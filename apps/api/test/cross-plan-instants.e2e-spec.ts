import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { CrossPlanDependencyRepository } from '../src/modules/cross-plan-dependencies/cross-plan-dependency.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **Cross-plan instants M4 — two real plans, joined through the public REST API, give the dates one
 * plan gives** (ADR-0212, spec FC-6, FC-5, FC-10). The engine specs prove the rule; only this
 * proves the product's own read path: the repository selects, the freshness check, the service mapping
 * and the stored columns the previous recalculation wrote.
 *
 * **The fixture is the #539 network** (`engine/compute.cross-calendar.fixture.ts`): plan calendar
 * Mon–Fri 08:00–16:00, a Sat–Sun 07:00–19:00 calendar, data date Monday 2027-06-14,
 * `A → W → M → K → F`, `W` weekend work from `SNET` Sat 06-26 (so it ends Sunday 19:00), `F` a finish
 * milestone `FNLT` Fri 07-09. Each case is cut across two plans and compared to the same activities in
 * ONE plan, solved by the same server. Quantities are in working minutes (`durationMinutes`), so no
 * day factor is in play.
 *
 * **Verified red with the read switched off** (`trustedInstantMinutes` made to return null): the start
 * milestone case reads `K` starting 2027-07-05 where one plan gives 2027-06-28, and the finish milestone
 * case gives `A` a different float. Both pass with the read on.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const DATA_DATE = '2027-06-14';
const WEEKDAY_MINUTES = 480;
const LONG_DAYS = 60;

type Agent = ReturnType<typeof request.agent>;

interface ActivityRow {
  id: string;
  name: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
}

const FIELDS = ['earlyStart', 'earlyFinish', 'lateStart', 'lateFinish', 'totalFloat'] as const;
const pick = (r: ActivityRow) => Object.fromEntries(FIELDS.map((f) => [f, r[f]]));

