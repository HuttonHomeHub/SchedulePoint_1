import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **A type change keeps a zero-duration activity's instant, through the API**
 * (`docs/specs/zero-duration-task/` M0-T3 then M2-T1; spec E18, E26, E29, FC-2, FC-3).
 *
 * **Case 1 was M0's characterisation of the defect and is M2's acceptance test.** A `PATCH` that
 * changes `type` used to touch no date field, and ADR-0155 reads every stored date on a
 * `FINISH_MILESTONE` as the END of its day. So a zero-duration `TASK` (or a `START_MILESTONE`) pinned
 * by an SNET to Monday 12 Jan, converted to a `FINISH_MILESTONE`, moved from the start of Monday to the
 * end of it, and its successor from Monday to Tuesday (M0 read `2026-01-13`). ADR-0162 decision 3
 * re-expresses the unsent stored date one calendar day (the SNET becomes Sunday 11 Jan), so the
 * instant, and the successor, stay on Monday: `SUCCESSOR_AFTER_TYPE_CHANGE` flipped to `'2026-01-12'`.
 *
 * **Case 1's control** is the successor's date before the change: it must be Monday, the same day the
 * activity is pinned to, or a later Tuesday reading would not be a move at all.
 *
 * **FC-2** runs the same shape with all five date fields set, on four calendars (Monday–Friday full
 * days, an eight-hour shift, 24-hour, and Monday–Friday with Monday 12 Jan made non-working), and
 * asserts every other activity's persisted schedule and every edge's driving flag are unchanged by a
 * round trip `TASK → FINISH_MILESTONE → TASK`. Four shapes suffice because the working-time port
 * branches on whether a minute is non-working, never on why; the exception calendar shows that rather
 * than asserting it.
 *
 * **Case 2 was M0's characterisation of a SECOND defect and is `docs/TECH_DEBT.md` #396's acceptance
 * test.** `update()` had one rule about `type` (the milestone-duration coercion above) and guarded no
 * structural change into or out of `WBS_SUMMARY`: `PATCH {type: 'TASK'}` on a summary with a child was
 * accepted, leaving a `TASK` whose child still named it as parent — against ADR-0038's "only a
 * WBS_SUMMARY may be a parent". The reverse, converting an activity that still has a dependency into
 * `WBS_SUMMARY`, breaks the sibling invariant — "a summary carries no logic" — the same rule
 * `DependenciesService.create()` already enforces when a NEW link targets a summary endpoint. Both are
 * now 422s, reusing that create-time guard's `SUMMARY_HAS_NO_LOGIC` reason for the second and the
 * re-parent guard's `PARENT_NOT_SUMMARY` reason for the first — the same invariant, read from the
 * opposite side. Two positive controls prove neither check overreaches: a *childless* summary still
 * converts to a plain type, and a *link-free* activity still converts to a summary.
 *
 * The first plan is created with no calendar, so it takes the organisation's default five-day week
 * (ADR-0155 "Corrections recorded"); Friday 9 Jan and Monday 12 Jan are the two days either side of a
 * weekend, which is what made "one working day later" Tuesday rather than Saturday.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

/** M0 read `'2026-01-13'` (the defect). M2 flipped it: the conversion keeps the instant. */
const SUCCESSOR_AFTER_TYPE_CHANGE = '2026-01-12';

interface Row {
  id: string;
  code: string;
  type: string;
  version: number;
  durationMinutes: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  freeFloat: number | null;
  isCritical: boolean;
  remainingFloat: number | null;
  visualDriftDays: number | null;
  visualConflict: boolean;
  constraintType: string | null;
  constraintDate: string | null;
  secondaryConstraintType: string | null;
  secondaryConstraintDate: string | null;
  externalEarlyStart: string | null;
  externalLateFinish: string | null;
  visualStart: string | null;
  parentId: string | null;
}

/** The five stored date inputs ADR-0162 decision 3 re-expresses. */
const DATE_FIELDS = [
  'visualStart',
  'constraintDate',
  'secondaryConstraintDate',
  'externalEarlyStart',
  'externalLateFinish',
] as const;

/** An activity's engine-owned schedule, less the four reported dates. */
function scheduleOf(r: Row) {
  return {
    totalFloat: r.totalFloat,
    freeFloat: r.freeFloat,
    isCritical: r.isCritical,
    remainingFloat: r.remainingFloat,
    visualDriftDays: r.visualDriftDays,
    visualConflict: r.visualConflict,
  };
}

/** An activity's whole schedule, reported dates included. */
function fullScheduleOf(r: Row) {
  return {
    ...scheduleOf(r),
    earlyStart: r.earlyStart,
    earlyFinish: r.earlyFinish,
    lateStart: r.lateStart,
    lateFinish: r.lateFinish,
  };
}

