import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import {
  collectPreview,
  main,
  openReadOnlyClient,
  renderPreview,
} from '../src/cli/clear-out-preview';
import * as candidates from '../src/common/hierarchy/hierarchy-expiry.candidates';
import * as runner from '../src/common/hierarchy/hierarchy-expiry.runner';
import { HierarchyExpiryService } from '../src/common/hierarchy/hierarchy-expiry.service';
import { HierarchyLifecycleService } from '../src/common/hierarchy/hierarchy-lifecycle.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';
import { clearActivityTree } from './clear-activity-tree';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * **The retention expiry against a real Postgres** (ADR-0096 D2/D5/D7).
 *
 * This is the only place the delete order can be proven, and the ONE case that matters is the one
 * no unit suite can produce: a plan that owns rows the soft-delete cascade never stamps —
 * `resource_assignments` and `cross_plan_dependencies` (`docs/TECH_DEBT.md` #139). A
 * `delete_batch_id`-keyed expiry passes on a bare plan and violates a foreign key on exactly the
 * plans a real customer has. Deriving the scope from **ownership** is what fixes it, and only a
 * real database can tell the two apart.
 *
 * The first four tests drive the runner **directly**. The rest drive the **sweep itself**
 * (`sweepNow`, obtained from the Nest container — the structural gate scans `src/` only), so the
 * selection, the claim, the audit row and the restore race are proven against Postgres rather than
 * a mocked Prisma. No timer is created and none is needed: the schedule is proven with a faked
 * clock in `hierarchy-expiry.service.spec.ts`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Hierarchy expiry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deleteExpiredScope: typeof import('../src/common/hierarchy/hierarchy-expiry.runner').deleteExpiredScope;
  let sweeper: HierarchyExpiryService;
  let lifecycle: HierarchyLifecycleService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    ({ deleteExpiredScope } = await import('../src/common/hierarchy/hierarchy-expiry.runner'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(Token);
    // `strict: false` because the module deliberately does not export the expiry service.
    sweeper = app.get(HierarchyExpiryService, { strict: false });
    lifecycle = app.get(HierarchyLifecycleService, { strict: false });
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // The `docs/TECH_DEBT.md` #119 order: link tables and activities first, or a sibling spec's
    // leftovers make this a foreign-key violation naming a table this file never touches.
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.activityStep.deleteMany();
    await prisma.note.deleteMany();
    await clearBaselineTree(prisma);
    await prisma.planShare.deleteMany();
    await clearActivityTree(prisma);
    await prisma.plan.deleteMany();
    await prisma.resource.deleteMany();
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

  async function createClient(actor: Actor, name: string): Promise<string> {
    const res = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createProject(actor: Actor, clientId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createPlan(actor: Actor, projectId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createActivity(orgId: string, planId: string, name: string): Promise<string> {
    const row = await prisma.activity.create({
      data: { organizationId: orgId, planId, name, durationMinutes: 1440 },
      select: { id: true },
    });
    return row.id;
  }

  it('permanently deletes a subtree carrying rows the cascade never stamps', async () => {
    // **The case that decides D5.** Both link tables below are left unstamped by the soft-delete
    // cascade, so a `delete_batch_id`-keyed delete would find nothing to remove and then fail the
    // foreign key on `activities` — on a resourced or programme-linked plan, i.e. a real one.
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');
    const activityId = await createActivity(orgId, planId, 'Excavate');

    // A live plan under a DIFFERENT client, so the cross-plan edge survives the expiring side.
    const otherClientId = await createClient(actor, 'Southgate');
    const otherProjectId = await createProject(actor, otherClientId, 'Hillside');
    const otherPlanId = await createPlan(actor, otherProjectId, 'Live');
    const otherActivityId = await createActivity(orgId, otherPlanId, 'Pour');

    const resource = await prisma.resource.create({
      data: { organizationId: orgId, name: 'Excavator', kind: 'EQUIPMENT' },
      select: { id: true },
    });
    await prisma.resourceAssignment.create({
      data: { organizationId: orgId, activityId, resourceId: resource.id, budgetedUnits: 8 },
    });
    await prisma.activityStep.create({
      data: { organizationId: orgId, activityId, seq: 1, name: 'Strip topsoil' },
    });
    await prisma.note.create({
      data: { organizationId: orgId, entityType: 'ACTIVITY', planId, activityId, body: 'Watch it' },
    });
    // History is RESTRICT into activities (ADR-0174 D8): the runner must delete it first, and count
    // it so the sweep can charge it to its budget.
    const recordedAt = new Date('2026-02-01T10:00:00.000Z');
    for (const [i, name] of ['name', 'durationMinutes'].entries()) {
      await prisma.activityHistoryEntry.create({
        data: {
          organizationId: orgId,
          activityId,
          actorUserId: actor.userId,
          scope: 'DEFINITION',
          firstRecordedAt: new Date(recordedAt.getTime() + i * 1000),
          lastRecordedAt: new Date(recordedAt.getTime() + i * 1000),
          hasNonCostChange: true,
          changes: { [name]: { from: 1, to: 2 } },
        },
      });
    }
    await prisma.crossPlanDependency.create({
      data: {
        organizationId: orgId,
        predecessorPlanId: planId,
        successorPlanId: otherPlanId,
        predecessorId: activityId,
        successorId: otherActivityId,
      },
    });
    const baseline = await prisma.baseline.create({
      data: { organizationId: orgId, planId, name: 'BL1' },
      select: { id: true },
    });
    await prisma.baselineActivity.create({
      data: {
        organizationId: orgId,
        baselineId: baseline.id,
        sourceActivityId: activityId,
        name: 'Excavate',
        durationMinutes: 1440,
      },
    });
    await prisma.planShare.create({
      data: { organizationId: orgId, planId, tokenHash: 'a'.repeat(64), label: 'QS' },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const counts = await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, { clientIds: [clientId], projectIds: [projectId], planIds: [planId] }),
    );

    expect(counts).toEqual({
      clients: 1,
      projects: 1,
      plans: 1,
      activities: 1,
      activityHistoryEntries: 2,
    });
    expect(await prisma.activityHistoryEntry.count()).toBe(0);
    expect(await prisma.client.findUnique({ where: { id: clientId } })).toBeNull();
    expect(await prisma.plan.findUnique({ where: { id: planId } })).toBeNull();
    expect(await prisma.activity.findUnique({ where: { id: activityId } })).toBeNull();
    expect(await prisma.resourceAssignment.count()).toBe(0);
    expect(await prisma.crossPlanDependency.count()).toBe(0);
    expect(await prisma.note.count()).toBe(0);
    expect(await prisma.baseline.count()).toBe(0);
    expect(await prisma.planShare.count()).toBe(0);

    // The other side of the link is untouched: an expiry may only ever reach what its scope owns.
    expect(await prisma.plan.findUnique({ where: { id: otherPlanId } })).not.toBeNull();
    expect(await prisma.activity.findUnique({ where: { id: otherActivityId } })).not.toBeNull();
    // The org-scoped resource is a LIBRARY row, not part of the subtree.
    expect(await prisma.resource.count()).toBe(1);
  });

  it('deletes a WBS chain in one statement, whatever its depth (D7)', async () => {
    // `activities.parent_id` is `onDelete: Restrict`, and the spec claimed that forced a repeated
    // leaves-first loop. RESTRICT is an AFTER ROW trigger evaluated at the END of the statement, so
    // every row the statement targets is already gone before any check runs.
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Deep');

    let parentId: string | null = null;
    for (let depth = 0; depth < 40; depth += 1) {
      const row: { id: string } = await prisma.activity.create({
        data: {
          organizationId: orgId,
          planId,
          name: `L${depth}`,
          durationMinutes: 1440,
          type: 'WBS_SUMMARY',
          parentId,
        },
        select: { id: true },
      });
      parentId = row.id;
    }

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const counts = await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, { clientIds: [clientId], projectIds: [projectId], planIds: [planId] }),
    );
    expect(counts.activities).toBe(40);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('leaves an ORG calendar alone and takes the project-scoped one', async () => {
    // ADR-0053: an ORG calendar is shared and outlives the project entirely. Expiring one would
    // silently take working time away from every other project that binds it.
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');

    const orgCalendar = await prisma.calendar.create({
      data: { organizationId: orgId, name: 'Standard week', scope: 'ORG' },
      select: { id: true },
    });
    const projectCalendar = await prisma.calendar.create({
      data: { organizationId: orgId, name: 'Site week', scope: 'PROJECT', projectId },
      select: { id: true },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, { clientIds: [clientId], projectIds: [projectId], planIds: [] }),
    );

    expect(await prisma.calendar.findUnique({ where: { id: orgCalendar.id } })).not.toBeNull();
    expect(await prisma.calendar.findUnique({ where: { id: projectCalendar.id } })).toBeNull();
  });

  it('leaves the surviving downstream plan recalculable after its upstream vanishes', async () => {
    // **The ADR's own M4 obligation** (ADR-0096, Consequences): expiring a plan that is a live
    // cross-plan dependency endpoint changes the SURVIVING downstream plan's next input, and the
    // parity sentence about the CPM engine does not cover it. ADR-0045 derives the downstream
    // bound from the upstream plan's persisted dates; with the upstream row gone, the closure it
    // walks has one fewer node — which either works or 500s, and only a real database says which.
    const { actor, orgId } = await adminWithOrg();
    const upClientId = await createClient(actor, 'Northgate');
    const upProjectId = await createProject(actor, upClientId, 'Riverside');
    const upPlanId = await createPlan(actor, upProjectId, 'Enabling works');
    const upActivityId = await createActivity(orgId, upPlanId, 'Demolish');

    const downClientId = await createClient(actor, 'Southgate');
    const downProjectId = await createProject(actor, downClientId, 'Hillside');
    const downPlanId = await createPlan(actor, downProjectId, 'Main works');
    const downActivityId = await createActivity(orgId, downPlanId, 'Pour slab');

    await prisma.crossPlanDependency.create({
      data: {
        organizationId: orgId,
        predecessorPlanId: upPlanId,
        successorPlanId: downPlanId,
        predecessorId: upActivityId,
        successorId: downActivityId,
      },
    });

    // Green before, so the assertion after is about the expiry and not about the fixture.
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${downPlanId}/schedule/recalculate-programme`)
      .expect(200);

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${upClientId}`).expect(204);
    await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, {
        clientIds: [upClientId],
        projectIds: [upProjectId],
        planIds: [upPlanId],
      }),
    );

    const after = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${downPlanId}/schedule/recalculate-programme`)
      .expect(200);
    expect(after.body.data).toBeDefined();

    // And the single-plan route, which is what the canvas actually calls.
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${downPlanId}/schedule/recalculate`)
      .expect(200);
  });

  // ---------------------------------------------------------------------------------------------
  // The sweep itself, on a real database (docs/specs/recycle-bin-clear-out, M1)
  // ---------------------------------------------------------------------------------------------

  const DAY_MS = 86_400_000;

  /** The period the running API was configured with; 90 unless the environment says otherwise. */
  const retentionDays = () => Number(process.env.RETENTION_HIERARCHY_DAYS ?? 90);
  const cutoffFor = (now: Date) => new Date(now.getTime() - retentionDays() * DAY_MS);
  const pastPeriod = (now: Date, extraDays = 1) =>
    new Date(now.getTime() - (retentionDays() + extraDays) * DAY_MS);

  /** Date every row of a deletion batch, as if it had been deleted at `at`. */
  async function backdate(root: { client?: string; project?: string; plan?: string }, at: Date) {
    const row = root.client
      ? await prisma.client.findUniqueOrThrow({ where: { id: root.client } })
      : root.project
        ? await prisma.project.findUniqueOrThrow({ where: { id: root.project } })
        : await prisma.plan.findUniqueOrThrow({ where: { id: root.plan! } });
    expect(row.deleteBatchId, 'the root must be soft-deleted first').not.toBeNull();
    const where = { deleteBatchId: row.deleteBatchId };
    await prisma.client.updateMany({ where, data: { deletedAt: at } });
    await prisma.project.updateMany({ where, data: { deletedAt: at } });
    await prisma.plan.updateMany({ where, data: { deletedAt: at } });
  }

  const exists = {
    client: async (id: string) => (await prisma.client.count({ where: { id } })) === 1,
    project: async (id: string) => (await prisma.project.count({ where: { id } })) === 1,
    plan: async (id: string) => (await prisma.plan.count({ where: { id } })) === 1,
  };

  const expiredRows = () => prisma.auditEvent.findMany({ where: { action: 'hierarchy.expired' } });

  /** The mixed picture the sweep-level tests share. Returns the ids by role. */
  async function seedMix(actor: Actor, orgId: string, now: Date) {
    const old = pastPeriod(now, 10);
    const soon = new Date(now.getTime() - (retentionDays() - 3) * DAY_MS);

    // An expired CLIENT with a project and a plan beneath it, all deleted together.
    const expiredClient = await createClient(actor, 'Northgate');
    const expiredClientProject = await createProject(actor, expiredClient, 'Riverside');
    const expiredClientPlan = await createPlan(actor, expiredClientProject, 'Baseline');
    await createActivity(orgId, expiredClientPlan, 'Excavate');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${expiredClient}`).expect(204);
    await backdate({ client: expiredClient }, old);

    // A live client holding: an expired PROJECT (with its plan), an expired PLAN on a live project,
    // a plan due in three days, and live work that must survive.
    const liveClient = await createClient(actor, 'Southgate');
    const expiredProject = await createProject(actor, liveClient, 'Hillside');
    const expiredProjectPlan = await createPlan(actor, expiredProject, 'Hill plan');
    await actor.agent.delete(`/api/v1/organizations/acme/projects/${expiredProject}`).expect(204);
    await backdate({ project: expiredProject }, old);

    const liveProject = await createProject(actor, liveClient, 'Quayside');
    const expiredPlan = await createPlan(actor, liveProject, 'Old base');
    const duePlan = await createPlan(actor, liveProject, 'Due soon');
    const livePlan = await createPlan(actor, liveProject, 'Live plan');
    await createActivity(orgId, livePlan, 'Pour');
    await actor.agent.delete(`/api/v1/organizations/acme/plans/${expiredPlan}`).expect(204);
    await backdate({ plan: expiredPlan }, old);
    await actor.agent.delete(`/api/v1/organizations/acme/plans/${duePlan}`).expect(204);
    await backdate({ plan: duePlan }, soon);

    // An ORG calendar the expiring project must not take.
    const orgCalendar = await prisma.calendar.create({
      data: { organizationId: orgId, name: 'Standard week', scope: 'ORG' },
      select: { id: true },
    });

    return {
      expiredClient,
      expiredClientProject,
      expiredClientPlan,
      expiredProject,
      expiredProjectPlan,
      expiredPlan,
      duePlan,
      liveClient,
      liveProject,
      livePlan,
      orgCalendar: orgCalendar.id,
    };
  }

  describe('the sweep, end to end (P5)', () => {
    it('takes all three levels, once each, and leaves everything else alone', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      const ids = await seedMix(actor, orgId, now);

      await sweeper.sweepNow(now);

      expect(await exists.client(ids.expiredClient)).toBe(false);
      expect(await exists.project(ids.expiredClientProject)).toBe(false);
      expect(await exists.plan(ids.expiredClientPlan)).toBe(false);
      expect(await exists.project(ids.expiredProject)).toBe(false);
      expect(await exists.plan(ids.expiredProjectPlan)).toBe(false);
      expect(await exists.plan(ids.expiredPlan)).toBe(false);

      // Not yet due, and live: untouched. The ORG calendar outlives the project beside it.
      expect(await exists.plan(ids.duePlan)).toBe(true);
      expect(await exists.client(ids.liveClient)).toBe(true);
      expect(await exists.project(ids.liveProject)).toBe(true);
      expect(await exists.plan(ids.livePlan)).toBe(true);
      expect(await prisma.activity.count({ where: { planId: ids.livePlan } })).toBe(1);
      expect(await prisma.calendar.count({ where: { id: ids.orgCalendar } })).toBe(1);

      // **Exactly one row per ROOT.** The expired client's project and plan are also past their
      // period, and attempting them again would write a second, all-zero row for each.
      const rows = await expiredRows();
      expect(rows.map((r) => `${r.subjectType}:${r.subjectId}`).sort()).toEqual(
        [
          `client:${ids.expiredClient}`,
          `project:${ids.expiredProject}`,
          `plan:${ids.expiredPlan}`,
        ].sort(),
      );
    });

    it('a second sweep finds nothing and writes nothing', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      await seedMix(actor, orgId, now);
      await sweeper.sweepNow(now);
      const before = (await expiredRows()).length;

      await sweeper.sweepNow(now);

      expect((await expiredRows()).length).toBe(before);
    });
  });

  describe.each(['UTC', 'Europe/London'])('the exact period boundary under TZ=%s (P6)', (zone) => {
    const priorTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (priorTz === undefined) delete process.env.TZ;
      else process.env.TZ = priorTz;
    });

    // 2026-10-25 01:30Z is inside the hour the UK repeats when summer time ends; the March date is
    // the hour it skips.
    it.each([new Date('2026-10-25T01:30:00.000Z'), new Date('2026-03-29T01:30:00.000Z')])(
      'keeps a plan deleted AT the cutoff and removes one a millisecond older (now %s)',
      async (now) => {
        const { actor } = await adminWithOrg();
        const clientId = await createClient(actor, 'Northgate');
        const projectId = await createProject(actor, clientId, 'Riverside');
        const atCutoff = await createPlan(actor, projectId, 'At the cutoff');
        const justOlder = await createPlan(actor, projectId, 'A millisecond older');
        const cutoff = cutoffFor(now);
        for (const [planId, at] of [
          [atCutoff, cutoff],
          [justOlder, new Date(cutoff.getTime() - 1)],
        ] as const) {
          await prisma.plan.update({
            where: { id: planId },
            data: { deletedAt: at, deleteBatchId: randomUUID() },
          });
        }

        await sweeper.sweepNow(now);

        expect(await exists.plan(atCutoff)).toBe(true);
        expect(await exists.plan(justOlder)).toBe(false);
        // The clock changing is a wall-clock event only: 90 x 24 hours either side of it.
        expect(cutoff.getTime()).toBe(now.getTime() - retentionDays() * DAY_MS);
      },
    );
  });

  describe('a restore and the sweep never both win (P7)', () => {
    /** Wait until some other session is blocked on a lock — proof both sides are in play. */
    async function waitForLockWait(): Promise<void> {
      for (let i = 0; i < 100; i += 1) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*)::bigint AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (Number(rows[0]?.n ?? 0) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('nothing ever blocked on a lock: the race was not exercised');
    }

    /** Run `gap` in the window between the sweep choosing a root and the transaction that deletes it. */
    function inTheGap(gap: () => Promise<void>) {
      const original = candidates.resolveExpiryScope;
      vi.spyOn(candidates, 'resolveExpiryScope').mockImplementation(async (reader, root) => {
        await gap();
        return original(reader, root);
      });
    }

    async function expiredPlanOf(actor: Actor, now: Date) {
      const clientId = await createClient(actor, 'Northgate');
      const projectId = await createProject(actor, clientId, 'Riverside');
      const planId = await createPlan(actor, projectId, 'Race');
      await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);
      await backdate({ plan: planId }, pastPeriod(now));
      return { clientId, projectId, planId };
    }

    it('a restore committed between selection and the transaction removes nothing', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      const { planId } = await expiredPlanOf(actor, now);
      await createActivity(orgId, planId, 'Excavate');
      inTheGap(async () => {
        await actor.agent.post(`/api/v1/organizations/acme/plans/${planId}/restore`).expect(200);
      });

      await sweeper.sweepNow(now);

      expect(await exists.plan(planId), 'the restored plan must survive').toBe(true);
      expect((await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).deletedAt).toBeNull();
      expect(await prisma.activity.count({ where: { planId } })).toBe(1);
      expect(await expiredRows()).toEqual([]);
    });

    it('restore-then-delete-again in the gap leaves the new deletion alone', async () => {
      const { actor } = await adminWithOrg();
      const now = new Date();
      const { planId } = await expiredPlanOf(actor, now);
      inTheGap(async () => {
        await actor.agent.post(`/api/v1/organizations/acme/plans/${planId}/restore`).expect(200);
        await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);
      });

      await sweeper.sweepNow(now);

      // Deleted again just now, so a fresh `deletedAt`: in the bin, not removed.
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
      expect(plan.deletedAt).not.toBeNull();
      expect(await expiredRows()).toEqual([]);
    });

    it('a restore that holds the row first is not undone by the sweep waiting behind it', async () => {
      const { actor } = await adminWithOrg();
      const now = new Date();
      const { planId } = await expiredPlanOf(actor, now);
      let release!: () => void;
      const hold = new Promise<void>((resolve) => (release = resolve));
      let restoreHolding!: () => void;
      const holding = new Promise<void>((resolve) => (restoreHolding = resolve));

      // A real restore transaction that has changed the row and not yet committed.
      const restoring = prisma.$transaction(async (tx) => {
        await lifecycle.restoreBatch(tx, 'plan', planId, actor.userId);
        restoreHolding();
        await hold;
      });
      await holding;

      const sweeping = sweeper.sweepNow(now);
      await waitForLockWait();
      release();
      await Promise.all([restoring, sweeping]);

      // Without the claim the sweep's id-keyed delete waits for the same lock, re-reads the row,
      // finds it still there and removes the plan the planner had just brought back.
      expect(await exists.plan(planId), 'the restored plan must survive').toBe(true);
      expect((await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).deletedAt).toBeNull();
      expect(await expiredRows()).toEqual([]);
    });

    it.each(['client', 'project', 'plan'] as const)(
      'a %s restore that loses to a claimed deletion answers 404 and the subtree stays gone',
      async (kind) => {
        const { actor } = await adminWithOrg();
        const now = new Date();
        const { clientId, projectId, planId } = await expiredPlanOf(actor, now);
        const rootId = { client: clientId, project: projectId, plan: planId }[kind];
        // `expiredPlanOf` deleted the plan; for the higher levels, bring it back and delete the
        // level under test instead, so that level is the expiring root.
        if (kind !== 'plan') {
          await actor.agent.post(`/api/v1/organizations/acme/plans/${planId}/restore`).expect(200);
          await actor.agent.delete(`/api/v1/organizations/acme/${kind}s/${rootId}`).expect(204);
          await backdate({ [kind]: rootId }, pastPeriod(now));
        }

        // Hold the deleting transaction open after it has claimed and deleted, so a restore arrives
        // while the row is locked and then finds it gone.
        let release!: () => void;
        const hold = new Promise<void>((resolve) => (release = resolve));
        let deleted!: () => void;
        const deletedSignal = new Promise<void>((resolve) => (deleted = resolve));
        const realDelete = runner.deleteExpiredScope;
        vi.spyOn(runner, 'deleteExpiredScope').mockImplementation(async (tx, scope) => {
          const counts = await realDelete(tx, scope);
          deleted();
          await hold;
          return counts;
        });

        const sweeping = sweeper.sweepNow(now);
        await deletedSignal;
        const response = actor.agent
          .post(`/api/v1/organizations/acme/${kind}s/${rootId}/restore`)
          .then((r) => r);
        await waitForLockWait();
        release();
        await sweeping;
        const result = await response;

        expect(result.status).toBe(404);
        expect(result.body.error).toBeDefined();
        // The service records `<kind>.restored` inside the restore transaction. A restore that
        // restored nothing must not leave that row behind: the 404 alone is only the controller's
        // later re-read, after the transaction has committed.
        expect(await prisma.auditEvent.count({ where: { action: `${kind}.restored` } })).toBe(0);
        expect(await exists[kind](rootId)).toBe(false);
        const rows = await expiredRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.subjectType).toBe(kind);
      },
    );
  });

  describe('the preview lists exactly what the sweep deletes (P8)', () => {
    const settings = () => ({
      enabled: false,
      retentionDays: retentionDays(),
      sweepIntervalMinutes: 60,
    });

    it('names the same roots the sweep then removes, and the next-seven-days list is the rest', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      const ids = await seedMix(actor, orgId, now);

      const preview = await collectPreview(prisma, now, settings());
      const listed = preview.due.map((i) => `${i.kind}:${i.id}`).sort();
      const binned = [
        ...(await prisma.client.findMany({ where: { deletedAt: { not: null } } })).map(
          (r) => `client:${r.id}`,
        ),
        ...(await prisma.project.findMany({ where: { deletedAt: { not: null } } })).map(
          (r) => `project:${r.id}`,
        ),
        ...(await prisma.plan.findMany({ where: { deletedAt: { not: null } } })).map(
          (r) => `plan:${r.id}`,
        ),
      ];

      await sweeper.sweepNow(now);

      const gone: string[] = [];
      for (const key of binned) {
        const [kind, id] = key.split(':') as ['client' | 'project' | 'plan', string];
        if (!(await exists[kind](id))) gone.push(key);
      }
      // Everything that went was a listed root or sat under one, and every listed root went. Both
      // directions, or the preview is lying one way.
      const underListed = new Set([
        `project:${ids.expiredClientProject}`,
        `plan:${ids.expiredClientPlan}`,
        `plan:${ids.expiredProjectPlan}`,
      ]);
      expect(gone.filter((k) => !underListed.has(k)).sort()).toEqual(listed);
      expect(listed).toEqual(
        [
          `client:${ids.expiredClient}`,
          `project:${ids.expiredProject}`,
          `plan:${ids.expiredPlan}`,
        ].sort(),
      );
      expect(preview.dueSoon.map((i) => i.id)).toEqual([ids.duePlan]);
      expect(await exists.plan(ids.duePlan)).toBe(true);

      // The preview counted what the sweep then took out of the client's subtree.
      const clientItem = preview.due.find((i) => i.id === ids.expiredClient)!;
      expect(clientItem).toMatchObject({ projects: 1, plans: 1, activities: 1, name: 'Northgate' });
      expect(preview.organizations.get(orgId)).toBe('Acme');
    });

    it('renders what the operator reads, and an emptied bin says so', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      await seedMix(actor, orgId, now);
      const text = renderPreview(await collectPreview(prisma, now, settings()));
      expect(text).toContain('The clear-out is OFF on this server.');
      expect(text).toContain('Organisation "Acme"');
      expect(text).toContain('Client  "Northgate"');
      expect(text).toContain('Plan    "Due soon"');
      expect(text).toContain('Nothing has been changed.');

      await sweeper.sweepNow(now);
      const after = renderPreview(await collectPreview(prisma, now, settings()));
      expect(after).toContain('Nothing is past its');
      expect(after).not.toContain('Northgate');
    });

    it('through a read-only session: lists the same, and refuses every write', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      await seedMix(actor, orgId, now);
      const viaApp = await collectPreview(prisma, now, settings());

      const readOnly = await openReadOnlyClient(process.env.DATABASE_URL!);
      try {
        const viaReadOnly = await collectPreview(readOnly, now, settings());
        expect(viaReadOnly.due.map((i) => i.id).sort()).toEqual(viaApp.due.map((i) => i.id).sort());

        const before = await prisma.organization.count();
        await expect(
          readOnly.organization.create({ data: { name: 'Nope', slug: 'nope' } }),
        ).rejects.toThrow(/read-only/i);
        await expect(readOnly.$executeRaw`DELETE FROM "plans"`).rejects.toThrow(/read-only/i);
        await expect(
          readOnly.plan.updateMany({ where: {}, data: { deletedAt: null } }),
        ).rejects.toThrow(/read-only/i);
        expect(await prisma.organization.count()).toBe(before);
        expect(await prisma.plan.count({ where: { deletedAt: { not: null } } })).toBeGreaterThan(0);
      } finally {
        await readOnly.$disconnect();
      }
    });

    it('the command itself prints the report and changes nothing', async () => {
      const { actor, orgId } = await adminWithOrg();
      const now = new Date();
      const ids = await seedMix(actor, orgId, now);
      const written: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        written.push(String(chunk));
        return true;
      });

      const code = await main();
      vi.restoreAllMocks();

      expect(code).toBe(0);
      expect(written.join('')).toContain('Client  "Northgate"');
      expect(await exists.client(ids.expiredClient)).toBe(true);
      expect(await expiredRows()).toEqual([]);
    });
  });

  describe('the audit row the sweep leaves (P9)', () => {
    it('is a SYSTEM row in the right organisation, with every count, readable by an Org Admin only', async () => {
      const { actor, orgId } = await adminWithOrg();
      const clientId = await createClient(actor, 'Northgate');
      const projectId = await createProject(actor, clientId, 'Riverside');
      const planId = await createPlan(actor, projectId, 'Baseline');
      const activityId = await createActivity(orgId, planId, 'Excavate');
      await createActivity(orgId, planId, 'Backfill');
      for (const name of ['name', 'durationMinutes']) {
        await prisma.activityHistoryEntry.create({
          data: {
            organizationId: orgId,
            activityId,
            actorUserId: actor.userId,
            scope: 'DEFINITION',
            firstRecordedAt: new Date('2026-02-01T10:00:00.000Z'),
            lastRecordedAt: new Date('2026-02-01T10:00:00.000Z'),
            hasNonCostChange: true,
            changes: { [name]: { from: 1, to: 2 } },
          },
        });
      }
      await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);
      const now = new Date();
      const deletedAt = pastPeriod(now, 5);
      await backdate({ client: clientId }, deletedAt);

      await sweeper.sweepNow(now);

      const [stored] = await expiredRows();
      expect(stored).toMatchObject({
        actorType: 'SYSTEM',
        organizationId: orgId,
        subjectType: 'client',
        subjectId: clientId,
        subjectLabel: 'Northgate',
        outcome: 'SUCCESS',
      });

      const planner = await signUp('planner@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: planner.userId, role: 'PLANNER' },
      });

      const read = await actor.agent
        .get('/api/v1/organizations/acme/audit-events?action=hierarchy.expired')
        .expect(200);
      const rows = read.body.data as Array<{
        actorType: string;
        changes: { after: Record<string, unknown> };
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actorType).toBe('SYSTEM');
      expect(rows[0]?.changes.after).toMatchObject({
        name: 'Northgate',
        retentionDays: retentionDays(),
        deletedAt: deletedAt.toISOString(),
        clientCount: 1,
        projectCount: 1,
        planCount: 1,
        activityCount: 2,
        // Allowlisted in the redactor: this field was recorded and then dropped from every row.
        activityHistoryCount: 2,
      });

      await planner.agent
        .get('/api/v1/organizations/acme/audit-events?action=hierarchy.expired')
        .expect(403);
    });
  });
});
