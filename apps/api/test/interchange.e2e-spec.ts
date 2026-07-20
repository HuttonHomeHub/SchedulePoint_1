import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { OrganizationRole } from '../src/common/auth/principal';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the schedule-interchange dry-run endpoint (ADR-0050, C2, Task 1.4). Covers a
 * Planner parsing a valid XER (200 + counts), a file with repairs (200 + reported repairs), an
 * unrecognised file (422), an oversize file (413 boundary cap), and the authz matrix: Viewer/Contributor
 * lacking `interchange:import` (403), a member of another org targeting this project (404 IDOR), a missing
 * project (404), a malformed id (400), and no session (401). Stateless: no plan is created. Verified
 * against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

/** A minimal well-formed single-project, two-activity, one-relationship XER. */
function validXer(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tT1\tPR_FS\t0',
    '%E',
  ].join('\n');
}

/** Valid XER with a dangling edge (successor references a missing task) → repaired + reported. */
function xerWithDanglingEdge(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tOne\tTT_Task\t8',
    '%R\tT2\tP1\tA1010\tTwo\tTT_Task\t8',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tGHOST\tPR_FS\t0',
    '%E',
  ].join('\n');
}

describe.skipIf(!hasDatabase)('Interchange dry-run API (e2e)', () => {
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
    // FK-safe order: children before parents. The commit endpoint (Task 1.5) creates
    // plans/activities/dependencies/calendars, so these must be cleared before projects.
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
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
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const dryRunUrl = (projectId: string) =>
    `/api/v1/organizations/acme/projects/${projectId}/interchange/dry-run`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  /** A project under a new client in acme. Returns its id. */
  async function makeProject(actor: Actor): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Riverside Holdings' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    return project.body.data.id as string;
  }

  async function addMember(orgId: string, email: string, role: OrganizationRole): Promise<Actor> {
    const user = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: user.userId, role } });
    return user;
  }

  it('parses a valid XER for a Planner and returns the report counts (no plan created)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');

    const res = await planner.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(200);

    expect(res.body.data).toMatchObject({
      detectedFormat: 'XER',
      sourceFilename: 'sample.xer',
      mapped: { activities: 2, relationships: 1, calendars: 0 },
    });
    expect(res.body.data.repairs).toEqual([]);
  });

  it('reports repairs for a file with a dangling edge (still 200)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const res = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(xerWithDanglingEdge(), 'utf8'), 'repairs.xer')
      .expect(200);

    expect(res.body.data.mapped.relationships).toBe(0);
    expect(
      (res.body.data.repairs as { detail: string }[]).some((r) => r.detail.includes('dangling')),
    ).toBe(true);
  });

  it('422s an unrecognised/garbage file (nothing created)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const res = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from('not an xer at all', 'utf8'), 'junk.txt')
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('UNPARSEABLE_FILE');
  });

  it('413s an oversize upload at the boundary (before parsing)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    // 17 MiB > the 16 MiB boundary cap → the multipart interceptor rejects it.
    const oversize = Buffer.alloc(17 * 1024 * 1024, 0x41);
    await actor.agent.post(dryRunUrl(projectId)).attach('file', oversize, 'huge.xer').expect(413);
  });

  it('403s a Viewer and a Contributor (lack interchange:import), but the endpoint still exists', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const viewer = await addMember(orgId, 'viewer@example.com', 'VIEWER');
    await viewer.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(403);

    const contributor = await addMember(orgId, 'contributor@example.com', 'CONTRIBUTOR');
    await contributor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(403);
  });

  it('404s a member of another org targeting this project (anti-IDOR)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    // Outsider is Org Admin of their OWN org (so they hold interchange:import somewhere and clear the
    // coarse guard), but they are not a member of acme → the org-scope resolver 404s acme's project.
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(404);
  });

  it('404s a well-formed but unknown project, and 400s a malformed id', async () => {
    const { actor } = await adminWithOrg();
    await makeProject(actor);

    await actor.agent
      .post(dryRunUrl('00000000-0000-7000-8000-000000000000'))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(404);
    await actor.agent
      .post(dryRunUrl('not-a-uuid'))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(400);
  });

  it('401s without a session', async () => {
    await request(server())
      .post(dryRunUrl('00000000-0000-7000-8000-000000000000'))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(401);
  });
});