type CalendarShape =
  | { kind: 'default' }
  | {
      kind: 'shifts';
      name: string;
      shifts: { weekday: number; startMinute: number; endMinute: number }[];
    }
  | { kind: 'exception'; name: string; nonWorking: string };

const weekdays = (days: number[], startMinute: number, endMinute: number) =>
  days.map((weekday) => ({ weekday, startMinute, endMinute }));

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

    async function setup(calendar: CalendarShape = { kind: 'default' }) {
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
      if (calendar.kind !== 'default') {
        const shifts =
          calendar.kind === 'shifts' ? calendar.shifts : weekdays([0, 1, 2, 3, 4], 0, 1440);
        const cal = await agent
          .post('/api/v1/organizations/acme/calendars')
          .send({ name: calendar.name, shifts })
          .expect(201);
        if (calendar.kind === 'exception') {
          await agent
            .post(`/api/v1/organizations/acme/calendars/${cal.body.data.id}/exceptions`)
            .send({ date: calendar.nonWorking, isWorking: false })
            .expect(201);
        }
        await agent
          .patch(`/api/v1/organizations/acme/plans/${planId}`)
          .send({ calendarId: cal.body.data.id, version: plan.body.data.version })
          .expect(200);
      }
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
      const driving = async (): Promise<Record<string, boolean>> => {
        const list = await agent
          .get(`/api/v1/organizations/acme/plans/${planId}/dependencies?limit=100`)
          .expect(200);
        return Object.fromEntries(
          (list.body.data as { id: string; isDriving: boolean }[]).map((d) => [d.id, d.isDriving]),
        );
      };
      const patch = (id: string, body: object) =>
        agent.patch(`/api/v1/organizations/acme/activities/${id}`).send(body);
      return { agent, create, link, recalculate, rows, driving, patch };
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
      it(`acceptance (E18, flipped by M2): a zero-duration ${zType} converted to FINISH_MILESTONE keeps its successor on the same day`, async () => {
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
        // The response carries the re-expressed date: one CALENDAR day earlier, the Sunday.
        expect(changed.body.data.constraintDate).toBe('2026-01-11');
        await api.recalculate();
        const after = await api.rows();

        expect(after.get('Z')!.type).toBe('FINISH_MILESTONE');
        expect(after.get('Z')!.constraintType).toBe('SNET');
        expect(after.get('Z')!.constraintDate).toBe('2026-01-11');
        // The milestone reports the day that closes at its instant (Monday 00:00): Friday 9 Jan.
        expect(after.get('Z')!.earlyFinish).toBe('2026-01-09');
        // The instant is unchanged, so the successor still starts Monday.
        expect(after.get('SUCC')!.earlyStart).toBe(SUCCESSOR_AFTER_TYPE_CHANGE);
      });
    }

    const CALENDARS: readonly { label: string; shape: CalendarShape }[] = [
      {
        label: 'Monday–Friday full days',
        shape: {
          kind: 'shifts',
          name: 'Five full days',
          shifts: weekdays([0, 1, 2, 3, 4], 0, 1440),
        },
      },
      {
        label: 'an eight-hour shift',
        shape: {
          kind: 'shifts',
          name: 'Eight hours',
          shifts: weekdays([0, 1, 2, 3, 4], 540, 1020),
        },
      },
      {
        label: '24-hour',
        shape: {
          kind: 'shifts',
          name: 'Round the clock',
          shifts: weekdays([0, 1, 2, 3, 4, 5, 6], 0, 1440),
        },
      },
      {
        label: 'Monday–Friday with Monday 12 Jan non-working',
        shape: { kind: 'exception', name: 'With a holiday', nonWorking: '2026-01-12' },
      },
    ];

    for (const { label, shape } of CALENDARS) {
      it(`FC-2 on ${label}: TASK → FINISH_MILESTONE → TASK with all five dates set moves nothing else`, async () => {
        const api = await setup(shape);
        const pre = await api.create({ name: 'Pre', code: 'PRE', durationDays: 5 });
        const z = await api.create({
          name: 'Zero',
          code: 'Z',
          durationDays: 0,
          constraintType: 'SNET',
          constraintDate: '2026-01-12',
          secondaryConstraintType: 'FNLT',
          secondaryConstraintDate: '2026-01-21',
          externalEarlyStart: '2026-01-12',
          externalLateFinish: '2026-01-21',
          visualStart: '2026-01-12',
        });
        const succ = await api.create({ name: 'Succ', code: 'SUCC', durationDays: 1 });
        const tail = await api.create({ name: 'Tail', code: 'TAIL', durationDays: 3 });
        const other = await api.create({ name: 'Other', code: 'OTHER', durationDays: 12 });
        await api.link(pre.id, z.id);
        await api.link(z.id, succ.id);
        await api.link(succ.id, tail.id);
        await api.link(pre.id, other.id);
        await api.recalculate();

        const before = await api.rows();
        const drivingBefore = await api.driving();
        const stored = before.get('Z')!;
        // Every one of the five reached the row, or a round trip over nulls would prove nothing.
        for (const f of DATE_FIELDS) expect(stored[f], f).not.toBeNull();

        const toMilestone = await api.patch(stored.id, {
          version: stored.version,
          type: 'FINISH_MILESTONE',
        });
        expect(toMilestone.status).toBe(200);
        for (const f of DATE_FIELDS) {
          // Mon 12 → Sun 11, Wed 21 → Tue 20: one calendar day earlier, whatever the calendar.
          const expected = stored[f] === '2026-01-12' ? '2026-01-11' : '2026-01-20';
          expect(toMilestone.body.data[f], f).toBe(expected);
        }
        await api.recalculate();
        const mid = await api.rows();

        for (const code of ['PRE', 'SUCC', 'TAIL', 'OTHER']) {
          expect(fullScheduleOf(mid.get(code)!), code).toEqual(fullScheduleOf(before.get(code)!));
        }
        expect(scheduleOf(mid.get('Z')!)).toEqual(scheduleOf(before.get('Z')!));
        expect(await api.driving()).toEqual(drivingBefore);

        const back = await api.patch(stored.id, { version: mid.get('Z')!.version, type: 'TASK' });
        expect(back.status).toBe(200);
        await api.recalculate();
        const after = await api.rows();
        for (const f of DATE_FIELDS) expect(after.get('Z')![f], f).toBe(stored[f]);
        for (const code of ['PRE', 'Z', 'SUCC', 'TAIL', 'OTHER']) {
          expect(fullScheduleOf(after.get(code)!), code).toEqual(fullScheduleOf(before.get(code)!));
        }
        expect(await api.driving()).toEqual(drivingBefore);
      });
    }

    it('FC-3 (b): a placement stored on a Sunday converts and comes back to the Sunday', async () => {
      const api = await setup();
      const pre = await api.create({ name: 'Pre', code: 'PRE', durationDays: 5 });
      const z = await api.create({
        name: 'Zero',
        code: 'Z',
        durationDays: 0,
        visualStart: '2026-01-11',
      });
      await api.link(pre.id, z.id);
      await api.recalculate();
      const before = (await api.rows()).get('Z')!;

      const into = await api.patch(z.id, { version: before.version, type: 'FINISH_MILESTONE' });
      expect(into.status).toBe(200);
      // A working-day shift would store Friday 9 Jan here and bring it back as Monday 12.
      expect(into.body.data.visualStart).toBe('2026-01-10');
      const back = await api.patch(z.id, { version: into.body.data.version, type: 'TASK' });
      expect(back.status).toBe(200);
      expect(back.body.data.visualStart).toBe('2026-01-11');
    });

    describe('N26 is checked on the values that will be persisted (spec S1, E26)', () => {
      it('(a) refuses a pair the re-expression would invert: 422, never a database error', async () => {
        const api = await setup();
        const z = await api.create({
          name: 'Zero',
          code: 'Z',
          durationDays: 0,
          externalEarlyStart: '2026-01-10',
          externalLateFinish: '2026-01-10',
        });
        // The late finish is unsent, so it moves to 9 Jan; the sent early start stays 10 Jan.
        const res = await api.patch(z.id, {
          version: z.version,
          type: 'FINISH_MILESTONE',
          externalEarlyStart: '2026-01-10',
        });
        expect(res.status).toBe(422);
        expect(res.body.error.details.reason).toBe('EXTERNAL_FINISH_BEFORE_START');
        const row = (await api.rows()).get('Z')!;
        expect(row.type).toBe('TASK');
        expect(row.externalLateFinish).toBe('2026-01-10');
      });

      it('(b) accepts a pair that is valid only after re-expression', async () => {
        const api = await setup();
        const z = await api.create({
          name: 'Zero',
          code: 'Z',
          durationDays: 0,
          externalEarlyStart: '2026-01-10',
          externalLateFinish: '2026-01-12',
        });
        // Against the stored early start (10 Jan) a sent late finish of 9 Jan is inverted; against
        // the re-expressed one (9 Jan) it is not.
        const res = await api.patch(z.id, {
          version: z.version,
          type: 'FINISH_MILESTONE',
          externalLateFinish: '2026-01-09',
        });
        expect(res.status).toBe(200);
        expect(res.body.data.externalEarlyStart).toBe('2026-01-09');
        expect(res.body.data.externalLateFinish).toBe('2026-01-09');
      });
    });

    it('characterisation (spec D3): a zero-duration RESOURCE_DEPENDENT is re-expressed; its instant is reported, not claimed', async () => {
      const api = await setup();
      const roundTheClock = await api.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Crane hours', shifts: weekdays([0, 1, 2, 3, 4, 5, 6], 0, 1440) })
        .expect(201);
      const crane = await api.agent
        .post('/api/v1/organizations/acme/resources')
        .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: roundTheClock.body.data.id })
        .expect(201);
      const pre = await api.create({ name: 'Pre', code: 'PRE', durationDays: 5 });
      const z = await api.create({
        name: 'Lift',
        code: 'Z',
        type: 'RESOURCE_DEPENDENT',
        durationDays: 0,
        constraintType: 'SNET',
        constraintDate: '2026-01-12',
      });
      await api.agent
        .post(`/api/v1/organizations/acme/activities/${z.id}/assignments`)
        .send({ resourceId: crane.body.data.id, budgetedUnits: 1, isDriving: true })
        .expect(201);
      const succ = await api.create({ name: 'Succ', code: 'SUCC', durationDays: 1 });
      await api.link(pre.id, z.id);
      await api.link(z.id, succ.id);
      await api.recalculate();
      const before = await api.rows();

      const res = await api.patch(z.id, {
        version: before.get('Z')!.version,
        type: 'FINISH_MILESTONE',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.constraintDate).toBe('2026-01-11');
      await api.recalculate();
      const after = await api.rows();
      // Reported, not asserted equal: the type change also moves the activity off its driving
      // resource's calendar, which D3 cannot keep (FC-2 is not claimed for this type).
      process.stderr.write(
        `[zero-duration M2] RESOURCE_DEPENDENT → FINISH_MILESTONE: successor ${before.get('SUCC')!.earlyStart} → ${after.get('SUCC')!.earlyStart}; Z ${before.get('Z')!.earlyFinish} → ${after.get('Z')!.earlyFinish}\n`,
      );
    });

    it('acceptance (spec E29, #396): a WBS_SUMMARY with an active child rejects PATCH {type: TASK} (422 PARENT_NOT_SUMMARY)', async () => {
      const api = await setup();
      const summary = await api.create({ name: 'Phase', code: 'W', type: 'WBS_SUMMARY' });
      await api.create({ name: 'Child', code: 'C', durationDays: 2, parentId: summary.id });

      const res = await api.patch(summary.id, { version: summary.version, type: 'TASK' });

      // Refused: converting away would leave the child's `parentId` pointing at a non-summary — the
      // rule was previously unenforced (M0's characterisation was `.expect(200)` here).
      expect(res.status).toBe(422);
      expect(res.body.error.details.reason).toBe('PARENT_NOT_SUMMARY');
      // Names the count.
      expect(res.body.error.message).toContain('1');
      const rows = await api.rows();
      expect(rows.get('W')!.type).toBe('WBS_SUMMARY');
      expect(rows.get('C')!.parentId).toBe(summary.id);
    });

    it('acceptance (#396): a TASK named by an active dependency rejects PATCH {type: WBS_SUMMARY} (422 SUMMARY_HAS_NO_LOGIC)', async () => {
      const api = await setup();
      const before = await api.create({ name: 'Before', code: 'B', durationDays: 1 });
      const middle = await api.create({ name: 'Middle', code: 'M', durationDays: 1 });
      await api.link(before.id, middle.id);

      const res = await api.patch(middle.id, { version: middle.version, type: 'WBS_SUMMARY' });

      // Refused: converting the endpoint would leave a summary carrying logic (ADR-0035 §24), the
      // same rule DependenciesService.create() enforces on a NEW link, read from the other side.
      expect(res.status).toBe(422);
      expect(res.body.error.details.reason).toBe('SUMMARY_HAS_NO_LOGIC');
      expect(res.body.error.message).toContain('1');
      const rows = await api.rows();
      expect(rows.get('M')!.type).toBe('TASK');
    });

    it('positive control (#396): a childless WBS_SUMMARY still converts to a plain type', async () => {
      const api = await setup();
      const summary = await api.create({ name: 'Empty phase', code: 'E', type: 'WBS_SUMMARY' });

      const res = await api.patch(summary.id, { version: summary.version, type: 'TASK' });

      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe('TASK');
    });

    it('positive control (#396): a link-free activity still converts to WBS_SUMMARY', async () => {
      const api = await setup();
      const solo = await api.create({ name: 'Solo', code: 'S', durationDays: 3 });

      const res = await api.patch(solo.id, { version: solo.version, type: 'WBS_SUMMARY' });

      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe('WBS_SUMMARY');
    });
  },
);
