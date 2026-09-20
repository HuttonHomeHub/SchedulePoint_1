import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **FC-7 Part B — the PRODUCT half of the placed-basis parity claim**
 * (`docs/specs/one-planning-surface/`, M-P-T3).
 *
 * FC-11 asserts the same invariant at `computeSchedule`, and the two deliberately do not substitute
 * for each other: ADR-0066 exists because all 117 capability keys were proven at the engine and none
 * at the application, and the two defects that motivated it were green at the engine and wrong in
 * the product. So this builds the plan through the **public REST API** — the real DTOs, the real
 * guards, the real write path, the real recalculation and the real read serialisation — and asserts
 * over the response a client actually receives.
 *
 * **The claim:** on a plan carrying progress, a Level of Effort and a WBS summary, and **no
 * placement anywhere**, every activity's `visualEffectiveStart`/`visualEffectiveFinish` equals its
 * `earlyStart`/`earlyFinish`.
 *
 * **What it looked like before M-P** (`m-p/red-run.md` at the engine,
 * `m-p/progress-parity.md` here): an in-progress activity's placed bar ignored its frozen actual
 * start and ran at full duration; a completed one ignored both actuals; an LOE and a summary each
 * collapsed to a **point**. A planner with progress reported saw two different pictures of the same
 * activity depending on which basis the view read — and M-F makes the placed basis the only one.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Row {
  code: string;
  type: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
}

describe.skipIf(!hasDatabase)('Placed-basis parity where nothing is placed (e2e)', () => {
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

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /**
   * A plan that exercises all three branches Pass 1 has and Pass 2 did not, plus plain tasks as the
   * control. **No `visualStart` is sent anywhere** — that is the condition, and a placement would
   * make a difference legitimate and the assertion meaningless.
   *
   * The calendar is left at the plan default deliberately: this is a parity claim between two
   * readings of the SAME schedule, so any calendar makes it, and pinning one would suggest the
   * result depends on working days when it does not.
   */
  async function seedProgressedPlan(): Promise<{ actor: Actor; planId: string; rows: Row[] }> {
    const actor = await signUp('parity-admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Parity', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;

    const create = async (body: object): Promise<{ id: string; version: number }> => {
      const res = await actor.agent.post(base).send(body).expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    };

    // The control: two plain unprogressed tasks, which agreed on both bases before M-P too. Without
    // them a run that returned no rows at all would pass, and a run in which EVERYTHING was broken
    // would look the same as one in which nothing was.
    const spine = await create({ name: 'Spine', code: 'SPINE', durationDays: 3 });
    const tail = await create({ name: 'Tail', code: 'TAIL', durationDays: 2 });

    // A summary over a child that starts AFTER the data date. The late start is the point: with the
    // child at the data date, Pass 2's bare data-date answer and Pass 1's rolled-up start coincide,
    // and this case passes over a summary that renders at the data date whatever its children do.
    const summary = await create({ name: 'Structure', code: 'SUMMARY', type: 'WBS_SUMMARY' });
    const lead = await create({ name: 'Lead-in', code: 'LEAD', durationDays: 5 });
    const child = await create({
      name: 'Frame',
      code: 'CHILD',
      durationDays: 4,
      parentId: summary.id,
    });

    // A Level of Effort hammocking the spine: SS from it, FF to the tail. Its span is DERIVED and
    // its input duration is zero, which is what made it collapse.
    const loe = await create({ name: 'Supervision', code: 'LOE', type: 'LEVEL_OF_EFFORT' });

    // A started activity and a completed one. Their actuals sit **BEFORE** the data date, which is
    // exactly where the data-date-anchored offset mapping Pass 2 used is lossy — and it is not
    // incidental: the first draft reported both actuals ON the data date, and the two bases then
    // agreed about the START of both rows while disagreeing about their finishes. A fixture whose
    // actuals coincide with the data date cannot exhibit half the defect it is written for.
    const started = await create({ name: 'Excavate', code: 'STARTED', durationDays: 4 });
    const done = await create({ name: 'Survey', code: 'DONE', durationDays: 4 });

    const link = async (predecessorId: string, successorId: string, type: string) =>
      actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId, successorId, type })
        .expect(201);
    await link(spine.id, tail.id, 'FS');
    await link(spine.id, loe.id, 'SS');
    await link(loe.id, tail.id, 'FF');
    await link(lead.id, child.id, 'FS');

    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${started.id}/progress`)
      .send({ percentComplete: 50, actualStart: '2026-01-02', version: started.version })
      .expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${done.id}/progress`)
      .send({
        percentComplete: 100,
        actualStart: '2026-01-02',
        actualFinish: '2026-01-03',
        version: done.version,
      })
      .expect(200);

    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);

    const list = await actor.agent.get(`${base}?limit=100`).expect(200);
    const rows = (list.body.data as Row[]).map((r) => ({
      code: r.code,
      type: r.type,
      earlyStart: r.earlyStart,
      earlyFinish: r.earlyFinish,
      visualEffectiveStart: r.visualEffectiveStart,
      visualEffectiveFinish: r.visualEffectiveFinish,
    }));
    return { actor, planId, rows };
  }

  it('renders every activity identically on both bases, through the public read', async () => {
    const { rows } = await seedProgressedPlan();

    // The fixture is only worth what it contains: assert the shapes are present before comparing
    // them, or a seeding change that quietly dropped the LOE would leave this green (ADR-0093).
    expect(rows.map((r) => r.code).sort()).toEqual(
      ['CHILD', 'DONE', 'LEAD', 'LOE', 'SPINE', 'STARTED', 'SUMMARY', 'TAIL'].sort(),
    );
    expect(rows.some((r) => r.type === 'WBS_SUMMARY')).toBe(true);
    expect(rows.some((r) => r.type === 'LEVEL_OF_EFFORT')).toBe(true);
    // A schedule that never computed would have nulls throughout and compare equal to itself.
    expect(rows.every((r) => r.earlyStart !== null && r.earlyFinish !== null)).toBe(true);

    // One whole-map comparison, so a failure names EVERY diverging activity rather than stopping at
    // the first — the class is what matters here, not the first member of it.
    const placed = Object.fromEntries(
      rows.map((r) => [r.code, { s: r.visualEffectiveStart, f: r.visualEffectiveFinish }]),
    );
    const early = Object.fromEntries(
      rows.map((r) => [r.code, { s: r.earlyStart, f: r.earlyFinish }]),
    );
    expect(placed).toEqual(early);
  });

  it('the derived-span rows really are derived, so the comparison above is not vacuous', async () => {
    const { rows } = await seedProgressedPlan();
    const by = (code: string) => rows.find((r) => r.code === code)!;

    // A summary and an LOE that had collapsed to a point would still satisfy the equality above if
    // Pass 1 had collapsed them too. It has not, and these assert that: both span more than a day,
    // and the summary does NOT begin at the data date.
    expect(by('SUMMARY').earlyStart).not.toBe(by('SUMMARY').earlyFinish);
    expect(by('SUMMARY').earlyStart).not.toBe('2026-01-05');
    expect(by('LOE').earlyStart).not.toBe(by('LOE').earlyFinish);
    // The started activity's early start is its frozen actual, and it precedes the data date —
    // the condition under which Pass 2's offset mapping was lossy.
    expect(by('STARTED').earlyStart).toBe('2026-01-02');
    expect(by('DONE').earlyStart).toBe('2026-01-02');
    expect(by('DONE').earlyFinish).toBe('2026-01-03');
  });
});
