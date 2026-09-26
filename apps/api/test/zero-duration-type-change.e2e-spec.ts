import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **A type change that moves an activity, reproduced through the API** (`docs/specs/zero-duration-task/`
 * M0-T3; spec E18 and E29). Nothing here is fixed: both cases characterise the product as it is.
 *
 * **Case 1 is M2's acceptance test, inverted.** A `PATCH` that changes `type` touches no date field
 * (`activities.service.ts`, the milestone invariant is its only type rule), and ADR-0155 reads every
 * stored date on a `FINISH_MILESTONE` as the END of its day. So a zero-duration `TASK` (or a
 * `START_MILESTONE`) pinned by an SNET to Monday 12 Jan, converted to a `FINISH_MILESTONE`, moves from
 * the start of Monday to the end of it, and its successor moves from Monday to Tuesday. The expected
 * successor date is the constant `SUCCESSOR_AFTER_TYPE_CHANGE`: M2 re-expresses the stored date on a
 * type change, and flips that one line to `'2026-01-12'`.
 *
 * **Case 1's control** is the successor's date before the change: it must be Monday, the same day the
 * activity is pinned to, or a later Tuesday reading would not be a move at all.
 *
 * **Case 2 is a plain characterisation and this epic does not flip it** (spec E29): a
 * `PATCH {type: 'TASK'}` on a `WBS_SUMMARY` that has a child is accepted today, leaving a `TASK` with a
 * child, against ADR-0038's rule that only a summary may be a parent. It is filed as a
 * `docs/TECH_DEBT.md` row, not fixed here.
 *
 * The plan is created with no calendar, so it takes the organisation's default five-day week
 * (ADR-0155 "Corrections recorded"); Friday 9 Jan and Monday 12 Jan are the two days either side of a
 * weekend, which is what makes "one working day later" Tuesday rather than Saturday.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

/** Today's reading. M2 flips this to `'2026-01-12'`: the conversion keeps the instant. */
const SUCCESSOR_AFTER_TYPE_CHANGE = '2026-01-13';

interface Row {
  id: string;
  code: string;
  type: string;
  version: number;
  durationMinutes: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  constraintType: string | null;
  constraintDate: string | null;
  parentId: string | null;
}

describe.skipIf(!hasDatabase)(
  'Changing a zero-duration activity to a finish milestone (e2e)',
  () => {
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

    beforeEach(async () => {
      await clearDomainData(prisma);
    });

    afterAll(async () => {
      await clearDomainData(prisma);
      await app?.close();
    });

    async function setup() {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'zd', email: 'zd-admin@example.com', password: PASSWORD })
        .expect(200);
      await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const client = await agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await agent
        .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201);
      const plan = await agent
        .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
        .send({ name: 'Zero', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
      const create = async (body: object): Promise<Row> =>
        (await agent.post(base).send(body).expect(201)).body.data as Row;
      const link = async (predecessorId: string, successorId: string) =>
        agent
          .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
          .send({ predecessorId, successorId, type: 'FS' })
          .expect(201);
      const recalculate = async () =>
        agent
          .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
          .send({})
          .expect(200);
      const rows = async (): Promise<Map<string, Row>> => {
        const list = await agent.get(`${base}?limit=100`).expect(200);
        return new Map((list.body.data as Row[]).map((r) => [r.code, r]));
      };
      const patch = (id: string, body: object) =>
        agent.patch(`/api/v1/organizations/acme/activities/${id}`).send(body);
      return { create, link, recalculate, rows, patch };
    }

    /**
     * `PRE` (5 working days from Monday 5 Jan) ends Friday 9 Jan. `Z` follows it FS with an SNET on
     * Monday 12 Jan, and `SUCC` (1 day) follows `Z`.
     */
    async function seed(zType: 'TASK' | 'START_MILESTONE') {
      const api = await setup();
      const pre = await api.create({ name: 'Pre', code: 'PRE', durationDays: 5 });
      const z = await api.create({
        name: 'Zero',
        code: 'Z',
        type: zType,
        durationDays: 0,
        constraintType: 'SNET',
        constraintDate: '2026-01-12',
      });
      const succ = await api.create({ name: 'Succ', code: 'SUCC', durationDays: 1 });
      await api.link(pre.id, z.id);
      await api.link(z.id, succ.id);
      await api.recalculate();
      return api;
    }

    for (const zType of ['TASK', 'START_MILESTONE'] as const) {
      it(`characterisation (E18): a zero-duration ${zType} converted to FINISH_MILESTONE moves its successor a working day later (M2 flips SUCCESSOR_AFTER_TYPE_CHANGE)`, async () => {
        const api = await seed(zType);
        const before = await api.rows();
        // The fixture, asserted before anything is concluded from it.
        expect(before.get('PRE')!.earlyFinish).toBe('2026-01-09');
        expect(before.get('Z')!.durationMinutes).toBe(0);
        expect(before.get('Z')!.earlyStart).toBe('2026-01-12');
        // The control: before the change the successor starts the day the activity is pinned to.
        expect(before.get('SUCC')!.earlyStart).toBe('2026-01-12');

        const z = before.get('Z')!;
        const changed = await api.patch(z.id, { version: z.version, type: 'FINISH_MILESTONE' });
        expect(changed.status).toBe(200);
        await api.recalculate();
        const after = await api.rows();

        // The PATCH wrote no date: the stored SNET is unchanged, so the move is the reading rule.
        expect(after.get('Z')!.type).toBe('FINISH_MILESTONE');
        expect(after.get('Z')!.constraintType).toBe('SNET');
        expect(after.get('Z')!.constraintDate).toBe('2026-01-12');
        // The milestone reports the day that closes at its instant: still Monday.
        expect(after.get('Z')!.earlyFinish).toBe('2026-01-12');
        // And the instant is the END of Monday, so the successor starts Tuesday.
        expect(after.get('SUCC')!.earlyStart).toBe(SUCCESSOR_AFTER_TYPE_CHANGE);
      });
    }

    it('characterisation (E29): a WBS_SUMMARY with a child accepts PATCH {type: TASK} today', async () => {
      const api = await setup();
      const summary = await api.create({ name: 'Phase', code: 'W', type: 'WBS_SUMMARY' });
      await api.create({ name: 'Child', code: 'C', durationDays: 2, parentId: summary.id });

      const res = await api.patch(summary.id, { version: summary.version, type: 'TASK' });

      // Accepted, and the child still names it as its parent: a TASK with a child, which ADR-0038 says
      // only a summary may be. Filed in docs/TECH_DEBT.md; this epic does not flip it.
      expect(res.status).toBe(200);
      const rows = await api.rows();
      expect(rows.get('W')!.type).toBe('TASK');
      expect(rows.get('C')!.parentId).toBe(summary.id);
    });
  },
);
