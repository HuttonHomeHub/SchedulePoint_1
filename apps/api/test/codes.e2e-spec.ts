import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for a plan's code types and values (p6-activity-codes spec §4.7, M2-T4), against a
 * real database. The assignment of a value to an activity is `activity-codes.e2e-spec.ts`.
 *
 * Boots with the plan edit-lock ENFORCED so the 423 on every write is observable. Covers each role,
 * the pen, organisation and plan scope (404 before anything else), a foreign `organizationId` that is
 * refused and a stored row that carries the plan's (security review S1), the stale-version and
 * duplicate 409s (including a non-ASCII case fold), both caps under the plan advisory lock, reorder,
 * soft delete and restore with their guards, the refused delete of the swimlane source type, and the
 * audit rows.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const FOREIGN_ORG = '00000000-0000-0000-0000-000000000000';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface ValueBody {
  id: string;
  codeTypeId: string;
  shortCode: string;
  description: string | null;
  position: number;
  version: number;
  deletedAt: string | null;
}

interface TypeBody {
  id: string;
  planId: string;
  name: string;
  position: number;
  version: number;
  deletedAt: string | null;
  values?: ValueBody[];
}

describe.skipIf(!hasDatabase)('Codes API (e2e, pen enforced)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    priorEnforced = process.env.PLAN_EDIT_LOCK_ENFORCED;
    process.env.PLAN_EDIT_LOCK_ENFORCED = 'true';
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
    // Leave no code row behind: a sibling spec whose reset deletes plans directly would meet the
    // RESTRICT foreign keys.
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();
  const base = (org = 'acme') => `/api/v1/organizations/${org}`;
  const types = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/code-types`;
  const values = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/code-values`;
  const lockUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/edit-lock`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function makePlan(actor: Actor, org = 'acme', planName = 'Plan'): Promise<string> {
    const client = await actor.agent
      .post(`${base(org)}/clients`)
      .send({ name: `Client ${planName}` })
      .expect(201);
    const project = await actor.agent
      .post(`${base(org)}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await actor.agent
      .post(`${base(org)}/projects/${project.body.data.id}/plans`)
      .send({ name: planName, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  /** An admin org with a plan, the pen taken. */
  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const planId = await makePlan(actor);
    await actor.agent.post(lockUrl(planId)).send({}).expect(200);
    return { actor, orgId: res.body.data.id as string, planId };
  }

  async function addMember(
    orgId: string,
    role: 'VIEWER' | 'CONTRIBUTOR' | 'PLANNER',
    email: string,
  ): Promise<Actor> {
    const member = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: member.userId, role } });
    return member;
  }

  async function createType(actor: Actor, planId: string, name: string) {
    const res = await actor.agent.post(types(planId)).send({ name }).expect(201);
    return res.body.data as TypeBody;
  }

  async function createValue(
    actor: Actor,
    planId: string,
    typeId: string,
    shortCode: string,
    description?: string | null,
  ) {
    const res = await actor.agent
      .post(`${types(planId)}/${typeId}/values`)
      .send({ shortCode, ...(description === undefined ? {} : { description }) })
      .expect(201);
    return res.body.data as ValueBody;
  }

  async function list(actor: Actor, planId: string, query = ''): Promise<TypeBody[]> {
    const res = await actor.agent.get(`${types(planId)}${query}`).expect(200);
    return res.body.data as TypeBody[];
  }

  async function auditRows(action: string) {
    return prisma.auditEvent.findMany({ where: { action }, orderBy: { occurredAt: 'asc' } });
  }

  describe('create, list and rename', () => {
    it('appends in order, derives the organisation from the plan, and lists with the values', async () => {
      const { actor, orgId, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const trade = await createType(actor, planId, 'Trade');
      expect([area.position, trade.position]).toEqual([0, 1]);
      expect(area).toMatchObject({ planId, name: 'Area', version: 1, deletedAt: null });
      expect(area.values).toBeUndefined();

      const l1 = await createValue(actor, planId, area.id, 'L1', 'Level 1');
      const l2 = await createValue(actor, planId, area.id, 'L2');
      expect(l1).toMatchObject({
        shortCode: 'L1',
        description: 'Level 1',
        position: 0,
        version: 1,
      });
      expect(l2).toMatchObject({ shortCode: 'L2', description: null, position: 1 });

      const stored = await prisma.codeType.findUniqueOrThrow({ where: { id: area.id } });
      expect(stored.organizationId).toBe(orgId);
      expect(stored.createdBy).toBe(actor.userId);
      const storedValue = await prisma.codeValue.findUniqueOrThrow({ where: { id: l1.id } });
      expect(storedValue.organizationId).toBe(orgId);

      const res = await actor.agent.get(types(planId)).expect(200);
      expect(res.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
      const listed = res.body.data as TypeBody[];
      expect(listed.map((t) => t.name)).toEqual(['Area', 'Trade']);
      expect(listed[0]?.values?.map((v) => v.shortCode)).toEqual(['L1', 'L2']);
      expect(listed[1]?.values).toEqual([]);
    });

    it('trims, renames with a version bump, and edits a value, clearing a description with null', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, '  Area  ');
      expect(area.name).toBe('Area');
      const renamed = await actor.agent
        .patch(`${types(planId)}/${area.id}`)
        .send({ name: 'Zone', version: area.version })
        .expect(200);
      expect(renamed.body.data).toMatchObject({ name: 'Zone', version: 2 });

      const v = await createValue(actor, planId, area.id, ' L1 ', '  Level 1  ');
      expect(v).toMatchObject({ shortCode: 'L1', description: 'Level 1' });
      const edited = await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ shortCode: 'L01', version: v.version })
        .expect(200);
      expect(edited.body.data).toMatchObject({
        shortCode: 'L01',
        description: 'Level 1',
        version: 2,
      });
      const cleared = await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ description: null, version: 2 })
        .expect(200);
      expect(cleared.body.data).toMatchObject({ shortCode: 'L01', description: null, version: 3 });
      // A blank description is a clear too, never a stored ''.
      const blank = await createValue(actor, planId, area.id, 'L2', '   ');
      expect(blank.description).toBeNull();
    });

    it('refuses an edit that names nothing to change', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, area.id, 'L1');
      await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ version: 1 })
        .expect(422);
      expect((await list(actor, planId))[0]?.values?.[0]?.version).toBe(1);
    });

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
      ['81 characters', 'x'.repeat(81)],
      ['a control character', 'Ar\tea'],
    ])('refuses a type name that is %s with 422', async (_label, name) => {
      const { actor, planId } = await setup();
      await actor.agent.post(types(planId)).send({ name }).expect(422);
    });

    it.each([
      ['a short code of 81 characters', { shortCode: 'x'.repeat(81) }],
      ['an empty short code', { shortCode: '' }],
      ['a control character in the short code', { shortCode: 'L\n1' }],
      ['a description of 256 characters', { shortCode: 'L1', description: 'x'.repeat(256) }],
      ['a control character in the description', { shortCode: 'L1', description: 'a\u0007b' }],
    ])('refuses a value with %s with 422', async (_label, body) => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      await actor.agent
        .post(`${types(planId)}/${area.id}/values`)
        .send(body)
        .expect(422);
    });

    it('accepts the longest short code and description', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, area.id, 'x'.repeat(80), 'y'.repeat(255));
      expect(v.shortCode).toHaveLength(80);
      expect(v.description).toHaveLength(255);
    });

    it('refuses a foreign organizationId (S1) and stores nothing', async () => {
      const { actor, planId } = await setup();
      await actor.agent
        .post(types(planId))
        .send({ name: 'Area', organizationId: FOREIGN_ORG })
        .expect(422);
      const area = await createType(actor, planId, 'Area');
      await actor.agent
        .post(`${types(planId)}/${area.id}/values`)
        .send({ shortCode: 'L1', organizationId: FOREIGN_ORG })
        .expect(422);
      expect(await prisma.codeType.count({ where: { organizationId: FOREIGN_ORG } })).toBe(0);
      expect(await prisma.codeValue.count({ where: { organizationId: FOREIGN_ORG } })).toBe(0);
      expect(await prisma.codeValue.count()).toBe(0);
    });
  });

  describe('roles and the pen', () => {
    it('lets a Viewer read, and refuses a Viewer and a Contributor every write with 403', async () => {
      const { actor, orgId, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, area.id, 'L1');
      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        const read = await member.agent.get(types(planId)).expect(200);
        expect(read.body.data[0].values).toHaveLength(1);
        await member.agent.post(types(planId)).send({ name: 'X' }).expect(403);
        await member.agent
          .patch(`${types(planId)}/${area.id}`)
          .send({ name: 'X', version: 1 })
          .expect(403);
        await member.agent
          .patch(`${types(planId)}/order`)
          .send({ order: [{ id: area.id, version: 1 }] })
          .expect(403);
        await member.agent.delete(`${types(planId)}/${area.id}`).expect(403);
        await member.agent.post(`${types(planId)}/${area.id}/restore`).expect(403);
        await member.agent
          .post(`${types(planId)}/${area.id}/values`)
          .send({ shortCode: 'X' })
          .expect(403);
        await member.agent
          .patch(`${types(planId)}/${area.id}/values/order`)
          .send({ order: [{ id: v.id, version: 1 }] })
          .expect(403);
        await member.agent
          .patch(`${values(planId)}/${v.id}`)
          .send({ shortCode: 'X', version: 1 })
          .expect(403);
        await member.agent.delete(`${values(planId)}/${v.id}`).expect(403);
        await member.agent.post(`${values(planId)}/${v.id}/restore`).expect(403);
        // The deleted rows are the restore picker's: reading them needs the restore permission.
        await member.agent.get(`${types(planId)}?include=deleted`).expect(403);
      }
    });

    it('lets a Planner who holds the pen write, and an Org Admin too', async () => {
      const { actor, orgId, planId } = await setup();
      const planner = await addMember(orgId, 'PLANNER', 'planner@example.com');
      await actor.agent.delete(lockUrl(planId)).expect(204);
      await planner.agent.post(lockUrl(planId)).send({}).expect(200);
      await planner.agent.post(types(planId)).send({ name: 'Area' }).expect(201);
      await planner.agent.delete(lockUrl(planId)).expect(204);
      await actor.agent.post(lockUrl(planId)).send({}).expect(200);
      await actor.agent.post(types(planId)).send({ name: 'Trade' }).expect(201);
    });

    it('answers 423 to every write without the pen, and changes nothing', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, area.id, 'L1');
      const gone = await createType(actor, planId, 'Gone');
      const goneValue = await createValue(actor, planId, area.id, 'L2');
      await actor.agent.delete(`${types(planId)}/${gone.id}`).expect(204);
      await actor.agent.delete(`${values(planId)}/${goneValue.id}`).expect(204);
      await actor.agent.delete(lockUrl(planId)).expect(204);

      await actor.agent.post(types(planId)).send({ name: 'X' }).expect(423);
      await actor.agent
        .patch(`${types(planId)}/${area.id}`)
        .send({ name: 'X', version: 1 })
        .expect(423);
      await actor.agent
        .patch(`${types(planId)}/order`)
        .send({ order: [{ id: area.id, version: 1 }] })
        .expect(423);
      await actor.agent.delete(`${types(planId)}/${area.id}`).expect(423);
      await actor.agent.post(`${types(planId)}/${gone.id}/restore`).expect(423);
      await actor.agent
        .post(`${types(planId)}/${area.id}/values`)
        .send({ shortCode: 'X' })
        .expect(423);
      await actor.agent
        .patch(`${types(planId)}/${area.id}/values/order`)
        .send({ order: [{ id: v.id, version: 1 }] })
        .expect(423);
      await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ shortCode: 'X', version: 1 })
        .expect(423);
      await actor.agent.delete(`${values(planId)}/${v.id}`).expect(423);
      await actor.agent.post(`${values(planId)}/${goneValue.id}/restore`).expect(423);

      await actor.agent.post(lockUrl(planId)).send({}).expect(200);
      const rows = await list(actor, planId);
      expect(rows.map((t) => t.name)).toEqual(['Area']);
      expect(rows[0]?.values?.map((x) => x.shortCode)).toEqual(['L1']);
      expect(await auditRows('code_type.restored')).toHaveLength(0);
      expect(await auditRows('code_value.restored')).toHaveLength(0);
    });

    it('answers 401 without a session', async () => {
      const { planId } = await setup();
      await request(server()).get(types(planId)).expect(401);
    });
  });

  describe('organisation and plan scope', () => {
    it('answers 404 for another organisation on every route', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, area.id, 'L1');
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);

      for (const org of ['other-co', 'acme']) {
        await outsider.agent.get(types(planId, org)).expect(404);
        await outsider.agent.post(types(planId, org)).send({ name: 'X' }).expect(404);
        await outsider.agent
          .patch(`${types(planId, org)}/${area.id}`)
          .send({ name: 'X', version: 1 })
          .expect(404);
        await outsider.agent.delete(`${types(planId, org)}/${area.id}`).expect(404);
        await outsider.agent.post(`${types(planId, org)}/${area.id}/restore`).expect(404);
        await outsider.agent
          .post(`${types(planId, org)}/${area.id}/values`)
          .send({ shortCode: 'X' })
          .expect(404);
        await outsider.agent
          .patch(`${values(planId, org)}/${v.id}`)
          .send({ shortCode: 'X', version: 1 })
          .expect(404);
        await outsider.agent.delete(`${values(planId, org)}/${v.id}`).expect(404);
        await outsider.agent.post(`${values(planId, org)}/${v.id}/restore`).expect(404);
      }
      expect(await prisma.codeValue.count({ where: { shortCode: 'X' } })).toBe(0);
    });

    it('answers 404 for a type or value addressed through a different plan of the organisation', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, area.id, 'L1');
      const otherPlan = await makePlan(actor, 'acme', 'Second');
      await actor.agent.post(lockUrl(otherPlan)).send({}).expect(200);

      await actor.agent
        .patch(`${types(otherPlan)}/${area.id}`)
        .send({ name: 'X', version: 1 })
        .expect(404);
      await actor.agent.delete(`${types(otherPlan)}/${area.id}`).expect(404);
      await actor.agent.post(`${types(otherPlan)}/${area.id}/restore`).expect(404);
      await actor.agent
        .post(`${types(otherPlan)}/${area.id}/values`)
        .send({ shortCode: 'X' })
        .expect(404);
      await actor.agent
        .patch(`${types(otherPlan)}/${area.id}/values/order`)
        .send({ order: [{ id: v.id, version: 1 }] })
        .expect(404);
      await actor.agent
        .patch(`${values(otherPlan)}/${v.id}`)
        .send({ shortCode: 'X', version: 1 })
        .expect(404);
      await actor.agent.delete(`${values(otherPlan)}/${v.id}`).expect(404);
      await actor.agent.post(`${values(otherPlan)}/${v.id}/restore`).expect(404);
      await actor.agent
        .patch(`${types(otherPlan)}/order`)
        .send({ order: [{ id: area.id, version: 1 }] })
        .expect(404);
      expect(await list(actor, otherPlan)).toEqual([]);
    });
  });

  describe('409 and 422', () => {
    it('answers 409 for a stale version on a type and on a value, applying nothing', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      await actor.agent
        .patch(`${types(planId)}/${area.id}`)
        .send({ name: 'One', version: 1 })
        .expect(200);
      const stale = await actor.agent
        .patch(`${types(planId)}/${area.id}`)
        .send({ name: 'Two', version: 1 })
        .expect(409);
      expect(stale.body.error.details.reason).toBe('STALE_VERSION');
      expect((await list(actor, planId))[0]?.name).toBe('One');

      const v = await createValue(actor, planId, area.id, 'L1');
      await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ shortCode: 'A', version: 1 })
        .expect(200);
      const staleValue = await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ shortCode: 'B', version: 1 })
        .expect(409);
      expect(staleValue.body.error.details.reason).toBe('STALE_VERSION');
    });

    it('answers 409 CODE_TYPE_NAME_TAKEN for a duplicate name, ignoring case, per plan', async () => {
      const { actor, planId } = await setup();
      await createType(actor, planId, 'Area');
      const dup = await actor.agent.post(types(planId)).send({ name: 'AREA' }).expect(409);
      expect(dup.body.error.details.reason).toBe('CODE_TYPE_NAME_TAKEN');
      // The message echoes the name the caller sent, never a stored row's.
      expect(dup.body.error.message).toBe('A code type called AREA already exists.');
      expect(JSON.stringify(dup.body)).not.toContain('"Area"');

      const second = await makePlan(actor, 'acme', 'Second');
      await actor.agent.post(lockUrl(second)).send({}).expect(200);
      await createType(actor, second, 'Area');
    });

    it('answers 409 CODE_VALUE_TAKEN for a duplicate short code per type, ignoring case', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const trade = await createType(actor, planId, 'Trade');
      await createValue(actor, planId, area.id, 'L1');
      const dup = await actor.agent
        .post(`${types(planId)}/${area.id}/values`)
        .send({ shortCode: 'l1' })
        .expect(409);
      expect(dup.body.error.details.reason).toBe('CODE_VALUE_TAKEN');
      // Another type may use the same code.
      await createValue(actor, planId, trade.id, 'L1');
      const l2 = await createValue(actor, planId, area.id, 'L2');
      await actor.agent
        .patch(`${values(planId)}/${l2.id}`)
        .send({ shortCode: 'L1', version: 1 })
        .expect(409);
    });

    it('folds a non-ASCII pair (É/é) for names and short codes on this database', async () => {
      const { actor, planId } = await setup();
      const t = await createType(actor, planId, 'Électrique');
      await actor.agent.post(types(planId)).send({ name: 'éLECTRIQUE' }).expect(409);
      await createValue(actor, planId, t.id, 'Étage');
      await actor.agent
        .post(`${types(planId)}/${t.id}/values`)
        .send({ shortCode: 'éTAGE' })
        .expect(409);
    });

    it('lets a deleted name and a deleted short code be reused', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, a.id, 'L1');
      await actor.agent.delete(`${values(planId)}/${v.id}`).expect(204);
      await createValue(actor, planId, a.id, 'L1');
      await actor.agent.delete(`${types(planId)}/${a.id}`).expect(204);
      await createType(actor, planId, 'Area');
    });

    it('answers 422 CODE_TYPE_LIMIT for the 101st type, and 100 are accepted', async () => {
      const { actor, orgId, planId } = await setup();
      await prisma.codeType.createMany({
        data: Array.from({ length: 99 }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Type ${i}`,
          position: i,
        })),
      });
      await createType(actor, planId, 'The hundredth');
      const over = await actor.agent.post(types(planId)).send({ name: 'One too many' }).expect(422);
      expect(over.body.error.details.reason).toBe('CODE_TYPE_LIMIT');
      expect(over.body.error.message).toContain('Delete one you no longer use first');
    });

    it('lets exactly one of two concurrent creates take the last type slot (the plan lock)', async () => {
      const { actor, orgId, planId } = await setup();
      await prisma.codeType.createMany({
        data: Array.from({ length: 99 }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Type ${i}`,
          position: i,
        })),
      });
      const results = await Promise.all(
        ['Racer A', 'Racer B'].map((name) => actor.agent.post(types(planId)).send({ name })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await prisma.codeType.count({ where: { planId, deletedAt: null } })).toBe(100);
    });

    it('answers 422 CODE_VALUE_LIMIT for the 1,001st value, and 1,000 are accepted', async () => {
      const { actor, orgId, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      await prisma.codeValue.createMany({
        data: Array.from({ length: 999 }, (_, i) => ({
          organizationId: orgId,
          codeTypeId: area.id,
          shortCode: `V${i}`,
          position: i,
        })),
      });
      await createValue(actor, planId, area.id, 'LAST');
      const over = await actor.agent
        .post(`${types(planId)}/${area.id}/values`)
        .send({ shortCode: 'ONE-TOO-MANY' })
        .expect(422);
      expect(over.body.error.details.reason).toBe('CODE_VALUE_LIMIT');
      expect(over.body.error.message).toContain('Area can have at most 1000 values');
      // The cap is per type: another type starts empty.
      const trade = await createType(actor, planId, 'Trade');
      await createValue(actor, planId, trade.id, 'M');
    });
  });

  describe('reorder', () => {
    it('rewrites type positions densely and bumps the versions of what moved', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'A');
      const b = await createType(actor, planId, 'B');
      const c = await createType(actor, planId, 'C');
      const res = await actor.agent
        .patch(`${types(planId)}/order`)
        .send({
          order: [
            { id: c.id, version: c.version },
            { id: a.id, version: a.version },
            { id: b.id, version: b.version },
          ],
        })
        .expect(200);
      expect(res.body.data.map((t: TypeBody) => [t.name, t.position, t.version])).toEqual([
        ['C', 0, 2],
        ['A', 1, 2],
        ['B', 2, 2],
      ]);
      expect((await list(actor, planId)).map((t) => t.name)).toEqual(['C', 'A', 'B']);
    });

    it('rewrites value positions, and applies nothing on a stale, short or duplicated set', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const v1 = await createValue(actor, planId, area.id, 'L1');
      const v2 = await createValue(actor, planId, area.id, 'L2');
      const url = `${types(planId)}/${area.id}/values/order`;
      const stale = await actor.agent
        .patch(url)
        .send({
          order: [
            { id: v2.id, version: 9 },
            { id: v1.id, version: 1 },
          ],
        })
        .expect(409);
      expect(stale.body.error.details.reason).toBe('STALE_VERSION');
      await actor.agent
        .patch(url)
        .send({ order: [{ id: v2.id, version: 1 }] })
        .expect(409);
      await actor.agent
        .patch(url)
        .send({
          order: [
            { id: v2.id, version: 1 },
            { id: v2.id, version: 1 },
          ],
        })
        .expect(422);
      expect((await list(actor, planId))[0]?.values?.map((v) => v.shortCode)).toEqual(['L1', 'L2']);

      const ok = await actor.agent
        .patch(url)
        .send({
          order: [
            { id: v2.id, version: 1 },
            { id: v1.id, version: 1 },
          ],
        })
        .expect(200);
      expect(ok.body.data.map((v: ValueBody) => [v.shortCode, v.position, v.version])).toEqual([
        ['L2', 0, 2],
        ['L1', 1, 2],
      ]);
    });
  });

  describe('delete and restore', () => {
    it('deletes a type with its live values in one batch, restores exactly those, and audits both', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const l1 = await createValue(actor, planId, area.id, 'L1');
      const l2 = await createValue(actor, planId, area.id, 'L2');
      const l3 = await createValue(actor, planId, area.id, 'L3');
      // L3 is deleted on its own first, so it is not part of the type's batch.
      await actor.agent.delete(`${values(planId)}/${l3.id}`).expect(204);

      await actor.agent.delete(`${types(planId)}/${area.id}`).expect(204);
      expect(await list(actor, planId)).toEqual([]);
      const stored = await prisma.codeType.findUniqueOrThrow({ where: { id: area.id } });
      expect(stored.deletedAt).not.toBeNull();
      const swept = await prisma.codeValue.findMany({ where: { codeTypeId: area.id } });
      const batches = new Map(swept.map((v) => [v.id, v.deleteBatchId]));
      expect(batches.get(l1.id)).toBe(stored.deleteBatchId);
      expect(batches.get(l2.id)).toBe(stored.deleteBatchId);
      expect(batches.get(l3.id)).not.toBe(stored.deleteBatchId);
      await actor.agent.delete(`${types(planId)}/${area.id}`).expect(404);

      const deletedList = await list(actor, planId, '?include=deleted');
      expect(deletedList[0]?.deletedAt).not.toBeNull();
      expect(deletedList[0]?.values?.map((v) => [v.shortCode, v.deletedAt !== null])).toEqual([
        ['L1', true],
        ['L2', true],
        ['L3', true],
      ]);

      const restored = await actor.agent.post(`${types(planId)}/${area.id}/restore`).expect(200);
      expect(restored.body.data).toMatchObject({ id: area.id, name: 'Area', deletedAt: null });
      expect(restored.body.data.values.map((v: ValueBody) => v.shortCode)).toEqual(['L1', 'L2']);
      expect((await list(actor, planId))[0]?.values?.map((v) => v.shortCode)).toEqual(['L1', 'L2']);

      const [deleted] = await auditRows('code_type.deleted');
      expect(deleted).toMatchObject({
        subjectType: 'CODE_TYPE',
        subjectId: area.id,
        subjectLabel: 'Area',
        actorUserId: actor.userId,
      });
      expect(deleted?.changes).toMatchObject({
        before: {
          name: 'Area',
          planName: 'Plan',
          deleteBatchId: stored.deleteBatchId,
          valueCount: 2,
        },
      });
      const [back] = await auditRows('code_type.restored');
      expect(back).toMatchObject({ subjectType: 'CODE_TYPE', subjectId: area.id });
      expect(back?.changes).toMatchObject({ after: { name: 'Area', valueCount: 2 } });
    });

    it('deletes and restores a value, and audits it', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      await createValue(actor, planId, area.id, 'L1');
      const l2 = await createValue(actor, planId, area.id, 'L2');
      await actor.agent.delete(`${values(planId)}/${l2.id}`).expect(204);
      expect((await list(actor, planId))[0]?.values?.map((v) => v.shortCode)).toEqual(['L1']);
      await actor.agent.delete(`${values(planId)}/${l2.id}`).expect(404);
      const restored = await actor.agent.post(`${values(planId)}/${l2.id}/restore`).expect(200);
      expect(restored.body.data).toMatchObject({ id: l2.id, shortCode: 'L2', deletedAt: null });
      expect((await list(actor, planId))[0]?.values?.map((v) => v.shortCode)).toEqual(['L1', 'L2']);

      const [deleted] = await auditRows('code_value.deleted');
      expect(deleted).toMatchObject({
        subjectType: 'CODE_VALUE',
        subjectId: l2.id,
        subjectLabel: 'L2',
      });
      expect(deleted?.changes).toMatchObject({
        before: { shortCode: 'L2', typeName: 'Area', planName: 'Plan' },
      });
      const [back] = await auditRows('code_value.restored');
      expect(back?.changes).toMatchObject({ after: { shortCode: 'L2', typeName: 'Area' } });
    });

    it('writes no audit row for create, rename, edit or reorder', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'A');
      const v = await createValue(actor, planId, a.id, 'L1');
      await actor.agent
        .patch(`${types(planId)}/${a.id}`)
        .send({ name: 'A2', version: 1 })
        .expect(200);
      await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ shortCode: 'L9', version: 1 })
        .expect(200);
      expect(await prisma.auditEvent.count({ where: { action: { startsWith: 'code_' } } })).toBe(0);
    });

    it('refuses a delete at a stale ?version= and deletes nothing', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'A');
      const v = await createValue(actor, planId, a.id, 'L1');
      const staleType = await actor.agent.delete(`${types(planId)}/${a.id}?version=5`).expect(409);
      expect(staleType.body.error.details.reason).toBe('STALE_VERSION');
      const staleValue = await actor.agent
        .delete(`${values(planId)}/${v.id}?version=5`)
        .expect(409);
      expect(staleValue.body.error.details.reason).toBe('STALE_VERSION');
      expect(await list(actor, planId)).toHaveLength(1);
      expect(await auditRows('code_type.deleted')).toHaveLength(0);
      expect(await auditRows('code_value.deleted')).toHaveLength(0);
      await actor.agent.delete(`${values(planId)}/${v.id}?version=1`).expect(204);
      await actor.agent.delete(`${types(planId)}/${a.id}?version=1`).expect(204);
    });

    it('answers 409 when the name or short code was taken while deleted, and keeps it deleted', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, a.id, 'L1');
      await actor.agent.delete(`${values(planId)}/${v.id}`).expect(204);
      await createValue(actor, planId, a.id, 'l1');
      const value = await actor.agent.post(`${values(planId)}/${v.id}/restore`).expect(409);
      expect(value.body.error.details.reason).toBe('CODE_VALUE_TAKEN');
      expect(await auditRows('code_value.restored')).toHaveLength(0);

      await actor.agent.delete(`${types(planId)}/${a.id}`).expect(204);
      await createType(actor, planId, 'area');
      const type = await actor.agent.post(`${types(planId)}/${a.id}/restore`).expect(409);
      expect(type.body.error.details.reason).toBe('CODE_TYPE_NAME_TAKEN');
      expect(await auditRows('code_type.restored')).toHaveLength(0);
    });

    it('answers 409 PARENT_DELETED for a value whose type is deleted, naming the type', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, a.id, 'L1');
      await actor.agent.delete(`${types(planId)}/${a.id}`).expect(204);
      const res = await actor.agent.post(`${values(planId)}/${v.id}/restore`).expect(409);
      expect(res.body.error.details.reason).toBe('PARENT_DELETED');
      expect(res.body.error.message).toBe('Restore Area first.');
      // A value cannot be edited or deleted while it is deleted: it is invisible to those routes.
      await actor.agent
        .patch(`${values(planId)}/${v.id}`)
        .send({ shortCode: 'X', version: 1 })
        .expect(404);
    });

    it('answers 409 PARENT_DELETED for a restore under a deleted plan', async () => {
      const { actor, planId } = await setup();
      const a = await createType(actor, planId, 'Area');
      const v = await createValue(actor, planId, a.id, 'L1');
      const gone = await createValue(actor, planId, a.id, 'L2');
      await actor.agent.delete(`${values(planId)}/${gone.id}`).expect(204);
      await actor.agent.delete(`${types(planId)}/${a.id}`).expect(204);
      await actor.agent.delete(`${base()}/plans/${planId}`).expect(204);
      const type = await actor.agent.post(`${types(planId)}/${a.id}/restore`).expect(409);
      expect(type.body.error.details.reason).toBe('PARENT_DELETED');
      const value = await actor.agent.post(`${values(planId)}/${v.id}/restore`).expect(409);
      expect(value.body.error.details.reason).toBe('PARENT_DELETED');
    });

    it('answers 422 for a type restore that would pass the cap', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await createType(actor, planId, 'Area');
      await actor.agent.delete(`${types(planId)}/${a.id}`).expect(204);
      await prisma.codeType.createMany({
        data: Array.from({ length: 100 }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Type ${i}`,
          position: i,
        })),
      });
      const res = await actor.agent.post(`${types(planId)}/${a.id}/restore`).expect(422);
      expect(res.body.error.details.reason).toBe('CODE_TYPE_LIMIT');
      expect(
        (await prisma.codeType.findUniqueOrThrow({ where: { id: a.id } })).deletedAt,
      ).not.toBeNull();
    });

    it('answers 422 for a value restore that would pass the cap', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await createType(actor, planId, 'Area');
      const gone = await createValue(actor, planId, a.id, 'GONE');
      await actor.agent.delete(`${values(planId)}/${gone.id}`).expect(204);
      await prisma.codeValue.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          organizationId: orgId,
          codeTypeId: a.id,
          shortCode: `V${i}`,
          position: i,
        })),
      });
      const res = await actor.agent.post(`${values(planId)}/${gone.id}/restore`).expect(422);
      expect(res.body.error.details.reason).toBe('CODE_VALUE_LIMIT');
    });
  });

  describe('the swimlane source type', () => {
    it('refuses to delete the type the swimlanes are drawn from, with the message to act on', async () => {
      const { actor, planId } = await setup();
      const area = await createType(actor, planId, 'Area');
      const trade = await createType(actor, planId, 'Trade');
      await createValue(actor, planId, area.id, 'L1');
      // Written directly so the case needs no activity carrying a value; the real switch, and this
      // refusal after it, are plan-swimlane-code-source.e2e-spec.ts.
      await prisma.plan.update({
        where: { id: planId },
        data: { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: area.id },
      });

      const res = await actor.agent.delete(`${types(planId)}/${area.id}`).expect(409);
      expect(res.body.error.details.reason).toBe('CODE_TYPE_IS_SWIMLANE_SOURCE');
      expect(res.body.error.message).toBe(
        'The swimlanes are made from Area. Choose another swimlane source first.',
      );
      const after = await prisma.codeType.findUniqueOrThrow({ where: { id: area.id } });
      expect(after.deletedAt).toBeNull();
      expect(
        await prisma.codeValue.count({ where: { codeTypeId: area.id, deletedAt: null } }),
      ).toBe(1);
      expect(await auditRows('code_type.deleted')).toHaveLength(0);

      // Another type is deletable, and so is a VALUE of the source type (its members draw in "No Area").
      await actor.agent.delete(`${types(planId)}/${trade.id}`).expect(204);
      const value = await prisma.codeValue.findFirstOrThrow({ where: { codeTypeId: area.id } });
      await actor.agent.delete(`${values(planId)}/${value.id}`).expect(204);

      // Once the swimlanes come from elsewhere the type can go.
      await prisma.plan.update({
        where: { id: planId },
        data: { swimlaneSource: 'NONE', swimlaneCodeTypeId: null },
      });
      await actor.agent.delete(`${types(planId)}/${area.id}`).expect(204);
    });
  });
});
