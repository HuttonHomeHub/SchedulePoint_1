import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **#385 M2-T7: a cross-plan link gives the dates the same link gives inside one plan**, through
 * the real write path, the real repository loads, the real derivation and the real programme
 * recalculation, against a real database.
 *
 * Each pair builds the link twice: across two plans, and inside one plan as an ordinary dependency
 * with the same lag. It then checks the cross-plan answer against the in-plan twin AND against a
 * date walked by hand from the calendar. The twin alone would not be enough: both worlds call the
 * engine's shared bound functions, so a defect inside one of those would move both and agree
 * (spec D2). The hand value is what can see that.
 *
 * Calendars are created explicitly (the plan's own calendar is set by PATCH), because the default
 * calendar is full-day and cannot exhibit the eight-hour defect (the ADR-0155 correction: its first
 * e2e fixture assumed the wrong calendar). Standard is Mon–Fri 00:00–24:00; eight-hour Mon–Fri
 * 08:00–16:00. 2026-01-05 is a Monday.
 *
 * The pen is not enforced here: the subject is dates, and `programme-schedule.e2e-spec.ts` owns the
 * pen pre-flight.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

type Agent = ReturnType<typeof request.agent>;

interface ActivityRow {
  id: string;
  name: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
}

describe.skipIf(!hasDatabase)('Cross-plan day boundary (e2e, #385 M2-T7)', () => {
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

  const org = '/api/v1/organizations/acme';

  async function admin(): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return agent;
  }

  /** A Monday-to-Friday calendar with one daily window, `open`–`close` minutes. */
  async function weekdayCalendar(
    agent: Agent,
    name: string,
    open: number,
    close: number,
  ): Promise<string> {
    const res = await agent
      .post(`${org}/calendars`)
      .send({
        name,
        shifts: [0, 1, 2, 3, 4].map((weekday) => ({
          weekday,
          startMinute: open,
          endMinute: close,
        })),
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function plan(
    agent: Agent,
    name: string,
    calendarId: string,
    plannedStart = '2026-01-05',
  ): Promise<string> {
    const client = await agent.post(`${org}/clients`).send({ name }).expect(201);
    const project = await agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name })
      .expect(201);
    const created = await agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart })
      .expect(201);
    const planId = created.body.data.id as string;
    await agent.patch(`${org}/plans/${planId}`).send({ calendarId, version: 1 }).expect(200);
    return planId;
  }

  async function activity(
    agent: Agent,
    planId: string,
    name: string,
    durationDays: number,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name, durationDays, ...extra })
      .expect(201);
    return res.body.data.id as string;
  }

  async function crossLink(
    agent: Agent,
    predecessorActivityId: string,
    successorActivityId: string,
    body: Record<string, unknown>,
  ): Promise<{ lagMinutes: number; lagDays: number }> {
    const res = await agent
      .post(`${org}/cross-plan-dependencies`)
      .send({ predecessorActivityId, successorActivityId, ...body })
      .expect(201);
    return res.body.data as { lagMinutes: number; lagDays: number };
  }

  async function inPlanLink(
    agent: Agent,
    planId: string,
    predecessorId: string,
    successorId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await agent
      .post(`${org}/plans/${planId}/dependencies`)
      .send({ predecessorId, successorId, ...body })
      .expect(201);
  }

  async function rows(agent: Agent, planId: string): Promise<Map<string, ActivityRow>> {
    const res = await agent.get(`${org}/plans/${planId}/activities`).expect(200);
    return new Map((res.body.data as ActivityRow[]).map((a) => [a.name, a]));
  }

  const recalc = (agent: Agent, planId: string) =>
    agent.post(`${org}/plans/${planId}/schedule/recalculate`).send({}).expect(200);
  const programme = (agent: Agent, planId: string) =>
    agent.post(`${org}/plans/${planId}/schedule/recalculate-programme`).send({}).expect(200);

  it('FC-3: FS+2 across a weekend starts the downstream on Wednesday, as inside one plan', async () => {
    const agent = await admin();
    const standard = await weekdayCalendar(agent, 'Weekdays 00-24', 0, 1440);

    // Across two plans. U: 5 days Mon 01-05 → Fri 01-09, finishing at the end of Friday.
    const up = await plan(agent, 'FC-3 upstream', standard);
    const down = await plan(agent, 'FC-3 downstream', standard);
    const u = await activity(agent, up, 'U', 5);
    const d = await activity(agent, down, 'D', 3);
    const link = await crossLink(agent, u, d, { lagDays: 2 });
    // Two working days on the successor plan's Standard calendar: 2 × 1440.
    expect(link).toMatchObject({ lagDays: 2, lagMinutes: 2880 });
    const solved = await programme(agent, down);
    expect(solved.body.data.programme.crossPlanUpstreamMissingCount).toBe(0);

    // Inside one plan.
    const single = await plan(agent, 'FC-3 twin', standard);
    const tu = await activity(agent, single, 'U', 5);
    const td = await activity(agent, single, 'D', 3);
    await inPlanLink(agent, single, tu, td, { lagDays: 2 });
    await recalc(agent, single);

    const cross = (await rows(agent, down)).get('D')!;
    const twin = (await rows(agent, single)).get('D')!;
    // Hand walk: from the end of Fri 01-09 (Sat 00:00), skip the weekend, count Mon 01-12 and
    // Tue 01-13 ⇒ Wed 01-14 00:00. Pre-M2: Mon 01-12.
    expect(twin.earlyStart).toBe('2026-01-14');
    expect(cross.earlyStart).toBe(twin.earlyStart);
    expect(cross.earlyStart).toBe('2026-01-14');
  });

  it('FC-4: a one-day lag on an eight-hour calendar is one eight-hour day, as inside one plan', async () => {
    const agent = await admin();
    const eightHour = await weekdayCalendar(agent, 'Eight-hour', 480, 960);

    // U: 2 days Mon 08:00 → Tue 01-06 16:00.
    const up = await plan(agent, 'FC-4 upstream', eightHour);
    const down = await plan(agent, 'FC-4 downstream', eightHour);
    const u = await activity(agent, up, 'U', 2);
    const d = await activity(agent, down, 'D', 2);
    const link = await crossLink(agent, u, d, { lagDays: 1 });
    // One working day on the successor plan's eight-hour calendar: 480, not 1440.
    expect(link).toMatchObject({ lagDays: 1, lagMinutes: 480 });
    await programme(agent, down);

    const single = await plan(agent, 'FC-4 twin', eightHour);
    const tu = await activity(agent, single, 'U', 2);
    const td = await activity(agent, single, 'D', 2);
    await inPlanLink(agent, single, tu, td, { lagDays: 1 });
    await recalc(agent, single);

    const cross = (await rows(agent, down)).get('D')!;
    const twin = (await rows(agent, single)).get('D')!;
    // Hand walk: Tue 16:00 + 480 eight-hour minutes ⇒ Wed 01-07 16:00; the downstream's first
    // working minute after it is Thu 01-08 08:00. Pre-M2: Wed 01-07. The derivation fixed without
    // the migration (1440 walked on this calendar): Mon 01-12.
    expect(twin.earlyStart).toBe('2026-01-08');
    expect(cross.earlyStart).toBe(twin.earlyStart);
    expect(cross.earlyStart).toBe('2026-01-08');
  });

  it('FC-9: backward FS — the upstream finishes by the end of Friday, as inside one plan', async () => {
    const agent = await admin();
    const standard = await weekdayCalendar(agent, 'Weekdays 00-24', 0, 1440);

    // Downstream S: 5 days, FNLT Fri 01-23 ⇒ late start Mon 01-19. L2 keeps that plan's own finish
    // later than the pin; L keeps the upstream's own finish later than the bound, so the link alone
    // sets U's late finish.
    const up = await plan(agent, 'FC-9 upstream', standard);
    const down = await plan(agent, 'FC-9 downstream', standard);
    const u = await activity(agent, up, 'U', 5);
    await activity(agent, up, 'L', 20);
    const s = await activity(agent, down, 'S', 5, {
      constraintType: 'FNLT',
      constraintDate: '2026-01-23',
    });
    await activity(agent, down, 'L2', 30);
    await crossLink(agent, u, s, { lagDays: 0 });
    // Upstream first, then the downstream; then the upstream again, which is when it reads the
    // downstream's written late dates.
    await programme(agent, down);
    await recalc(agent, up);

    const single = await plan(agent, 'FC-9 twin', standard);
    const tu = await activity(agent, single, 'U', 5);
    await activity(agent, single, 'L', 20);
    const ts = await activity(agent, single, 'S', 5, {
      constraintType: 'FNLT',
      constraintDate: '2026-01-23',
    });
    await activity(agent, single, 'L2', 30);
    await inPlanLink(agent, single, tu, ts, { lagDays: 0 });
    await recalc(agent, single);

    const downRows = await rows(agent, down);
    expect(downRows.get('S')!.lateStart).toBe('2026-01-19');
    const cross = (await rows(agent, up)).get('U')!;
    const twin = (await rows(agent, single)).get('U')!;
    // Hand walk: the downstream's late start Mon 01-19 is Mon 00:00; FS lag 0 bounds U there, and
    // its last working end at or before that is the end of Fri 01-16. Pre-M2: Mon 01-19.
    expect(twin.lateFinish).toBe('2026-01-16');
    expect(cross.lateFinish).toBe(twin.lateFinish);
    expect(cross.lateFinish).toBe('2026-01-16');
  });
});
