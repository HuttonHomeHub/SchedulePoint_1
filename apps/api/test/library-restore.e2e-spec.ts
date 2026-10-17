import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * Restoring a deleted RESOURCE or CALENDAR from Recently deleted (ADR-0195), against a real
 * PostgreSQL + Better Auth.
 *
 * **Every refusal below is written to fail against a naive restore** — an `updateMany` by
 * `delete_batch_id` with no guards — because that is the implementation a refusal test exists to
 * make impossible. Each test names the defect it would catch, so a reader can tell a vacuous
 * assertion from a load-bearing one. Fixtures are built through the public API; the only direct
 * writes are reads for assertions.
 *
 * Not covered here, deliberately: a 403 for a missing `calendar:manage_org` (no role holds
 * `calendar:restore` without it — proven in `calendars.service.spec.ts`), and a group restore
 * across thousands of rows (chunking is proven at the repository's unit level).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';
const NIL = '00000000-0000-4000-8000-000000000000';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface ResourceBody {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  parentId: string | null;
  calendarId: string | null;
  maxUnitsPerHour: number | null;
  costPerUnit: number | null;
  archivedAt: string | null;
  version: number;
}

interface BinItem {
  kind: string;
  id: string;
  name: string;
  subtype: string | null;
  expiresAt: string | null;
  canRestore: boolean;
  deleteBatchId: string | null;
  blockedBy: { kind: string; relation: string; id: string; name: string } | null;
}

describe.skipIf(!hasDatabase)('Library restore (e2e)', () => {
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
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
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

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function member(
    orgId: string,
    email: string,
    role: 'VIEWER' | 'CONTRIBUTOR',
  ): Promise<Actor> {
    const actor = await signUp(email);
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: actor.userId, role },
    });
    return actor;
  }

  async function createResource(
    actor: Actor,
    body: Record<string, unknown>,
  ): Promise<ResourceBody> {
    const res = await actor.agent.post(`${API}/resources`).send(body).expect(201);
    return res.body.data as ResourceBody;
  }

  const getResource = async (actor: Actor, id: string): Promise<request.Response> =>
    actor.agent.get(`${API}/resources/${id}`);

  const deleteResource = (actor: Actor, id: string) =>
    actor.agent.delete(`${API}/resources/${id}`).expect(204);

  const restoreResource = (actor: Actor, id: string) =>
    actor.agent.post(`${API}/resources/${id}/restore`);

  async function createCalendar(
    actor: Actor,
    name: string,
    over: Record<string, unknown> = {},
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`${API}/calendars`)
      .send({ name, workingWeekdays: 31, ...over })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  const restoreCalendar = (actor: Actor, id: string) =>
    actor.agent.post(`${API}/calendars/${id}/restore`);

  async function bin(actor: Actor): Promise<BinItem[]> {
    const items: BinItem[] = [];
    let cursor: string | undefined;
    do {
      const res = await actor.agent
        .get(`${API}/deleted`)
        .query({ limit: 100, ...(cursor ? { cursor } : {}) })
        .expect(200);
      items.push(...(res.body.data as BinItem[]));
      cursor = (res.body.meta as { nextCursor: string | null }).nextCursor ?? undefined;
    } while (cursor);
    return items;
  }

  async function auditRows(action: string) {
    return prisma.auditEvent.findMany({ where: { action }, orderBy: { occurredAt: 'desc' } });
  }

  // ---------------------------------------------------------------------------------------------
  describe('restoring a resource', () => {
    it('brings a leaf back exactly as it was, archived state and calendar included', async () => {
      // Naive restore would pass this; it is the positive control for every refusal below.
      const { actor } = await adminWithOrg();
      const calendar = await createCalendar(actor, 'Crane hours');
      const made = await createResource(actor, {
        name: 'Crane A',
        code: 'CRN-A',
        kind: 'EQUIPMENT',
        calendarId: calendar.id,
        maxUnitsPerHour: 4,
        costPerUnit: 120,
      });
      await actor.agent
        .post(`${API}/resources/${made.id}/archive`)
        .send({ version: 1 })
        .expect(204);
      const archived = (await getResource(actor, made.id)).body.data as ResourceBody;
      await deleteResource(actor, made.id);
      expect((await getResource(actor, made.id)).status).toBe(404);

      const res = await restoreResource(actor, made.id).expect(200);
      const back = res.body.data as ResourceBody;

      expect(back).toMatchObject({
        id: made.id,
        name: 'Crane A',
        code: 'CRN-A',
        kind: 'EQUIPMENT',
        parentId: null,
        calendarId: calendar.id,
        maxUnitsPerHour: 4,
        costPerUnit: 120,
      });
      // Archived when deleted, archived again (spec D7), and the version moved so a stale form 409s.
      expect(back.archivedAt).toBe(archived.archivedAt);
      expect(back.version).toBeGreaterThan(archived.version);
      expect((await bin(actor)).map((item) => item.id)).not.toContain(made.id);
      expect((await getResource(actor, made.id)).status).toBe(200);
    });

    it('brings a whole group back under one batch, and leaves a child deleted earlier deleted', async () => {
      // A naive "restore the subtree" (by parent links, not by batch) resurrects the early child.
      const { actor } = await adminWithOrg();
      const group = await createResource(actor, { name: 'Groundworks', kind: 'GROUP' });
      const early = await createResource(actor, {
        name: 'Early',
        kind: 'LABOUR',
        parentId: group.id,
      });
      const a = await createResource(actor, { name: 'Crew A', kind: 'LABOUR', parentId: group.id });
      const nested = await createResource(actor, {
        name: 'Crews',
        kind: 'GROUP',
        parentId: group.id,
      });
      const b = await createResource(actor, {
        name: 'Crew B',
        kind: 'LABOUR',
        parentId: nested.id,
      });

      await deleteResource(actor, early.id);
      await deleteResource(actor, group.id);

      const res = await restoreResource(actor, group.id).expect(200);
      expect((res.body.data as ResourceBody).id).toBe(group.id);

      for (const id of [group.id, a.id, nested.id, b.id]) {
        expect((await getResource(actor, id)).status, id).toBe(200);
      }
      expect((await getResource(actor, b.id)).body.data.parentId).toBe(nested.id);
      expect((await getResource(actor, early.id)).status).toBe(404);
      // …and it is still in the bin as its own row, blocked by nothing now that the group is back.
      const stillDeleted = (await bin(actor)).find((item) => item.id === early.id);
      expect(stillDeleted).toMatchObject({ canRestore: true, blockedBy: null });
      await restoreResource(actor, early.id).expect(200);
    });

    it('is a no-op 200 for an active resource: no audit row, no version bump', async () => {
      const { actor } = await adminWithOrg();
      const made = await createResource(actor, { name: 'Crane A', kind: 'EQUIPMENT' });
      const res = await restoreResource(actor, made.id).expect(200);
      expect((res.body.data as ResourceBody).version).toBe(made.version);
      expect(await auditRows('resource.restored')).toHaveLength(0);
    });

    it('records ONE resource.restored row for a branch, carrying its size', async () => {
      const { actor } = await adminWithOrg();
      const group = await createResource(actor, { name: 'Groundworks', kind: 'GROUP' });
      for (const name of ['One', 'Two']) {
        await createResource(actor, { name, kind: 'LABOUR', parentId: group.id });
      }
      await deleteResource(actor, group.id);
      await restoreResource(actor, group.id).expect(200);

      const rows = await auditRows('resource.restored');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.subjectId).toBe(group.id);
      expect((rows[0]!.changes as { after: unknown }).after).toMatchObject({
        name: 'Groundworks',
        kind: 'GROUP',
        resourceCount: 3,
        deleteBatchId: expect.any(String),
      });
    });

    it('restores a dissolved group EMPTY: the promoted children stay where they were moved', async () => {
      const { actor } = await adminWithOrg();
      const group = await createResource(actor, { name: 'Crews', kind: 'GROUP' });
      const child = await createResource(actor, {
        name: 'Crew A',
        kind: 'LABOUR',
        parentId: group.id,
      });
      await actor.agent.post(`${API}/resources/${group.id}/dissolve`).expect(200);

      const listed = (await bin(actor)).find((item) => item.id === group.id);
      expect(listed).toMatchObject({ kind: 'resource', subtype: 'GROUP', canRestore: true });

      await restoreResource(actor, group.id).expect(200);
      expect((await getResource(actor, child.id)).body.data.parentId).toBeNull();
      const kids = await actor.agent.get(`${API}/resources`).query({ parentId: group.id });
      expect(kids.body.data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('a resource restore that must be refused', () => {
    it('refuses a child whose group was deleted LATER (409 PARENT_DELETED naming the group)', async () => {
      // Naive restore: 200, and an active resource sits under a deleted parent.
      const { actor } = await adminWithOrg();
      const group = await createResource(actor, { name: 'Groundworks', kind: 'GROUP' });
      const child = await createResource(actor, {
        name: 'Crew A',
        kind: 'LABOUR',
        parentId: group.id,
      });
      await deleteResource(actor, child.id);
      await deleteResource(actor, group.id);

      const res = await restoreResource(actor, child.id).expect(409);
      expect(res.body.error.details).toMatchObject({
        reason: 'PARENT_DELETED',
        blockedBy: { kind: 'resource', relation: 'parent', id: group.id, name: 'Groundworks' },
      });
      expect((await getResource(actor, child.id)).status).toBe(404);
      // The bin says the same, so the screen can offer "Restore resource group first".
      const row = (await bin(actor)).find((item) => item.id === child.id)!;
      expect(row).toMatchObject({
        canRestore: false,
        blockedBy: { kind: 'resource', relation: 'parent', id: group.id },
      });
    });

    it('refuses a restore by a MEMBER’s id (409 PARENT_DELETED): the bin acts on the root', async () => {
      // Naive restore by the member's batch brings the WHOLE branch back through the back door.
      const { actor } = await adminWithOrg();
      const group = await createResource(actor, { name: 'Groundworks', kind: 'GROUP' });
      const child = await createResource(actor, {
        name: 'Crew A',
        kind: 'LABOUR',
        parentId: group.id,
      });
      await deleteResource(actor, group.id);

      const res = await restoreResource(actor, child.id).expect(409);
      expect(res.body.error.details.reason).toBe('PARENT_DELETED');
      expect((await getResource(actor, group.id)).status).toBe(404);
      expect((await getResource(actor, child.id)).status).toBe(404);
    });

    it('refuses when the parent has stopped being a group (422 RESOURCE_PARENT_NOT_GROUP)', async () => {
      // Naive restore: a resource under a LABOUR parent, which the forward paths forbid.
      const { actor } = await adminWithOrg();
      const group = await createResource(actor, { name: 'Old group', kind: 'GROUP' });
      const child = await createResource(actor, {
        name: 'Crew A',
        kind: 'LABOUR',
        parentId: group.id,
      });
      await deleteResource(actor, child.id);
      // Legal now: a group may become a leaf while it has no ACTIVE children.
      await actor.agent
        .patch(`${API}/resources/${group.id}`)
        .send({ kind: 'LABOUR', version: group.version })
        .expect(200);

      const res = await restoreResource(actor, child.id).expect(422);
      expect(res.body.error.details).toMatchObject({
        reason: 'RESOURCE_PARENT_NOT_GROUP',
        parentName: 'Old group',
      });
      expect((await getResource(actor, child.id)).status).toBe(404);
    });

    it('refuses a branch the tree has grown too deep for (422 RESOURCE_TREE_TOO_DEEP)', async () => {
      // The tree guard walks ACTIVE children only, and the branch is deleted — so a restore that
      // reuses the guard without supplying the branch's height sees height 1 and waves it through.
      const { actor } = await adminWithOrg();
      const top = await createResource(actor, { name: 'P', kind: 'GROUP' });
      const x = await createResource(actor, { name: 'X', kind: 'GROUP', parentId: top.id });
      const y = await createResource(actor, { name: 'Y', kind: 'GROUP', parentId: x.id });
      await createResource(actor, { name: 'Z', kind: 'LABOUR', parentId: y.id });
      await deleteResource(actor, x.id); // the branch X > Y > Z, height 3, under P

      // Move P under a chain of seven groups: P is now at depth 8, and 8 + 3 > 10.
      let parentId: string | null = null;
      for (let i = 1; i <= 7; i += 1) {
        const link: ResourceBody = await createResource(actor, {
          name: `G${String(i)}`,
          kind: 'GROUP',
          ...(parentId === null ? {} : { parentId }),
        });
        parentId = link.id;
      }
      await actor.agent
        .patch(`${API}/resources/${top.id}`)
        .send({ parentId, version: top.version })
        .expect(200);

      const res = await restoreResource(actor, x.id).expect(422);
      expect(res.body.error.details).toMatchObject({
        reason: 'RESOURCE_TREE_TOO_DEEP',
        resultingDepth: 11,
      });
    });

    it('refuses a name a live resource now holds, and names that resource', async () => {
      // Naive restore: the partial unique raises P2002 -> 500, or a 409 that names nothing.
      const { actor } = await adminWithOrg();
      const gone = await createResource(actor, { name: 'Crane A', kind: 'EQUIPMENT' });
      await deleteResource(actor, gone.id);
      const live = await createResource(actor, { name: 'Crane A', kind: 'EQUIPMENT' });

      const res = await restoreResource(actor, gone.id).expect(409);
      expect(res.body.error.details).toMatchObject({
        reason: 'NAME_TAKEN',
        total: 1,
        conflicts: [{ field: 'name', value: 'Crane A', id: live.id, archived: false }],
      });
      expect(res.body.error.message).toContain('Crane A');
      // Nothing written: the deleted row is untouched and the live one is too.
      expect((await bin(actor)).map((item) => item.id)).toContain(gone.id);
      expect((await getResource(actor, live.id)).body.data.version).toBe(live.version);
      expect(await auditRows('resource.restored')).toHaveLength(0);
    });

    it('treats an ARCHIVED holder as a holder, and says so', async () => {
      // Archiving frees neither name nor code (ADR-0053 §4).
      const { actor } = await adminWithOrg();
      const gone = await createResource(actor, { name: 'Crane A', kind: 'EQUIPMENT' });
      await deleteResource(actor, gone.id);
      const live = await createResource(actor, { name: 'Crane A', kind: 'EQUIPMENT' });
      await actor.agent
        .post(`${API}/resources/${live.id}/archive`)
        .send({ version: live.version })
        .expect(204);

      const res = await restoreResource(actor, gone.id).expect(409);
      expect(res.body.error.details.conflicts[0]).toMatchObject({ id: live.id, archived: true });
      expect(res.body.error.message).toContain('archived');
    });

    it('refuses a code a live resource now holds (CODE_TAKEN) — a code is an identity', async () => {
      const { actor } = await adminWithOrg();
      const gone = await createResource(actor, { name: 'Old', code: 'CRN-1', kind: 'EQUIPMENT' });
      await deleteResource(actor, gone.id);
      const live = await createResource(actor, { name: 'New', code: 'CRN-1', kind: 'EQUIPMENT' });

      const res = await restoreResource(actor, gone.id).expect(409);
      expect(res.body.error.details).toMatchObject({
        reason: 'CODE_TAKEN',
        conflicts: [{ field: 'code', value: 'CRN-1', id: live.id }],
      });
    });

    it('refuses when the resource’s own calendar has since been deleted (409 CALENDAR_DELETED)', async () => {
      // CALENDAR_IN_USE counts only ACTIVE resources, so deleting the calendar was allowed.
      // Naive restore: an active resource on a deleted calendar.
      const { actor } = await adminWithOrg();
      const calendar = await createCalendar(actor, 'Crane hours');
      const made = await createResource(actor, {
        name: 'Crane A',
        kind: 'EQUIPMENT',
        calendarId: calendar.id,
      });
      await deleteResource(actor, made.id);
      await actor.agent.delete(`${API}/calendars/${calendar.id}`).expect(204);

      const res = await restoreResource(actor, made.id).expect(409);
      expect(res.body.error.details).toMatchObject({
        reason: 'CALENDAR_DELETED',
        calendar: { id: calendar.id, name: 'Crane hours' },
      });
      const row = (await bin(actor)).find((item) => item.id === made.id)!;
      expect(row.blockedBy).toMatchObject({
        kind: 'calendar',
        relation: 'calendar',
        id: calendar.id,
      });

      // Restoring the calendar first is the way through.
      await restoreCalendar(actor, calendar.id).expect(200);
      await restoreResource(actor, made.id).expect(200);
    });

    it('refuses the WHOLE group when only a child’s calendar is deleted, and shows it on the root', async () => {
      const { actor } = await adminWithOrg();
      const calendar = await createCalendar(actor, 'Crane hours');
      const group = await createResource(actor, { name: 'Plant', kind: 'GROUP' });
      const child = await createResource(actor, {
        name: 'Crane A',
        kind: 'EQUIPMENT',
        parentId: group.id,
        calendarId: calendar.id,
      });
      await deleteResource(actor, group.id);
      await actor.agent.delete(`${API}/calendars/${calendar.id}`).expect(204);

      await restoreResource(actor, group.id).expect(409);
      expect((await getResource(actor, group.id)).status).toBe(404);
      expect((await getResource(actor, child.id)).status).toBe(404);

      const items = await bin(actor);
      const root = items.find((item) => item.id === group.id)!;
      const member = items.find((item) => item.id === child.id)!;
      // Root: blocked by the calendar. Member: blocked by its own parent, in its own batch — which
      // is what keeps it a member (the web picks the root as the row blocked from OUTSIDE).
      expect(root.blockedBy).toMatchObject({ kind: 'calendar', relation: 'calendar' });
      expect(member.blockedBy).toMatchObject({
        kind: 'resource',
        relation: 'parent',
        id: group.id,
      });
      expect(member.deleteBatchId).toBe(root.deleteBatchId);
    });

    it('allows a resource on an ARCHIVED calendar — archived bindings stay live', async () => {
      const { actor } = await adminWithOrg();
      const calendar = await createCalendar(actor, 'Retired hours');
      const made = await createResource(actor, {
        name: 'Crane A',
        kind: 'EQUIPMENT',
        calendarId: calendar.id,
      });
      await deleteResource(actor, made.id);
      await actor.agent
        .post(`${API}/calendars/${calendar.id}/archive`)
        .send({ version: calendar.version })
        .expect(204);
      await restoreResource(actor, made.id).expect(200);
    });

    it('serialises a restore against a delete of the calendar it depends on', async () => {
      // Without the calendar advisory lock both succeed and an active resource is left on a deleted
      // calendar. With it, exactly one wins, every time.
      const { actor } = await adminWithOrg();
      for (let round = 0; round < 8; round += 1) {
        const calendar = await createCalendar(actor, `Hours ${String(round)}`);
        const made = await createResource(actor, {
          name: `Crane ${String(round)}`,
          kind: 'EQUIPMENT',
          calendarId: calendar.id,
        });
        await deleteResource(actor, made.id);

        const [restored, deleted] = await Promise.all([
          restoreResource(actor, made.id),
          actor.agent.delete(`${API}/calendars/${calendar.id}`),
        ]);

        const restoreWon = restored.status === 200;
        const deleteWon = deleted.status === 204;
        expect(restoreWon !== deleteWon, `round ${String(round)}: exactly one wins`).toBe(true);
        if (restoreWon) expect(deleted.status).toBe(409);
        else expect(restored.status).toBe(409);
        const row = await prisma.resource.findUniqueOrThrow({ where: { id: made.id } });
        const cal = await prisma.calendar.findUniqueOrThrow({ where: { id: calendar.id } });
        // The invariant itself: never an active resource on a deleted calendar.
        expect(row.deletedAt === null && cal.deletedAt !== null).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('who may restore, and whose', () => {
    it('refuses a Viewer and a Contributor (403), and a non-member (404)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const made = await createResource(actor, { name: 'Crane A', kind: 'EQUIPMENT' });
      await deleteResource(actor, made.id);
      const calendar = await createCalendar(actor, 'Hours');
      await actor.agent.delete(`${API}/calendars/${calendar.id}`).expect(204);

      const viewer = await member(orgId, 'viewer@example.com', 'VIEWER');
      const contributor = await member(orgId, 'contrib@example.com', 'CONTRIBUTOR');
      const outsider = await signUp('outsider@example.com');
      for (const who of [viewer, contributor]) {
        await restoreResource(who, made.id).expect(403);
        await restoreCalendar(who, calendar.id).expect(403);
      }
      await restoreResource(outsider, made.id).expect(404);
      await restoreCalendar(outsider, calendar.id).expect(404);
      // Anyone in the organisation can SEE them.
      expect((await bin(viewer)).map((item) => item.id)).toEqual(
        expect.arrayContaining([made.id, calendar.id]),
      );
    });

    it('treats another organisation’s id as unknown (404), and writes nothing there', async () => {
      // Naive restore that loads by id alone would reactivate a foreign tenant's row.
      const { actor } = await adminWithOrg();
      const other = await signUp('beta@example.com');
      await other.agent.post('/api/v1/organizations').send({ name: 'Beta' }).expect(201);
      const foreign = await other.agent
        .post('/api/v1/organizations/beta/resources')
        .send({ name: 'Foreign crane', kind: 'EQUIPMENT' })
        .expect(201);
      const foreignId = foreign.body.data.id as string;
      await other.agent.delete(`/api/v1/organizations/beta/resources/${foreignId}`).expect(204);
      const cal = await other.agent
        .post('/api/v1/organizations/beta/calendars')
        .send({ name: 'Foreign hours', workingWeekdays: 31 })
        .expect(201);
      const calId = cal.body.data.id as string;
      await other.agent.delete(`/api/v1/organizations/beta/calendars/${calId}`).expect(204);

      await restoreResource(actor, foreignId).expect(404);
      await restoreCalendar(actor, calId).expect(404);
      await restoreResource(actor, NIL).expect(404);
      const row = await prisma.resource.findUniqueOrThrow({ where: { id: foreignId } });
      expect(row.deletedAt).not.toBeNull();
      const calRow = await prisma.calendar.findUniqueOrThrow({ where: { id: calId } });
      expect(calRow.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('restoring a calendar', () => {
    it('brings back its pattern and the exceptions deleted WITH it, not ones removed earlier', async () => {
      // A naive restore by calendar id (every exception of the calendar) resurrects the early one.
      const { actor } = await adminWithOrg();
      const calendar = await createCalendar(actor, 'Site week', { hoursPerDay: 10 });
      const kept = await actor.agent
        .post(`${API}/calendars/${calendar.id}/exceptions`)
        .send({ date: '2026-12-25', label: 'Christmas' })
        .expect(201);
      const early = await actor.agent
        .post(`${API}/calendars/${calendar.id}/exceptions`)
        .send({ date: '2026-12-26', label: 'Boxing Day' })
        .expect(201);
      await actor.agent
        .delete(`${API}/calendars/${calendar.id}/exceptions/${early.body.data.id as string}`)
        .expect(204);
      const before = (await actor.agent.get(`${API}/calendars/${calendar.id}`).expect(200)).body
        .data;
      await actor.agent.delete(`${API}/calendars/${calendar.id}`).expect(204);
      expect((await actor.agent.get(`${API}/calendars/${calendar.id}`)).status).toBe(404);

      const res = await restoreCalendar(actor, calendar.id).expect(200);
      const back = res.body.data as {
        workingWeekdays: number;
        exceptions: { id: string }[];
        hoursPerDay?: number;
        version: number;
      };

      expect(back.workingWeekdays).toBe(31);
      expect(back.hoursPerDay).toBe(before.hoursPerDay);
      expect(back.exceptions.map((e) => e.id)).toEqual([kept.body.data.id]);
      expect(back.version).toBeGreaterThan(before.version as number);
      const rows = await auditRows('calendar.restored');
      expect(rows).toHaveLength(1);
      expect((rows[0]!.changes as { after: unknown }).after).toMatchObject({
        name: 'Site week',
        scope: 'ORG',
        exceptionCount: 1,
      });
    });

    it('is a no-op 200 for an active calendar: no audit row', async () => {
      const { actor } = await adminWithOrg();
      const calendar = await createCalendar(actor, 'Site week');
      await restoreCalendar(actor, calendar.id).expect(200);
      expect(await auditRows('calendar.restored')).toHaveLength(0);
    });

    it('refuses a name a live calendar holds in the same tier, archived or not', async () => {
      const { actor } = await adminWithOrg();
      const gone = await createCalendar(actor, 'Site week');
      await actor.agent.delete(`${API}/calendars/${gone.id}`).expect(204);
      const live = await createCalendar(actor, 'Site week');
      let res = await restoreCalendar(actor, gone.id).expect(409);
      expect(res.body.error.details).toMatchObject({
        reason: 'NAME_TAKEN',
        conflicts: [{ field: 'name', value: 'Site week', id: live.id, archived: false }],
      });

      await actor.agent
        .post(`${API}/calendars/${live.id}/archive`)
        .send({ version: live.version })
        .expect(204);
      res = await restoreCalendar(actor, gone.id).expect(409);
      expect(res.body.error.details.conflicts[0]).toMatchObject({ archived: true });
      expect((await bin(actor)).map((item) => item.id)).toContain(gone.id);
    });

    it('lets the same name coexist across tiers: a PROJECT calendar restores beside an ORG one', async () => {
      const { actor } = await adminWithOrg();
      const client = await actor.agent
        .post(`${API}/clients`)
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`${API}/clients/${client.body.data.id as string}/projects`)
        .send({ name: 'Tower' })
        .expect(201);
      const projectId = project.body.data.id as string;
      const local = await actor.agent
        .post(`${API}/calendars`)
        .send({ name: 'Site week', workingWeekdays: 31, scope: 'PROJECT', projectId })
        .expect(201);
      await createCalendar(actor, 'Site week');
      const localId = local.body.data.id as string;
      await actor.agent.delete(`${API}/calendars/${localId}`).expect(204);

      await restoreCalendar(actor, localId).expect(200);
    });

    it('refuses a PROJECT calendar swept with its project: it comes back WITH the project', async () => {
      // Naive restore by calendar id would leave an active calendar under a deleted project.
      const { actor } = await adminWithOrg();
      const client = await actor.agent
        .post(`${API}/clients`)
        .send({ name: 'Northgate' })
        .expect(201);
      const clientId = client.body.data.id as string;
      const project = await actor.agent
        .post(`${API}/clients/${clientId}/projects`)
        .send({ name: 'Tower' })
        .expect(201);
      const projectId = project.body.data.id as string;
      const local = await actor.agent
        .post(`${API}/calendars`)
        .send({ name: 'Tower week', workingWeekdays: 31, scope: 'PROJECT', projectId })
        .expect(201);
      const localId = local.body.data.id as string;
      await actor.agent.delete(`${API}/projects/${projectId}`).expect(204);

      const res = await restoreCalendar(actor, localId).expect(409);
      expect(res.body.error.details).toMatchObject({
        reason: 'PARENT_DELETED',
        blockedBy: { kind: 'project', relation: 'parent', id: projectId, name: 'Tower' },
      });
      // In the bin it is a MEMBER of the project's deletion (same batch, blocker is the project).
      const items = await bin(actor);
      const calendarRow = items.find((item) => item.id === localId)!;
      const projectRow = items.find((item) => item.id === projectId)!;
      expect(calendarRow).toMatchObject({
        kind: 'calendar',
        subtype: 'PROJECT',
        canRestore: false,
      });
      expect(calendarRow.deleteBatchId).toBe(projectRow.deleteBatchId);

      await actor.agent.post(`${API}/projects/${projectId}/restore`).expect(200);
      expect((await actor.agent.get(`${API}/calendars/${localId}`)).status).toBe(200);
    });

    it('restores a standalone PROJECT calendar under a live project, and is blocked once the project goes', async () => {
      const { actor } = await adminWithOrg();
      const client = await actor.agent
        .post(`${API}/clients`)
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`${API}/clients/${client.body.data.id as string}/projects`)
        .send({ name: 'Tower' })
        .expect(201);
      const projectId = project.body.data.id as string;
      const local = await actor.agent
        .post(`${API}/calendars`)
        .send({ name: 'Tower week', workingWeekdays: 31, scope: 'PROJECT', projectId })
        .expect(201);
      const localId = local.body.data.id as string;

      await actor.agent.delete(`${API}/calendars/${localId}`).expect(204);
      await restoreCalendar(actor, localId).expect(200);

      await actor.agent.delete(`${API}/calendars/${localId}`).expect(204);
      await actor.agent.delete(`${API}/projects/${projectId}`).expect(204);
      const res = await restoreCalendar(actor, localId).expect(409);
      expect(res.body.error.details.reason).toBe('PARENT_DELETED');
      // Another batch from the project's: the calendar is the ROOT of its own row, blocked by it.
      const row = (await bin(actor)).find((item) => item.id === localId)!;
      expect(row.blockedBy).toMatchObject({ kind: 'project', id: projectId });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('a plan already pointing at a deleted calendar (F11, TECH_DEBT #519)', () => {
    /**
     * Fixtures: a calendar working Mon-Wed only and one five-day activity from Monday 5 Jan 2026,
     * so the finish tells the calendars apart (Mon-Wed gives the 13th, round-the-clock the 9th).
     */
    async function worldWithPlan(): Promise<{
      actor: Actor;
      planId: string;
      calendarId: string;
      finish: () => Promise<string | null>;
      recalculate: () => Promise<void>;
    }> {
      const { actor } = await adminWithOrg();
      const client = await actor.agent
        .post(`${API}/clients`)
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`${API}/clients/${client.body.data.id as string}/projects`)
        .send({ name: 'Tower' })
        .expect(201);
      const calendar = await createCalendar(actor, 'Mon-Wed', { workingWeekdays: 7 });
      const plan = await actor.agent
        .post(`${API}/projects/${project.body.data.id as string}/plans`)
        .send({ name: 'Plan', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      await actor.agent
        .patch(`${API}/plans/${planId}`)
        .send({ calendarId: calendar.id, version: plan.body.data.version })
        .expect(200);
      await actor.agent.post(`${API}/plans/${planId}/edit-lock`).send({}).expect(200);
      await actor.agent
        .post(`${API}/plans/${planId}/activities`)
        .send({ name: 'Pour slab', durationDays: 5 })
        .expect(201);
      const recalculate = async (): Promise<void> => {
        await actor.agent.post(`${API}/plans/${planId}/edit-lock`).send({}).expect(200);
        await actor.agent.post(`${API}/plans/${planId}/schedule/recalculate`).send({}).expect(200);
      };
      const finish = async (): Promise<string | null> =>
        (await actor.agent.get(`${API}/plans/${planId}/schedule/summary`).expect(200)).body.data
          .projectFinish as string | null;
      await recalculate();
      return { actor, planId, calendarId: calendar.id, finish, recalculate };
    }

    it('refuses the plan restore that used to reproduce the gap; restoring the calendar first re-dates it correctly', async () => {
      const w = await worldWithPlan();
      expect(await w.finish()).toBe('2026-01-13');

      // Delete the plan, then its calendar (the in-use guard counts ACTIVE plans only). The plan
      // restore used to succeed here and the plan then finished on 2026-01-09, round the clock
      // (F11, TECH_DEBT #519). It is now refused (ADR-0200), so that state cannot be reached.
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await w.actor.agent.delete(`${API}/calendars/${w.calendarId}`).expect(204);
      const refused = await w.actor.agent.post(`${API}/plans/${w.planId}/restore`).expect(409);
      expect(refused.body.error.details).toMatchObject({
        reason: 'CALENDAR_DELETED',
        calendar: { id: w.calendarId, name: 'Mon-Wed' },
      });

      // The cure is two presses, and the schedule is the Mon-Wed one.
      await restoreCalendar(w.actor, w.calendarId).expect(200);
      await w.actor.agent.post(`${API}/plans/${w.planId}/restore`).expect(200);
      await w.recalculate();
      expect(await w.finish()).toBe('2026-01-13');
    });

    it('still re-dates a plan that is ALREADY live on a deleted calendar (legacy data, ADR-0195 D7)', async () => {
      const w = await worldWithPlan();
      // LEGACY FIXTURE: rows restored before ADR-0200 can be live on a deleted calendar, and no
      // public path makes one any more, so the old restore is replayed directly on the rows.
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await w.actor.agent.delete(`${API}/calendars/${w.calendarId}`).expect(204);
      const live = { deletedAt: null, deleteBatchId: null };
      await prisma.plan.update({ where: { id: w.planId }, data: live });
      await prisma.activity.updateMany({ where: { planId: w.planId }, data: live });
      await w.recalculate();
      // The engine treats a deleted calendar as absent and schedules round the clock.
      expect(await w.finish()).toBe('2026-01-09');

      // The remedy ADR-0195 shipped: restoring the calendar marks the plan edited, and its next run
      // uses the calendar again.
      await restoreCalendar(w.actor, w.calendarId).expect(200);
      const plan = await w.actor.agent.get(`${API}/plans/${w.planId}`).expect(200);
      expect(plan.body.data.editedSinceCalculated).toBe(true);
      await w.recalculate();
      expect(await w.finish()).toBe('2026-01-13');
    });

    it('leaves a plan that does not use the calendar current', async () => {
      const w = await worldWithPlan();
      const other = await createCalendar(w.actor, 'Unused');
      await w.actor.agent.delete(`${API}/calendars/${other.id}`).expect(204);
      await restoreCalendar(w.actor, other.id).expect(200);
      const plan = await w.actor.agent.get(`${API}/plans/${w.planId}`).expect(200);
      expect(plan.body.data.editedSinceCalculated).toBe(false);
    });
  });
});
