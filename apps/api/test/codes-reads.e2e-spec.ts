import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for the on-demand reads of code values (p6-activity-codes M3-T0), against a real
 * database: `GET code-types?values=none` with `valueCount`, `GET code-types/:id/values`,
 * `GET code-values?id=`, and `codes` on the single-activity GET. The writes are `codes.e2e-spec.ts`
 * and `activity-codes.e2e-spec.ts`.
 *
 * Covers the shapes and the order across pages, the bounds (422), the `include=deleted` permission,
 * the IDOR rows (foreign organisation, another plan, deleted and unknown ids: one 404, never told
 * apart), what the resolve read names (deleted values and values of deleted types) and leaves out
 * (foreign ids), and SC-2 parity on the single-activity GET.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface ValueBody {
  id: string;
  codeTypeId: string;
  shortCode: string;
  position: number;
  version: number;
  deletedAt: string | null;
  codeTypeName?: string;
  codeTypeDeletedAt?: string | null;
}

interface TypeBody {
  id: string;
  name: string;
  deletedAt: string | null;
  values?: ValueBody[];
  valueCount?: number;
}

describe.skipIf(!hasDatabase)('Code reads API (e2e)', () => {
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
  const base = (org = 'acme') => `/api/v1/organizations/${org}`;
  const typesUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/code-types`;
  const valuesUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/code-values`;

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

  async function addMember(
    orgId: string,
    role: 'VIEWER' | 'CONTRIBUTOR' | 'PLANNER',
    email: string,
  ): Promise<Actor> {
    const member = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: member.userId, role } });
    return member;
  }

  async function createType(actor: Actor, planId: string, name: string): Promise<TypeBody> {
    const res = await actor.agent.post(typesUrl(planId)).send({ name }).expect(201);
    return res.body.data as TypeBody;
  }

  async function createValue(actor: Actor, planId: string, typeId: string, shortCode: string) {
    const res = await actor.agent
      .post(`${typesUrl(planId)}/${typeId}/values`)
      .send({ shortCode })
      .expect(201);
    return res.body.data as ValueBody;
  }

  /** An admin org with a plan carrying Area (L1..L5, L4 deleted) and an empty Trade. */
  async function seed() {
    const actor = await signUp('admin@example.com');
    const org = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const planId = await makePlan(actor);
    const area = await createType(actor, planId, 'Area');
    const trade = await createType(actor, planId, 'Trade');
    const vs: ValueBody[] = [];
    for (const code of ['L1', 'L2', 'L3', 'L4', 'L5']) {
      vs.push(await createValue(actor, planId, area.id, code));
    }
    const l4 = vs[3] as ValueBody;
    await actor.agent.delete(`${valuesUrl(planId)}/${l4.id}`).expect(204);
    return { actor, orgId: org.body.data.id as string, planId, area, trade, vs, l4 };
  }

  describe('GET code-types?values=none', () => {
    it('returns the types alone with their live value count, deleted values not counted', async () => {
      const { actor, planId, area, trade } = await seed();
      const res = await actor.agent.get(`${typesUrl(planId)}?values=none`).expect(200);
      const data = res.body.data as TypeBody[];
      expect(data.map((t) => [t.id, t.valueCount])).toEqual([
        [area.id, 4],
        [trade.id, 0],
      ]);
      for (const t of data) expect('values' in t).toBe(false);
    });

    it('keeps the default nesting, and adds only the count to it', async () => {
      const { actor, planId, area } = await seed();
      const nested = (await actor.agent.get(typesUrl(planId)).expect(200)).body.data as TypeBody[];
      const bare = (await actor.agent.get(`${typesUrl(planId)}?values=none`).expect(200)).body
        .data as TypeBody[];
      expect(nested[0]?.values?.map((v) => v.shortCode)).toEqual(['L1', 'L2', 'L3', 'L5']);
      expect(nested[1]?.values).toEqual([]);
      expect(nested[0]?.valueCount).toBe(4);
      expect(nested.map(({ values: _values, ...rest }) => rest)).toEqual(bare);
      expect(nested[0]?.id).toBe(area.id);
    });

    it('with include=deleted lists the deleted types, still without values or a values read', async () => {
      const { actor, planId, trade } = await seed();
      await actor.agent.delete(`${typesUrl(planId)}/${trade.id}`).expect(204);
      const res = await actor.agent
        .get(`${typesUrl(planId)}?values=none&include=deleted`)
        .expect(200);
      const data = res.body.data as TypeBody[];
      expect(data.map((t) => [t.name, t.deletedAt !== null, t.valueCount])).toEqual([
        ['Area', false, 4],
        ['Trade', true, 0],
      ]);
      for (const t of data) expect('values' in t).toBe(false);
    });

    it('pages over the types and refuses a malformed cursor or an unknown values option', async () => {
      const { actor, planId, area, trade } = await seed();
      const first = await actor.agent.get(`${typesUrl(planId)}?values=none&limit=1`).expect(200);
      expect(first.body.meta).toMatchObject({ hasMore: true, nextCursor: area.id });
      const second = await actor.agent
        .get(`${typesUrl(planId)}?values=none&limit=1&cursor=${area.id}`)
        .expect(200);
      expect((second.body.data as TypeBody[]).map((t) => t.id)).toEqual([trade.id]);
      await actor.agent.get(`${typesUrl(planId)}?cursor=not-a-uuid`).expect(422);
      await actor.agent.get(`${typesUrl(planId)}?values=all`).expect(422);
    });
  });

  describe('GET code-types/:codeTypeId/values', () => {
    it('lists a type’s live values in position order, and pages them across cursors', async () => {
      const { actor, planId, area, vs } = await seed();
      const url = `${typesUrl(planId)}/${area.id}/values`;
      const all = await actor.agent.get(url).expect(200);
      expect(all.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
      expect((all.body.data as ValueBody[]).map((v) => v.shortCode)).toEqual([
        'L1',
        'L2',
        'L3',
        'L5',
      ]);

      const page1 = await actor.agent.get(`${url}?limit=3`).expect(200);
      expect((page1.body.data as ValueBody[]).map((v) => v.shortCode)).toEqual(['L1', 'L2', 'L3']);
      expect(page1.body.meta).toMatchObject({ hasMore: true, nextCursor: vs[2]?.id });
      const page2 = await actor.agent
        .get(`${url}?limit=3&cursor=${page1.body.meta.nextCursor as string}`)
        .expect(200);
      expect((page2.body.data as ValueBody[]).map((v) => v.shortCode)).toEqual(['L5']);
      expect(page2.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it('reads the order a reorder writes', async () => {
      const { actor, planId, area, vs } = await seed();
      const live = [vs[0], vs[1], vs[2], vs[4]] as ValueBody[];
      const reordered = [live[3], live[0], live[2], live[1]] as ValueBody[];
      await actor.agent
        .patch(`${typesUrl(planId)}/${area.id}/values/order`)
        .send({ order: reordered.map((v) => ({ id: v.id, version: v.version })) })
        .expect(200);
      const res = await actor.agent.get(`${typesUrl(planId)}/${area.id}/values`).expect(200);
      expect((res.body.data as ValueBody[]).map((v) => v.shortCode)).toEqual([
        'L5',
        'L1',
        'L3',
        'L2',
      ]);
    });

    it('returns the same fields as the nested list', async () => {
      const { actor, planId, area } = await seed();
      const nested = (await actor.agent.get(typesUrl(planId)).expect(200)).body.data as TypeBody[];
      const own = await actor.agent.get(`${typesUrl(planId)}/${area.id}/values`).expect(200);
      expect(own.body.data).toEqual(nested[0]?.values);
    });

    it('refuses a limit of 0 or 1,001 and a non-UUID cursor with 422', async () => {
      const { actor, planId, area } = await seed();
      const url = `${typesUrl(planId)}/${area.id}/values`;
      await actor.agent.get(`${url}?limit=0`).expect(422);
      await actor.agent.get(`${url}?limit=1001`).expect(422);
      await actor.agent.get(`${url}?limit=1000`).expect(200);
      await actor.agent.get(`${url}?cursor=nope`).expect(422);
      await actor.agent.get(`${url}?include=everything`).expect(422);
    });

    it('adds the deleted values with include=deleted, in the same order, for code:restore only', async () => {
      const { actor, orgId, planId, area, l4 } = await seed();
      const url = `${typesUrl(planId)}/${area.id}/values`;
      const res = await actor.agent.get(`${url}?include=deleted`).expect(200);
      const data = res.body.data as ValueBody[];
      expect(data.map((v) => [v.shortCode, v.deletedAt !== null])).toEqual([
        ['L1', false],
        ['L2', false],
        ['L3', false],
        ['L4', true],
        ['L5', false],
      ]);
      expect(data[3]?.id).toBe(l4.id);

      const paged = await actor.agent.get(`${url}?include=deleted&limit=4`).expect(200);
      expect(paged.body.meta).toMatchObject({ hasMore: true });
      const rest = await actor.agent
        .get(`${url}?include=deleted&limit=4&cursor=${paged.body.meta.nextCursor as string}`)
        .expect(200);
      expect((rest.body.data as ValueBody[]).map((v) => v.shortCode)).toEqual(['L5']);

      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        await member.agent.get(`${url}?include=deleted`).expect(403);
        await member.agent.get(url).expect(200);
      }
      const planner = await addMember(orgId, 'PLANNER', 'planner@example.com');
      await planner.agent.get(`${url}?include=deleted`).expect(200);
    });

    it('answers 404 for every kind of type that is not a live type of this plan', async () => {
      const { actor, orgId, planId, area, trade } = await seed();
      await actor.agent.delete(`${typesUrl(planId)}/${trade.id}`).expect(204);
      const other = await makePlan(actor, 'acme', 'Second');
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);
      const stranger = await addMember(orgId, 'VIEWER', 'viewer@example.com');
      await stranger.agent.get(`${typesUrl(planId)}/${area.id}/values`).expect(200);

      const responses = await Promise.all([
        actor.agent.get(`${typesUrl(planId)}/${trade.id}/values`),
        actor.agent.get(`${typesUrl(planId)}/${UNKNOWN_ID}/values`),
        actor.agent.get(`${typesUrl(other)}/${area.id}/values`),
        outsider.agent.get(`${typesUrl(planId, 'other-co')}/${area.id}/values`),
        outsider.agent.get(`${typesUrl(planId)}/${area.id}/values`),
        actor.agent.get(`${typesUrl(UNKNOWN_ID)}/${area.id}/values`),
      ]);
      expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
      const bodies = new Set(responses.slice(0, 3).map((r) => JSON.stringify(r.body.error)));
      expect(bodies.size).toBe(1);
    });

    it('answers 401 without a session', async () => {
      const { planId, area } = await seed();
      await request(server())
        .get(`${typesUrl(planId)}/${area.id}/values`)
        .expect(401);
    });
  });

  describe('GET code-values?id=', () => {
    it('names values by id with their type, unpaged, and leaves unknown ids out', async () => {
      const { actor, planId, area, vs } = await seed();
      const [l1, l2] = vs as [ValueBody, ValueBody];
      const res = await actor.agent
        .get(`${valuesUrl(planId)}?id=${l2.id}&id=${l1.id}&id=${UNKNOWN_ID}`)
        .expect(200);
      expect('meta' in res.body && res.body.meta !== undefined).toBe(false);
      const data = res.body.data as ValueBody[];
      expect(data.map((v) => v.shortCode)).toEqual(['L1', 'L2']);
      expect(data[0]).toMatchObject({
        id: l1.id,
        codeTypeId: area.id,
        codeTypeName: 'Area',
        codeTypeDeletedAt: null,
        deletedAt: null,
      });
      await actor.agent.get(`${valuesUrl(planId)}?id=${l1.id}`).expect(200);
    });

    it('names a deleted value and a value of a deleted type, saying so', async () => {
      const { actor, planId, area, l4, vs } = await seed();
      const l1 = vs[0] as ValueBody;
      await actor.agent.delete(`${typesUrl(planId)}/${area.id}`).expect(204);
      const res = await actor.agent.get(`${valuesUrl(planId)}?id=${l4.id}&id=${l1.id}`).expect(200);
      const data = res.body.data as ValueBody[];
      expect(data).toHaveLength(2);
      for (const v of data) {
        expect(v.codeTypeName).toBe('Area');
        expect(v.codeTypeDeletedAt).not.toBeNull();
      }
      expect(data.find((v) => v.id === l4.id)?.deletedAt).not.toBeNull();
    });

    it('reads for a Viewer, and leaves out the ids of another plan and another organisation', async () => {
      const { actor, orgId, planId, vs } = await seed();
      const l1 = vs[0] as ValueBody;
      const viewer = await addMember(orgId, 'VIEWER', 'viewer@example.com');
      const own = await viewer.agent.get(`${valuesUrl(planId)}?id=${l1.id}`).expect(200);
      expect((own.body.data as ValueBody[]).map((v) => v.id)).toEqual([l1.id]);

      const other = await makePlan(actor, 'acme', 'Second');
      const crossPlan = await actor.agent.get(`${valuesUrl(other)}?id=${l1.id}`).expect(200);
      expect(crossPlan.body.data).toEqual([]);

      const outsider = await signUp('outsider@example.com');
      const otherOrg = await outsider.agent
        .post('/api/v1/organizations')
        .send({ name: 'Other Co' })
        .expect(201);
      expect(otherOrg.body.data.id).not.toBe(orgId);
      const theirPlan = await makePlan(outsider, 'other-co', 'Theirs');
      const foreign = await outsider.agent
        .get(`${valuesUrl(theirPlan, 'other-co')}?id=${l1.id}`)
        .expect(200);
      expect(foreign.body.data).toEqual([]);
      await outsider.agent.get(`${valuesUrl(planId, 'acme')}?id=${l1.id}`).expect(404);
      await outsider.agent.get(`${valuesUrl(planId, 'other-co')}?id=${l1.id}`).expect(404);
    });

    it('refuses no ids, 101 ids, a comma-joined list and a non-UUID with 422', async () => {
      const { actor, planId, vs } = await seed();
      const [l1, l2] = vs as [ValueBody, ValueBody];
      await actor.agent.get(valuesUrl(planId)).expect(422);
      await actor.agent.get(`${valuesUrl(planId)}?id=`).expect(422);
      await actor.agent.get(`${valuesUrl(planId)}?id=${l1.id},${l2.id}`).expect(422);
      await actor.agent.get(`${valuesUrl(planId)}?id=not-a-uuid`).expect(422);
      const hundred = Array.from({ length: 100 }, () => `id=${UNKNOWN_ID}`).join('&');
      await actor.agent.get(`${valuesUrl(planId)}?${hundred}`).expect(200);
      await actor.agent.get(`${valuesUrl(planId)}?${hundred}&id=${UNKNOWN_ID}`).expect(422);
    });

    it('answers 401 without a session', async () => {
      const { planId, vs } = await seed();
      await request(server())
        .get(`${valuesUrl(planId)}?id=${(vs[0] as ValueBody).id}`)
        .expect(401);
    });
  });

  describe('codes on GET activities/:activityId', () => {
    interface ActivityBody {
      id: string;
      version: number;
      codes?: { codeTypeId: string; codeValueId: string }[];
    }

    async function createActivity(actor: Actor, planId: string, name: string) {
      const res = await actor.agent
        .post(`${base()}/plans/${planId}/activities`)
        .send({ name })
        .expect(201);
      return res.body.data as ActivityBody;
    }

    const detail = async (actor: Actor, id: string) =>
      (await actor.agent.get(`${base()}/activities/${id}`).expect(200)).body.data as ActivityBody;

    it('is absent on a plan with no code type, and equal to the list’s own row (SC-2)', async () => {
      const actor = await signUp('admin@example.com');
      await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const planId = await makePlan(actor);
      const made = await createActivity(actor, planId, 'Excavate');
      const got = await detail(actor, made.id);
      expect('codes' in got).toBe(false);
      const listed = (await actor.agent.get(`${base()}/plans/${planId}/activities`).expect(200))
        .body.data as ActivityBody[];
      expect(got).toEqual(listed.find((a) => a.id === made.id));
    });

    it('is [] for an uncoded activity of a coded plan, and carries the value once set', async () => {
      const { actor, orgId, planId, area, vs } = await seed();
      const l1 = vs[0] as ValueBody;
      const made = await createActivity(actor, planId, 'Excavate');
      expect((await detail(actor, made.id)).codes).toEqual([]);

      const patched = await actor.agent
        .patch(`${base()}/plans/${planId}/activities/codes`)
        .send({
          activities: [
            {
              id: made.id,
              version: made.version,
              codes: [{ codeTypeId: area.id, codeValueId: l1.id }],
            },
          ],
        })
        .expect(200);
      expect(patched.body.data).toBeDefined();
      expect((await detail(actor, made.id)).codes).toEqual([
        { codeTypeId: area.id, codeValueId: l1.id },
      ]);

      const viewer = await addMember(orgId, 'VIEWER', 'viewer@example.com');
      expect((await detail(viewer, made.id)).codes).toEqual([
        { codeTypeId: area.id, codeValueId: l1.id },
      ]);
    });
  });
});
