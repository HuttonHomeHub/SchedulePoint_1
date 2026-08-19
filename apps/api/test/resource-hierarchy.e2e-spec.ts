import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { RESOURCE_KINDS, RESOURCE_TREE_MAX_DEPTH } from '@repo/types';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the RESOURCE HIERARCHY (M3 of the library-scoping epic, ADR-0053 §3),
 * against a real PostgreSQL + Better Auth session:
 *
 *  - creating a `GROUP` and nesting resources under it, and the `?parentId=` tree filter;
 *  - every reject path: cycle (self and descendant), non-GROUP parent, cross-org parent (404,
 *    never an existence oracle), depth cap, and a GROUP given scheduling fields;
 *  - the `GROUP_NOT_ASSIGNABLE` bar at the assignment seam — the single fact the whole
 *    levelling / histogram / EV parity argument rests on;
 *  - the kind-change guards in both directions (assigned → GROUP, GROUP-with-children → LABOUR);
 *  - the subtree delete: blocked by a descendant's assignment (with the SUBTREE count), otherwise
 *    soft-deleting the whole branch under ONE `delete_batch_id` (the restore unit);
 *  - CONCURRENT MIRROR REPARENTS, which is the only reason the tree lock is org-scoped;
 *  - the two DB CHECKs, exercised from RAW SQL so the database is proven to be the last line of
 *    defence even if the service were bypassed — including the FAIL-CLOSED round-trip over every
 *    `ResourceKind` value, which goes red the moment a kind is added without a CHECK branch.
 *
 * Resources have no restore endpoint (they are a sibling library, not a hierarchy level), so the
 * restore half of the cascade is asserted at the DB level: one shared batch id makes the branch a
 * single restore unit, which is what the ADR-0038 precedent buys.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Resource hierarchy (e2e)', () => {
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

  async function resetDatabase(): Promise<void> {
    await prisma.resourceAssignment.deleteMany();
    // Children before parents so the self-FK never bites: null every parent link first.
    await prisma.resource.updateMany({ data: { parentId: null } });
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarExceptionWindow.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendarShift.deleteMany();
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
  }

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const base = '/api/v1/organizations/acme/resources';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(
    email = 'admin@example.com',
    name = 'Acme',
  ): Promise<{ actor: Actor; orgId: string; slug: string }> {
    const actor = await signUp(email);
    const res = await actor.agent.post('/api/v1/organizations').send({ name }).expect(201);
    return {
      actor,
      orgId: res.body.data.id as string,
      slug: res.body.data.slug as string,
    };
  }

  /** Seed a client → project → plan → activity directly (the activity write path is pen-gated). */
  async function seedActivity(orgId: string, userId: string): Promise<string> {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: 'C', createdBy: userId },
    });
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId: client.id, name: 'P', createdBy: userId },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: 'Pl',
        plannedStart: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: userId,
      },
    });
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId: plan.id,
        name: 'A',
        durationMinutes: 1440,
        createdBy: userId,
      },
    });
    return activity.id;
  }

  async function create(
    actor: Actor,
    body: Record<string, unknown>,
    slug = 'acme',
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${slug}/resources`)
      .send(body)
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  it('creates a GROUP and nests resources under it, exposing parentId on every row', async () => {
    const { actor } = await adminWithOrg();
    const group = await create(actor, { name: 'Groundworks', kind: 'GROUP' });
    const child = await create(actor, { name: 'Crew A', kind: 'LABOUR', parentId: group.id });

    const list = await actor.agent.get(base).expect(200);
    const rows = list.body.data as { id: string; parentId: string | null; kind: string }[];
    expect(rows.find((r) => r.id === group.id)).toMatchObject({ kind: 'GROUP', parentId: null });
    expect(rows.find((r) => r.id === child.id)).toMatchObject({ parentId: group.id });
  });

  it('filters by ?parentId= (a group id) and ?parentId=null (top level)', async () => {
    const { actor } = await adminWithOrg();
    const group = await create(actor, { name: 'Plant', kind: 'GROUP' });
    const child = await create(actor, { name: 'CR600', kind: 'EQUIPMENT', parentId: group.id });
    const loose = await create(actor, { name: 'Loose', kind: 'LABOUR' });

    const children = await actor.agent.get(`${base}?parentId=${group.id}`).expect(200);
    expect((children.body.data as { id: string }[]).map((r) => r.id)).toEqual([child.id]);

    const top = await actor.agent.get(`${base}?parentId=null`).expect(200);
    expect((top.body.data as { id: string }[]).map((r) => r.id).sort()).toEqual(
      [group.id, loose.id].sort(),
    );

    // Omitted ⇒ the whole flat library, exactly as before the tree existed.
    const all = await actor.agent.get(base).expect(200);
    expect((all.body.data as unknown[]).length).toBe(3);
  });

  it('re-parents an existing resource, and back to top level with an explicit null', async () => {
    const { actor } = await adminWithOrg();
    const group = await create(actor, { name: 'G', kind: 'GROUP' });
    const child = await create(actor, { name: 'Crew', kind: 'LABOUR' });

    const moved = await actor.agent
      .patch(`${base}/${child.id}`)
      .send({ parentId: group.id, version: child.version })
      .expect(200);
    expect(moved.body.data.parentId).toBe(group.id);

    const promoted = await actor.agent
      .patch(`${base}/${child.id}`)
      .send({ parentId: null, version: moved.body.data.version as number })
      .expect(200);
    expect(promoted.body.data.parentId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Reject paths
  // -------------------------------------------------------------------------

  it('409s RESOURCE_PARENT_CYCLE for a self-parent and for a descendant parent', async () => {
    const { actor } = await adminWithOrg();
    const top = await create(actor, { name: 'Top', kind: 'GROUP' });
    const mid = await create(actor, { name: 'Mid', kind: 'GROUP', parentId: top.id });

    const self = await actor.agent
      .patch(`${base}/${top.id}`)
      .send({ parentId: top.id, version: top.version })
      .expect(409);
    expect(self.body.error.details.reason).toBe('RESOURCE_PARENT_CYCLE');

    const descendant = await actor.agent
      .patch(`${base}/${top.id}`)
      .send({ parentId: mid.id, version: top.version })
      .expect(409);
    expect(descendant.body.error.details.reason).toBe('RESOURCE_PARENT_CYCLE');

    // Nothing was written: `top` is still top-level.
    const row = await prisma.resource.findUniqueOrThrow({ where: { id: top.id } });
    expect(row.parentId).toBeNull();
  });

  it('422s RESOURCE_PARENT_NOT_GROUP when the parent is an ordinary resource', async () => {
    const { actor } = await adminWithOrg();
    const crew = await create(actor, { name: 'Crew', kind: 'LABOUR' });
    const res = await actor.agent
      .post(base)
      .send({ name: 'Nested', kind: 'LABOUR', parentId: crew.id })
      .expect(422);
    expect(res.body.error.details.reason).toBe('RESOURCE_PARENT_NOT_GROUP');
  });

  it('404s for a parent in ANOTHER organisation — the tree is not an existence oracle', async () => {
    const other = await adminWithOrg('other@example.com', 'Other Co');
    const foreignGroup = await create(other.actor, { name: 'Theirs', kind: 'GROUP' }, other.slug);
    const { actor } = await adminWithOrg();

    const res = await actor.agent
      .post(base)
      .send({ name: 'Mine', kind: 'LABOUR', parentId: foreignGroup.id })
      .expect(404);
    // Indistinguishable from an unknown id — same status, same message.
    const unknown = await actor.agent
      .post(base)
      .send({ name: 'Mine2', kind: 'LABOUR', parentId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
    expect(res.body.error.message).toBe(unknown.body.error.message);
  });

  it('422s RESOURCE_TREE_TOO_DEEP past the depth cap', async () => {
    const { actor } = await adminWithOrg();
    let parentId: string | null = null;
    // A chain of exactly RESOURCE_TREE_MAX_DEPTH groups: the last one is legal, the next is not.
    for (let i = 0; i < RESOURCE_TREE_MAX_DEPTH; i += 1) {
      const created: { id: string } = await create(actor, {
        name: `G${i}`,
        kind: 'GROUP',
        ...(parentId === null ? {} : { parentId }),
      });
      parentId = created.id;
    }
    const res = await actor.agent
      .post(base)
      .send({ name: 'One too deep', kind: 'LABOUR', parentId })
      .expect(422);
    expect(res.body.error.details).toMatchObject({
      reason: 'RESOURCE_TREE_TOO_DEEP',
      maxDepth: RESOURCE_TREE_MAX_DEPTH,
    });
  });

  it('422s GROUP_HAS_NO_SCHEDULING_FIELDS when a group is given a calendar/capacity/cost', async () => {
    const { actor, orgId } = await adminWithOrg();
    const calendar = await prisma.calendar.create({
      data: { organizationId: orgId, name: 'Std', createdBy: actor.userId },
    });
    for (const extra of [
      { calendarId: calendar.id },
      { maxUnitsPerHour: 4 },
      { costPerUnit: 1200 },
    ]) {
      const res = await actor.agent
        .post(base)
        .send({ name: `G-${Object.keys(extra)[0]}`, kind: 'GROUP', ...extra })
        .expect(422);
      expect(res.body.error.details.reason).toBe('GROUP_HAS_NO_SCHEDULING_FIELDS');
    }
  });

  // -------------------------------------------------------------------------
  // The assignment bar — the whole parity argument
  // -------------------------------------------------------------------------

  it('422s GROUP_NOT_ASSIGNABLE when a group is assigned to an activity', async () => {
    const { actor, orgId } = await adminWithOrg();
    const activityId = await seedActivity(orgId, actor.userId);
    const group = await create(actor, { name: 'Groundworks', kind: 'GROUP' });

    const res = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activityId}/assignments`)
      .send({ resourceId: group.id, budgetedUnits: 8 })
      .expect(422);
    expect(res.body.error.details.reason).toBe('GROUP_NOT_ASSIGNABLE');

    // …and the same for an attempt to make it the DRIVER.
    const driving = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activityId}/assignments`)
      .send({ resourceId: group.id, budgetedUnits: 8, isDriving: true })
      .expect(422);
    expect(driving.body.error.details.reason).toBe('GROUP_NOT_ASSIGNABLE');

    // Nothing was written — a group can therefore never enter levelling / histogram / EV demand.
    expect(await prisma.resourceAssignment.count()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Kind-change guards
  // -------------------------------------------------------------------------

  it('409s RESOURCE_IN_USE when converting an ASSIGNED resource into a group', async () => {
    const { actor, orgId } = await adminWithOrg();
    const activityId = await seedActivity(orgId, actor.userId);
    const crew = await create(actor, { name: 'Crew', kind: 'LABOUR' });
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activityId}/assignments`)
      .send({ resourceId: crew.id, budgetedUnits: 8 })
      .expect(201);

    const res = await actor.agent
      .patch(`${base}/${crew.id}`)
      .send({ kind: 'GROUP', version: crew.version })
      .expect(409);
    expect(res.body.error.details).toMatchObject({ reason: 'RESOURCE_IN_USE', count: 1 });
  });

  it('409s RESOURCE_GROUP_HAS_CHILDREN when un-grouping a group that still contains rows', async () => {
    const { actor } = await adminWithOrg();
    const group = await create(actor, { name: 'G', kind: 'GROUP' });
    await create(actor, { name: 'Crew', kind: 'LABOUR', parentId: group.id });

    const res = await actor.agent
      .patch(`${base}/${group.id}`)
      .send({ kind: 'LABOUR', version: group.version })
      .expect(409);
    expect(res.body.error.details).toMatchObject({
      reason: 'RESOURCE_GROUP_HAS_CHILDREN',
      count: 1,
    });
  });

  // -------------------------------------------------------------------------
  // Subtree cascade
  // -------------------------------------------------------------------------

  it('soft-deletes a GROUP’s whole subtree under ONE delete_batch_id (the restore unit)', async () => {
    const { actor } = await adminWithOrg();
    const root = await create(actor, { name: 'Root', kind: 'GROUP' });
    const mid = await create(actor, { name: 'Mid', kind: 'GROUP', parentId: root.id });
    const leaf = await create(actor, { name: 'Leaf', kind: 'LABOUR', parentId: mid.id });
    // A sibling branch that must survive untouched.
    const other = await create(actor, { name: 'Other', kind: 'LABOUR' });

    await actor.agent.delete(`${base}/${root.id}`).expect(204);

    const rows = await prisma.resource.findMany({
      where: { id: { in: [root.id, mid.id, leaf.id, other.id] } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const batchIds = new Set(
      [root.id, mid.id, leaf.id].map((id) => byId.get(id)?.deleteBatchId ?? 'missing'),
    );
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).not.toBe('missing');
    for (const id of [root.id, mid.id, leaf.id]) {
      expect(byId.get(id)?.deletedAt).not.toBeNull();
    }
    expect(byId.get(other.id)?.deletedAt).toBeNull();

    // Restoring the batch reactivates exactly the branch — the property the shared id buys, which
    // is why the cascade is a single `updateMany` rather than a per-row delete.
    const batchId = [...batchIds][0] as string;
    const restored = await prisma.resource.updateMany({
      where: { deleteBatchId: batchId },
      data: { deletedAt: null, deleteBatchId: null },
    });
    expect(restored.count).toBe(3);
  });

  it('409s RESOURCE_IN_USE with the SUBTREE count when a DESCENDANT is still assigned', async () => {
    const { actor, orgId } = await adminWithOrg();
    const activityId = await seedActivity(orgId, actor.userId);
    const group = await create(actor, { name: 'G', kind: 'GROUP' });
    const child = await create(actor, { name: 'Crew', kind: 'LABOUR', parentId: group.id });
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activityId}/assignments`)
      .send({ resourceId: child.id, budgetedUnits: 8 })
      .expect(201);

    const res = await actor.agent.delete(`${base}/${group.id}`).expect(409);
    expect(res.body.error.details).toMatchObject({
      reason: 'RESOURCE_IN_USE',
      count: 1,
      subtreeSize: 2,
    });
    // Nothing deleted — the group's own assignment count is zero, so only the SUBTREE count
    // could have caught this.
    expect(await prisma.resource.count({ where: { deletedAt: null } })).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Concurrency — the reason the tree lock is ORG-scoped
  // -------------------------------------------------------------------------

  it('serialises concurrent MIRROR reparents so the pair cannot form a cycle', async () => {
    const { actor } = await adminWithOrg();
    const a = await create(actor, { name: 'A', kind: 'GROUP' });
    const b = await create(actor, { name: 'B', kind: 'GROUP' });

    // "A under B" and "B under A" fired together. Per-resource locks would take DIFFERENT keys and
    // never contend, so each walk would see a cycle-free tree and both would commit — a cycle. The
    // org-scoped tree lock makes them serial, so the second sees the first's committed edge.
    const [first, second] = await Promise.all([
      actor.agent.patch(`${base}/${a.id}`).send({ parentId: b.id, version: a.version }),
      actor.agent.patch(`${base}/${b.id}`).send({ parentId: a.id, version: b.version }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    // The decisive assertion: whatever the interleaving, the tree is still acyclic — at most one
    // of the two carries a parent.
    const rows = await prisma.resource.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.filter((r) => r.parentId !== null)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // The database as the last line of defence
  // -------------------------------------------------------------------------

  it('the DB rejects a self-parent even when the service is bypassed (ck_resources_parent_not_self)', async () => {
    const { actor } = await adminWithOrg();
    const group = await create(actor, { name: 'G', kind: 'GROUP' });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "resources" SET "parent_id" = id WHERE id = $1::uuid`,
        group.id,
      ),
    ).rejects.toThrow();
  });

  it('the DB rejects a GROUP carrying a capacity or cost (ck_resources_group_no_scheduling_fields)', async () => {
    const { actor } = await adminWithOrg();
    const group = await create(actor, { name: 'G', kind: 'GROUP' });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "resources" SET "max_units_per_hour" = 4 WHERE id = $1::uuid`,
        group.id,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "resources" SET "cost_per_unit" = 100 WHERE id = $1::uuid`,
        group.id,
      ),
    ).rejects.toThrow();
  });

  it('every ResourceKind has a CHECK branch — the fail-closed CASE goes red on an unbranched kind', async () => {
    // The `CASE … ELSE false` form rejects any label without its own branch. `prisma migrate dev`
    // generates the `ALTER TYPE … ADD VALUE` but will NEVER amend the raw-SQL CHECK, so this
    // round-trip is what turns that omission into a CI failure instead of a production 500.
    const { actor, orgId } = await adminWithOrg();
    for (const kind of RESOURCE_KINDS) {
      const row = await prisma.resource.create({
        data: {
          organizationId: orgId,
          name: `probe-${kind}`,
          kind,
          createdBy: actor.userId,
        },
      });
      expect(row.kind).toBe(kind);
    }
  });
});
