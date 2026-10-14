import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { pairwiseSuite } from '@repo/seed';
import { PenHolder, SeedClient, seedPlan } from '@repo/seed-http';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../../src/app-setup';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { clearDomainData } from '../audit-reset';

/**
 * **The database the backup round trip proves** (ADR-0192; `scripts/backup-restore-check.sh`).
 *
 * A backup check against an empty database proves nothing, and the API e2e suite and the pairwise
 * differential both sweep their rows away when they finish (`clearDomainData` in `afterAll`), so by the
 * time CI reaches the round trip the database holds no plans at all. This spec exists to leave behind
 * a database worth restoring: generated pairwise plans (calendars, resources, constraints and
 * dependency types varied), a captured baseline and the audit trail all of that wrote — every table `backup-restore-check.sh` requires non-empty.
 *
 * **It deliberately leaves its rows in place**, the reverse of every other spec here, so it must be the
 * last thing to use the database before the round trip. It resets first, so running it twice is safe,
 * and `scripts/e2e-local.sh backup` runs it for you. Like the pairwise differential it seeds over real
 * HTTP through `@repo/seed-http` — an ordinary client obeying every DTO, guard and lock — rather than
 * writing rows directly, so what is backed up is what the application actually produces.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'backup-fixture@example.com';
const ORG = 'backup-co';
/**
 * Enough generated plans to put several constraint, calendar and link shapes in the copy. Twelve rather
 * than the P6 torture fixture (147 activities, 188 links) because that fixture took ~4.5 minutes to seed
 * over HTTP — measured here — and a round trip does not need volume to be exact; it needs every table
 * written to.
 */
const PAIRWISE_PLANS = 12;

describe.skipIf(!hasDatabase)('Backup fixture (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../../src/app.module');
    const { PrismaService: Token } = await import('../../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    // A real socket, because the seeder is a `fetch` client (see the pairwise differential).
    await app.listen(0);
    prisma = app.get(Token);
  }, 120_000);

  afterAll(async () => {
    // No reset: leaving the rows is the point. Closing the app releases its connections, which the
    // round trip asserts (it needs a quiet database).
    await app?.close();
  });

  it('leaves a database with real data in every table the round trip requires', async () => {
    await clearDomainData(prisma);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Backup Fixture', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Backup Co' }).expect(201);
    const clientRes = await agent
      .post(`/api/v1/organizations/${ORG}/clients`)
      .send({ name: 'Backed up' })
      .expect(201);
    const projectRes = await agent
      .post(`/api/v1/organizations/${ORG}/clients/${clientRes.body.data.id}/projects`)
      .send({ name: 'Fixture plans' })
      .expect(201);
    const target = { orgSlug: ORG, projectId: projectRes.body.data.id as string };

    const client = new SeedClient({ baseUrl: await app.getUrl(), origin: TRUSTED_ORIGIN });
    await client.authenticate({ email: EMAIL, password: PASSWORD });

    const planIds: string[] = [];
    for (const c of pairwiseSuite().cases.slice(0, PAIRWISE_PLANS)) {
      const seeded = await seedPlan(client, target, c.spec);
      expect(seeded.findings, `${c.caseId} seeded cleanly`).toEqual([]);
      expect(seeded.planId, `${c.caseId} was created`).not.toBeNull();
      planIds.push(seeded.planId!);
    }

    // One row in each table the generated plans do not reach, written through the same API a planner
    // uses (and under the pen, as any plan edit is). The round trip requires each of these non-empty.
    const org = `/api/v1/organizations/${ORG}`;
    const planId = planIds[0]!;
    await PenHolder.withPen(client, ORG, planId, async () => {
      const activities = await client.get<{ id: string; version: number }[]>(
        `${org}/plans/${planId}/activities?limit=100`,
      );
      const activity = activities[0];
      expect(activity, 'the first fixture plan has an activity').toBeDefined();
      await client.post(`${org}/plans/${planId}/notes`, { body: 'Backup fixture: a plan note' });
      await client.post(`${org}/activities/${activity!.id}/notes`, {
        body: 'Backup fixture: an activity note',
      });
      await client.put(`${org}/activities/${activity!.id}/steps`, {
        version: activity!.version,
        steps: [
          { name: 'Prepare', weight: 1, percentComplete: 100 },
          { name: 'Install', weight: 3, percentComplete: 25 },
        ],
      });
      const calendars = await client.get<{ id: string }[]>(`${org}/calendars?limit=100`);
      await client.post(`${org}/calendars/${calendars[0]!.id}/exceptions`, {
        date: '2026-12-25',
        label: 'Backup fixture holiday',
      });
      await client.post(`${org}/plans/${planId}/shares`, { label: 'Backup fixture link' });
      // After the edits above, so the baseline snapshots the plan as it ends up.
      await client.post(`${org}/plans/${planId}/baselines`, { name: 'Backup fixture baseline' });
    });

    // The round trip asserts these again against the source; asserting here puts the failure in the
    // step that caused it rather than in the one that noticed.
    const counts = {
      organizations: await prisma.organization.count(),
      users: await prisma.user.count(),
      plans: await prisma.plan.count(),
      activities: await prisma.activity.count(),
      dependencies: await prisma.activityDependency.count(),
      calendars: await prisma.calendar.count(),
      calendarShifts: await prisma.calendarShift.count(),
      baselines: await prisma.baseline.count(),
      auditEvents: await prisma.auditEvent.count(),
      notes: await prisma.note.count(),
      planShares: await prisma.planShare.count(),
      calendarExceptions: await prisma.calendarException.count(),
      activitySteps: await prisma.activityStep.count(),
      resources: await prisma.resource.count(),
      resourceAssignments: await prisma.resourceAssignment.count(),
      baselineActivities: await prisma.baselineActivity.count(),
    };
    for (const [table, n] of Object.entries(counts)) {
      expect(n, `${table} is not empty`).toBeGreaterThan(0);
    }
  }, 300_000);
});
