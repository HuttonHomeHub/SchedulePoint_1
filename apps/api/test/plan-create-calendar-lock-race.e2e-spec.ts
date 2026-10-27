import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { acquireCalendarWriteLock } from '../src/common/db/calendar-advisory-lock';
import { ConflictError } from '../src/common/errors/domain-errors';
import { CALENDAR_CONFLICT, CalendarsService } from '../src/modules/calendars/calendars.service';
import { PlansService } from '../src/modules/plans/plans.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **Can a new plan be bound to the Standard calendar while that calendar is being deleted?**
 * (`docs/TECH_DEBT.md` #559, the same race #550 closed for activities.)
 *
 * Plan create used to read the organisation's Standard calendar before its transaction and bind it
 * without the calendar advisory lock the `CALENDAR_IN_USE` delete takes, so a delete that counted
 * referencers between the read and the insert could soft-delete the calendar under a new plan.
 *
 * **Driven below HTTP**, like `activity-create-plan-lock-race.e2e-spec.ts`: two Supertest requests do
 * not overlap (#70). A second connection plays the delete — it holds the calendar lock — and the
 * create is started while it is held; the create has already read its Standard hint by then, which
 * is exactly the window.
 *
 * **Red without the fix:** the create never waits, so it finishes inside the hold
 * (`createFinishedWhileHeld` true) and leaves an active plan on the deleted Standard.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
/** How long the create is given to (wrongly) finish while the lock is held. */
const WAIT_MS = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Agent = ReturnType<typeof request.agent>;

interface World {
  agent: Agent;
  base: string;
  orgSlug: string;
  principal: Principal;
  projectId: string;
  standardId: string;
}

describe.skipIf(!hasDatabase)('Plan create against a delete of the Standard calendar', () => {
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
    try {
      if (prisma) await clearDomainData(prisma);
    } finally {
      await app?.close();
    }
  });

  async function world(): Promise<World> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Racer', email: `plancalrace-${stamp}@example.com`, password: PASSWORD })
      .expect(200);
    const org = await agent
      .post('/api/v1/organizations')
      .send({ name: `Plan Calendar Race ${stamp}` })
      .expect(201);
    const orgSlug = org.body.data.slug as string;
    const orgId = org.body.data.id as string;
    const base = `/api/v1/organizations/${orgSlug}`;
    const client = await agent.post(`${base}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await agent
      .post(`${base}/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const me = await agent.get('/api/v1/me').expect(200);
    const standard = await prisma.calendar.findFirstOrThrow({
      where: { organizationId: orgId, name: 'Standard', scope: 'ORG', deletedAt: null },
    });
    return {
      agent,
      base,
      orgSlug,
      projectId: project.body.data.id as string,
      standardId: standard.id,
      principal: new Principal(me.body.data.user.id as string, [
        { organizationId: orgId, role: 'ORG_ADMIN', permissions: permissionsForRole('ORG_ADMIN') },
      ]),
    };
  }

  /**
   * Connection 2, playing the calendar delete: takes the calendar lock, then waits for `release()`
   * and runs `beforeCommit` while still holding it.
   */
  function holdCalendarLock(
    calendarId: string,
    beforeCommit: (
      tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ) => Promise<void>,
  ): { held: Promise<void>; done: Promise<void>; release: () => void } {
    let markHeld!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (markHeld = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const done = prisma.$transaction(
      async (tx) => {
        await acquireCalendarWriteLock(tx, calendarId);
        markHeld();
        await released;
        await beforeCommit(tx);
      },
      { timeout: 30_000 },
    );
    return { held, done, release };
  }

  function startCreate(w: World, name: string) {
    let settled = false;
    const result = app
      .get(PlansService)
      .create(w.principal, w.orgSlug, w.projectId, { name, plannedStart: '2026-01-05' })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      )
      .finally(() => {
        settled = true;
      });
    return { result, isSettled: () => settled };
  }

  it('a create that meets a delete of the Standard in flight binds nothing and leaves no plan on it', async () => {
    const w = await world();
    const hold = holdCalendarLock(w.standardId, async (tx) => {
      await tx.calendar.update({ where: { id: w.standardId }, data: { deletedAt: new Date() } });
    });
    await hold.held;

    const create = startCreate(w, 'Races the delete');
    await sleep(WAIT_MS);
    const createFinishedWhileHeld = create.isSettled();
    hold.release();
    await hold.done;
    const result = await create.result;

    expect(
      createFinishedWhileHeld,
      'the create was not held by the calendar lock, so there was nothing for it to serialise',
    ).toBe(false);
    expect(result.status).toBe('fulfilled');
    expect((result as { value: { calendarId: string | null } }).value.calendarId).toBeNull();
    expect(await prisma.plan.count({ where: { calendarId: w.standardId, deletedAt: null } })).toBe(
      0,
    );
  });

  it('a create that waited and found the Standard intact binds it, so a delete is then refused', async () => {
    const w = await world();
    const hold = holdCalendarLock(w.standardId, () => Promise.resolve());
    await hold.held;

    const create = startCreate(w, 'Waits then binds');
    await sleep(WAIT_MS);
    expect(create.isSettled()).toBe(false);
    hold.release();
    await hold.done;
    const result = await create.result;

    expect(result.status).toBe('fulfilled');
    expect((result as { value: { calendarId: string | null } }).value.calendarId).toBe(
      w.standardId,
    );
    const removal = await app
      .get(CalendarsService)
      .remove(w.principal, w.orgSlug, w.standardId)
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(removal).toBeInstanceOf(ConflictError);
    expect((removal as ConflictError).details).toMatchObject({
      reason: CALENDAR_CONFLICT.CALENDAR_IN_USE,
    });
  });

  it("never binds a project calendar that happens to be named 'Standard'", async () => {
    const w = await world();
    const projectCalendar = await w.agent
      .post(`${w.base}/calendars`)
      .send({ name: 'Standard', scope: 'PROJECT', projectId: w.projectId, workingWeekdays: 31 })
      .expect(201);

    const plan = await app
      .get(PlansService)
      .create(w.principal, w.orgSlug, w.projectId, { name: 'Tiered', plannedStart: '2026-01-05' });

    expect(plan.calendarId).toBe(w.standardId);
    expect(plan.calendarId).not.toBe(projectCalendar.body.data.id);
  });

  it('does not bind an archived Standard', async () => {
    const w = await world();
    await prisma.calendar.update({ where: { id: w.standardId }, data: { archivedAt: new Date() } });

    const plan = await app.get(PlansService).create(w.principal, w.orgSlug, w.projectId, {
      name: 'Archived',
      plannedStart: '2026-01-05',
    });

    expect(plan.calendarId).toBeNull();
  });
});
