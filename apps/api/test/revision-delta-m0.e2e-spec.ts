import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { fixtureSpec } from '@repo/seed';
import { SeedClient, seedPlan } from '@repo/seed-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * **M0-T2 — the critical-path delta's measurement harness.**
 *
 * Judged against [`docs/specs/revision-compare-delta/m0-condition.md`](../../../docs/specs/revision-compare-delta/m0-condition.md),
 * which was committed on its own before this file existed.
 *
 * **The non-vacuity limb runs FIRST**, because F1 passes trivially against two identical schedules
 * and a green suite that cannot tell "all correct" from "found nothing" is the failure ADR-0093 and
 * ADR-0108 both record. If a qualifying change set cannot be produced through the public write
 * path, that is itself the finding and it is reported rather than worked around.
 *
 * **Where it bypasses the product (ADR-0081 §3).** F1 and F2 call the delta and the engine
 * directly. A pass says the METHOD is sound and says nothing about a route, a DTO or a guard. F3
 * goes over the real HTTP route precisely because the other two do not.
 *
 * The fixture is seeded **in-spec** through the same seeder the CLI uses, so this runs anywhere the
 * e2e suite runs and does not depend on a machine having been seeded by hand. That is why
 * `fixtureSpec` moved into `@repo/seed`: it was the only catalogue tier living in an app, and an
 * app cannot be imported from here.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** See `interchange-roundtrip.e2e-spec.ts` — Better Auth validates Origin against trustedOrigins. */
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'revision-delta@example.com';

describe.skipIf(!hasDatabase)('Revision delta — M0 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: SeedClient;
  let projectId: string;
  const orgSlug = 'delta-co';

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
    await app.listen(0);
    const baseUrl = await app.getUrl();
    prisma = app.get(Token);

    await resetDatabase();
    projectId = await bootstrapOrganisation(baseUrl);

    client = new SeedClient({ baseUrl, origin: TRUSTED_ORIGIN });
    await client.authenticate({ email: EMAIL, password: PASSWORD });
  }, 300_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  /** Children before parents. The database is shared between specs, so this clears others' rows too. */
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarExceptionWindow.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendarShift.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  async function bootstrapOrganisation(baseUrl: string): Promise<string> {
    const request = (await import('supertest')).default;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Delta', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Delta Co' }).expect(201);
    const clientRes = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients`)
      .send({ name: 'Revision' })
      .expect(201);
    const projectRes = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients/${clientRes.body.data.id}/projects`)
      .send({ name: 'Delta' })
      .expect(201);
    void baseUrl;
    return projectRes.body.data.id as string;
  }

  it('seeds the fixture, recalculates and captures a baseline through the public API', async () => {
    const spec = fixtureSpec();
    const seeded = await seedPlan(client, { orgSlug, projectId }, spec);
    expect(seeded.planId, `fixture seed failed: ${JSON.stringify(seeded.findings)}`).not.toBeNull();
    const planId = seeded.planId!;

    // The catalogue captures no baseline (docs/TEST_PLAYBOOK.md:196), so the old side of every
    // comparison has to be created here, through the ordinary write path a planner would use.
    const captured = await client.post<{ id: string }>(
      `/api/v1/organizations/${orgSlug}/plans/${planId}/baselines`,
      { name: 'M0 old side' },
    );

    const rows = await prisma.baselineActivity.count({ where: { baselineId: captured.id } });
    const activities = await prisma.activity.count({ where: { planId, deletedAt: null } });

    // eslint-disable-next-line no-console
    console.warn(
      `M0 setup: plan ${planId} — ${activities} activities, baseline ${captured.id} froze ${rows} rows`,
    );

    expect(rows).toBeGreaterThan(0);
    expect(rows).toBe(activities);
  }, 300_000);
});
