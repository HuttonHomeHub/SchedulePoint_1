import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MONEY_MINOR_UNITS_MAX } from '@repo/types';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for activities: nested create/list under a parent plan, the
 * flat item operations, the milestone-duration invariant and constraint pairing,
 * per-plan name/code uniqueness, the IDOR/parent-404 matrix, the soft-delete +
 * restore round-trip incl. the top-down PARENT_DELETED invariant, and the RBAC
 * split (a Viewer/Contributor cannot edit the definition) — verified against a
 * real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Activities API (e2e)', () => {
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

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // Both link tables first, even though this spec creates neither. `activities` is their FK
    // target, so ANY dependency row left in the shared local database — by a sibling spec, or by a
    // Playwright journey run against the same `app_test` — makes this `deleteMany` a foreign-key
    // violation, and every one of this file's tests then fails in `beforeEach` with an error that
    // names a table the spec never touches.
    //
    // "The sibling specs already sweep in this order" is what this comment used to say, and it was
    // wrong: NINE of them did not, and each passed or failed on the order the files happened to run
    // in until one new e2e file changed it (`docs/TECH_DEBT.md` #119). They all sweep this way now.
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
    // Resource assignments hold `activity_id` FKs and resources are organisation-scoped, so both
    // are swept here for the same shared-database reason as the link tables above
    // (docs/TECH_DEBT.md #119): a leftover row from a sibling suite or a Playwright run against
    // the same `app_test` otherwise fails a spec that never touches resources — which happened
    // on 2026-08-28, in `beforeEach`, to every test in the file at once.
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
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

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  /** Set up an admin org with a client + project + plan, returning the plan id. */
  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const { actor, orgId } = await adminWithOrg();
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const clientId = client.body.data.id as string;
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    return { actor, orgId, planId: plan.body.data.id as string };
  }

  /**
   * TECH_DEBT #78. ADR-0036 moved storage and the engine to working-MINUTES and shipped intraday
   * calendars, but the public DTOs exposed only whole days — so a 4-hour lift was importable and
   * not authorable, and any edit that touched the duration rounded it to whole days. These cover
   * the write path AND the read path: exposing `durationMinutes` on the request without exposing it
   * on the response would let a client author a sub-day activity and only ever see it as 0 days.
   */
  describe('sub-day durations (TECH_DEBT #78)', () => {
    it('authors a 4-hour activity, reads it back exactly, and edits it without rounding', async () => {
      const { actor, planId } = await setup();
      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;

      const created = await actor.agent
        .post(base)
        .send({ name: 'Crane lift', durationMinutes: 240 })
        .expect(201);
      // 240 minutes is 0 whole days: the day field rounds, and that is exactly why the minute
      // field has to be readable — otherwise the value is invisible the moment it is stored.
      expect(created.body.data).toMatchObject({ durationMinutes: 240, durationDays: 0 });
      const id = created.body.data.id as string;

      const got = await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
      expect(got.body.data.durationMinutes).toBe(240);

      // The edit that used to destroy it: a duration change now expressible in the same unit.
      const edited = await actor.agent
        .patch(`/api/v1/organizations/acme/activities/${id}`)
        .send({ durationMinutes: 90, version: created.body.data.version })
        .expect(200);
      expect(edited.body.data).toMatchObject({ durationMinutes: 90, durationDays: 0 });
    });

    it('refuses a payload carrying both units rather than picking a winner', async () => {
      const { actor, planId } = await setup();
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name: 'Ambiguous', durationDays: 2, durationMinutes: 240 })
        .expect(422);
      expect(JSON.stringify(res.body)).toContain('send one, not both');
    });

    it('still refuses a milestone a duration, whichever unit it arrives in', async () => {
      const { actor, planId } = await setup();
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name: 'Bad milestone', type: 'START_MILESTONE', durationMinutes: 240 })
        .expect(422);
    });

    it('keeps the day field working unchanged for every existing client', async () => {
      const { actor, planId } = await setup();
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name: 'Ordinary', durationDays: 3 })
        .expect(201);
      expect(res.body.data).toMatchObject({ durationDays: 3, durationMinutes: 3 * 1440 });
    });
  });

  /**
   * The same asymmetry one field along (surface audit F3). ADR-0070 made an activity's DURATION
   * sub-day authorable and left its REMAINING work a whole-days field — so a planner could type a
   * four-hour lift and then report the remainder only as `0` or `1` day. On an incomplete activity
   * `0` is not a rounding artefact: it is also the value that means *no work left*.
   */
  describe('sub-day remaining duration (surface audit F3)', () => {
    const progressOf = async (
      actor: Actor,
      activityId: string,
      body: object,
      expected = 200,
    ): Promise<{ remainingDurationDays: number | null; remainingDurationMinutes: number | null }> =>
      (
        await actor.agent
          .patch(`/api/v1/organizations/acme/activities/${activityId}/progress`)
          .send(body)
          .expect(expected)
      ).body.data;

    const startedActivity = async () => {
      const { actor, planId } = await setup();
      const created = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name: 'Cure slab', durationDays: 2 })
        .expect(201);
      return {
        actor,
        id: created.body.data.id as string,
        version: created.body.data.version as number,
      };
    };

    it('reports a four-hour remainder and reads it back exactly', async () => {
      const { actor, id, version } = await startedActivity();

      const data = await progressOf(actor, id, {
        percentComplete: 60,
        // On or before the plan's data date (2026-01-01) — a later actual is a 422 by design.
        actualStart: '2026-01-01',
        remainingDurationMinutes: 240,
        version,
      });
      // The day field still rounds — that is the point, and why the minute field must be readable.
      expect(data).toMatchObject({ remainingDurationMinutes: 240, remainingDurationDays: 0 });

      const got = await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
      expect(got.body.data.remainingDurationMinutes).toBe(240);
    });

    it('refuses a payload carrying both units rather than picking a winner', async () => {
      const { actor, id, version } = await startedActivity();
      const res = await actor.agent
        .patch(`/api/v1/organizations/acme/activities/${id}/progress`)
        .send({ remainingDurationDays: 1, remainingDurationMinutes: 240, version })
        .expect(422);
      expect(JSON.stringify(res.body)).toContain('send one, not both');
    });

    it('keeps the day field working unchanged for every existing client', async () => {
      const { actor, id, version } = await startedActivity();
      const data = await progressOf(actor, id, {
        percentComplete: 50,
        actualStart: '2026-01-01',
        remainingDurationDays: 1,
        version,
      });
      expect(data).toMatchObject({ remainingDurationDays: 1, remainingDurationMinutes: 1440 });
    });

    it('clears the explicit remainder with null, in either unit', async () => {
      const { actor, id, version } = await startedActivity();
      const set = await progressOf(actor, id, {
        percentComplete: 60,
        actualStart: '2026-01-01',
        remainingDurationMinutes: 240,
        version,
      });
      expect(set.remainingDurationMinutes).toBe(240);

      const cleared = await progressOf(actor, id, {
        remainingDurationMinutes: null,
        version: version + 1,
      });
      // Null means "derive it from percent complete", which is a different state from zero.
      expect(cleared.remainingDurationMinutes).toBeNull();
      expect(cleared.remainingDurationDays).toBeNull();
    });
  });

  it('creates an activity with defaults, gets and lists it', async () => {
    const { actor, planId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Excavate' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Excavate',
      planId,
      type: 'TASK',
      durationDays: 1,
      code: null,
      constraintType: null,
      constraintDate: null,
      laneIndex: 0,
      status: 'NOT_STARTED',
      percentComplete: 0,
      isCritical: false,
      version: 1,
    });
    const id = res.body.data.id as string;

    const got = await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
    expect(got.body.data).toMatchObject({ name: 'Excavate', planId });

    const list = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('round-trips code, duration, lane and a paired constraint', async () => {
    const { actor, planId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({
        name: 'Pour slab',
        code: 'A100',
        durationDays: 10,
        laneIndex: 2,
        constraintType: 'SNET',
        constraintDate: '2026-05-01',
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      code: 'A100',
      durationDays: 10,
      laneIndex: 2,
      constraintType: 'SNET',
      constraintDate: '2026-05-01',
    });
  });

  it('forces a milestone duration to 0, on create and on type change', async () => {
    const { actor, planId } = await setup();
    // A milestone created with a non-zero duration is coerced to 0.
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Kickoff', type: 'START_MILESTONE', durationDays: 0 })
      .expect(201);
    expect(created.body.data).toMatchObject({ type: 'START_MILESTONE', durationDays: 0 });

    // A task turned into a milestone loses its duration.
    const task = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Handover', durationDays: 5 })
      .expect(201);
    const id = task.body.data.id as string;
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${id}`)
      .send({ type: 'FINISH_MILESTONE', version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ type: 'FINISH_MILESTONE', durationDays: 0 });
  });

  it('rejects a non-zero milestone duration, a lone constraint, and a bad date (422)', async () => {
    const { actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    await actor.agent
      .post(base)
      .send({ name: 'A', type: 'START_MILESTONE', durationDays: 3 })
      .expect(422);
    await actor.agent.post(base).send({ name: 'B', constraintType: 'SNET' }).expect(422);
    await actor.agent.post(base).send({ name: 'C', constraintDate: '2026-05-01' }).expect(422);
    await actor.agent
      .post(base)
      .send({ name: 'D', constraintType: 'SNET', constraintDate: '2026-02-30' })
      .expect(422);
    // The secondary constraint pair (ADR-0035 §10) is validated the same way.
    await actor.agent.post(base).send({ name: 'E', secondaryConstraintType: 'FNLT' }).expect(422);
    await actor.agent
      .post(base)
      .send({ name: 'F', secondaryConstraintDate: '2026-05-01' })
      .expect(422);
  });

  it('rejects a budgetedExpense above the money ceiling (422, TECH_DEBT #40a)', async () => {
    const { actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    await actor.agent
      .post(base)
      .send({ name: 'Overflow', budgetedExpense: MONEY_MINOR_UNITS_MAX + 1 })
      .expect(422);
  });

  it('accepts an expense on a FINISH_MILESTONE — a payment milestone is cost with no duration', async () => {
    // **The evidence D9 turns on** (`docs/specs/activity-dialog-unification/`, M4-T2). The create
    // dialog hid the cost fields for every duration-derived type, so a payment milestone — the
    // commonest reason a milestone carries money at all — could not be given its value on the one
    // surface that creates it. Moving the editor's rule across is only right if the API agrees, and
    // reading the DTO is not the same as asking it: the type gates in `activities.service.ts` all
    // touch duration, and the money fields validate on range alone, but that is an argument rather
    // than an answer. This is the answer.
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Practical completion', type: 'FINISH_MILESTONE', budgetedExpense: 250_000 })
      .expect(201);

    expect(created.body.data).toMatchObject({
      type: 'FINISH_MILESTONE',
      durationDays: 0,
      budgetedExpense: 250_000,
    });

    // And it survives an update, which is the other half: a milestone whose expense could be set
    // once and never corrected would be its own defect.
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${created.body.data.id as string}`)
      .send({ budgetedExpense: 300_000, version: created.body.data.version })
      .expect(200);
    expect(patched.body.data.budgetedExpense).toBe(300_000);
  });

  it('round-trips a secondary constraint and enforces its pairing on update (ADR-0035 §10)', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({
        name: 'Two-constraint',
        constraintType: 'SNET',
        constraintDate: '2026-05-01',
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-05-10',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      secondaryConstraintType: 'FNLT',
      secondaryConstraintDate: '2026-05-10',
    });
    const item = `/api/v1/organizations/acme/activities/${created.body.data.id as string}`;

    // A lone secondary side is refused; clearing both is allowed.
    const res = await actor.agent
      .patch(item)
      .send({ secondaryConstraintType: null, version: 1 })
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('CONSTRAINT_PAIR_REQUIRED');
    const cleared = await actor.agent
      .patch(item)
      .send({ secondaryConstraintType: null, secondaryConstraintDate: null, version: 1 })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      secondaryConstraintType: null,
      secondaryConstraintDate: null,
      // The primary is untouched.
      constraintType: 'SNET',
    });
  });

  it('rejects a partial constraint update that omits one side (422), keeping the pair intact', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Constrained', constraintType: 'SNET', constraintDate: '2026-05-01' })
      .expect(201);
    const id = created.body.data.id as string;
    const item = `/api/v1/organizations/acme/activities/${id}`;

    // Clearing only the type (date omitted) would leave a dangling date — refused.
    const res = await actor.agent
      .patch(item)
      .send({ constraintType: null, version: 1 })
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('CONSTRAINT_PAIR_REQUIRED');
    // The symmetric case (date only) is refused too.
    await actor.agent.patch(item).send({ constraintDate: null, version: 1 }).expect(422);
    // And setting only a type on an unconstrained field is refused.
    await actor.agent.patch(item).send({ constraintType: 'FNLT', version: 1 }).expect(422);

    // The activity is untouched — the original pair is still intact.
    const got = await actor.agent.get(item).expect(200);
    expect(got.body.data).toMatchObject({
      constraintType: 'SNET',
      constraintDate: '2026-05-01',
      version: 1,
    });

    // Clearing BOTH together is allowed.
    const cleared = await actor.agent
      .patch(item)
      .send({ constraintType: null, constraintDate: null, version: 1 })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ constraintType: null, constraintDate: null });
  });

  it('round-trips external / inter-project dates and clears them (ADR-0043 / ADR-0035 §30)', async () => {
    const { actor, planId } = await setup();
    // Both external bounds may be set together on create (ELF after EES).
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({
        name: 'Vendor-gated',
        externalEarlyStart: '2026-06-01',
        externalLateFinish: '2026-08-01',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      externalEarlyStart: '2026-06-01',
      externalLateFinish: '2026-08-01',
    });
    const item = `/api/v1/organizations/acme/activities/${created.body.data.id as string}`;

    // One side can be changed while the other keeps its stored value.
    const patched = await actor.agent
      .patch(item)
      .send({ externalEarlyStart: '2026-06-15', version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({
      externalEarlyStart: '2026-06-15',
      externalLateFinish: '2026-08-01',
    });

    // Null clears a bound (the other is untouched).
    const cleared = await actor.agent
      .patch(item)
      .send({ externalLateFinish: null, version: 2 })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      externalEarlyStart: '2026-06-15',
      externalLateFinish: null,
    });
  });

  it('rejects an external late finish before the external early start (N26 422)', async () => {
    const { actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    // Create: both set, ELF < EES → 422 EXTERNAL_FINISH_BEFORE_START.
    const bad = await actor.agent
      .post(base)
      .send({
        name: 'Backwards',
        externalEarlyStart: '2026-08-01',
        externalLateFinish: '2026-06-01',
      })
      .expect(422);
    expect(bad.body.error?.details?.reason).toBe('EXTERNAL_FINISH_BEFORE_START');

    // Update: patching a lone side is checked against the stored other side (N26 on effective pair).
    const created = await actor.agent
      .post(base)
      .send({ name: 'External', externalEarlyStart: '2026-08-01' })
      .expect(201);
    const item = `/api/v1/organizations/acme/activities/${created.body.data.id as string}`;
    const patchBad = await actor.agent
      .patch(item)
      .send({ externalLateFinish: '2026-06-01', version: 1 })
      .expect(422);
    expect(patchBad.body.error?.details?.reason).toBe('EXTERNAL_FINISH_BEFORE_START');
  });

  it('allows the same activity name under different plans, but not within one', async () => {
    const { actor, planId } = await setup();
    // A second plan under the same project.
    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    const clientId = list.body.data[0].id as string;
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name: 'Otherside' })
      .expect(201);
    const secondPlan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Second', plannedStart: '2026-01-01' })
      .expect(201);
    const a = `/api/v1/organizations/acme/plans/${planId}/activities`;
    const b = `/api/v1/organizations/acme/plans/${secondPlan.body.data.id}/activities`;

    await actor.agent.post(a).send({ name: 'Dup' }).expect(201);
    await actor.agent.post(b).send({ name: 'Dup' }).expect(201); // different plan: allowed
    await actor.agent.post(a).send({ name: 'Dup' }).expect(409); // same plan: conflict
  });

  it('enforces per-plan code uniqueness among active rows', async () => {
    const { actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    await actor.agent.post(base).send({ name: 'One', code: 'A100' }).expect(201);
    const clash = await actor.agent.post(base).send({ name: 'Two', code: 'A100' }).expect(409);
    // The 409 pinpoints the code (not the name) so the client can fix the field.
    expect(clash.body.error?.details?.reason).toBe('CODE_TAKEN');
    // Two activities with no code do not collide (the code unique is partial).
    await actor.agent.post(base).send({ name: 'Three' }).expect(201);
    await actor.agent.post(base).send({ name: 'Four' }).expect(201);
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Lock' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${id}`)
      .send({ name: 'Lock v2', version: 1 })
      .expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('soft-deletes and restores an activity', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Temp' })
      .expect(201);
    const id = created.body.data.id as string;

    // 200 with a body, not 204 (`docs/TECH_DEBT.md` #113): the cascade's `deleteBatchId` already
    // existed server-side, and answering with no body meant a client could not restore what it had
    // just deleted — which is why undoing a band copy had no redo. Asserted as a real id, and then
    // USED below, because a field nobody exercises is a field that can quietly stop being right.
    const deleted = await actor.agent
      .delete(`/api/v1/organizations/acme/activities/${id}`)
      .expect(200);
    const deleteBatchId = deleted.body.data.deleteBatchId as string;
    expect(deleteBatchId).toMatch(/^[0-9a-f-]{36}$/);
    await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(404);
    const list = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    // The id the DELETE handed back restores exactly what it deleted — the round trip #113 exists
    // for. Asserted before the per-activity restore below, which is a different route.
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities/restore-batch/${deleteBatchId}`)
      .expect(200);
    await actor.agent.delete(`/api/v1/organizations/acme/activities/${id}`).expect(200);

    await actor.agent.post(`/api/v1/organizations/acme/activities/${id}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
  });

  it('refuses to restore an activity whose parent plan is still deleted (409)', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Child' })
      .expect(201);
    const id = created.body.data.id as string;

    // Deleting the plan cascades the activity into the plan's batch.
    await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);

    const res = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${id}/restore`)
      .expect(409);
    expect(res.body.error?.details?.reason).toBe('PARENT_DELETED');

    // Restoring the plan brings the whole batch (incl. the activity) back.
    await actor.agent.post(`/api/v1/organizations/acme/plans/${planId}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
  });

  it('404s a foreign/deleted parent plan and hides activities from non-members', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Hidden' })
      .expect(201);
    const activityId = created.body.data.id as string;

    const unknownPlan = '00000000-0000-7000-8000-000000000000';
    await actor.agent.get(`/api/v1/organizations/acme/plans/${unknownPlan}/activities`).expect(404);
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${unknownPlan}/activities`)
      .send({ name: 'Nope' })
      .expect(404);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(`/api/v1/organizations/acme/activities/${activityId}`).expect(404);
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/activities/${activityId}`).expect(404);
  });

  it('lets a Viewer read but forbids create; a Contributor also cannot edit the definition', async () => {
    const { orgId, actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    const created = await actor.agent.post(base).send({ name: 'Seed' }).expect(201);
    const activityId = created.body.data.id as string;

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(base).expect(200);
    await viewer.agent.post(base).send({ name: 'Nope' }).expect(403);

    // A Contributor may read, but definition write (create/update/delete) is
    // Planner+ only — progress is what a Contributor gets (that endpoint is B2).
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.get(base).expect(200);
    await contributor.agent.post(base).send({ name: 'Nope' }).expect(403);
    await contributor.agent
      .patch(`/api/v1/organizations/acme/activities/${activityId}`)
      .send({ name: 'Renamed', version: 1 })
      .expect(403);
    await contributor.agent
      .delete(`/api/v1/organizations/acme/activities/${activityId}`)
      .expect(403);
  });

  it('reports progress and derives status; a Contributor can, a Viewer cannot', async () => {
    const { orgId, actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Framing', durationDays: 10 })
      .expect(201);
    const id = created.body.data.id as string;
    const item = `/api/v1/organizations/acme/activities/${id}`;

    // A Contributor (who cannot edit the definition) reports progress.
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    // Actuals fall on or before the plan data date (2026-01-01) — an actual after "now"/the data
    // date is rejected by N07 (ADR-0035 §6), so progress is reported against dates already elapsed.
    const progressed = await contributor.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 40, actualStart: '2025-12-01', version: 1 })
      .expect(200);
    expect(progressed.body.data).toMatchObject({
      percentComplete: 40,
      actualStart: '2025-12-01',
      status: 'IN_PROGRESS', // derived from the numbers, not sent
      version: 2,
    });

    // Completing it (100% + finish date) derives COMPLETE.
    const done = await contributor.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 100, actualFinish: '2025-12-15', version: 2 })
      .expect(200);
    expect(done.body.data).toMatchObject({ status: 'COMPLETE', actualFinish: '2025-12-15' });

    // A finish before the start, or without one, is rejected.
    await contributor.agent
      .patch(`${item}/progress`)
      .send({ actualStart: '2025-12-20', actualFinish: '2025-12-10', version: 3 })
      .expect(422);

    // A Viewer cannot report progress.
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 50, version: 3 })
      .expect(403);

    // A Contributor still cannot edit the definition (that split is the whole point).
    await contributor.agent.patch(item).send({ name: 'Renamed', version: 3 }).expect(403);

    // The Planner-owned Visual placement (`visualStart`, ADR-0033) must never ride the progress
    // path — the DTO omits it and the global whitelist rejects the unknown property (422), so a
    // Contributor can't reach a definition-only field through the progress endpoint they DO have.
    await contributor.agent
      .patch(`${item}/progress`)
      .send({ visualStart: '2026-05-01', version: 3 })
      .expect(422);
  });

  it('surfaces a repair as meta.warnings, and omits meta on an ordinary report (M2, ADR-0035 §6)', async () => {
    const { planId, actor } = await setup(); // plan data date is 2026-01-01
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Pour', durationDays: 5 })
      .expect(201);
    const item = `/api/v1/organizations/acme/activities/${created.body.data.id as string}`;

    // An ordinary in-progress report repairs nothing → the bare { data } envelope, no meta.
    const plain = await actor.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 40, actualStart: '2025-12-01', version: 1 })
      .expect(200);
    expect(plain.body.meta).toBeUndefined();

    // Marking it 100% with no actual finish repairs the finish to the data date (N08) and reports it.
    const repaired = await actor.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 100, version: 2 })
      .expect(200);
    expect(repaired.body.data).toMatchObject({ status: 'COMPLETE', actualFinish: '2026-01-01' });
    expect(repaired.body.meta.warnings).toEqual([
      { code: 'COMPLETE_WITHOUT_FINISH', message: expect.any(String) as string },
    ]);
  });

  describe('batch lane positions (M4)', () => {
    async function makeAct(actor: Actor, planId: string, name: string) {
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name })
        .expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    }
    const positionsUrl = (planId: string) =>
      `/api/v1/organizations/acme/plans/${planId}/activities/positions`;

    it('moves several activities to new lanes in one call and bumps their versions', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      const b = await makeAct(actor, planId, 'B');

      const res = await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 2, version: a.version },
            { id: b.id, laneIndex: 3, version: b.version },
          ],
        })
        .expect(200);

      const byId = new Map(
        (res.body.data as Array<{ id: string; laneIndex: number; version: number }>).map((x) => [
          x.id,
          x,
        ]),
      );
      expect(byId.get(a.id)).toMatchObject({ laneIndex: 2, version: 2 });
      expect(byId.get(b.id)).toMatchObject({ laneIndex: 3, version: 2 });
    });

    it('is all-or-nothing: a single stale version rejects the whole batch (409), nothing moves', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      const b = await makeAct(actor, planId, 'B');

      await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 5, version: a.version },
            { id: b.id, laneIndex: 6, version: 99 }, // stale
          ],
        })
        .expect(409);

      // Neither row moved — the good one rolled back with the bad one.
      const got = await actor.agent
        .get(`/api/v1/organizations/acme/activities/${a.id}`)
        .expect(200);
      expect(got.body.data).toMatchObject({ laneIndex: 0, version: 1 });
    });

    it('rejects an id from another plan (404) and moves nothing (anti-IDOR)', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      // A second plan in the same org with its own activity.
      const project = await actor.agent
        .post(`/api/v1/organizations/acme/clients`)
        .send({ name: 'Other' })
        .expect(201);
      const proj = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${project.body.data.id}/projects`)
        .send({ name: 'P2' })
        .expect(201);
      const plan2 = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${proj.body.data.id}/plans`)
        .send({ name: 'Plan2', plannedStart: '2026-01-01' })
        .expect(201);
      const foreign = await makeAct(actor, plan2.body.data.id as string, 'Foreign');

      await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 4, version: a.version },
            { id: foreign.id, laneIndex: 4, version: foreign.version },
          ],
        })
        .expect(404);

      const got = await actor.agent
        .get(`/api/v1/organizations/acme/activities/${a.id}`)
        .expect(200);
      expect(got.body.data).toMatchObject({ laneIndex: 0 }); // in-plan row untouched
    });

    it('422s a batch that names the same activity twice', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 1, version: a.version },
            { id: a.id, laneIndex: 2, version: a.version },
          ],
        })
        .expect(422);
    });

    it('forbids a Contributor and a Viewer from moving lanes (403)', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      const body = { positions: [{ id: a.id, laneIndex: 1, version: a.version }] };

      const contributor = await signUp('lane-contrib@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
      });
      await contributor.agent.patch(positionsUrl(planId)).send(body).expect(403);

      const viewer = await signUp('lane-viewer@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
      });
      await viewer.agent.patch(positionsUrl(planId)).send(body).expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // WBS parent tree — ADR-0038 invariant (a)
  //
  // Scope note, so nobody reads more into this than it proves: this exercises the
  // cycle REJECTION through the real stack (HTTP → service → Postgres). It is NOT the
  // regression gate for the plan advisory lock the re-parent path takes. Two mirror
  // PATCHes fired with `Promise.all`, even on two separate keep-alive sockets, were
  // measured NOT to overlap in the danger window — the second request's ancestor walk
  // began ~15 ms after the first's transaction had already committed — so this test
  // passes identically with the lock removed. The lock's real gate is the unit suite
  // (`activities.service.spec.ts` → "WBS re-parent serialisation"), which asserts the
  // acquisition itself and fails when it is taken away.
  // ---------------------------------------------------------------------------

  describe('WBS re-parent (ADR-0038 invariant (a))', () => {
    async function summary(actor: Actor, planId: string, name: string) {
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name, type: 'WBS_SUMMARY' })
        .expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    }

    describe('batch membership write', () => {
      const parentsUrl = (planId: string) =>
        `/api/v1/organizations/acme/plans/${planId}/activities/parents`;

      async function task(actor: Actor, planId: string, name: string) {
        const res = await actor.agent
          .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
          .send({ name })
          .expect(201);
        return { id: res.body.data.id as string, version: res.body.data.version as number };
      }

      it('files several activities under a summary in one call and bumps their versions', async () => {
        const { actor, planId } = await setup();
        const s = await summary(actor, planId, 'Substructure');
        const a = await task(actor, planId, 'Excavate');
        const b = await task(actor, planId, 'Blind');

        const res = await actor.agent
          .patch(parentsUrl(planId))
          .send({
            parents: [
              { id: a.id, parentId: s.id, version: a.version },
              { id: b.id, parentId: s.id, version: b.version },
            ],
          })
          .expect(200);

        const byId = new Map(
          (res.body.data as { id: string; parentId: string | null; version: number }[]).map((r) => [
            r.id,
            r,
          ]),
        );
        expect(byId.get(a.id)).toMatchObject({ parentId: s.id, version: a.version + 1 });
        expect(byId.get(b.id)).toMatchObject({ parentId: s.id, version: b.version + 1 });
      });

      it('clears a member back to the top level on a null parentId', async () => {
        const { actor, planId } = await setup();
        const s = await summary(actor, planId, 'Substructure');
        const a = await task(actor, planId, 'Excavate');
        await actor.agent
          .patch(parentsUrl(planId))
          .send({ parents: [{ id: a.id, parentId: s.id, version: a.version }] })
          .expect(200);

        const res = await actor.agent
          .patch(parentsUrl(planId))
          .send({ parents: [{ id: a.id, parentId: null, version: a.version + 1 }] })
          .expect(200);
        expect(res.body.data[0]).toMatchObject({ id: a.id, parentId: null });
      });

      it('rejects the whole batch on one stale version, writing nothing (409)', async () => {
        const { actor, planId } = await setup();
        const s = await summary(actor, planId, 'Substructure');
        const a = await task(actor, planId, 'Excavate');
        const b = await task(actor, planId, 'Blind');

        await actor.agent
          .patch(parentsUrl(planId))
          .send({
            parents: [
              { id: a.id, parentId: s.id, version: a.version },
              { id: b.id, parentId: s.id, version: b.version + 5 }, // stale
            ],
          })
          .expect(409);

        // The decisive assertion: the GOOD row did not land either.
        const rows = await prisma.activity.findMany({ where: { id: { in: [a.id, b.id] } } });
        expect(rows.every((r) => r.parentId === null)).toBe(true);
        expect(rows.every((r) => r.version === 1)).toBe(true);
      });

      it('rejects a batch that is cycle-free row by row but cyclic as a whole (409)', async () => {
        const { actor, planId } = await setup();
        const s1 = await summary(actor, planId, 'A');
        const s2 = await summary(actor, planId, 'B');

        await actor.agent
          .patch(parentsUrl(planId))
          .send({
            parents: [
              { id: s1.id, parentId: s2.id, version: s1.version },
              { id: s2.id, parentId: s1.id, version: s2.version },
            ],
          })
          .expect(409);

        const rows = await prisma.activity.findMany({ where: { id: { in: [s1.id, s2.id] } } });
        expect(rows.every((r) => r.parentId === null)).toBe(true);
      });

      it('422s a non-summary parent and 404s an activity from another plan', async () => {
        const { actor, orgId, planId } = await setup();
        const a = await task(actor, planId, 'Excavate');
        const b = await task(actor, planId, 'Blind');
        await actor.agent
          .patch(parentsUrl(planId))
          .send({ parents: [{ id: a.id, parentId: b.id, version: a.version }] })
          .expect(422);

        // A second plan in the same org: its activity is not addressable through this plan's route.
        const project = await prisma.project.findFirstOrThrow({
          where: { organizationId: orgId },
        });
        const other = await actor.agent
          .post(`/api/v1/organizations/acme/projects/${project.id}/plans`)
          .send({ name: 'Other', plannedStart: '2026-01-01' })
          .expect(201);
        const foreign = await task(actor, other.body.data.id as string, 'Elsewhere');
        await actor.agent
          .patch(parentsUrl(planId))
          .send({ parents: [{ id: foreign.id, parentId: null, version: foreign.version }] })
          .expect(404);
      });

      it('forbids a Contributor and a Viewer (403)', async () => {
        const { actor, orgId, planId } = await setup();
        const a = await task(actor, planId, 'Excavate');
        const body = { parents: [{ id: a.id, parentId: null, version: a.version }] };

        const contributor = await signUp('parents-contrib@example.com');
        await prisma.orgMember.create({
          data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
        });
        await contributor.agent.patch(parentsUrl(planId)).send(body).expect(403);

        const viewer = await signUp('parents-viewer@example.com');
        await prisma.orgMember.create({
          data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
        });
        await viewer.agent.patch(parentsUrl(planId)).send(body).expect(403);
      });
    });

    describe('dissolve (remove the grouping, keep the work)', () => {
      const dissolveUrl = (id: string) => `/api/v1/organizations/acme/activities/${id}/dissolve`;

      async function task(actor: Actor, planId: string, name: string, parentId?: string) {
        const res = await actor.agent
          .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
          .send({ name, ...(parentId ? { parentId } : {}) })
          .expect(201);
        return { id: res.body.data.id as string, version: res.body.data.version as number };
      }

      it('promotes the children and loses no activity', async () => {
        const { actor, planId } = await setup();
        const s = await summary(actor, planId, 'Substructure');
        const a = await task(actor, planId, 'Excavate', s.id);
        const b = await task(actor, planId, 'Blind', s.id);
        const before = await prisma.activity.count({ where: { planId, deletedAt: null } });

        const res = await actor.agent.post(dissolveUrl(s.id)).expect(200);

        /*
         * The response carries the rows the caller could NOT have predicted — the summary's
         * children — at their NEW versions. Without it a cached copy of a promoted child is
         * silently stale and its next save 409s for a reason the user did not cause (the M6 API
         * review's finding; `docs/API.md`'s cross-resource-recompute rule).
         */
        expect(res.body.data.promoted).toHaveLength(2);
        expect(
          (res.body.data.promoted as { id: string; parentId: string | null; version: number }[])
            .map((r) => r.id)
            .sort(),
        ).toEqual([a.id, b.id].sort());
        for (const row of res.body.data.promoted as { version: number; parentId: null }[]) {
          expect(row.parentId).toBeNull();
          // Bumped past the version the caller was holding — that is the whole point of returning it.
          expect(row.version).toBeGreaterThan(1);
        }

        // The invariant that matters: exactly one row went (the summary), not the subtree.
        const after = await prisma.activity.count({ where: { planId, deletedAt: null } });
        expect(after).toBe(before - 1);
        const rows = await prisma.activity.findMany({ where: { id: { in: [a.id, b.id] } } });
        expect(rows.every((r) => r.deletedAt === null && r.parentId === null)).toBe(true);
        expect(await prisma.activity.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
          deletedAt: expect.any(Date) as Date,
        });
      });

      it('keeps a nested branch intact, moving it up one level', async () => {
        const { actor, planId } = await setup();
        const outer = await summary(actor, planId, 'Outer');
        const inner = await summary(actor, planId, 'Inner');
        await actor.agent
          .patch(`/api/v1/organizations/acme/activities/${inner.id}`)
          .send({ parentId: outer.id, version: inner.version })
          .expect(200);
        const leaf = await task(actor, planId, 'Leaf', inner.id);

        await actor.agent.post(dissolveUrl(outer.id)).expect(200);

        // Inner moved up to the top level; the leaf did NOT move — it is still Inner's child.
        expect(await prisma.activity.findUniqueOrThrow({ where: { id: inner.id } })).toMatchObject({
          parentId: null,
          deletedAt: null,
        });
        expect(await prisma.activity.findUniqueOrThrow({ where: { id: leaf.id } })).toMatchObject({
          parentId: inner.id,
        });
      });

      it('restores the summary ALONE — its former children stay promoted', async () => {
        const { actor, planId } = await setup();
        const s = await summary(actor, planId, 'Substructure');
        const a = await task(actor, planId, 'Excavate', s.id);
        await actor.agent.post(dissolveUrl(s.id)).expect(200);

        await actor.agent.post(`/api/v1/organizations/acme/activities/${s.id}/restore`).expect(200);

        expect(await prisma.activity.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
          deletedAt: null,
        });
        // Dissolve is not undone by restoring: the child stays where it was promoted to.
        expect(await prisma.activity.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
          parentId: null,
        });
      });

      it('422s a non-summary activity, leaving it active', async () => {
        const { actor, planId } = await setup();
        const a = await task(actor, planId, 'Excavate');
        await actor.agent.post(dissolveUrl(a.id)).expect(422);
        expect(await prisma.activity.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
          deletedAt: null,
        });
      });

      it('404s an activity in another organisation, and forbids a Contributor (403)', async () => {
        const { actor, orgId, planId } = await setup();
        const s = await summary(actor, planId, 'Substructure');

        const contributor = await signUp('dissolve-contrib@example.com');
        await prisma.orgMember.create({
          data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
        });
        await contributor.agent.post(dissolveUrl(s.id)).expect(403);

        const outsider = await signUp('dissolve-outsider@example.com');
        await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);
        await outsider.agent
          .post(`/api/v1/organizations/other-co/activities/${s.id}/dissolve`)
          .expect(404);
      });
    });

    it('rejects the mirror re-parent that would close a cycle, leaving the tree acyclic', async () => {
      const { actor, planId } = await setup();
      const a = await summary(actor, planId, 'A');
      const b = await summary(actor, planId, 'B');

      // "A under B" then "B under A". The second closes a loop, so the ancestor walk must reject it
      // (409) rather than persist it — optimistic `version` cannot catch this on its own, because
      // each request writes only its OWN row, at exactly the version it read.
      const url = (id: string) => `/api/v1/organizations/acme/activities/${id}`;
      const [r1, r2] = await Promise.all([
        actor.agent.patch(url(a.id)).send({ parentId: b.id, version: a.version }),
        actor.agent.patch(url(b.id)).send({ parentId: a.id, version: b.version }),
      ]);

      // One wins; the loser is rejected as a cycle — not silently dropped.
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);

      // The decisive assertion: the tree is still acyclic — at most one of the two carries a parent.
      const rows = await prisma.activity.findMany({ where: { id: { in: [a.id, b.id] } } });
      expect(rows.filter((r) => r.parentId !== null)).toHaveLength(1);
    });
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/activities')
      .expect(401);
  });
});
