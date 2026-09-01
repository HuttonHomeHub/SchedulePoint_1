import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the organisations feature against a real Better Auth
 * session + PostgreSQL. Exercises creation (creator → Org Admin), listing the
 * caller's organisations, slug lookup, and the anti-enumeration 404 for a
 * non-member (IDOR defence).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(!hasDatabase)('Organizations API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // Order respects the RESTRICT foreign keys (invitations + members reference org/user).
    await prisma.invitation.deleteMany();
    // Both link tables and `activities` first, even though this spec creates none of them.
    // `activities` is the link tables' FK target and `plans` is its own, so ANY row left in the
    // shared local database — by a sibling spec, or by a Playwright journey run against the same
    // `app_test` — makes the `plan.deleteMany()` below a foreign-key violation, and every test in
    // this file then fails in `beforeEach` naming a table the spec never touches.
    //
    // This order was missing from NINE specs and present in the rest, so each of them passed or
    // failed on the order the files happened to run in. Adding one new e2e file was enough to
    // change that order and break them (`docs/TECH_DEBT.md` #119).
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
    // Resource assignments hold `activity_id` FKs and resources are organisation-scoped, so both
    // are swept here for the same shared-database reason as the link tables above
    // (docs/TECH_DEBT.md #119): a leftover row from a sibling suite or a Playwright run against
    // the same `app_test` otherwise fails a spec that never touches resources — which happened
    // on 2026-08-28, in `beforeEach`, to every test in the file at once.
    // Weighted steps hold `activity_id` (ADR-0044 §33), and they are the THIRD table to fail this
    // way — after `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a). Found the
    // same way and recorded here rather than in one file: a full API run on 2026-08-31 failed 282
    // tests across 10 files in `beforeEach` on `activity_steps_activity_id_fkey`, and by the time
    // anyone looked the database was clean, because a later suite in the same run had swept it.
    // The log was kept, which is the only reason this was diagnosable at all.
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  });

  const server = () => app.getHttpServer();

  /** Sign up a user and return a cookie-persisting agent. */
  async function signedInAgent(email: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return agent;
  }

  it('rejects org creation without a session (401)', async () => {
    await request(server()).post('/api/v1/organizations').send({ name: 'Acme' }).expect(401);
  });

  it('creates an organisation, making the creator its Org Admin (201)', async () => {
    const agent = await signedInAgent('ada@example.com');

    const res = await agent
      .post('/api/v1/organizations')
      .send({ name: 'Acme Construction' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Acme Construction',
      slug: 'acme-construction',
      role: 'ORG_ADMIN',
    });
    expect(res.body.data.id).toEqual(expect.any(String));
  });

  it('derives a unique slug when names collide', async () => {
    const agent = await signedInAgent('ada@example.com');
    const first = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const second = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    expect(first.body.data.slug).toBe('acme');
    expect(second.body.data.slug).toBe('acme-2');
  });

  it('lists only the caller organisations and fetches one by slug', async () => {
    const agent = await signedInAgent('ada@example.com');
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);

    const list = await agent.get('/api/v1/organizations').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ slug: 'acme', role: 'ORG_ADMIN' });

    const one = await agent.get('/api/v1/organizations/acme').expect(200);
    expect(one.body.data).toMatchObject({ slug: 'acme', role: 'ORG_ADMIN' });
  });

  it('404s when a non-member fetches an organisation by slug (anti-enumeration)', async () => {
    const owner = await signedInAgent('owner@example.com');
    await owner.post('/api/v1/organizations').send({ name: 'Private Co' }).expect(201);

    const outsider = await signedInAgent('outsider@example.com');
    await outsider.get('/api/v1/organizations/private-co').expect(404);
    // The outsider sees no organisations of their own.
    const list = await outsider.get('/api/v1/organizations').expect(200);
    expect(list.body.data).toHaveLength(0);
  });
});
