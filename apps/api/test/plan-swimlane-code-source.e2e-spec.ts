import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { acquirePlanWriteLock } from '../src/common/db/plan-advisory-lock';
import { ValidationError } from '../src/common/errors/domain-errors';
import { CodeTypeRepository } from '../src/modules/codes/code-type.repository';
import { PlansService } from '../src/modules/plans/plans.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * The swimlane source switch to a code (p6-activity-codes M4-T2), through the real plan PATCH, with
 * the pen enforced: the triple (source, WBS level, code type) written together, the values-in-use
 * rule with WBS summaries excluded, the refusals in domain terms rather than the CHECK's 23514 or the
 * key's 23503, and the plan advisory lock that makes the "refuse deleting the source type" rule
 * sound (m4-database-review §2.9, §3.1).
 *
 * The lock cases drive the service below HTTP, like `code-cascade.e2e-spec.ts`: two Supertest
 * requests do not overlap (#70), so a test-owned transaction plays the other writer and holds the
 * plan lock while the switch is started against it.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const HOLD_MS = 1_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface ActivityBody {
  id: string;
  version: number;
}

/** The shared "in use" fixture: one file read here for the SQL count and by `@repo/layout` for the web rule. */
interface InUseCase {
  name: string;
  values: { id: string; deleted: boolean }[];
  activities: { type: 'TASK' | 'WBS_SUMMARY'; deleted: boolean; valueId: string | null }[];
  expectedInUse: number;
}

describe.skipIf(!hasDatabase)('Plan swimlane source from a code (e2e, pen enforced)', () => {
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
  const typesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/code-types`;
  const valuesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/code-values`;
  const codesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/activities/codes`;
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

  async function makePlan(actor: Actor, org: string, name: string): Promise<string> {
    const client = await actor.agent
      .post(`${base(org)}/clients`)
      .send({ name: `Client ${name}` })
      .expect(201);
    const project = await actor.agent
      .post(`${base(org)}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await actor.agent
      .post(`${base(org)}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent.post(lockUrl(planId, org)).send({}).expect(200);
    return planId;
  }

  /** An admin org with a plan, the pen taken. */
  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const planId = await makePlan(actor, 'acme', 'Plan');
    return { actor, orgId: res.body.data.id as string, planId };
  }

  async function addMember(
    orgId: string,
    role: 'VIEWER' | 'CONTRIBUTOR',
    email: string,
  ): Promise<Actor> {
    const member = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: member.userId, role } });
    return member;
  }

  async function createType(actor: Actor, planId: string, name: string, org = 'acme') {
    const res = await actor.agent.post(typesUrl(planId, org)).send({ name }).expect(201);
    return res.body.data as { id: string };
  }

  async function createValue(actor: Actor, planId: string, typeId: string, shortCode: string) {
    const res = await actor.agent
      .post(`${typesUrl(planId)}/${typeId}/values`)
      .send({ shortCode })
      .expect(201);
    return res.body.data as { id: string };
  }

  async function createActivity(
    actor: Actor,
    planId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<ActivityBody> {
    const res = await actor.agent
      .post(`${planUrl(planId)}/activities`)
      .send({ name, ...extra })
      .expect(201);
    return res.body.data as ActivityBody;
  }

  async function assign(
    actor: Actor,
    planId: string,
    typeId: string,
    pairs: { activity: ActivityBody; valueId: string }[],
  ): Promise<void> {
    await actor.agent
      .patch(codesUrl(planId))
      .send({
        activities: pairs.map(({ activity, valueId }) => ({
          id: activity.id,
          version: activity.version,
          codes: [{ codeTypeId: typeId, codeValueId: valueId }],
        })),
      })
      .expect(200);
  }

  async function planBody(actor: Actor, planId: string) {
    const res = await actor.agent.get(planUrl(planId)).expect(200);
    return res.body.data as Record<string, unknown> & { version: number };
  }

  async function switchTo(actor: Actor, planId: string, body: Record<string, unknown>) {
    const current = await planBody(actor, planId);
    return actor.agent.patch(planUrl(planId)).send({ ...body, version: current.version });
  }

  const toCode = (typeId: string) => ({
    swimlaneSource: 'ACTIVITY_CODE' as const,
    swimlaneCodeTypeId: typeId,
  });

  /** A plan with Area (two values, each carried by one activity) and Trade (one value, one activity). */
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
    await assign(actor, planId, area.id, [
      { activity: a, valueId: l1.id },
      { activity: b, valueId: l2.id },
    ]);
    const [aAfter] = await liveActivities(actor, planId, [a.id]);
    await assign(actor, planId, trade.id, [{ activity: aAfter!, valueId: mech.id }]);
    return { ...ctx, area, trade, l1, l2, mech, a, b };
  }

  async function liveActivities(actor: Actor, planId: string, ids: string[]) {
    const res = await actor.agent.get(`${planUrl(planId)}/activities`).expect(200);
    const all = res.body.data as ActivityBody[];
    return ids.map((id) => all.find((x) => x.id === id)!);
  }

  describe('the triple (DB §2.1)', () => {
    it('takes a code from NONE, MANUAL and WBS, writes all three columns, and reads the type back', async () => {
      const { actor, planId, area } = await seed();
      const none = await planBody(actor, planId);
      expect(none).toMatchObject({ swimlaneSource: 'NONE', swimlaneCodeTypeId: null });

      const fromNone = await switchTo(actor, planId, toCode(area.id));
      expect(fromNone.status).toBe(200);
      expect(fromNone.body.data).toMatchObject({
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneWbsLevel: null,
        swimlaneCodeTypeId: area.id,
        version: none.version + 1,
      });
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: area.id });

      await switchTo(actor, planId, { swimlaneSource: 'MANUAL' }).then((r) =>
        expect(r.status).toBe(200),
      );
      const fromManual = await switchTo(actor, planId, toCode(area.id));
      expect(fromManual.status).toBe(200);

      await switchTo(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 2 }).then((r) =>
        expect(r.status).toBe(200),
      );
      const fromWbs = await switchTo(actor, planId, toCode(area.id));
      expect(fromWbs.status).toBe(200);
      expect(fromWbs.body.data).toMatchObject({ swimlaneWbsLevel: null });
    });

    it('moves from one code to another, and keeps the type when only the source is restated', async () => {
      const { actor, planId, area, trade } = await seed();
      await switchTo(actor, planId, toCode(area.id)).then((r) => expect(r.status).toBe(200));

      const moved = await switchTo(actor, planId, { swimlaneCodeTypeId: trade.id });
      expect(moved.status).toBe(200);
      expect(moved.body.data).toMatchObject({
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: trade.id,
      });

      const restated = await switchTo(actor, planId, { swimlaneSource: 'ACTIVITY_CODE' });
      expect(restated.status).toBe(200);
      expect(restated.body.data).toMatchObject({ swimlaneCodeTypeId: trade.id });
    });

    it('clears the type in the same write when the source leaves ACTIVITY_CODE, where the CHECK would be a 500', async () => {
      const { actor, planId, area } = await seed();
      await switchTo(actor, planId, toCode(area.id)).then((r) => expect(r.status).toBe(200));

      const manual = await switchTo(actor, planId, { swimlaneSource: 'MANUAL' });
      expect(manual.status).toBe(200);
      expect(manual.body.data).toMatchObject({
        swimlaneSource: 'MANUAL',
        swimlaneCodeTypeId: null,
      });
      expect(
        await prisma.plan.findUniqueOrThrow({
          where: { id: planId },
          select: { swimlaneCodeTypeId: true },
        }),
      ).toEqual({ swimlaneCodeTypeId: null });

      await switchTo(actor, planId, toCode(area.id)).then((r) => expect(r.status).toBe(200));
      const none = await switchTo(actor, planId, { swimlaneSource: 'NONE' });
      expect(none.body.data).toMatchObject({ swimlaneSource: 'NONE', swimlaneCodeTypeId: null });
    });

    it.each([
      ['a code source without a type', { swimlaneSource: 'ACTIVITY_CODE' }],
      [
        'a code source with a null type',
        { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: null },
      ],
      ['a type beside MANUAL', { swimlaneSource: 'MANUAL', swimlaneCodeTypeId: 'TYPE' }],
      ['a type on a plan that is not a code plan', { swimlaneCodeTypeId: 'TYPE' }],
      [
        'a level beside a code source',
        { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: 'TYPE', swimlaneWbsLevel: 1 },
      ],
    ])('refuses %s with 422 and changes nothing', async (_label, body) => {
      const { actor, planId, area } = await seed();
      const sent = JSON.parse(JSON.stringify(body).replace('TYPE', area.id)) as Record<
        string,
        unknown
      >;
      const res = await switchTo(actor, planId, sent);
      expect(res.status).toBe(422);
      expect(res.body.error.details.reason).toMatch(/^SWIMLANE_(CODE_TYPE|LEVEL)_MISMATCH$/);
      expect(await planBody(actor, planId)).toMatchObject({
        swimlaneSource: 'NONE',
        swimlaneCodeTypeId: null,
      });
    });

    it('refuses a cleared type on a code plan, and a malformed id', async () => {
      const { actor, planId, area } = await seed();
      await switchTo(actor, planId, toCode(area.id)).then((r) => expect(r.status).toBe(200));
      const cleared = await switchTo(actor, planId, { swimlaneCodeTypeId: null });
      expect(cleared.status).toBe(422);
      expect(cleared.body.error.details.reason).toBe('SWIMLANE_CODE_TYPE_MISMATCH');
      const malformed = await switchTo(actor, planId, {
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: 'not-a-uuid',
      });
      expect(malformed.status).toBe(422);
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: area.id });
    });

    it('reads a type of another plan, another organisation or no plan as missing (404), never the key’s 23503', async () => {
      const { actor, planId } = await seed();
      const second = await makePlan(actor, 'acme', 'Second plan');
      const foreign = await createType(actor, second, 'Other plan area');
      expect((await switchTo(actor, planId, toCode(foreign.id))).status).toBe(404);

      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
      const otherPlan = await makePlan(outsider, 'other', 'Theirs');
      const theirs = await createType(outsider, otherPlan, 'Theirs', 'other');
      expect((await switchTo(actor, planId, toCode(theirs.id))).status).toBe(404);

      const unknown = '00000000-0000-7000-8000-000000000000';
      expect((await switchTo(actor, planId, toCode(unknown))).status).toBe(404);
      expect(await planBody(actor, planId)).toMatchObject({
        swimlaneSource: 'NONE',
        swimlaneCodeTypeId: null,
      });
    });

    it('refuses a soft-deleted type of this plan with 422, never the key’s silent admission (probe P11)', async () => {
      const { actor, planId, area } = await seed();
      await actor.agent.delete(`${typesUrl(planId)}/${area.id}`).expect(204);
      const res = await switchTo(actor, planId, toCode(area.id));
      expect(res.status).toBe(422);
      expect(res.body.error.details.reason).toBe('SWIMLANE_CODE_TYPE_MISMATCH');
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: null });
    });

    it('reads a deleted type of ANOTHER plan as missing (404), not as the deleted-type 422', async () => {
      const { actor, planId } = await seed();
      const second = await makePlan(actor, 'acme', 'Second plan');
      const foreign = await createType(actor, second, 'Other plan area');
      await actor.agent.delete(`${typesUrl(second)}/${foreign.id}`).expect(204);
      expect((await switchTo(actor, planId, toCode(foreign.id))).status).toBe(404);
    });

    it('then refuses to delete the source type, with the sentence to act on', async () => {
      const { actor, planId, area } = await seed();
      await switchTo(actor, planId, toCode(area.id)).then((r) => expect(r.status).toBe(200));
      const res = await actor.agent.delete(`${typesUrl(planId)}/${area.id}`).expect(409);
      expect(res.body.error.details.reason).toBe('CODE_TYPE_IS_SWIMLANE_SOURCE');
    });

    it('answers 409 for a stale version and changes nothing', async () => {
      const { actor, planId, area } = await seed();
      await actor.agent
        .patch(planUrl(planId))
        .send({ ...toCode(area.id), version: 99 })
        .expect(409);
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: null });
    });

    it('is not a governance change or a scheduling input: no settings row, no input stamp', async () => {
      const { actor, planId, area } = await seed();
      await actor.agent
        .post(`${planUrl(planId)}/schedule/recalculate`)
        .send({})
        .expect(200);
      const before = await prisma.plan.findUniqueOrThrow({
        where: { id: planId },
        select: { scheduleInputsChangedAt: true },
      });
      const settingsRows = () =>
        prisma.auditEvent.count({ where: { action: 'plan.settings_changed' } });
      const rowsBefore = await settingsRows();

      const res = await switchTo(actor, planId, toCode(area.id));
      expect(res.status).toBe(200);
      expect(res.body.data.editedSinceCalculated).toBe(false);
      await switchTo(actor, planId, { swimlaneSource: 'NONE' });

      const after = await prisma.plan.findUniqueOrThrow({
        where: { id: planId },
        select: { scheduleInputsChangedAt: true },
      });
      expect(after.scheduleInputsChangedAt).toEqual(before.scheduleInputsChangedAt);
      expect(await settingsRows()).toBe(rowsBefore);
    });

    it('takes a calendar and a code source in one PATCH', async () => {
      const { actor, planId, area } = await seed();
      const calendars = await actor.agent.get(`${base()}/calendars`).expect(200);
      const standard = (calendars.body.data as { id: string; name: string }[]).find(
        (c) => c.name === 'Standard',
      )!;
      const res = await switchTo(actor, planId, { ...toCode(area.id), calendarId: standard.id });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        swimlaneCodeTypeId: area.id,
        calendarId: standard.id,
      });
      // A calendar alone keeps working without any swimlane field.
      const alone = await switchTo(actor, planId, { calendarId: null });
      expect(alone.status).toBe(200);
      expect(alone.body.data).toMatchObject({ calendarId: null, swimlaneCodeTypeId: area.id });
    });

    it('carries swimlaneCodeTypeId on the plan list too', async () => {
      const { actor, planId, area } = await seed();
      await switchTo(actor, planId, toCode(area.id)).then((r) => expect(r.status).toBe(200));
      const project = await prisma.plan.findUniqueOrThrow({
        where: { id: planId },
        select: { projectId: true },
      });
      const list = await actor.agent
        .get(`${base()}/projects/${project.projectId}/plans`)
        .expect(200);
      expect(list.body.data[0]).toMatchObject({ swimlaneCodeTypeId: area.id });
    });
  });

  describe('who may switch, and the pen', () => {
    it('refuses a Viewer and a Contributor (403)', async () => {
      const { orgId, planId, actor, area } = await seed();
      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        await member.agent
          .patch(planUrl(planId))
          .send({ ...toCode(area.id), version: 1 })
          .expect(403);
      }
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: null });
    });

    it('needs the pen, and a rename does not', async () => {
      const { actor, planId, area } = await seed();
      await actor.agent.delete(lockUrl(planId)).expect(204);
      expect((await switchTo(actor, planId, toCode(area.id))).status).toBe(423);
      expect((await switchTo(actor, planId, { name: 'Renamed' })).status).toBe(200);
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: null });
    });
  });

  describe('the values-in-use rule (1 to 100)', () => {
    it('refuses 0, admits 1 and 100, refuses 101, naming the count', async () => {
      const { actor, orgId, planId } = await setup();
      const type = await createType(actor, planId, 'Area');
      await prisma.codeValue.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          organizationId: orgId,
          codeTypeId: type.id,
          shortCode: `V${String(i).padStart(3, '0')}`,
          position: i,
        })),
      });
      const values = await prisma.codeValue.findMany({
        where: { codeTypeId: type.id },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      const activities: ActivityBody[] = [];
      for (let i = 0; i < 101; i += 1) {
        activities.push(await createActivity(actor, planId, `Task ${i}`));
      }
      const give = (from: number, to: number) =>
        assign(
          actor,
          planId,
          type.id,
          activities.slice(from, to).map((activity, i) => ({
            activity,
            valueId: values[from + i]!.id,
          })),
        );

      const none = await switchTo(actor, planId, toCode(type.id));
      expect(none.status).toBe(422);
      expect(none.body.error.details).toEqual({
        reason: 'SWIMLANE_CODE_TYPE_INELIGIBLE',
        valuesInUse: 0,
        limit: 100,
      });

      await give(0, 1);
      expect((await switchTo(actor, planId, toCode(type.id))).status).toBe(200);
      await switchTo(actor, planId, { swimlaneSource: 'NONE' });

      await give(1, 100);
      expect((await switchTo(actor, planId, toCode(type.id))).status).toBe(200);
      await switchTo(actor, planId, { swimlaneSource: 'NONE' });

      const fresh = await liveActivities(actor, planId, [activities[100]!.id]);
      await assign(actor, planId, type.id, [{ activity: fresh[0]!, valueId: values[100]!.id }]);
      const over = await switchTo(actor, planId, toCode(type.id));
      expect(over.status).toBe(422);
      expect(over.body.error.message).toBe(
        'Area has 101 values in use. Swimlanes can show up to 100.',
      );
      expect(over.body.error.details).toEqual({
        reason: 'SWIMLANE_CODE_TYPE_INELIGIBLE',
        valuesInUse: 101,
        limit: 100,
      });
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneSource: 'NONE' });
    });

    it('does not refuse a plan already on the code for drifting over 100, and refuses coming back', async () => {
      const { actor, orgId, planId } = await setup();
      const type = await createType(actor, planId, 'Area');
      await prisma.codeValue.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          organizationId: orgId,
          codeTypeId: type.id,
          shortCode: `V${String(i).padStart(3, '0')}`,
          position: i,
        })),
      });
      const values = await prisma.codeValue.findMany({
        where: { codeTypeId: type.id },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      const activities: ActivityBody[] = [];
      for (let i = 0; i < 101; i += 1) {
        activities.push(await createActivity(actor, planId, `Task ${i}`));
      }
      await assign(
        actor,
        planId,
        type.id,
        activities.slice(0, 100).map((activity, i) => ({ activity, valueId: values[i]!.id })),
      );
      expect((await switchTo(actor, planId, toCode(type.id))).status).toBe(200);

      // The codes write is not stopped by the source (owner answer 1: keep drawing), so the count drifts.
      const last = await liveActivities(actor, planId, [activities[100]!.id]);
      await assign(actor, planId, type.id, [{ activity: last[0]!, valueId: values[100]!.id }]);

      const restated = await switchTo(actor, planId, { swimlaneSource: 'ACTIVITY_CODE' });
      expect(restated.status).toBe(200);
      await switchTo(actor, planId, { swimlaneSource: 'MANUAL' });
      expect((await switchTo(actor, planId, toCode(type.id))).status).toBe(422);
    });

    it('does not count a value only a WBS summary carries, nor a deleted activity or value', async () => {
      const { actor, planId } = await setup();
      const type = await createType(actor, planId, 'Area');
      const onSummary = await createValue(actor, planId, type.id, 'SUM');
      const onDeleted = await createValue(actor, planId, type.id, 'DEL');
      const deletedValue = await createValue(actor, planId, type.id, 'GONE');
      const summary = await createActivity(actor, planId, 'Summary', { type: 'WBS_SUMMARY' });
      const doomed = await createActivity(actor, planId, 'Doomed');
      const carrier = await createActivity(actor, planId, 'Carrier');
      await assign(actor, planId, type.id, [
        { activity: summary, valueId: onSummary.id },
        { activity: doomed, valueId: onDeleted.id },
        { activity: carrier, valueId: deletedValue.id },
      ]);
      await actor.agent.delete(`${base()}/activities/${doomed.id}`).expect(200);
      await actor.agent.delete(`${valuesUrl(planId)}/${deletedValue.id}`).expect(204);

      const res = await switchTo(actor, planId, toCode(type.id));
      expect(res.status).toBe(422);
      expect(res.body.error.details).toMatchObject({ valuesInUse: 0 });

      const real = await createValue(actor, planId, type.id, 'REAL');
      const member = await createActivity(actor, planId, 'Member');
      await assign(actor, planId, type.id, [{ activity: member, valueId: real.id }]);
      expect((await switchTo(actor, planId, toCode(type.id))).status).toBe(200);
    });
  });

  describe('the shared in-use fixture (the SQL count and the web rule agree)', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../../packages/layout/src/code-swimlane-values-in-use.fixture.json'),
        'utf8',
      ),
    ) as { cases: InUseCase[] };

    it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', async (_name, spec) => {
      const { actor, orgId, planId } = await setup();
      const type = await createType(actor, planId, 'Area');
      const valueIds = new Map<string, string>();
      for (const v of spec.values) {
        const created = await createValue(actor, planId, type.id, v.id.toUpperCase());
        valueIds.set(v.id, created.id);
      }
      const made: { spec: InUseCase['activities'][number]; body: ActivityBody }[] = [];
      for (const [i, a] of spec.activities.entries()) {
        made.push({
          spec: a,
          body: await createActivity(actor, planId, `Activity ${i}`, { type: a.type }),
        });
      }
      const carriers = made.filter((m) => m.spec.valueId !== null);
      if (carriers.length > 0) {
        await assign(
          actor,
          planId,
          type.id,
          carriers.map((m) => ({ activity: m.body, valueId: valueIds.get(m.spec.valueId!)! })),
        );
      }
      for (const m of made.filter((x) => x.spec.deleted)) {
        await actor.agent.delete(`${base()}/activities/${m.body.id}`).expect(200);
      }
      for (const v of spec.values.filter((x) => x.deleted)) {
        await actor.agent.delete(`${valuesUrl(planId)}/${valueIds.get(v.id)}`).expect(204);
      }

      const counted = await prisma.$transaction((tx) =>
        app.get(CodeTypeRepository).countValuesInUse(orgId, planId, type.id, tx),
      );
      expect(counted).toBe(spec.expectedInUse);
      const res = await switchTo(actor, planId, toCode(type.id));
      expect(res.status).toBe(spec.expectedInUse >= 1 && spec.expectedInUse <= 100 ? 200 : 422);
    });
  });

  describe('the plan lock (DB §2.9, §3.1)', () => {
    const principalOf = (actor: Actor, orgId: string) =>
      new Principal(actor.userId, [
        { organizationId: orgId, role: 'ORG_ADMIN', permissions: permissionsForRole('ORG_ADMIN') },
      ]);

    /**
     * Runs `write` while a test-owned transaction holds the plan lock, then has that transaction
     * run `whileHeld` and commit. Returns the write's outcome and whether it finished inside the hold.
     */
    async function raceAgainstHolder(
      planId: string,
      whileHeld: (tx: Prisma.TransactionClient) => Promise<void>,
      write: () => Promise<unknown>,
    ) {
      let held!: () => void;
      const heldPromise = new Promise<void>((resolve) => (held = resolve));
      const holder = prisma.$transaction(
        async (tx) => {
          await acquirePlanWriteLock(tx, planId);
          held();
          await sleep(HOLD_MS);
          await whileHeld(tx);
        },
        { timeout: 30_000 },
      );
      await heldPromise;

      let settled = false;
      const outcome = write()
        .then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        )
        .finally(() => {
          settled = true;
        });
      await sleep(HOLD_MS / 2);
      const finishedWhileHeld = settled;
      await holder;
      return { result: await outcome, finishedWhileHeld };
    }

    it('waits for a type delete in flight, then sees the type deleted and refuses (422)', async () => {
      const { actor, orgId, planId, area } = await seed();
      const version = (await planBody(actor, planId)).version;
      const { result, finishedWhileHeld } = await raceAgainstHolder(
        planId,
        async (tx) => {
          const batch = await app
            .get(CodeTypeRepository)
            .softDelete(area.id, planId, orgId, actor.userId, tx);
          expect(batch).not.toBeNull();
        },
        () =>
          app
            .get(PlansService)
            .update(principalOf(actor, orgId), 'acme', planId, { ...toCode(area.id), version }),
      );
      expect(finishedWhileHeld, 'the switch was not held by the plan lock').toBe(false);
      expect(result.status).toBe('rejected');
      const reason = (result as { reason: unknown }).reason;
      expect(reason).toBeInstanceOf(ValidationError);
      expect((reason as ValidationError).details).toEqual({
        reason: 'SWIMLANE_CODE_TYPE_MISMATCH',
      });
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: null });
    });

    it('waits for a holder that leaves the type alone, then switches', async () => {
      const { actor, orgId, planId, area } = await seed();
      const version = (await planBody(actor, planId)).version;
      const { result, finishedWhileHeld } = await raceAgainstHolder(
        planId,
        () => Promise.resolve(),
        () =>
          app
            .get(PlansService)
            .update(principalOf(actor, orgId), 'acme', planId, { ...toCode(area.id), version }),
      );
      expect(finishedWhileHeld, 'the switch was not held by the plan lock').toBe(false);
      expect(result.status).toBe('fulfilled');
      expect(await planBody(actor, planId)).toMatchObject({ swimlaneCodeTypeId: area.id });
    });

    it('does not make a rename wait: only a swimlane field takes the lock', async () => {
      const { actor, orgId, planId } = await seed();
      const version = (await planBody(actor, planId)).version;
      const { result, finishedWhileHeld } = await raceAgainstHolder(
        planId,
        () => Promise.resolve(),
        () =>
          app
            .get(PlansService)
            .update(principalOf(actor, orgId), 'acme', planId, { name: 'Renamed', version }),
      );
      expect(finishedWhileHeld, 'a rename waited for the plan lock').toBe(true);
      expect(result.status).toBe('fulfilled');
    });
  });
});
