import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';
import { clearActivityTree } from './clear-activity-tree';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * **The redundant-links advisory, through the public REST API** (redundant-link-advisory M2-T4,
 * ADR-0066's write-path half of the proof).
 *
 * The unit and oracle suites prove the rule against the engine in memory. This one proves it on the
 * route a planner uses: build plans through the API, read the report, **delete each flagged link
 * through the API, recalculate, re-read every activity, and compare**. A rule that the in-memory proof
 * passes and the write path contradicts (a stored field the loader reads differently from the oracle's
 * builder) fails here and nowhere else.
 *
 * Every fixture is built through the REST API, never by writing rows.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Offender {
  id: string;
  kind: string;
  name: string;
  note: string;
  activityId: string;
}

/** The engine-owned fields a recalculation persists, as the activity list returns them. */
const SCHEDULE_FIELDS = [
  'earlyStart',
  'earlyFinish',
  'lateStart',
  'lateFinish',
  'totalFloat',
  'freeFloat',
  'isCritical',
  'visualEffectiveStart',
  'visualEffectiveFinish',
  'remainingFloat',
] as const;

describe.skipIf(!hasDatabase)('Redundant-links advisory (e2e)', () => {
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

  // Children before parents so the FK restrictions never bite (the schedule-health-check order).
  async function resetDatabase(): Promise<void> {
    await clearBaselineTree(prisma);
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.activityStep.deleteMany();
    await clearActivityTree(prisma);
    await prisma.planShare.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const org = '/api/v1/organizations/acme';

  async function adminWithOrg(): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin-acme@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function makePlan(actor: Actor): Promise<string> {
    const client = await actor.agent.post(`${org}/clients`).send({ name: 'Client' }).expect(201);
    const project = await actor.agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Redundancy plan', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    // All-days-work, so the date arithmetic in the assertions is transparent.
    await actor.agent
      .patch(`${org}/plans/${planId}`)
      .send({ calendarId: null, version: 1 })
      .expect(200);
    return planId;
  }

  async function activity(actor: Actor, planId: string, name: string, days: number) {
    const res = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name, durationDays: days })
      .expect(201);
    return res.body.data.id as string;
  }

  async function link(
    actor: Actor,
    planId: string,
    pred: string,
    succ: string,
    extra: object = {},
  ): Promise<string> {
    const res = await actor.agent
      .post(`${org}/plans/${planId}/dependencies`)
      .send({ predecessorId: pred, successorId: succ, ...extra })
      .expect(201);
    return res.body.data.id as string;
  }

  async function recalculate(actor: Actor, planId: string): Promise<void> {
    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);
  }

  async function schedule(actor: Actor, planId: string) {
    const res = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const rows = res.body.data as Array<Record<string, unknown> & { id: string }>;
    return Object.fromEntries(
      rows.map((r) => [r.id, Object.fromEntries(SCHEDULE_FIELDS.map((f) => [f, r[f]]))]),
    );
  }

  async function advisory(actor: Actor, planId: string) {
    const res = await actor.agent.get(`${org}/plans/${planId}/schedule/health-check`).expect(200);
    const rows = res.body.data.advisories as Array<{
      id: string;
      offenders: Offender[];
      offenderCount: number;
      measured: { count: number; denominator: number };
      detail: { rule: string; unjudged: number; searchCapped: boolean };
    }>;
    return {
      rows,
      redundant: rows.find((a) => a.id === 'REDUNDANT_LINKS')!,
      body: res.body as { data: { metrics: unknown[]; summary: unknown } },
    };
  }

  /** Four disconnected clusters, one per kind of verdict the table in the spec states. */
  async function build(actor: Actor, planId: string) {
    const trio = async (tag: string) => ({
      a: await activity(actor, planId, `${tag}A`, 2),
      b: await activity(actor, planId, `${tag}B`, 1),
      c: await activity(actor, planId, `${tag}C`, 2),
    });
    const r1 = await trio('R1');
    await link(actor, planId, r1.a, r1.b);
    await link(actor, planId, r1.b, r1.c);
    const r1Direct = await link(actor, planId, r1.a, r1.c);

    // R2: the direct link carries a 5-day lag the chain does not, so it is the one doing the work.
    const r2 = await trio('R2');
    await link(actor, planId, r2.a, r2.b);
    await link(actor, planId, r2.b, r2.c);
    const r2Direct = await link(actor, planId, r2.a, r2.c, { lagDays: 5 });

    // R5: a start-to-start link beside a finish-to-start chain.
    const r5 = await trio('R5');
    await link(actor, planId, r5.a, r5.b);
    await link(actor, planId, r5.b, r5.c);
    const r5Direct = await link(actor, planId, r5.a, r5.c, { type: 'SS' });

    // R14: an SS link beside an FS link between the same two activities.
    const a14 = await activity(actor, planId, 'R14A', 2);
    const b14 = await activity(actor, planId, 'R14B', 2);
    await link(actor, planId, a14, b14, { type: 'FS' });
    const r14Ss = await link(actor, planId, a14, b14, { type: 'SS' });

    return { r1Direct, r2Direct, r5Direct, r14Ss, r1 };
  }

  it('flags the provable cases, leaves the rest, and counts nothing it did not check', async () => {
    const actor = await adminWithOrg();
    const planId = await makePlan(actor);
    const ids = await build(actor, planId);

    const { rows, redundant } = await advisory(actor, planId);

    // Both advisories, always, in tuple order.
    expect(rows.map((r) => r.id)).toEqual(['ZERO_DURATION_TASKS', 'REDUNDANT_LINKS']);
    expect(redundant.offenders.map((o) => o.id).sort()).toEqual(
      [ids.r1Direct, ids.r5Direct, ids.r14Ss].sort(),
    );
    expect(redundant.offenders.map((o) => o.id)).not.toContain(ids.r2Direct);
    expect(redundant.offenderCount).toBe(3);
    // The denominator is the plan's live relationships, not its activities: 3 + 3 + 3 + 2.
    expect(redundant.measured).toEqual(expect.objectContaining({ count: 3, denominator: 11 }));
    expect(redundant.detail).toEqual({
      rule: 'DOMINATED_UNDER_ANY_DURATION',
      unjudged: 0,
      searchCapped: false,
    });
    const r1 = redundant.offenders.find((o) => o.id === ids.r1Direct)!;
    expect(r1).toMatchObject({ kind: 'RELATIONSHIP', name: 'R1A → R1C', activityId: ids.r1.c });
    expect(r1.note).toBe('FS; already implied through R1B');
  });

  it('leaves the fourteen metrics and the summary untouched by the advisory (FC-4)', async () => {
    const actor = await adminWithOrg();
    const planId = await makePlan(actor);
    await build(actor, planId);
    const { body } = await advisory(actor, planId);
    expect(body.data.metrics).toHaveLength(14);
    const s = body.data.summary as {
      passed: number;
      failed: number;
      notAssessable: number;
      informational: number;
    };
    expect(s.passed + s.failed + s.notAssessable + s.informational).toBe(14);
  });

  it('deleting every flagged link through the API moves no date and no float', async () => {
    const actor = await adminWithOrg();
    const planId = await makePlan(actor);
    await build(actor, planId);
    await recalculate(actor, planId);
    const before = await schedule(actor, planId);
    const flagged = (await advisory(actor, planId)).redundant.offenders.map((o) => o.id);
    expect(flagged.length).toBeGreaterThan(0);

    // One at a time and cumulatively: after the last, every flagged link is gone together.
    for (const id of flagged) {
      await actor.agent.delete(`${org}/dependencies/${id}`).expect(204);
      await recalculate(actor, planId);
      expect(await schedule(actor, planId)).toEqual(before);
    }

    // And the finding is gone with them, so the count drops and nothing else is newly flagged.
    const after = await advisory(actor, planId);
    expect(after.redundant.offenderCount).toBe(0);
  });

  it('is present and reads "0 of 0" on a plan with no links', async () => {
    const actor = await adminWithOrg();
    const planId = await makePlan(actor);
    await activity(actor, planId, 'Alone', 3);
    const { redundant } = await advisory(actor, planId);
    expect(redundant.offenders).toEqual([]);
    expect(redundant.measured).toEqual(expect.objectContaining({ count: 0, denominator: 0 }));
  });

  it('computes before the plan has ever been calculated (it reads stored rows, not dates)', async () => {
    const actor = await adminWithOrg();
    const planId = await makePlan(actor);
    const ids = await build(actor, planId);
    const { redundant } = await advisory(actor, planId);
    expect(redundant.offenders.map((o) => o.id)).toContain(ids.r1Direct);
  });
});
