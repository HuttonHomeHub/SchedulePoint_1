import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for setting and clearing a code value on an activity (p6-activity-codes spec §4.7,
 * M2-T4), against a real database. An assignment is an ordinary ACTIVITY write: it needs
 * `activity:update` and the pen, bumps the activity's version, and is recorded in its history.
 *
 * Covers the activity list's per-page `codes` (absent when the plan has no code type, SC-2), the
 * batch write's all-or-nothing rules, every cross-plan and cross-tenant attempt, a foreign
 * `organizationId` (security review S1), a deleted value or type reading as "no value", and the
 * history item.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const FOREIGN_ORG = '00000000-0000-0000-0000-000000000000';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface CodeRef {
  codeTypeId: string;
  codeValueId: string;
}

interface ActivityBody {
  id: string;
  version: number;
  codes?: CodeRef[];
}

describe.skipIf(!hasDatabase)('Activity codes API (e2e, pen enforced)', () => {
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
  const planUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}`;
  const codesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/activities/codes`;
  const typesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/code-types`;
  const lockUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/edit-lock`;

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

  async function createActivity(actor: Actor, planId: string, name: string, extra = {}) {
    const res = await actor.agent
      .post(`${planUrl(planId)}/activities`)
      .send({ name, ...extra })
      .expect(201);
    return res.body.data as ActivityBody;
  }

  async function createType(actor: Actor, planId: string, name: string) {
    const res = await actor.agent.post(typesUrl(planId)).send({ name }).expect(201);
    return res.body.data as { id: string };
  }

  async function createValue(actor: Actor, planId: string, typeId: string, shortCode: string) {
    const res = await actor.agent
      .post(`${typesUrl(planId)}/${typeId}/values`)
      .send({ shortCode })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  /** A plan with Area (L1, L2), Trade (MECH) and two activities. */
  async function seed() {
    const ctx = await setup();
    const { actor, planId } = ctx;
    const area = await createType(actor, planId, 'Area');
    const trade = await createType(actor, planId, 'Trade');
    const l1 = await createValue(actor, planId, area.id, 'L1');
    const l2 = await createValue(actor, planId, area.id, 'L2');
    const mech = await createValue(actor, planId, trade.id, 'MECH');
    const a = await createActivity(actor, planId, 'Excavate');
    const b = await createActivity(actor, planId, 'Pour');
    return { ...ctx, area, trade, l1, l2, mech, a, b };
  }

  const row = (a: ActivityBody, codes: { codeTypeId: string; codeValueId: string | null }[]) => ({
    id: a.id,
    version: a.version,
    codes,
  });

  async function listActivities(actor: Actor, planId: string): Promise<ActivityBody[]> {
    const res = await actor.agent.get(`${planUrl(planId)}/activities`).expect(200);
    return res.body.data as ActivityBody[];
  }

  async function history(actor: Actor, activityId: string) {
    const res = await actor.agent.get(`${base()}/activities/${activityId}/history`).expect(200);
    return res.body.data as { scope: string; changes: Record<string, unknown>; batch: unknown }[];
  }

  describe('the activity list', () => {
    it('carries no codes key at all when the plan has no code type (SC-2)', async () => {
      const { actor, planId } = await setup();
      await createActivity(actor, planId, 'Excavate');
      const [activity] = await listActivities(actor, planId);
      expect(activity).toBeDefined();
      expect('codes' in (activity as object)).toBe(false);
    });

    it('carries codes: [] for an activity with no value once the plan has a type', async () => {
      const { actor, planId, a } = await seed();
      const listed = (await listActivities(actor, planId)).find((x) => x.id === a.id);
      expect(listed?.codes).toEqual([]);
    });

    it('lists each activity’s values, ordered by type, one entry per type', async () => {
      const { actor, planId, area, trade, l2, mech, a, b } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [
              { codeTypeId: trade.id, codeValueId: mech.id },
              { codeTypeId: area.id, codeValueId: l2.id },
            ]),
          ],
        })
        .expect(200);
      const listed = await listActivities(actor, planId);
      const byId = new Map(listed.map((x) => [x.id, x]));
      const expected = [
        { codeTypeId: area.id, codeValueId: l2.id },
        { codeTypeId: trade.id, codeValueId: mech.id },
      ].sort((x, y) => (x.codeTypeId < y.codeTypeId ? -1 : 1));
      expect(byId.get(a.id)?.codes).toEqual(expected);
      expect(byId.get(b.id)?.codes).toEqual([]);
    });

    it('lets a Viewer read the codes', async () => {
      const { actor, orgId, planId, area, l1, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(200);
      const viewer = await addMember(orgId, 'VIEWER', 'viewer@example.com');
      const listed = await listActivities(viewer, planId);
      expect(listed.find((x) => x.id === a.id)?.codes).toEqual([
        { codeTypeId: area.id, codeValueId: l1.id },
      ]);
    });

    it('reads a deleted value or type as no value, and a restore brings it back', async () => {
      const { actor, planId, area, trade, l1, mech, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [
              { codeTypeId: area.id, codeValueId: l1.id },
              { codeTypeId: trade.id, codeValueId: mech.id },
            ]),
          ],
        })
        .expect(200);
      const codesOf = async () =>
        (await listActivities(actor, planId)).find((x) => x.id === a.id)?.codes?.length;
      expect(await codesOf()).toBe(2);

      await actor.agent.delete(`${planUrl(planId)}/code-values/${l1.id}`).expect(204);
      expect(await codesOf()).toBe(1);
      await actor.agent.delete(`${typesUrl(planId)}/${trade.id}`).expect(204);
      expect(await codesOf()).toBe(0);
      // The rows were kept: the assignment is an edge, not a lifecycle.
      expect(await prisma.codeValueAssignment.count({ where: { activityId: a.id } })).toBe(2);

      await actor.agent.post(`${typesUrl(planId)}/${trade.id}/restore`).expect(200);
      await actor.agent.post(`${planUrl(planId)}/code-values/${l1.id}/restore`).expect(200);
      expect(await codesOf()).toBe(2);
    });
  });

  describe('setting and clearing', () => {
    it('sets values on a batch in one write, bumping each activity’s version and nothing else', async () => {
      const { actor, orgId, planId, area, l1, a, b } = await seed();
      const res = await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [{ codeTypeId: area.id, codeValueId: l1.id }]),
            row(b, [{ codeTypeId: area.id, codeValueId: l1.id }]),
          ],
        })
        .expect(200);
      const body = res.body.data as ActivityBody[];
      expect(body.map((x) => x.version).sort()).toEqual([2, 2]);
      for (const x of body) expect(x.codes).toEqual([{ codeTypeId: area.id, codeValueId: l1.id }]);

      const stored = await prisma.codeValueAssignment.findMany({ where: { planId } });
      expect(stored).toHaveLength(2);
      for (const s of stored) {
        expect(s.organizationId).toBe(orgId);
        expect(s.planId).toBe(planId);
      }
      const activity = await prisma.activity.findUniqueOrThrow({ where: { id: a.id } });
      expect(activity.version).toBe(2);
      expect(activity.updatedBy).toBe(actor.userId);
    });

    it('changes a value in place and clears a type with null, leaving the other types alone', async () => {
      const { actor, planId, area, trade, l1, l2, mech, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [
              { codeTypeId: area.id, codeValueId: l1.id },
              { codeTypeId: trade.id, codeValueId: mech.id },
            ]),
          ],
        })
        .expect(200);
      const second = await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            { id: a.id, version: 2, codes: [{ codeTypeId: area.id, codeValueId: l2.id }] },
          ],
        })
        .expect(200);
      expect(second.body.data[0].codes).toHaveLength(2);
      expect(await prisma.codeValueAssignment.count({ where: { activityId: a.id } })).toBe(2);
      const area1 = await prisma.codeValueAssignment.findFirstOrThrow({
        where: { activityId: a.id, codeTypeId: area.id },
      });
      expect(area1.codeValueId).toBe(l2.id);

      const cleared = await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            { id: a.id, version: 3, codes: [{ codeTypeId: trade.id, codeValueId: null }] },
          ],
        })
        .expect(200);
      expect(cleared.body.data[0].codes).toEqual([{ codeTypeId: area.id, codeValueId: l2.id }]);
      expect(await prisma.codeValueAssignment.count({ where: { activityId: a.id } })).toBe(1);
    });

    it('moves the version even when the value sent is the one already held, and records nothing', async () => {
      const { actor, planId, area, l1, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(200);
      const before = (await history(actor, a.id)).length;
      const res = await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            { id: a.id, version: 2, codes: [{ codeTypeId: area.id, codeValueId: l1.id }] },
          ],
        })
        .expect(200);
      expect(res.body.data[0].version).toBe(3);
      expect(await history(actor, a.id)).toHaveLength(before);
    });

    it('allows a WBS summary to carry codes', async () => {
      const { actor, planId, area, l1 } = await seed();
      const summary = await createActivity(actor, planId, 'Substructure', { type: 'WBS_SUMMARY' });
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(summary, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(200);
    });
  });

  describe('refusals', () => {
    it('answers 409 for a stale version and changes nothing, not even the other rows of the batch', async () => {
      const { actor, planId, area, l1, a, b } = await seed();
      const res = await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [{ codeTypeId: area.id, codeValueId: l1.id }]),
            { ...row(b, [{ codeTypeId: area.id, codeValueId: l1.id }]), version: 9 },
          ],
        })
        .expect(409);
      expect(res.body.error.details.reason).toBe('STALE_VERSION');
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
      expect((await prisma.activity.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(1);
      expect(await history(actor, a.id)).toEqual([]);
    });

    it('answers 422 for a value of another type, and for a deleted value', async () => {
      const { actor, planId, area, trade, l1, mech, a } = await seed();
      const wrong = await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: trade.id, codeValueId: l1.id }])] })
        .expect(422);
      expect(wrong.body.error.details.reason).toBe('CODE_VALUE_WRONG_TYPE');
      expect(wrong.body.error.message).toBe('That value does not belong to Trade.');

      await actor.agent.delete(`${planUrl(planId)}/code-values/${mech.id}`).expect(204);
      const deleted = await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: trade.id, codeValueId: mech.id }])] })
        .expect(422);
      expect(deleted.body.error.details.reason).toBe('CODE_VALUE_DELETED');
      expect(deleted.body.error.message).toBe('That value was deleted.');
      expect(
        await prisma.codeValueAssignment.count({ where: { planId, codeTypeId: area.id } }),
      ).toBe(0);
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
    });

    it('answers 404 for a deleted or unknown code type', async () => {
      const { actor, planId, area, l1, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: FOREIGN_ORG, codeValueId: null }])] })
        .expect(404);
      await actor.agent.delete(`${typesUrl(planId)}/${area.id}`).expect(204);
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(404);
    });

    it('answers 422 for the same activity twice, and the same type twice for one activity', async () => {
      const { actor, planId, area, l1, l2, a } = await seed();
      const one = { codeTypeId: area.id, codeValueId: l1.id };
      const dupActivity = await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [one]), row(a, [one])] })
        .expect(422);
      expect(dupActivity.body.error.details.reason).toBe('DUPLICATE_CODES_ACTIVITY_ID');
      const dupType = await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [one, { codeTypeId: area.id, codeValueId: l2.id }])] })
        .expect(422);
      expect(dupType.body.error.details.reason).toBe('DUPLICATE_CODES_TYPE_ID');
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
    });

    it('requires codeValueId on every entry, so an omission is never a silent clear', async () => {
      const { actor, planId, area, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [{ id: a.id, version: 1, codes: [{ codeTypeId: area.id }] }] })
        .expect(422);
      await actor.agent.patch(codesUrl(planId)).send({ activities: [] }).expect(422);
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [{ id: a.id, version: 1, codes: [] }] })
        .expect(422);
    });

    it('refuses a foreign organizationId (S1) and stores rows only under the plan’s organisation', async () => {
      const { actor, orgId, planId, area, l1, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          organizationId: FOREIGN_ORG,
          activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        })
        .expect(422);
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            {
              ...row(a, [{ codeTypeId: area.id, codeValueId: l1.id }]),
              organizationId: FOREIGN_ORG,
            },
          ],
        })
        .expect(422);
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(200);
      const stored = await prisma.codeValueAssignment.findMany();
      expect(stored.map((s) => s.organizationId)).toEqual([orgId]);
      expect(
        await prisma.codeValueAssignment.count({ where: { organizationId: FOREIGN_ORG } }),
      ).toBe(0);
    });
  });

  describe('roles, the pen and scope', () => {
    it('refuses a Viewer and a Contributor with 403, and a missing pen with 423', async () => {
      const { actor, orgId, planId, area, l1, a } = await seed();
      const body = { activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] };
      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        await member.agent.patch(codesUrl(planId)).send(body).expect(403);
      }
      await actor.agent.delete(lockUrl(planId)).expect(204);
      await actor.agent.patch(codesUrl(planId)).send(body).expect(423);
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
      expect((await prisma.activity.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(1);
    });

    it('lets a Planner who holds the pen write', async () => {
      const { actor, orgId, planId, area, l1, a } = await seed();
      const planner = await addMember(orgId, 'PLANNER', 'planner@example.com');
      await actor.agent.delete(lockUrl(planId)).expect(204);
      await planner.agent.post(lockUrl(planId)).send({}).expect(200);
      await planner.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(200);
    });

    it('answers 401 without a session', async () => {
      const { planId } = await setup();
      await request(server()).patch(codesUrl(planId)).send({}).expect(401);
    });

    it('answers 404 for another organisation, and for a plan, type, value or activity of another plan', async () => {
      const { actor, planId, area, l1, a } = await seed();
      const body = { activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] };
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);
      await outsider.agent.patch(codesUrl(planId, 'other-co')).send(body).expect(404);
      await outsider.agent.patch(codesUrl(planId)).send(body).expect(404);

      // Another plan of the same organisation: nothing of this plan resolves there.
      const otherPlan = await makePlan(actor, 'acme', 'Second');
      await actor.agent.post(lockUrl(otherPlan)).send({}).expect(200);
      const otherActivity = await createActivity(actor, otherPlan, 'Elsewhere');
      const otherType = await createType(actor, otherPlan, 'Other Area');
      const otherValue = await createValue(actor, otherPlan, otherType.id, 'X');
      await actor.agent.patch(codesUrl(otherPlan)).send(body).expect(404); // our activity, their plan
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(otherActivity, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(404);
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: otherType.id, codeValueId: otherValue.id }])] })
        .expect(404);
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: otherValue.id }])] })
        .expect(404);
      expect(await prisma.codeValueAssignment.count()).toBe(0);
    });

    it('answers 404 for a plan in another organisation’s value even by id, with no existence oracle', async () => {
      const { actor, planId, area, a } = await seed();
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);
      const foreignPlan = await makePlan(outsider, 'other-co', 'Foreign');
      await outsider.agent.post(lockUrl(foreignPlan, 'other-co')).send({}).expect(200);
      const foreignType = await outsider.agent
        .post(typesUrl(foreignPlan, 'other-co'))
        .send({ name: 'Theirs' })
        .expect(201);
      const foreignValue = await outsider.agent
        .post(`${typesUrl(foreignPlan, 'other-co')}/${foreignType.body.data.id}/values`)
        .send({ shortCode: 'T' })
        .expect(201);
      const res = await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [{ codeTypeId: area.id, codeValueId: foreignValue.body.data.id as string }]),
          ],
        })
        .expect(404);
      expect(JSON.stringify(res.body)).not.toContain('Theirs');
      expect(await prisma.codeValueAssignment.count()).toBe(0);
    });
  });

  describe('the activity history', () => {
    it('records a code:<codeTypeId> item with the value ids either side, scope DEFINITION', async () => {
      const { actor, planId, area, l1, l2, a } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({ activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])] })
        .expect(200);
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            { id: a.id, version: 2, codes: [{ codeTypeId: area.id, codeValueId: l2.id }] },
          ],
        })
        .expect(200);
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            { id: a.id, version: 3, codes: [{ codeTypeId: area.id, codeValueId: null }] },
          ],
        })
        .expect(200);

      const entries = await history(actor, a.id);
      // A batch never merges: one entry per write, newest first.
      expect(entries.map((e) => e.scope)).toEqual(['DEFINITION', 'DEFINITION', 'DEFINITION']);
      const key = `code:${area.id}`;
      expect(entries.map((e) => e.changes[key])).toEqual([
        { from: l2.id, to: null },
        { from: l1.id, to: l2.id },
        { from: null, to: l1.id },
      ]);
    });

    it('records one entry per activity of a batch, sharing a batch', async () => {
      const { actor, planId, area, l1, a, b } = await seed();
      await actor.agent
        .patch(codesUrl(planId))
        .send({
          activities: [
            row(a, [{ codeTypeId: area.id, codeValueId: l1.id }]),
            row(b, [{ codeTypeId: area.id, codeValueId: l1.id }]),
          ],
        })
        .expect(200);
      const [ea] = await history(actor, a.id);
      const [eb] = await history(actor, b.id);
      expect(ea?.batch).toMatchObject({ size: 2 });
      expect(eb?.batch).toMatchObject({ size: 2 });
    });
  });
});
