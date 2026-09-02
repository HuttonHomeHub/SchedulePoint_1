import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for the three batch operations a canvas multi-select needs
 * (`docs/specs/canvas-multi-select/` M1) — `PATCH …/activities/placements`,
 * `POST …/activities/bulk-delete` and `POST …/activities/restore-batch/:batchId` — against a real
 * PostgreSQL and a real Better Auth session.
 *
 * The assertions that carry the design rather than the code are:
 *
 * - **all-or-nothing** on every route, checked by re-reading the rows that should NOT have moved.
 *   A partial batch is the failure mode that matters: it produces a schedule that looks deliberate.
 * - **one audit row for one act**, with scalar counts. Twelve rows for one gesture is the exact
 *   defect ADR-0073 C3.1 exists to prevent, and a nested count object records as `[object]`.
 * - **id-stable restore with its links** — the whole reason `restore-batch` was built rather than
 *   letting an undo re-create the activities (CQ-4).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Ref {
  id: string;
  version: number;
}

describe.skipIf(!hasDatabase)('Activity batch operations (e2e)', () => {
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
    // Same sweep order as the sibling specs: baselines and link tables before `activities`, audit
    // before its org. This spec creates no baseline, but the local database is shared with the ones
    // that do, and a leftover row makes `plan.deleteMany()` a foreign-key violation that names a
    // table this file never touches.
    // **The shared list, not a private copy** (`docs/TECH_DEBT.md` #119a). This hand-rolled its own
    // sweep and omitted `plan_shares`, so `plan.deleteMany()` died on `plan_shares_plan_id_fkey`
    // whenever a Playwright run left a share behind on the same database — the failure that took all
    // 45 of `activities.e2e-spec.ts` down. `clearDomainData` is a strict superset in the same
    // deepest-first order, ending identically, and it handles the append-only audit triggers itself.
    await clearDomainData(prisma);
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

  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const actor = await signUp('admin@example.com');
    const org = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    return { actor, orgId: org.body.data.id as string, planId: plan.body.data.id as string };
  }

  async function task(
    actor: Actor,
    planId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<Ref> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name, durationDays: 5, ...extra })
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  const placementsUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/activities/placements`;
  const bulkDeleteUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/activities/bulk-delete`;
  const restoreBatchUrl = (planId: string, batchId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/activities/restore-batch/${batchId}`;

  /** A complete placement row — every field stated, which is the DTO's whole contract. */
  const place = (ref: Ref, over: Partial<Record<string, unknown>> = {}) => ({
    id: ref.id,
    version: ref.version,
    constraintType: null,
    constraintDate: null,
    visualStart: null,
    laneIndex: null,
    ...over,
  });

  // -------------------------------------------------------------------------
  // PATCH …/activities/placements
  // -------------------------------------------------------------------------

  describe('batch placements', () => {
    it('moves several activities in time in one call and bumps their versions', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const b = await task(actor, planId, 'B');

      const res = await actor.agent
        .patch(placementsUrl(planId))
        .send({
          placements: [
            place(a, { constraintType: 'SNET', constraintDate: '2026-03-02' }),
            place(b, {
              constraintType: 'SNET',
              constraintDate: '2026-03-09',
              laneIndex: 4,
            }),
          ],
        })
        .expect(200);

      const byId = new Map(
        (
          res.body.data as Array<{
            id: string;
            constraintDate: string | null;
            laneIndex: number;
            version: number;
          }>
        ).map((x) => [x.id, x]),
      );
      expect(byId.get(a.id)).toMatchObject({
        constraintDate: '2026-03-02',
        laneIndex: 0, // null laneIndex left it alone
        version: 2,
      });
      expect(byId.get(b.id)).toMatchObject({ constraintDate: '2026-03-09', laneIndex: 4 });
    });

    it('clears a constraint when both fields are null', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A', {
        constraintType: 'SNET',
        constraintDate: '2026-02-02',
      });

      const res = await actor.agent
        .patch(placementsUrl(planId))
        .send({ placements: [place(a)] })
        .expect(200);
      expect(res.body.data[0]).toMatchObject({ constraintType: null, constraintDate: null });
    });

    it('rejects an omitted field rather than treating it as a clear (the complete-row rule)', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      // `visualStart` missing. With @IsOptional() this would pass and silently clear the field;
      // that is precisely the destructive default the DTO refuses.
      await actor.agent
        .patch(placementsUrl(planId))
        .send({
          placements: [
            {
              id: a.id,
              version: a.version,
              constraintType: null,
              constraintDate: null,
              laneIndex: null,
            },
          ],
        })
        .expect(422);
    });

    it('is all-or-nothing: one stale version rejects the batch (409) and nothing moves', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const b = await task(actor, planId, 'B');

      await actor.agent
        .patch(placementsUrl(planId))
        .send({
          placements: [
            place(a, { constraintType: 'SNET', constraintDate: '2026-03-02' }),
            place({ id: b.id, version: 99 }, { laneIndex: 7 }),
          ],
        })
        .expect(409);

      const got = await actor.agent
        .get(`/api/v1/organizations/acme/activities/${a.id}`)
        .expect(200);
      expect(got.body.data).toMatchObject({ constraintDate: null, version: 1 });
    });

    it('rejects an id from another plan (404) and moves nothing (anti-IDOR)', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const client2 = await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Other' })
        .expect(201);
      const proj2 = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${client2.body.data.id as string}/projects`)
        .send({ name: 'P2' })
        .expect(201);
      const plan2 = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${proj2.body.data.id as string}/plans`)
        .send({ name: 'Plan2', plannedStart: '2026-01-01' })
        .expect(201);
      const foreign = await task(actor, plan2.body.data.id as string, 'Foreign');

      await actor.agent
        .patch(placementsUrl(planId))
        .send({ placements: [place(a, { laneIndex: 3 }), place(foreign, { laneIndex: 3 })] })
        .expect(404);

      const got = await actor.agent
        .get(`/api/v1/organizations/acme/activities/${a.id}`)
        .expect(200);
      expect(got.body.data).toMatchObject({ laneIndex: 0 });
    });

    it('422s a duplicate id, and 422s a WBS summary in the batch', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      await actor.agent
        .patch(placementsUrl(planId))
        .send({ placements: [place(a), place(a)] })
        .expect(422);

      const s = await task(actor, planId, 'Substructure', {
        type: 'WBS_SUMMARY',
        durationDays: undefined,
      });
      await actor.agent
        .patch(placementsUrl(planId))
        .send({ placements: [place(s)] })
        .expect(422);
    });

    it('forbids a Contributor and a Viewer (403)', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const body = { placements: [place(a, { laneIndex: 1 })] };

      const contributor = await signUp('place-contrib@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
      });
      await contributor.agent.patch(placementsUrl(planId)).send(body).expect(403);

      const viewer = await signUp('place-viewer@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
      });
      await viewer.agent.patch(placementsUrl(planId)).send(body).expect(403);
    });

    it('leaves the same rows a batch leaves as the equivalent single PATCHes', async () => {
      // The parity assertion the plan asks for, stated at the level it can honestly be made: the
      // batch route is a second door onto the same columns, so what must be shown is that the door
      // does not change the values. Recalculation is not called by either path.
      const { actor, planId } = await setup();
      const viaBatch = await task(actor, planId, 'Batch');
      const viaSingle = await task(actor, planId, 'Single');

      await actor.agent
        .patch(placementsUrl(planId))
        .send({
          placements: [
            place(viaBatch, {
              constraintType: 'SNET',
              constraintDate: '2026-04-13',
              laneIndex: 6,
            }),
          ],
        })
        .expect(200);
      await actor.agent
        .patch(`/api/v1/organizations/acme/activities/${viaSingle.id}`)
        .send({
          constraintType: 'SNET',
          constraintDate: '2026-04-13',
          laneIndex: 6,
          version: viaSingle.version,
        })
        .expect(200);

      const rows = await prisma.activity.findMany({
        where: { id: { in: [viaBatch.id, viaSingle.id] } },
        select: { id: true, constraintType: true, constraintDate: true, laneIndex: true },
      });
      const [one, two] = rows.map(({ id: _id, ...rest }) => rest);
      expect(one).toEqual(two);
    });
  });

  // -------------------------------------------------------------------------
  // POST …/activities/bulk-delete
  // -------------------------------------------------------------------------

  describe('bulk delete', () => {
    it('deletes the batch under ONE delete_batch_id and records exactly ONE audit row', async () => {
      const { actor, orgId, planId } = await setup();
      const refs = [
        await task(actor, planId, 'A'),
        await task(actor, planId, 'B'),
        await task(actor, planId, 'C'),
      ];
      // A link between two of them, so the cascade count is not trivially the activity count.
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: refs[0]!.id, successorId: refs[1]!.id, type: 'FS' })
        .expect(201);

      const res = await actor.agent
        .post(bulkDeleteUrl(planId))
        .send({ activities: refs.map((r) => ({ id: r.id, version: r.version })) })
        .expect(200);
      expect(res.body.data).toMatchObject({ activityCount: 3, dependencyCount: 1 });
      const batchId = res.body.data.deleteBatchId as string;

      // ONE batch id across every swept row — what makes the undo one restore rather than three.
      const swept = await prisma.activity.findMany({
        where: { planId, deletedAt: { not: null } },
        select: { deleteBatchId: true },
      });
      expect(swept).toHaveLength(3);
      expect(new Set(swept.map((s) => s.deleteBatchId))).toEqual(new Set([batchId]));

      // ONE audit row for one act — never one per swept activity (ADR-0073 C3.1).
      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgId, action: 'activity.deleted' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ subjectType: 'PLAN', subjectId: planId });
      expect((events[0]!.changes as { after: Record<string, unknown> }).after).toMatchObject({
        deleteBatchId: batchId,
        activityCount: 3,
        dependencyCount: 1,
      });
    });

    it('is all-or-nothing: one stale version rejects the batch (409) and every row stays alive', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const b = await task(actor, planId, 'B');

      await actor.agent
        .post(bulkDeleteUrl(planId))
        .send({
          activities: [
            { id: a.id, version: a.version },
            { id: b.id, version: 99 },
          ],
        })
        .expect(409);

      const alive = await prisma.activity.count({ where: { planId, deletedAt: null } });
      expect(alive).toBe(2);
    });

    it('422s a WBS summary in the batch and changes nothing', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const s = await task(actor, planId, 'Substructure', {
        type: 'WBS_SUMMARY',
        durationDays: undefined,
      });

      await actor.agent
        .post(bulkDeleteUrl(planId))
        .send({
          activities: [
            { id: a.id, version: a.version },
            { id: s.id, version: s.version },
          ],
        })
        .expect(422);
      expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(2);
    });

    it('404s an id from another plan without deleting the in-plan one', async () => {
      const { actor, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const client2 = await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Other' })
        .expect(201);
      const proj2 = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${client2.body.data.id as string}/projects`)
        .send({ name: 'P2' })
        .expect(201);
      const plan2 = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${proj2.body.data.id as string}/plans`)
        .send({ name: 'Plan2', plannedStart: '2026-01-01' })
        .expect(201);
      const foreign = await task(actor, plan2.body.data.id as string, 'Foreign');

      await actor.agent
        .post(bulkDeleteUrl(planId))
        .send({
          activities: [
            { id: a.id, version: a.version },
            { id: foreign.id, version: foreign.version },
          ],
        })
        .expect(404);
      expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(1);
    });

    it('forbids a Contributor (403)', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await task(actor, planId, 'A');
      const contributor = await signUp('del-contrib@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
      });
      await contributor.agent
        .post(bulkDeleteUrl(planId))
        .send({ activities: [{ id: a.id, version: a.version }] })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST …/activities/restore-batch/:batchId
  // -------------------------------------------------------------------------

  describe('restore batch', () => {
    /**
     * **A CASCADE batch — a WBS summary deleted with its subtree — restored against a real
     * database** (`docs/TECH_DEBT.md` #230).
     *
     * Nothing in this repository had ever done this. The bulk case below is structurally safe
     * because its members' parents are outside the batch and already active; a cascade's are not.
     * `restoreBatch` runs `assertParentActive` on the anchor BEFORE restoring anything, and every
     * non-root member of a cascade batch has a parent that is still deleted at that instant — so
     * the restore succeeded only when an unrequested `findMany` ordering happened to return the
     * root first.
     *
     * **This case is a capability proof, not the gate — it does NOT go red against the defect, and
     * that was established by running it rather than assumed.** Against the pre-fix `ids[0]` it
     * passes, because Postgres returns the summary first when the summary was inserted first.
     *
     * Making it discriminating was attempted and abandoned, which is worth recording because the
     * attempt looked like it worked. Rewriting the summary's row after its children exist moves
     * its heap tuple to the end, a child becomes the first row back, and the pre-fix code then
     * answers 409 `PARENT_DELETED` — verified red, running this file alone. It does not survive a
     * full-suite run: `beforeEach` empties these tables 44 times, so the free-space map hands the
     * rewritten tuple a slot EARLIER in the heap and the summary comes back first again. A probe
     * asserting the hostile precondition caught that loudly instead of letting a green run prove
     * nothing — so the conclusion is the probe's, not a guess: **physical order is not something a
     * test can hold, so no e2e case can be the anchor's regression test.**
     *
     * What this does prove is that the cascade restore works end to end against a real database —
     * ids, nesting and the link inside the subtree — which nothing in this repository had ever
     * asserted. The anchor itself is pinned by `batch-restore-anchor.spec.ts`, child-first, where
     * no database ordering can flatter it.
     */
    it('restores a WBS summary deleted with its whole subtree', async () => {
      const { actor, planId } = await setup();
      const summary = await task(actor, planId, 'Substructure', { type: 'WBS_SUMMARY' });
      const first = await task(actor, planId, 'Excavate', { parentId: summary.id });
      const second = await task(actor, planId, 'Pour slab', { parentId: summary.id });
      // A link wholly inside the subtree — a re-create-based undo would lose it.
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: first.id, successorId: second.id, type: 'FS' })
        .expect(201);

      const deleted = await actor.agent
        .delete(`/api/v1/organizations/acme/activities/${summary.id}`)
        .expect(200);
      const batchId = deleted.body.data.deleteBatchId as string;
      expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(0);

      await actor.agent.post(restoreBatchUrl(planId, batchId)).expect(200);

      const live = await prisma.activity.findMany({
        where: { planId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      expect(live.map((a) => a.id).sort()).toEqual([first.id, second.id, summary.id].sort());
      // The nesting comes back, not just the rows — the subtree is what was deleted.
      expect(live.find((a) => a.id === first.id)?.parentId).toBe(summary.id);
      expect(live.find((a) => a.id === second.id)?.parentId).toBe(summary.id);
      expect(await prisma.activityDependency.count({ where: { planId, deletedAt: null } })).toBe(1);
    });

    it('brings every activity back with its ORIGINAL id and its links live again', async () => {
      const { actor, planId } = await setup();
      const refs: Ref[] = [];
      for (let i = 0; i < 12; i += 1) refs.push(await task(actor, planId, `A${i}`));
      // Two links wholly inside the batch: these are what a re-create-based undo would lose.
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: refs[0]!.id, successorId: refs[1]!.id, type: 'FS' })
        .expect(201);
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: refs[1]!.id, successorId: refs[2]!.id, type: 'FS' })
        .expect(201);

      const deleted = await actor.agent
        .post(bulkDeleteUrl(planId))
        .send({ activities: refs.map((r) => ({ id: r.id, version: r.version })) })
        .expect(200);
      const batchId = deleted.body.data.deleteBatchId as string;
      expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(0);

      // 200, not 201: this restores existing rows by their own ids and returns them (docs/API.md's
      // `POST :id/<verb>` sub-action rule). The suite asserted 201 for a while, which pinned the
      // defect rather than catching it.
      const restored = await actor.agent.post(restoreBatchUrl(planId, batchId)).expect(200);
      expect(restored.body.data).toHaveLength(12);
      // Id-stable — the point of the endpoint.
      expect(new Set((restored.body.data as Array<{ id: string }>).map((r) => r.id))).toEqual(
        new Set(refs.map((r) => r.id)),
      );
      const links = await prisma.activityDependency.count({ where: { planId, deletedAt: null } });
      expect(links).toBe(2);
    });

    it('404s a batch id that belongs to no deleted row in this plan', async () => {
      const { actor, planId } = await setup();
      await actor.agent
        .post(restoreBatchUrl(planId, '11111111-1111-4111-8111-111111111111'))
        .expect(404);
    });

    it('records ONE audit row for the restore, subject = the plan', async () => {
      const { actor, orgId, planId } = await setup();
      const refs = [await task(actor, planId, 'A'), await task(actor, planId, 'B')];
      const deleted = await actor.agent
        .post(bulkDeleteUrl(planId))
        .send({ activities: refs.map((r) => ({ id: r.id, version: r.version })) })
        .expect(200);
      await actor.agent
        .post(restoreBatchUrl(planId, deleted.body.data.deleteBatchId as string))
        .expect(200);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgId, action: 'activity.restored' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ subjectType: 'PLAN', subjectId: planId });
      expect((events[0]!.changes as { after: Record<string, unknown> }).after).toMatchObject({
        activityCount: 2,
      });
    });
  });
});
