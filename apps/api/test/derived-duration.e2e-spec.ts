import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **The derived duration of a summary and a level-of-effort, read back from a real database**
 * (ADR-0197, `docs/specs/wbs-summary-duration/`).
 *
 * `schedule.repository.day-factor.spec.ts` asserts the argument array handed to a MOCKED
 * `$executeRaw`, so it cannot see a missing `derived_duration_minutes = v.derived_duration_minutes`
 * line in the `UPDATE SET` (the same blind spot `remaining_float` documents there). This is the half
 * that can: build the plan through the public REST API, recalculate, read the value back over the
 * real route and straight from the column.
 *
 * Assertions are phrased in the stored minutes of the children rather than a number of days, so they
 * hold on whatever calendar the plan defaults to: the children run back to back, so the span the
 * summary and the hammock cover is exactly their summed working minutes.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
}

interface Row {
  id: string;
  code: string;
  type: string;
  version: number;
  durationMinutes: number;
  derivedDurationMinutes: number | null;
  derivedDurationDays: number | null;
}

describe.skipIf(!hasDatabase)('derived duration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(Token);
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  const org = '/api/v1/organizations/acme';

  async function planFor(): Promise<{ actor: Actor; planId: string }> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'derived-admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent.post(`${org}/clients`).send({ name: 'C' }).expect(201);
    const project = await agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const plan = await agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Derived', plannedStart: '2026-01-05' })
      .expect(201);
    return { actor: { agent }, planId: plan.body.data.id as string };
  }

  const create = async (actor: Actor, planId: string, body: object): Promise<Row> => {
    const res = await actor.agent.post(`${org}/plans/${planId}/activities`).send(body).expect(201);
    return res.body.data as Row;
  };

  const link = (
    actor: Actor,
    planId: string,
    predecessorId: string,
    successorId: string,
    type: string,
  ) =>
    actor.agent
      .post(`${org}/plans/${planId}/dependencies`)
      .send({ predecessorId, successorId, type })
      .expect(201);

  const recalculate = (actor: Actor, planId: string) =>
    actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).send({}).expect(200);

  async function read(actor: Actor, planId: string): Promise<Map<string, Row>> {
    const res = await actor.agent.get(`${org}/plans/${planId}/activities?limit=100`).expect(200);
    return new Map((res.body.data as Row[]).map((r) => [r.code, r]));
  }

  it('writes the span a summary and a level-of-effort cover, and nothing for any other row', async () => {
    const { actor, planId } = await planFor();
    const summary = await create(actor, planId, {
      name: 'Phase',
      code: 'SUM',
      type: 'WBS_SUMMARY',
    });
    const a = await create(actor, planId, {
      name: 'A',
      code: 'A',
      durationDays: 2,
      parentId: summary.id,
    });
    const b = await create(actor, planId, {
      name: 'B',
      code: 'B',
      durationDays: 3,
      parentId: summary.id,
    });
    const loe = await create(actor, planId, { name: 'Site', code: 'LOE', type: 'LEVEL_OF_EFFORT' });
    await create(actor, planId, { name: 'Empty', code: 'EMPTY', type: 'WBS_SUMMARY' });
    const noSpan = await create(actor, planId, {
      name: 'Open',
      code: 'OPEN',
      type: 'LEVEL_OF_EFFORT',
    });
    await link(actor, planId, a.id, b.id, 'FS');
    await link(actor, planId, a.id, loe.id, 'SS');
    await link(actor, planId, loe.id, b.id, 'FF');
    await link(actor, planId, a.id, noSpan.id, 'SS');

    await recalculate(actor, planId);
    const rows = await read(actor, planId);

    const span = a.durationMinutes + b.durationMinutes;
    expect(span, 'the fixture must have a span, or this asserts 0 === 0').toBeGreaterThan(0);
    expect(rows.get('SUM')!.derivedDurationMinutes).toBe(span);
    expect(rows.get('LOE')!.derivedDurationMinutes).toBe(span);
    expect(rows.get('SUM')!.derivedDurationDays).toBe(5);
    // No span is NULL, never the zero a defined fallback placement would measure.
    expect(rows.get('EMPTY')!.derivedDurationMinutes).toBeNull();
    expect(rows.get('OPEN')!.derivedDurationMinutes).toBeNull();
    expect(rows.get('A')!.derivedDurationMinutes).toBeNull();
    expect(rows.get('B')!.derivedDurationMinutes).toBeNull();

    // The column itself, not the DTO: the DTO gates on type, so only the row can show the write.
    const stored = await prisma.activity.findUniqueOrThrow({ where: { id: summary.id } });
    expect(stored.derivedDurationMinutes).toBe(span);
    // `duration_minutes` stays the planner's input (ADR-0197 D2): the creation default, not the span.
    expect(stored.durationMinutes).toBe(summary.durationMinutes);
    expect(stored.durationMinutes).not.toBe(span);
  });

  it('clears the column when a summary stops being one, on the next recalculation', async () => {
    const { actor, planId } = await planFor();
    const summary = await create(actor, planId, {
      name: 'Phase',
      code: 'SUM',
      type: 'WBS_SUMMARY',
    });
    await create(actor, planId, { name: 'A', code: 'A', durationDays: 2, parentId: summary.id });
    await recalculate(actor, planId);
    expect(
      (await prisma.activity.findUniqueOrThrow({ where: { id: summary.id } }))
        .derivedDurationMinutes,
    ).toBeGreaterThan(0);

    const current = (await read(actor, planId)).get('SUM')!;
    // The children are filed under it, so release them first: a TASK may not keep children.
    await prisma.activity.updateMany({ where: { parentId: summary.id }, data: { parentId: null } });
    await actor.agent
      .patch(`${org}/activities/${summary.id}`)
      .send({ type: 'TASK', durationDays: 1, version: current.version })
      .expect(200);
    // Pre-seed a stale value on the now-TASK row, so that clearing is what is under test: with the
    // write absent from the UPDATE this stays 999, whatever the first recalculation did.
    await prisma.activity.update({
      where: { id: summary.id },
      data: { derivedDurationMinutes: 999 },
    });
    await recalculate(actor, planId);

    expect(
      (await prisma.activity.findUniqueOrThrow({ where: { id: summary.id } }))
        .derivedDurationMinutes,
    ).toBeNull();
  });

  it('states the derived duration in the MSPDI export for a summary, from the stored column', async () => {
    const { actor, planId } = await planFor();
    const summary = await create(actor, planId, {
      name: 'Phase',
      code: 'SUM',
      type: 'WBS_SUMMARY',
    });
    const a = await create(actor, planId, {
      name: 'A',
      code: 'A',
      durationDays: 2,
      parentId: summary.id,
    });
    await recalculate(actor, planId);
    const span = (await prisma.activity.findUniqueOrThrow({ where: { id: summary.id } }))
      .derivedDurationMinutes;
    expect(span, 'the fixture must have a span, or this asserts 0 === 0').toBeGreaterThan(0);
    expect(span).toBe(a.durationMinutes);

    const res = await actor.agent
      .get(`${org}/plans/${planId}/interchange/export/mspdi`)
      .responseType('blob')
      .expect(200);
    const xml = (res.body as Buffer).toString('utf8');
    const hours = Math.floor(span! / 60);
    const minutes = span! % 60;
    // The summary's own <Task> carries its derived span rather than the stored 0.
    const task = xml.split('<Task>').find((t) => t.includes('<Name>Phase</Name>'));
    expect(task, 'the summary is in the file').toBeDefined();
    expect(task).toContain(`<Duration>PT${String(hours)}H${String(minutes)}M0S</Duration>`);
  });

  it('recalculates a plan with neither type, whose column array is all NULL', async () => {
    const { actor, planId } = await planFor();
    const a = await create(actor, planId, { name: 'A', code: 'A', durationDays: 2 });
    const b = await create(actor, planId, { name: 'B', code: 'B', durationDays: 3 });
    await link(actor, planId, a.id, b.id, 'FS');

    await recalculate(actor, planId);

    const rows = await read(actor, planId);
    expect([...rows.values()].map((r) => r.derivedDurationMinutes)).toEqual([null, null]);
  });
});
