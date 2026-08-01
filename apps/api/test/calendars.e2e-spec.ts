import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ALL_WEEKDAYS_MASK, STANDARD_WEEKDAYS_MASK } from '@repo/types';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the working-day calendar library: CRUD, the weekday-mask
 * validation, name uniqueness, the exception editor (add/remove + duplicate
 * guard + parent-version bump), the soft-delete cascade over exceptions, and the
 * RBAC / IDOR matrix (verified against a real PostgreSQL + Better Auth session).
 *
 * Calendars are the one entity no other e2e spec cleans up, so this spec resets
 * them in `beforeEach` AND leaves a clean database in `afterAll` (children before
 * parents) — otherwise a later spec's `organization.deleteMany()` would trip the
 * calendars → organizations FK (the shared-DB discipline from the M6 slice).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Calendars API (e2e)', () => {
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
    await prisma.calendarException.deleteMany();
    // Plans reference calendars (plans.calendar_id FK, RESTRICT, since Task C1), so
    // delete plans BEFORE calendars — the delete-in-use test leaves a plan pointing at
    // a calendar.
    await prisma.plan.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    // Leave a clean DB so later specs / Playwright don't hit the calendars FK.
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const base = '/api/v1/organizations/acme/calendars';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** An admin (Planner privileges included) who owns an org 'acme'. */
  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function createCalendar(
    actor: Actor,
    name: string,
    workingWeekdays = STANDARD_WEEKDAYS_MASK,
  ): Promise<string> {
    const res = await actor.agent.post(base).send({ name, workingWeekdays }).expect(201);
    expect(res.body.data).toMatchObject({ name, workingWeekdays, version: 1, exceptions: [] });
    return res.body.data.id as string;
  }

  it('seeds a Standard (Mon–Fri) calendar for a new organisation', async () => {
    const { actor } = await adminWithOrg();
    const list = await actor.agent.get(base).expect(200);
    // Org create seeds exactly one Standard calendar (M5, ADR-0024).
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      name: 'Standard',
      workingWeekdays: STANDARD_WEEKDAYS_MASK,
    });
  });

  /**
   * TECH_DEBT #80. ADR-0036 shipped intraday shift patterns in the engine and in storage, and no
   * write path could create one: the repository derived every calendar's shifts from a 7-bit
   * weekday mask, so every calendar in every database was a whole-day calendar and the
   * minute-granular machinery underneath was exercised only by unit tests.
   */
  describe('authorable shift patterns (TECH_DEBT #80)', () => {
    it('authors a split shift and reads the windows back exactly', async () => {
      const { actor } = await adminWithOrg();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({
          name: 'Two shifts',
          // 08:00–12:00 and 13:00–17:00 on Monday — a lunch break, which a mask cannot express.
          shifts: [
            { weekday: 0, startMinute: 480, endMinute: 720 },
            { weekday: 0, startMinute: 780, endMinute: 1020 },
          ],
        })
        .expect(201);
      expect(res.body.data.shifts).toEqual([
        { weekday: 0, startMinute: 480, endMinute: 720 },
        { weekday: 0, startMinute: 780, endMinute: 1020 },
      ]);
      // Derived, and lossy on purpose: the mask can only say Monday works.
      expect(res.body.data.workingWeekdays).toBe(1);
    });

    it('authors a night shift as two adjacent-day windows, not a wrap', async () => {
      const { actor } = await adminWithOrg();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({
          name: 'Nights',
          shifts: [
            { weekday: 0, startMinute: 1200, endMinute: 1440 }, // Mon 20:00–24:00
            { weekday: 1, startMinute: 0, endMinute: 360 }, // Tue 00:00–06:00
          ],
        })
        .expect(201);
      expect(res.body.data.shifts).toHaveLength(2);
    });

    it('replaces the whole week on update, whichever form the patch uses', async () => {
      const { actor } = await adminWithOrg();
      const created = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Replaceable', workingWeekdays: STANDARD_WEEKDAYS_MASK })
        .expect(201);
      const res = await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${created.body.data.id as string}`)
        .send({
          shifts: [{ weekday: 4, startMinute: 480, endMinute: 720 }], // half-day Friday only
          version: created.body.data.version,
        })
        .expect(200);
      // The five full-day rows the mask created must be gone — the two fields are two spellings
      // of one value, so a patch naming one cannot leave rows the other put there.
      expect(res.body.data.shifts).toEqual([{ weekday: 4, startMinute: 480, endMinute: 720 }]);
      expect(res.body.data.workingWeekdays).toBe(0b0010000);
    });

    it('refuses overlapping, unsorted, or inverted windows at the boundary', async () => {
      const { actor } = await adminWithOrg();
      const base = '/api/v1/organizations/acme/calendars';
      const bad = (shifts: unknown) => actor.agent.post(base).send({ name: 'Bad', shifts });
      // Overlapping: 08:00–12:00 and 11:00–17:00.
      await bad([
        { weekday: 0, startMinute: 480, endMinute: 720 },
        { weekday: 0, startMinute: 660, endMinute: 1020 },
      ]).expect(422);
      // Unsorted — rejected rather than quietly reordered.
      await bad([
        { weekday: 0, startMinute: 780, endMinute: 1020 },
        { weekday: 0, startMinute: 480, endMinute: 720 },
      ]).expect(422);
      // Inverted, which is what a wrapped night shift looks like if authored as one window.
      await bad([{ weekday: 0, startMinute: 1200, endMinute: 360 }]).expect(422);
    });

    it('refuses both spellings of the week at once, and neither', async () => {
      const { actor } = await adminWithOrg();
      const base = '/api/v1/organizations/acme/calendars';
      await actor.agent
        .post(base)
        .send({
          name: 'Both',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
          shifts: [{ weekday: 0, startMinute: 480, endMinute: 720 }],
        })
        .expect(422);
      await actor.agent.post(base).send({ name: 'Neither' }).expect(422);
    });
  });

  /**
   * TECH_DEBT #79. ADR-0036 §2 made a window-only base week valid — every weekday non-working,
   * all working time from dated exception windows (a plant turnaround, a shutdown programme) —
   * and said the old "mask must be non-zero" guard was replaced by the engine's
   * `buildWorkingTimeCalendar` check. The DTO's `@Min(1)` and the DB CHECK were never relaxed to
   * match, so for a year the engine supported the shape and the API answered 422.
   */
  describe('window-only calendars (TECH_DEBT #79)', () => {
    it('accepts a zero mask — the turnaround shape the engine already supports', async () => {
      const { actor } = await adminWithOrg();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Turnaround', workingWeekdays: 0 })
        .expect(201);
      expect(res.body.data).toMatchObject({ name: 'Turnaround', workingWeekdays: 0 });
    });

    it('lets an existing calendar be narrowed to window-only', async () => {
      const { actor } = await adminWithOrg();
      const created = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Shutdown', workingWeekdays: STANDARD_WEEKDAYS_MASK })
        .expect(201);
      const res = await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${created.body.data.id as string}`)
        .send({ workingWeekdays: 0, version: created.body.data.version })
        .expect(200);
      expect(res.body.data.workingWeekdays).toBe(0);
    });

    it('still refuses a mask outside the week', async () => {
      const { actor } = await adminWithOrg();
      await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Impossible', workingWeekdays: 128 })
        .expect(422);
      await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Negative', workingWeekdays: -1 })
        .expect(422);
    });
  });

  it('creates, gets and lists calendars', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Project Calendar');

    const got = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(got.body.data).toMatchObject({
      name: 'Project Calendar',
      workingWeekdays: STANDARD_WEEKDAYS_MASK,
    });
    expect(got.body.data.exceptions).toEqual([]);

    const list = await actor.agent.get(base).expect(200);
    // The seeded Standard plus the one just created.
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.map((c: { name: string }) => c.name).sort()).toEqual([
      'Project Calendar',
      'Standard',
    ]);
    expect(list.body.meta).toMatchObject({ hasMore: false });
    // The list shape is the summary — no embedded exceptions.
    expect(list.body.data[0]).not.toHaveProperty('exceptions');
  });

  it('rejects an invalid working-weekday mask (422)', async () => {
    const { actor } = await adminWithOrg();
    // `workingWeekdays: 0` was asserted here as a 422 and is now a 201 — see the window-only
    // describe block below. It moved rather than being deleted: the shape is valid (ADR-0036 §2),
    // so the case is still worth a test, just with the opposite expectation.
    await actor.agent.post(base).send({ name: 'TooWide', workingWeekdays: 128 }).expect(422);
    await actor.agent.post(base).send({ name: 'NoPattern' }).expect(422);
  });

  it('rejects a duplicate active name (409) but allows reuse after delete', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Dup');
    await actor.agent
      .post(base)
      .send({ name: 'Dup', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(409);

    await actor.agent.delete(`${base}/${id}`).expect(204);
    // Same name is free once the holder is soft-deleted.
    await createCalendar(actor, 'Dup');
  });

  it('updates with optimistic locking (stale version → 409) and changes the pattern', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Renamed');

    const ok = await actor.agent
      .patch(`${base}/${id}`)
      .send({ name: 'Renamed 7-day', workingWeekdays: ALL_WEEKDAYS_MASK, version: 1 })
      .expect(200);
    expect(ok.body.data).toMatchObject({
      name: 'Renamed 7-day',
      workingWeekdays: ALL_WEEKDAYS_MASK,
      version: 2,
    });

    await actor.agent.patch(`${base}/${id}`).send({ name: 'Again', version: 1 }).expect(409);
  });

  it('adds, lists and removes exceptions; bumps the calendar version; blocks duplicates', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Holidays');

    const added = await actor.agent
      .post(`${base}/${id}/exceptions`)
      .send({ date: '2026-12-25', label: 'Christmas Day' })
      .expect(201);
    expect(added.body.data).toMatchObject({
      date: '2026-12-25',
      isWorking: false,
      label: 'Christmas Day',
    });
    const exceptionId = added.body.data.id as string;

    // A worked Saturday (isWorking: true).
    await actor.agent
      .post(`${base}/${id}/exceptions`)
      .send({ date: '2026-01-17', isWorking: true })
      .expect(201);

    // Duplicate date on the same calendar → 409.
    await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(409);

    // Adding exceptions bumped the calendar version (1 → 3 after two adds).
    const got = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(got.body.data.version).toBe(3);
    expect(got.body.data.exceptions).toHaveLength(2);
    // Exceptions are returned date-ordered.
    expect(got.body.data.exceptions.map((e: { date: string }) => e.date)).toEqual([
      '2026-01-17',
      '2026-12-25',
    ]);

    await actor.agent.delete(`${base}/${id}/exceptions/${exceptionId}`).expect(204);
    const afterRemove = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(afterRemove.body.data.exceptions).toHaveLength(1);
    expect(afterRemove.body.data.version).toBe(4);
    // The removed date is free to re-add (partial unique ignores soft-deleted rows).
    await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(201);
  });

  it('soft-deletes a calendar and its exceptions together', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Cascade');
    await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(201);

    await actor.agent.delete(`${base}/${id}`).expect(204);

    // The calendar is gone from the active list (the seeded Standard remains)...
    const list = await actor.agent.get(base).expect(200);
    expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(id);
    // ...and its exceptions were soft-deleted in the same batch.
    const cal = await prisma.calendar.findUniqueOrThrow({ where: { id } });
    const exceptions = await prisma.calendarException.findMany({ where: { calendarId: id } });
    expect(cal.deletedAt).not.toBeNull();
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.deletedAt).not.toBeNull();
    expect(exceptions[0]?.deleteBatchId).toBe(cal.deleteBatchId);
  });

  it('refuses to delete a calendar in use by an active plan (409 CALENDAR_IN_USE)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const calId = await createCalendar(actor, 'In Use');

    // Seed a client → project → plan referencing the calendar directly (the plan
    // calendar picker is a web concern; here we assert the service guard).
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: 'C', createdBy: actor.userId },
    });
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId: client.id, name: 'P', createdBy: actor.userId },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: 'Pl',
        plannedStart: new Date('2026-01-01T00:00:00.000Z'),
        calendarId: calId,
        createdBy: actor.userId,
      },
    });

    const res = await actor.agent.delete(`${base}/${calId}`).expect(409);
    expect(res.body.error?.details?.reason).toBe('CALENDAR_IN_USE');
    // Still active — the delete was refused.
    await actor.agent.get(`${base}/${calId}`).expect(200);

    // Once the plan is soft-deleted it no longer counts, so the calendar can be deleted.
    await prisma.plan.update({ where: { id: plan.id }, data: { deletedAt: new Date() } });
    await actor.agent.delete(`${base}/${calId}`).expect(204);
  });

  it('404s a foreign/unknown calendar id and hides calendars from non-members', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Secret');

    const missingExceptionId = '00000000-0000-0000-0000-000000000000';
    const outsider = await signUp('outsider@example.com');
    // Non-member: the org is invisible (404, not 403) on every route, read or write.
    await outsider.agent.get(base).expect(404);
    await outsider.agent.get(`${base}/${id}`).expect(404);
    await outsider.agent.patch(`${base}/${id}`).send({ name: 'X', version: 1 }).expect(404);
    await outsider.agent.delete(`${base}/${id}`).expect(404);
    await outsider.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(404);
    await outsider.agent.delete(`${base}/${id}/exceptions/${missingExceptionId}`).expect(404);

    // A member of a *different* org cannot reach this org's calendar on ANY route —
    // scope resolves to 'other', then the scoped calendar load 404s (anti-IDOR).
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const other = '/api/v1/organizations/other/calendars';
    await outsider.agent.get(`${other}/${id}`).expect(404);
    await outsider.agent.patch(`${other}/${id}`).send({ name: 'X', version: 1 }).expect(404);
    await outsider.agent.delete(`${other}/${id}`).expect(404);
    await outsider.agent.post(`${other}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(404);
    await outsider.agent.delete(`${other}/${id}/exceptions/${missingExceptionId}`).expect(404);
  });

  it('forbids Viewer and Contributor writes but allows reading (403 / 200)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const id = await createCalendar(actor, 'Visible');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });

    const missingExceptionId = '00000000-0000-0000-0000-000000000000';
    for (const member of [viewer, contributor]) {
      await member.agent.get(base).expect(200);
      await member.agent.get(`${base}/${id}`).expect(200);
      await member.agent
        .post(base)
        .send({ name: 'Nope', workingWeekdays: STANDARD_WEEKDAYS_MASK })
        .expect(403);
      await member.agent.patch(`${base}/${id}`).send({ name: 'Nope', version: 1 }).expect(403);
      await member.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(403);
      // removeException denies on calendar:update before it ever loads the exception.
      await member.agent.delete(`${base}/${id}/exceptions/${missingExceptionId}`).expect(403);
      await member.agent.delete(`${base}/${id}`).expect(403);
    }
  });

  it('401s without a session', async () => {
    await request(server()).get(base).expect(401);
  });
});
