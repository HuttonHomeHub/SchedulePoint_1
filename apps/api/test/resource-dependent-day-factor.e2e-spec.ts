import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * **M0-T1 of `docs/specs/resource-dependent-day-factor/` — the engine half, executed.**
 *
 * `docs/TECH_DEBT.md` #86 said for a year that this defect is display-only: _"the API stores
 * minutes, and the engine reschedules on the correct calendar regardless"_. That sentence kept the
 * row a low priority, and it is false. The web-side half is pinned in
 * `apps/web/src/lib/day-factor-divergence.characterisation.test.ts`; **this file is the half that
 * needs a real database**, because it is a fact about two server rules disagreeing and no unit tier
 * can reach it.
 *
 * ## The two rules
 *
 * `activities/day-factor.ts:19-24` converts a written `durationDays` on
 * `activityCalendarId ?? planCalendarId` — the activity's **own** calendar.
 * `schedule.service.ts:1277-1287` schedules a `RESOURCE_DEPENDENT` activity on its **driving
 * resource's** calendar. Both are correct in isolation and both claim to name "the activity's
 * effective calendar". Where the two calendars have different working hours, the quantity written
 * and the calendar it is spent on disagree.
 *
 * ## This is CHARACTERISATION, not desired behaviour
 *
 * Every expectation pins what the product does **today**, including the wrong finish. When M2 of the
 * spec lands, the resource-dependent activity finishes level with its task twin and these
 * expectations invert. A reader who finds this file green has learnt the defect is
 * still present, which is the opposite of what a green test usually means.
 *
 * ## Why the fixture is hand-built
 *
 * The seed catalogue cannot supply it: **every calendar it builds has `hoursPerDay: null`**
 * (`packages/seed/src/{fixture,pairwise,scale,negative}`), so no seeded plan can exhibit this
 * divergence at all. `docs/TEST_PLAYBOOK.md`'s `plan:capability-resources` row watches the right
 * distinction — "the resource-dependent one schedules on its driving resource's calendar" — on
 * calendars whose day lengths are equal, which is exactly the case where the defect is invisible.
 *
 * Built through the public REST API throughout (the ADR-0066 rule): a fixture assembled below the
 * write path reuses the assembly the defect lives in, and would agree with itself.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('RESOURCE_DEPENDENT day factor (e2e, characterisation)', () => {
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
    await clearBaselineTree(prisma);
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.updateMany({ data: { parentId: null } });
    await clearDomainData(prisma);
  }

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const org = '/api/v1/organizations/acme';

  async function adminWithOrg(): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /**
   * A calendar working every day, `hours` long. Every weekday is authored, so no computed date can
   * land on a non-working day and the finish is a pure function of the day length — which is the
   * one variable under test.
   */
  async function calendar(actor: Actor, name: string, hours: number): Promise<string> {
    const res = await actor.agent
      .post(`${org}/calendars`)
      .send({
        name,
        shifts: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: hours * 60,
        })),
      })
      .expect(201);
    expect(res.body.data.hoursPerDay).toBe(hours);
    return res.body.data.id as string;
  }

  async function planOn(actor: Actor, calendarId: string): Promise<string> {
    const client = await actor.agent.post(`${org}/clients`).send({ name: 'C' }).expect(201);
    const project = await actor.agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const plan = await actor.agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Pl', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent.patch(`${org}/plans/${planId}`).send({ calendarId, version: 1 }).expect(200);
    return planId;
  }

  it('spends a 5-day resource-dependent activity on the DRIVER’s day length, not the one it was written on', async () => {
    const actor = await adminWithOrg();
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const roundTheClock = await calendar(actor, 'Crane (24h)', 24);
    const planId = await planOn(actor, eightHourDay);

    // The control, created first so a failure cannot be blamed on ordering: an ordinary TASK with
    // the same written duration on the same plan. It has no driver, so both rules agree about it.
    const task = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Task twin', durationDays: 5 })
      .expect(201);

    const driven = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Crane lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    const drivenId = driven.body.data.id as string;

    const crane = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: roundTheClock })
      .expect(201);
    await actor.agent
      .post(`${org}/activities/${drivenId}/assignments`)
      .send({ resourceId: crane.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);

    // ── The write. Both activities were written `durationDays: 5` on the plan's 8 h calendar, so
    //    `day-factor.ts` stores 5 × 8 × 60 for BOTH — the driver is not consulted on the way in.
    expect(task.body.data.durationMinutes).toBe(2400);
    expect(driven.body.data.durationMinutes).toBe(2400);

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);

    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (list.body.data as { name: string; earlyFinish: string | null }[]).map((a) => [a.name, a]),
    );

    // ── The read. The task spends 2,400 minutes at 8 h/day: five days, 1–5 January.
    expect(byName.get('Task twin')?.earlyFinish).toBe('2026-01-05');

    // And the resource-dependent one spends the SAME 2,400 minutes at 24 h/day — under two days.
    // **This is the defect, and it is the number M2 has to change**: a planner asked for five days
    // of crane time and the programme reserves less than two, with every read-out still saying `5d`
    // because `minutesToDays(2400, 480)` returns 5 on the way back out.
    expect(byName.get('Crane lift')?.earlyFinish).toBe('2026-01-02');
    expect(byName.get('Crane lift')?.earlyFinish).not.toBe(byName.get('Task twin')?.earlyFinish);
  });

  it('agrees when the two calendars agree — so a green run cannot mean the fixture stopped discriminating', async () => {
    // Without this the case above passes equally against a build where the driving calendar is
    // never resolved at all, which is a different defect wearing the same result.
    const actor = await adminWithOrg();
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const alsoEight = await calendar(actor, 'Second crew (8h)', 8);
    const planId = await planOn(actor, eightHourDay);

    await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Task twin', durationDays: 5 })
      .expect(201);
    const driven = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Crane lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);

    const crew = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Crew B', kind: 'LABOUR', calendarId: alsoEight })
      .expect(201);
    await actor.agent
      .post(`${org}/activities/${driven.body.data.id}/assignments`)
      .send({ resourceId: crew.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);

    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (list.body.data as { name: string; earlyFinish: string | null }[]).map((a) => [a.name, a]),
    );
    expect(byName.get('Crane lift')?.earlyFinish).toBe(byName.get('Task twin')?.earlyFinish);
  });
});
