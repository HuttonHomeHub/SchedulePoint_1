import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * The External-Guest read of swimlanes (swimlanes M4-T3, SQ-4, ADR-0051 §4 as amended): the plan
 * view lists the live swimlanes by id and name, and each activity carries its DERIVED membership and
 * lane — never the row's own `swimlaneId`/`swimlaneLanes`, the plan's source, or its WBS level.
 * Minted and read through the public API exactly as a Planner and a guest would.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface GuestActivity {
  id: string;
  name: string;
  memberOfSwimlaneId: string | null;
  swimlaneLaneIndex: number | null;
}

/** Every key a guest must NEVER see on the swimlane surface, at any depth of any payload. */
const FORBIDDEN_SWIMLANE_KEYS = [
  'swimlaneId',
  'swimlaneLanes',
  'swimlaneSource',
  'swimlaneWbsLevel',
  'position',
  'summaryActivityId',
  'wbsLevel',
  'basis',
  'parentId',
];

function containsKey(value: unknown, keys: readonly string[]): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, keys));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, v]) => keys.includes(key) || containsKey(v, keys),
    );
  }
  return false;
}

describe.skipIf(!hasDatabase)('External-Guest swimlanes (e2e)', () => {
  let app: INestApplication;
  let throttlerStorage: ThrottlerStorage;
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
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
  });

  afterAll(async () => {
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();
  const base = '/api/v1/organizations/acme';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** An Org Admin of "Acme" with an empty plan. */
  async function setup(): Promise<{ actor: Actor; planId: string }> {
    const actor = await signUp('admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent.post(`${base}/clients`).send({ name: 'Client' }).expect(201);
    const project = await actor.agent
      .post(`${base}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await actor.agent
      .post(`${base}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Plan', plannedStart: '2026-01-01' })
      .expect(201);
    return { actor, planId: plan.body.data.id as string };
  }

  const planUrl = (planId: string) => `${base}/plans/${planId}`;

  async function setSource(actor: Actor, planId: string, body: Record<string, unknown>) {
    const current = await actor.agent.get(planUrl(planId)).expect(200);
    await actor.agent
      .patch(planUrl(planId))
      .send({ ...body, version: current.body.data.version })
      .expect(200);
  }

  async function createSwimlane(actor: Actor, planId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`${planUrl(planId)}/swimlanes`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createActivity(
    actor: Actor,
    planId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`${planUrl(planId)}/activities`)
      .send({ name, ...extra })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  /** File an activity in a swimlane at a lane through the positions batch (a MANUAL write). */
  async function place(
    actor: Actor,
    planId: string,
    activity: { id: string; version: number },
    swimlaneId: string | null,
    laneIndex: number,
  ): Promise<void> {
    await actor.agent
      .patch(`${planUrl(planId)}/activities/positions`)
      .send({
        positions: [
          { id: activity.id, version: activity.version, swimlane: { swimlaneId, laneIndex } },
        ],
      })
      .expect(200);
  }

  async function mintToken(actor: Actor, planId: string): Promise<string> {
    const res = await actor.agent
      .post(`${planUrl(planId)}/shares`)
      .send({})
      .expect(201);
    const token = (res.body.data.url as string).split('#')[1];
    if (!token) throw new Error('share url carried no fragment token');
    return token;
  }

  const guestGet = (path: string, token: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);

  it('lists the swimlanes in display order and places each activity by derived membership and lane', async () => {
    const { actor, planId } = await setup();
    await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
    const civil = await createSwimlane(actor, planId, 'Civil');
    const mech = await createSwimlane(actor, planId, 'Mechanical');
    const a = await createActivity(actor, planId, 'A');
    const b = await createActivity(actor, planId, 'B');
    const c = await createActivity(actor, planId, 'C');
    await place(actor, planId, a, civil, 2);
    await place(actor, planId, b, mech, 0);
    const token = await mintToken(actor, planId);

    const plan = await guestGet('/api/v1/share/plan', token).expect(200);
    expect(plan.body.data.swimlanes).toEqual([
      { id: civil, name: 'Civil' },
      { id: mech, name: 'Mechanical' },
    ]);

    const activities = await guestGet('/api/v1/share/activities', token).expect(200);
    const byId = new Map(
      (activities.body.data as GuestActivity[]).map((row): [string, GuestActivity] => [
        row.id,
        row,
      ]),
    );
    expect(byId.get(a.id)).toMatchObject({ memberOfSwimlaneId: civil, swimlaneLaneIndex: 2 });
    expect(byId.get(b.id)).toMatchObject({ memberOfSwimlaneId: mech, swimlaneLaneIndex: 0 });
    // Never filed: "No swimlane", and never placed on that basis either.
    expect(byId.get(c.id)).toMatchObject({ memberOfSwimlaneId: null, swimlaneLaneIndex: null });
  });

  it('discloses nothing else about swimlanes: no raw membership, lane rows, source, level or order key', async () => {
    const { actor, planId } = await setup();
    await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
    const civil = await createSwimlane(actor, planId, 'Civil');
    const a = await createActivity(actor, planId, 'A');
    await place(actor, planId, a, civil, 1);
    const token = await mintToken(actor, planId);

    const plan = await guestGet('/api/v1/share/plan', token).expect(200);
    const activities = await guestGet('/api/v1/share/activities', token).expect(200);
    expect(containsKey(plan.body, FORBIDDEN_SWIMLANE_KEYS)).toBe(false);
    expect(containsKey(activities.body, FORBIDDEN_SWIMLANE_KEYS)).toBe(false);
    expect(Object.keys(plan.body.data.swimlanes[0]).sort()).toEqual(['id', 'name']);
  });

  it('files a member of a deleted swimlane under "No swimlane" and drops the swimlane from the list', async () => {
    const { actor, planId } = await setup();
    await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
    const civil = await createSwimlane(actor, planId, 'Civil');
    const mech = await createSwimlane(actor, planId, 'Mechanical');
    const a = await createActivity(actor, planId, 'A');
    await place(actor, planId, a, civil, 3);
    await actor.agent.delete(`${planUrl(planId)}/swimlanes/${civil}`).expect(204);
    const token = await mintToken(actor, planId);

    const plan = await guestGet('/api/v1/share/plan', token).expect(200);
    expect(plan.body.data.swimlanes).toEqual([{ id: mech, name: 'Mechanical' }]);
    const activities = await guestGet('/api/v1/share/activities', token).expect(200);
    const row = (activities.body.data as GuestActivity[]).find((r) => r.id === a.id);
    // The raw id is kept for a restore, but the guest is only told where the diagram draws it.
    expect(row).toMatchObject({ memberOfSwimlaneId: null });
    expect(JSON.stringify(activities.body)).not.toContain(civil);
  });

  it.each(['NONE', 'WBS'] as const)(
    'shows a %s plan without swimlanes, even where an activity is still filed in one',
    async (source) => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(actor, planId, 'Civil');
      const a = await createActivity(actor, planId, 'A');
      await place(actor, planId, a, civil, 1);
      // The membership is kept while the source is anything but MANUAL, and must stay invisible.
      await setSource(
        actor,
        planId,
        source === 'WBS'
          ? { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 }
          : { swimlaneSource: 'NONE' },
      );
      const token = await mintToken(actor, planId);

      const plan = await guestGet('/api/v1/share/plan', token).expect(200);
      expect(plan.body.data.swimlanes).toEqual([]);
      const activities = await guestGet('/api/v1/share/activities', token).expect(200);
      for (const row of activities.body.data as GuestActivity[]) {
        expect(row).toMatchObject({ memberOfSwimlaneId: null, swimlaneLaneIndex: null });
      }
    },
  );

  describe('swimlanes made from a code (p6-activity-codes M4-T6, owner answer 3)', () => {
    /** Area with Ground floor, Level 1, Level 2 (nobody carries it) and Roof; five activities. */
    async function codedPlan() {
      const { actor, planId } = await setup();
      const typeRes = await actor.agent
        .post(`${planUrl(planId)}/code-types`)
        .send({ name: 'Area' })
        .expect(201);
      const typeId = typeRes.body.data.id as string;
      const value = async (shortCode: string, description?: string): Promise<string> =>
        (
          await actor.agent
            .post(`${planUrl(planId)}/code-types/${typeId}/values`)
            .send({ shortCode, ...(description === undefined ? {} : { description }) })
            .expect(201)
        ).body.data.id as string;
      const gf = await value('GF', 'Ground floor');
      const l1 = await value('L1');
      const l2 = await value('L2', 'Level 2');
      const rf = await value('RF', 'Roof');
      const dig = await createActivity(actor, planId, 'Dig');
      const pour = await createActivity(actor, planId, 'Pour');
      const roof = await createActivity(actor, planId, 'Roof deck');
      const snag = await createActivity(actor, planId, 'Snagging');
      const stray = await createActivity(actor, planId, 'Stray');
      const version = async (id: string): Promise<number> =>
        (await prisma.activity.findUniqueOrThrow({ where: { id } })).version;
      const set = async (id: string, codeValueId: string): Promise<void> => {
        await actor.agent
          .patch(`${planUrl(planId)}/activities/codes`)
          .send({
            activities: [
              { id, version: await version(id), codes: [{ codeTypeId: typeId, codeValueId }] },
            ],
          })
          .expect(200);
      };
      await set(dig.id, gf);
      await set(pour.id, l1);
      await set(roof.id, rf);
      // A value only a WBS summary carries is not in use, so its band is not drawn.
      const summary = await createActivity(actor, planId, 'Summary', { type: 'WBS_SUMMARY' });
      await set(summary.id, l2);
      await setSource(actor, planId, {
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: typeId,
      });
      const current = await version(pour.id);
      await actor.agent
        .patch(`${planUrl(planId)}/activities/codes`)
        .send({
          activities: [
            { id: pour.id, version: current, codes: [{ codeTypeId: typeId, codeValueId: l1 }] },
          ],
          lanes: [{ id: pour.id, version: current, laneIndex: 3 }],
          lanesCodeTypeId: typeId,
        })
        .expect(200);
      return { actor, planId, typeId, gf, l1, l2, rf, dig, pour, roof, snag, stray, summary };
    }

    it('lists the values in use by name in value order, and names the last band "No <type>"', async () => {
      const { actor, planId, gf, l1, rf } = await codedPlan();
      const token = await mintToken(actor, planId);
      const plan = await guestGet('/api/v1/share/plan', token).expect(200);
      expect(plan.body.data.swimlanes).toEqual([
        { id: gf, name: 'Ground floor' },
        { id: l1, name: 'L1' },
        { id: rf, name: 'Roof' },
      ]);
      expect(plan.body.data.noSwimlaneName).toBe('No Area');
    });

    it('places each activity by derived membership and lane, null for No <type>', async () => {
      const { actor, planId, gf, l1, rf, dig, pour, roof, snag, summary } = await codedPlan();
      const token = await mintToken(actor, planId);
      const activities = await guestGet('/api/v1/share/activities', token).expect(200);
      const byId = new Map(
        (activities.body.data as GuestActivity[]).map((row): [string, GuestActivity] => [
          row.id,
          row,
        ]),
      );
      expect(byId.get(dig.id)?.memberOfSwimlaneId).toBe(gf);
      expect(byId.get(pour.id)).toMatchObject({ memberOfSwimlaneId: l1, swimlaneLaneIndex: 3 });
      expect(byId.get(roof.id)?.memberOfSwimlaneId).toBe(rf);
      // No value, and a summary: both in No Area.
      expect(byId.get(snag.id)).toMatchObject({ memberOfSwimlaneId: null });
      expect(byId.get(summary.id)).toMatchObject({ memberOfSwimlaneId: null });
    });

    it('never discloses a code: no type, value id of an undrawn band, short code, lane row or source', async () => {
      const { actor, planId, typeId, l2 } = await codedPlan();
      const token = await mintToken(actor, planId);
      const plan = await guestGet('/api/v1/share/plan', token).expect(200);
      const activities = await guestGet('/api/v1/share/activities', token).expect(200);
      const wire = JSON.stringify([plan.body, activities.body]);
      expect(wire).not.toContain(typeId);
      // Level 2 is carried only by a summary, so it is not a band and its id never travels.
      expect(wire).not.toContain(l2);
      expect(wire).not.toContain('shortCode');
      expect(
        containsKey(
          [plan.body, activities.body],
          [
            'codes',
            'codeSwimlaneLanes',
            'codeTypeId',
            'codeValueId',
            'swimlaneCodeTypeId',
            ...FORBIDDEN_SWIMLANE_KEYS,
          ],
        ),
      ).toBe(false);
      expect(Object.keys(plan.body.data.swimlanes[0]).sort()).toEqual(['id', 'name']);
      // A band's id is its value's opaque id, never the type's.
      for (const band of plan.body.data.swimlanes as { id: string }[]) {
        expect(band.id).not.toBe(typeId);
      }
    });

    it('says null for the lane of an activity never placed in its band', async () => {
      const { actor, planId, dig } = await codedPlan();
      const token = await mintToken(actor, planId);
      const activities = await guestGet('/api/v1/share/activities', token).expect(200);
      const row = (activities.body.data as GuestActivity[]).find((r) => r.id === dig.id);
      expect(row).toMatchObject({ swimlaneLaneIndex: null });
    });

    it('does not send noSwimlaneName for a hand-made plan', async () => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      await createSwimlane(actor, planId, 'Civil');
      const token = await mintToken(actor, planId);
      const plan = await guestGet('/api/v1/share/plan', token).expect(200);
      expect(plan.body.data).not.toHaveProperty('noSwimlaneName');
    });
  });

  it('keeps the uniform 404 for a dead token on the plan view that now carries swimlanes', async () => {
    await guestGet('/api/v1/share/plan', 'not-a-real-token').expect(404);
  });
});