describe.skipIf(!hasDatabase)('cross-plan instants (e2e)', () => {
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
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  const org = '/api/v1/organizations/acme';

  async function admin(): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'cross-instants@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return agent;
  }

  async function calendar(
    agent: Agent,
    name: string,
    weekdays: number[],
    open: number,
    close: number,
  ): Promise<string> {
    const res = await agent
      .post(`${org}/calendars`)
      .send({
        name,
        shifts: weekdays.map((weekday) => ({ weekday, startMinute: open, endMinute: close })),
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function calendars(agent: Agent) {
    return {
      weekday: await calendar(agent, 'Weekdays 08-16', [0, 1, 2, 3, 4], 480, 960),
      weekend: await calendar(agent, 'Weekend 07-19', [5, 6], 420, 1140),
    };
  }

  async function plan(agent: Agent, name: string, calendarId: string): Promise<string> {
    const client = await agent.post(`${org}/clients`).send({ name }).expect(201);
    const project = await agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name })
      .expect(201);
    const created = await agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: DATA_DATE })
      .expect(201);
    const planId = created.body.data.id as string;
    await agent.patch(`${org}/plans/${planId}`).send({ calendarId, version: 1 }).expect(200);
    return planId;
  }

  async function activity(
    agent: Agent,
    planId: string,
    name: string,
    durationMinutes: number,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name, code: name, durationMinutes, ...extra })
      .expect(201);
    return res.body.data.id as string;
  }

  const inPlanLink = (agent: Agent, planId: string, predecessorId: string, successorId: string) =>
    agent
      .post(`${org}/plans/${planId}/dependencies`)
      .send({ predecessorId, successorId })
      .expect(201);

  const crossLink = (agent: Agent, predecessorActivityId: string, successorActivityId: string) =>
    agent
      .post(`${org}/cross-plan-dependencies`)
      .send({ predecessorActivityId, successorActivityId })
      .expect(201);

  async function rows(agent: Agent, planId: string): Promise<Map<string, ActivityRow>> {
    const res = await agent.get(`${org}/plans/${planId}/activities`).expect(200);
    return new Map((res.body.data as ActivityRow[]).map((a) => [a.name, a]));
  }

  const recalc = (agent: Agent, planId: string) =>
    agent.post(`${org}/plans/${planId}/schedule/recalculate`).send({}).expect(200);
  const programme = (agent: Agent, planId: string) =>
    agent.post(`${org}/plans/${planId}/schedule/recalculate-programme`).send({}).expect(200);

  /** The network's activities, created in `planId` (the ones named by `names`, in chain order). */
  function createNetwork(
    agent: Agent,
    cal: { weekday: string; weekend: string },
    middle: { type: string; calendarId?: string },
  ) {
    const defs: Record<string, [number, Record<string, unknown>]> = {
      A: [5 * WEEKDAY_MINUTES, {}],
      W: [1440, { calendarId: cal.weekend, constraintType: 'SNET', constraintDate: '2027-06-26' }],
      M: [
        0,
        { type: middle.type, ...(middle.calendarId ? { calendarId: middle.calendarId } : {}) },
      ],
      K: [5 * WEEKDAY_MINUTES, {}],
      F: [0, { type: 'FINISH_MILESTONE', constraintType: 'FNLT', constraintDate: '2027-07-09' }],
    };
    return async (planId: string, names: string[]): Promise<Map<string, string>> => {
      const ids = new Map<string, string>();
      for (const name of names) {
        const [minutes, extra] = defs[name]!;
        ids.set(name, await activity(agent, planId, name, minutes, extra));
      }
      return ids;
    };
  }

  /** The one-plan twin of the whole chain, solved by the same server. */
  async function twin(
    agent: Agent,
    cal: { weekday: string; weekend: string },
    middle: { type: string; calendarId?: string },
    longer: boolean,
  ): Promise<Map<string, ActivityRow>> {
    const planId = await plan(agent, 'Twin', cal.weekday);
    const ids = await createNetwork(agent, cal, middle)(planId, ['A', 'W', 'M', 'K', 'F']);
    if (longer) await activity(agent, planId, 'L', LONG_DAYS * WEEKDAY_MINUTES);
    for (const [p, s] of [
      ['A', 'W'],
      ['W', 'M'],
      ['M', 'K'],
      ['K', 'F'],
    ] as const) {
      await inPlanLink(agent, planId, ids.get(p)!, ids.get(s)!);
    }
    await recalc(agent, planId);
    return rows(agent, planId);
  }

  /** The two-plan programme, cut at `cut`, solved upstream, downstream, then upstream again. */
  async function twoPlans(
    agent: Agent,
    cal: { weekday: string; weekend: string },
    middle: { type: string; calendarId?: string },
    cut: 'M->K' | 'W->M',
    longer: boolean,
  ) {
    const make = createNetwork(agent, cal, middle);
    const upNames = cut === 'M->K' ? ['A', 'W', 'M'] : ['A', 'W'];
    const downNames = cut === 'M->K' ? ['K', 'F'] : ['M', 'K', 'F'];
    const up = await plan(agent, 'Upstream', cal.weekday);
    const down = await plan(agent, 'Downstream', cal.weekday);
    const upIds = await make(up, upNames);
    const downIds = await make(down, downNames);
    if (longer) {
      await activity(agent, up, 'L', LONG_DAYS * WEEKDAY_MINUTES);
      await activity(agent, down, 'L2', LONG_DAYS * WEEKDAY_MINUTES);
    }
    const chain = ['A', 'W', 'M', 'K', 'F'];
    for (let i = 0; i < chain.length - 1; i++) {
      const [p, s] = [chain[i]!, chain[i + 1]!];
      if (upIds.has(p) && upIds.has(s)) await inPlanLink(agent, up, upIds.get(p)!, upIds.get(s)!);
      else if (downIds.has(p) && downIds.has(s))
        await inPlanLink(agent, down, downIds.get(p)!, downIds.get(s)!);
      else await crossLink(agent, upIds.get(p)!, downIds.get(s)!);
    }
    await programme(agent, down);
    await recalc(agent, up);
    return { up, down, upIds, downIds };
  }

  it('FC-6: a start milestone on the weekend calendar, cut at M->K, gives K the one-plan start', async () => {
    const agent = await admin();
    const cal = await calendars(agent);
    const middle = { type: 'START_MILESTONE', calendarId: cal.weekend };

    const single = await twin(agent, cal, middle, false);
    const { up, down } = await twoPlans(agent, cal, middle, 'M->K', false);
    const upRows = await rows(agent, up);
    const downRows = await rows(agent, down);

    // Non-vacuity: one plan starts K on the Monday the weekend work hands over to, a week before the
    // date alone would put it (Sunday's end read as the end of the day, then rolled to 07-05).
    expect(single.get('K')!.earlyStart).toBe('2027-06-28');
    expect(downRows.get('K')!.earlyStart).toBe('2027-06-28');
    for (const name of ['A', 'W', 'M'])
      expect(pick(upRows.get(name)!), name).toEqual(pick(single.get(name)!));
    for (const name of ['K', 'F'])
      expect(pick(downRows.get(name)!), name).toEqual(pick(single.get(name)!));
  });

  it('FC-6: a finish milestone on the plan calendar, cut at W->M, keeps the upstream float one plan gives', async () => {
    const agent = await admin();
    const cal = await calendars(agent);
    const middle = { type: 'FINISH_MILESTONE' };

    const single = await twin(agent, cal, middle, true);
    const { up, down } = await twoPlans(agent, cal, middle, 'W->M', true);
    const upRows = await rows(agent, up);
    const downRows = await rows(agent, down);

    // Non-vacuity: the float is there to be lost.
    expect(single.get('A')!.totalFloat).toBeGreaterThan(0);
    for (const name of ['A', 'W'])
      expect(pick(upRows.get(name)!), name).toEqual(pick(single.get(name)!));
    for (const name of ['M', 'K', 'F'])
      expect(pick(downRows.get(name)!), name).toEqual(pick(single.get(name)!));
  });

  it('FC-5: a remote plan without instants is read from its date, and is read again once recalculated', async () => {
    const agent = await admin();
    const cal = await calendars(agent);
    const middle = { type: 'START_MILESTONE', calendarId: cal.weekend };
    const { up, down } = await twoPlans(agent, cal, middle, 'M->K', false);
    const k = async () => (await rows(agent, down)).get('K')!.earlyStart;
    expect(await k()).toBe('2027-06-28');

    const stamps = async () =>
      (
        await prisma.$queryRaw<{ equal: boolean | null }[]>`
          SELECT ("schedule_instants_computed_at" = "schedule_computed_at") AS "equal"
            FROM "plans" WHERE "id" = ${up}::uuid`
      )[0]!.equal;
    expect(await stamps(), 'the recalculation stamped both in one statement').toBe(true);

    // FC-5: an upstream whose instants are not stamped (a plan never calculated) reads from its date.
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_instants_computed_at" = NULL WHERE "id" = $1::uuid`,
      up,
    );
    await recalc(agent, down);
    expect(await k()).toBe('2027-07-05');

    // Recalculating the upstream stamps its instants again, and the downstream reads them.
    await recalc(agent, up);
    expect(await stamps()).toBe(true);
    await recalc(agent, down);
    expect(await k()).toBe('2027-06-28');
  });

  it('FC-10: the cross-plan loads issue the same statements at 10 and 100 links each way', async () => {
    const agent = await admin();
    const cal = await calendars(agent);
    const up = await plan(agent, 'Up', cal.weekday);
    const mid = await plan(agent, 'Mid', cal.weekday);
    const down = await plan(agent, 'Down', cal.weekday);
    const organizationId = (await prisma.plan.findFirstOrThrow({ where: { id: mid } }))
      .organizationId;
    // Straight into the tables: a REST call per activity is rate-limited, and is not what is measured.
    const made = { u: 0 };
    const grow = async (n: number) => {
      const from = made.u;
      const create = async (planId: string, prefix: string) => {
        await prisma.activity.createMany({
          data: Array.from({ length: n - from }, (_, i) => ({
            organizationId,
            planId,
            name: `${prefix}${from + i}`,
            durationMinutes: 480,
          })),
        });
        const found = await prisma.activity.findMany({
          where: { planId, name: { startsWith: prefix } },
          select: { id: true, name: true },
        });
        return new Map(found.map((a) => [a.name, a.id]));
      };
      const ups = await create(up, 'U');
      const midIn = await create(mid, 'I');
      const midOut = await create(mid, 'O');
      const downs = await create(down, 'D');
      await prisma.crossPlanDependency.createMany({
        data: Array.from({ length: n - from }, (_, i) => {
          const k = from + i;
          return [
            {
              organizationId,
              predecessorPlanId: up,
              successorPlanId: mid,
              predecessorId: ups.get(`U${k}`)!,
              successorId: midIn.get(`I${k}`)!,
            },
            {
              organizationId,
              predecessorPlanId: mid,
              successorPlanId: down,
              predecessorId: midOut.get(`O${k}`)!,
              successorId: downs.get(`D${k}`)!,
            },
          ];
        }).flat(),
      });
      made.u = n;
    };

    const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    try {
      let counted = 0;
      client.$on('query', () => {
        counted += 1;
      });
      const repo = new CrossPlanDependencyRepository(client as unknown as PrismaService);
      const measure = async (): Promise<{
        statements: number;
        incoming: number;
        outgoing: number;
      }> => {
        counted = 0;
        const incoming = await repo.loadIncomingWithPredecessorDates(organizationId, mid);
        const outgoing = await repo.loadOutgoingWithSuccessorDates(organizationId, mid);
        // Prisma emits its query events a beat after the call resolves; read the count once they land.
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { statements: counted, incoming: incoming.length, outgoing: outgoing.length };
      };

      await grow(10);
      const small = await measure();
      await grow(100);
      const large = await measure();

      expect(small).toMatchObject({ incoming: 10, outgoing: 10 });
      expect(large).toMatchObject({ incoming: 100, outgoing: 100 });
      expect(small.statements).toBeGreaterThan(0);
      expect(large.statements, 'no statement per edge').toBe(small.statements);
    } finally {
      await client.$disconnect();
    }
  }, 120_000);
});
