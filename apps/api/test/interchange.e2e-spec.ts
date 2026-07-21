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

/**
 * A P6 `clndr_data` blob for a standard Mon–Fri 08:00–16:00 week (P6 day numbering 1=Sun…7=Sat), with
 * one non-working New-Year exception (Excel/OLE serial). Mirrors the pure package's fixture so the commit
 * e2e can exercise calendar creation without importing the package's (non-barrel) test helpers.
 */
function standardClndrData(): string {
  const workDay = (day: number): string => `(0||${day}()( (0||0(s|08:00|f|16:00)) ))`;
  const restDay = (day: number): string => `(0||${day}()())`;
  const days = [
    restDay(1),
    workDay(2),
    workDay(3),
    workDay(4),
    workDay(5),
    workDay(6),
    restDay(7),
  ].join('');
  // 46023 === 2026-01-01 (Excel/OLE serial, base 1899-12-30) — a non-working exception.
  const exc = `(0||d|46023()())`;
  return `(0||CalendarData()( (0||DaysOfWeek()( ${days} )) (0||Exceptions()( ${exc} )) ))`;
}

/**
 * A valid XER with a named calendar (NOT "Standard", to avoid colliding with the org-seeded calendar),
 * two tasks on it, and one FS link — the calendar-bearing happy-path fixture for commit.
 */
function xerWithCalendar(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    '%R\tP1\tImported\t2026-01-05 00:00\t2026-01-04 00:00\tC1',
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    `%R\tC1\tSite 6-Day\tY\t8\t${standardClndrData()}`,
    '%T\tTASK',
    '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tC1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tC1\tA1010\tDesign\tTT_Task\t80',
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

/**
 * A rich M2 XER (ADR-0038/0039/0040/0035): a 2-level WBS (Engineering → Design), three real tasks under
 * it, a primary + secondary constraint on one, an in-progress progressed task, a labour + a material
 * resource on a named calendar, and two assignments on the resource-dependent task (labour driving, the
 * material non-driving). Exercises the whole M2 persistence path — WBS parentage, constraints, progress,
 * resolve-or-create resources, and driving assignments.
 */
function richXer(): string {
  // Tab-join rows so empty (undefined) fields are explicit — every row matches its %F column count.
  const row = (...fields: string[]): string => `%R\t${fields.join('\t')}`;
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    row('P1', 'Rich', '2026-01-05 00:00', '2026-01-04 00:00', 'C1'),
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    row('C1', 'Site 6-Day', 'Y', '8', standardClndrData()),
    '%T\tPROJWBS',
    '%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name',
    row('W1', 'P1', '', 'ENG', 'Engineering'), // root: no parent
    row('W2', 'P1', 'W1', 'DES', 'Design'), // child of W1
    '%T\tTASK',
    '%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt\tcstr_type\tcstr_date\tcstr_type2\tcstr_date2\tstatus_code\tcomplete_pct\tact_start_date\tremain_drtn_hr_cnt',
    // T1 under W1: primary SNET (CS_MSOA) + secondary FNLT (CS_MEOB).
    row(
      'T1',
      'P1',
      'W1',
      'C1',
      'A100',
      'Foundations',
      'TT_Task',
      '40',
      'CS_MSOA',
      '2026-02-01 00:00',
      'CS_MEOB',
      '2026-03-01 00:00',
      '',
      '',
      '',
      '',
    ),
    // T2 under W1: in-progress (actual start, 50% complete, 20h remaining).
    row(
      'T2',
      'P1',
      'W1',
      'C1',
      'A110',
      'Excavate',
      'TT_Task',
      '40',
      '',
      '',
      '',
      '',
      'TK_Active',
      '50',
      '2026-01-05 00:00',
      '20',
    ),
    // T3 under W2: resource-dependent (schedules on its driving resource's calendar).
    row('T3', 'P1', 'W2', 'C1', 'A120', 'Pour', 'TT_Rsrc', '80', '', '', '', '', '', '', '', ''),
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    row('R1', 'T2', 'T1', 'PR_FS', '0'),
    '%T\tRSRC',
    '%F\trsrc_id\trsrc_name\trsrc_short_name\trsrc_type\tclndr_id',
    row('RA', 'Site Crew', 'CREW-A', 'RT_Labor', 'C1'), // labour, on the calendar
    row('RB', 'Ready-Mix', 'MAT-C', 'RT_Mat', ''), // material, no calendar
    '%T\tTASKRSRC',
    '%F\ttaskrsrc_id\ttask_id\trsrc_id\ttarget_qty\tdriving_flag',
    row('X1', 'T3', 'RA', '40', 'Y'), // labour drives T3
    row('X2', 'T3', 'RB', '10', 'N'), // material, non-driving
    '%E',
  ].join('\n');
}

/**
 * A calendar-free resource XER for the resource-reuse re-import: one task with a labour (driving) + a
 * material (non-driving) assignment on two coded resources (CREW-A / MAT-C), no CALENDAR table. Because
 * the M1 commit always creates NEW calendars (there is no calendar resolve-or-create), a calendar-bearing
 * file cannot be re-imported into the same org (its calendar name collides); this fixture isolates the
 * RESOURCE resolve-or-create path so a same-org re-import reuses the two resources by code.
 */
function resourceOnlyXer(): string {
  const row = (...fields: string[]): string => `%R\t${fields.join('\t')}`;
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    row('P1', 'Resourced', '2026-01-05 00:00', '2026-01-04 00:00'),
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    row('T1', 'P1', 'A100', 'Build', 'TT_Task', '40'),
    '%T\tRSRC',
    '%F\trsrc_id\trsrc_name\trsrc_short_name\trsrc_type',
    row('RA', 'Site Crew', 'CREW-A', 'RT_Labor'),
    row('RB', 'Ready-Mix', 'MAT-C', 'RT_Mat'),
    '%T\tTASKRSRC',
    '%F\ttaskrsrc_id\ttask_id\trsrc_id\ttarget_qty\tdriving_flag',
    row('X1', 'T1', 'RA', '40', 'Y'), // labour drives
    row('X2', 'T1', 'RB', '10', 'N'), // material, non-driving
    '%E',
  ].join('\n');
}

/**
 * A large but well-formed XER for the commit timing test (ADR-0050 B3): `nTasks` activities on a chain
 * (T1→T2→…) plus `nSkip` extra Ti→Ti+2 edges — all unique and acyclic — so the batched commit is
 * exercised near the product ceiling (~2,000 activities, ~2,600 relationships) and proven to persist
 * well under Prisma's default 5s interactive-transaction timeout.
 */
function largeXer(nTasks: number, nSkip: number): string {
  const lines: string[] = [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tLarge\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
  ];
  for (let i = 1; i <= nTasks; i += 1) {
    lines.push(`%R\tT${i}\tP1\tA${i}\tTask ${i}\tTT_Task\t8`);
  }
  lines.push('%T\tTASKPRED', '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt');
  let r = 0;
  for (let i = 1; i < nTasks; i += 1) {
    r += 1;
    lines.push(`%R\tR${r}\tT${i + 1}\tT${i}\tPR_FS\t0`); // Ti → Ti+1 (chain)
  }
  for (let i = 1; i <= nSkip && i + 2 <= nTasks; i += 1) {
    r += 1;
    lines.push(`%R\tR${r}\tT${i + 2}\tT${i}\tPR_FS\t0`); // Ti → Ti+2 (skip)
  }
  lines.push('%E');
  return lines.join('\n');
}

describe.skipIf(!hasDatabase)('Interchange API (e2e)', () => {
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
    // FK-safe order: children before parents. The commit endpoint creates plans/activities/dependencies/
    // calendars (Task 1.5) and, from M2, resources + assignments (ADR-0039) — cleared before projects.
    // Assignments reference activities AND resources, so they go first.
    await prisma.resourceAssignment.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.resource.deleteMany();
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
  const commitUrl = (projectId: string) =>
    `/api/v1/organizations/acme/projects/${projectId}/interchange/commit`;

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
    const res = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', oversize, 'huge.xer')
      .expect(413);
    expect(res.body.error?.code).toBe('PAYLOAD_TOO_LARGE');
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

  // ---- commit (Task 1.5) --------------------------------------------------

  it('commits a calendar-bearing XER for a Planner → 201, plan created + recalculated', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');

    const res = await planner.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xerWithCalendar(), 'utf8'), 'imported.xer')
      .expect(201);

    // The response carries the new plan id and the interchange report.
    const planId = res.body.data.planId as string;
    expect(planId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.data.report).toMatchObject({
      detectedFormat: 'XER',
      mapped: { activities: 2, relationships: 1, calendars: 1 },
    });

    // The plan exists in the target project with the imported data date and a default calendar.
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.projectId).toBe(projectId);
    expect(plan.deletedAt).toBeNull();
    expect(plan.calendarId).not.toBeNull();
    // Recalculated in phase 2: the freshness cursor is stamped.
    expect(plan.scheduleComputedAt).not.toBeNull();

    // The right counts persisted, scoped to the new plan.
    const [activities, dependencies] = await Promise.all([
      prisma.activity.findMany({ where: { planId }, orderBy: { laneIndex: 'asc' } }),
      prisma.activityDependency.count({ where: { planId } }),
    ]);
    expect(activities).toHaveLength(2);
    expect(dependencies).toBe(1);
    // The imported calendar (named to avoid the seeded "Standard") was created in the org.
    expect(
      await prisma.calendar.count({ where: { organizationId: orgId, name: 'Site 6-Day' } }),
    ).toBe(1);
    // Deterministic lanes: sequential by source order (0, 1).
    expect(activities.map((a) => a.laneIndex)).toEqual([0, 1]);
    // Recalculated: the engine wrote early dates onto the activities.
    expect(activities.every((a) => a.earlyStart !== null)).toBe(true);
  });

  it('commits a plain multi-activity XER → 201 with matching counts (no calendars)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(201);

    const planId = res.body.data.planId as string;
    expect(res.body.data.report.mapped).toEqual({ activities: 2, relationships: 1, calendars: 0 });
    expect(await prisma.activity.count({ where: { planId } })).toBe(2);
    expect(await prisma.activityDependency.count({ where: { planId } })).toBe(1);
  });

  it('commits a large XER (~2,000 activities) well under the transaction timeout', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const xer = largeXer(2000, 600); // 2,000 activities, 2,599 relationships
    const started = Date.now();
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xer, 'utf8'), 'large.xer')
      .expect(201);
    const elapsedMs = Date.now() - started;
    // eslint-disable-next-line no-console
    console.log(`[interchange] large commit (2000 activities / 2599 deps) took ${elapsedMs}ms`);

    const planId = res.body.data.planId as string;
    expect(res.body.data.report.mapped).toEqual({
      activities: 2000,
      relationships: 2599,
      calendars: 0,
    });
    expect(await prisma.activity.count({ where: { planId } })).toBe(2000);
    expect(await prisma.activityDependency.count({ where: { planId } })).toBe(2599);
    // The whole request (batched persist + recalc) stays comfortably under a generous CI bound; the
    // persist transaction alone is a handful of `createMany`s, far under the 5s interactive-txn timeout.
    expect(elapsedMs).toBeLessThan(60_000);
  }, 60_000);

  it('rolls back the whole transaction when a create fails mid-way (nothing created)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    // First commit succeeds and creates a plan named after the source project ("Sample").
    await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(201);
    const afterFirst = await prisma.plan.count({ where: { projectId } });
    expect(afterFirst).toBe(1);

    // Committing the SAME file into the SAME project collides on the per-project plan name (409). The
    // plan.create fails mid-transaction, so nothing from the second attempt is persisted.
    await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(409);

    // Still exactly one plan and one plan's worth of activities/dependencies — the failed commit
    // created nothing.
    expect(await prisma.plan.count({ where: { projectId } })).toBe(1);
    const planId = (await prisma.plan.findFirstOrThrow({ where: { projectId } })).id;
    expect(await prisma.activity.count({ where: { planId } })).toBe(2);
    expect(await prisma.activityDependency.count({ where: { planId } })).toBe(1);
  });

  it('422s an unrecognised file on commit (nothing created)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from('not an xer at all', 'utf8'), 'junk.txt')
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('UNPARSEABLE_FILE');
    expect(await prisma.plan.count({ where: { projectId } })).toBe(0);
  });

  it('403s a Viewer and a Contributor on commit (lack interchange:import)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const viewer = await addMember(orgId, 'viewer@example.com', 'VIEWER');
    await viewer.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(403);

    const contributor = await addMember(orgId, 'contributor@example.com', 'CONTRIBUTOR');
    await contributor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(403);

    expect(await prisma.plan.count({ where: { projectId } })).toBe(0);
  });

  it('404s a member of another org committing to this project (anti-IDOR)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(404);

    expect(await prisma.plan.count({ where: { projectId } })).toBe(0);
  });

  // ---- M2 rich import (WBS + constraints + progress + resources + assignments) ---------------------

  /** A second project under a fresh client in acme (for the resource-reuse re-import). Returns its id. */
  async function makeSecondProject(actor: Actor): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate Partners' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Northgate' })
      .expect(201);
    return project.body.data.id as string;
  }

  it('dry-runs then commits a rich M2 XER: WBS, constraints, progress, resources, assignments', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    // Dry-run first: the report surfaces the M2 counts (WBS summaries, constraints, resources, assignments).
    const dry = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(richXer(), 'utf8'), 'rich.xer')
      .expect(200);
    expect(dry.body.data.mapped).toEqual({
      activities: 3, // real (non-summary) activities
      relationships: 1,
      calendars: 1,
      wbsSummaries: 2,
      constraints: 2, // T1's primary + secondary
      resources: 2,
      assignments: 2,
    });

    // Commit persists the whole graph and recalculates.
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(richXer(), 'utf8'), 'rich.xer')
      .expect(201);
    const planId = res.body.data.planId as string;
    expect(res.body.data.report.mapped.wbsSummaries).toBe(2);

    const activities = await prisma.activity.findMany({ where: { planId } });

    // WBS: two WBS_SUMMARY activities, and a real task carries a parentId pointing at a summary.
    const summaries = activities.filter((a) => a.type === 'WBS_SUMMARY');
    expect(summaries).toHaveLength(2);
    const pour = activities.find((a) => a.code === 'A120');
    expect(pour?.type).toBe('RESOURCE_DEPENDENT');
    expect(pour?.parentId).not.toBeNull();
    expect(summaries.some((s) => s.id === pour?.parentId)).toBe(true);
    // At least one summary actually has children (parentId set on other rows).
    const summaryIds = new Set(summaries.map((s) => s.id));
    expect(activities.some((a) => a.parentId !== null && summaryIds.has(a.parentId))).toBe(true);

    // Constraints: the foundations task carries both a primary and a secondary constraint.
    const foundations = activities.find((a) => a.code === 'A100');
    expect(foundations?.constraintType).toBe('SNET'); // CS_MSOA → SNET
    expect(foundations?.secondaryConstraintType).toBe('FNLT'); // CS_MEOB → FNLT
    expect(foundations?.constraintDate).not.toBeNull();
    expect(foundations?.secondaryConstraintDate).not.toBeNull();

    // Progress: the excavate task is in progress with an actual start.
    const excavate = activities.find((a) => a.code === 'A110');
    expect(excavate?.status).toBe('IN_PROGRESS');
    expect(excavate?.actualStart).not.toBeNull();
    expect(excavate?.percentComplete).toBe(50);

    // Resources: both were created org-scoped; assignments join them to the pour task with one driver.
    expect(await prisma.resource.count({ where: { organizationId: orgId, deletedAt: null } })).toBe(
      2,
    );
    const assignments = await prisma.resourceAssignment.findMany({
      where: { activity: { planId } },
    });
    expect(assignments).toHaveLength(2);
    expect(assignments.filter((a) => a.isDriving)).toHaveLength(1);
    const driving = assignments.find((a) => a.isDriving);
    expect(driving?.activityId).toBe(pour?.id);
  });

  it('reuses existing org resources on a re-import into the same org (no duplicate, no P2002)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const firstProjectId = await makeProject(actor);

    // First import creates the two resources (matched later by their codes CREW-A / MAT-C).
    await actor.agent
      .post(commitUrl(firstProjectId))
      .attach('file', Buffer.from(resourceOnlyXer(), 'utf8'), 'resourced.xer')
      .expect(201);
    expect(await prisma.resource.count({ where: { organizationId: orgId, deletedAt: null } })).toBe(
      2,
    );

    // Re-importing the same file into a DIFFERENT project in the SAME org reuses the two resources —
    // the resolve-or-create step matches them by code, so no new rows and no unique-violation (P2002).
    const secondProjectId = await makeSecondProject(actor);
    const res = await actor.agent
      .post(commitUrl(secondProjectId))
      .attach('file', Buffer.from(resourceOnlyXer(), 'utf8'), 'resourced.xer')
      .expect(201);

    // Still exactly two resources — the re-import reused them rather than duplicating.
    expect(await prisma.resource.count({ where: { organizationId: orgId, deletedAt: null } })).toBe(
      2,
    );

    // The second plan's driving assignment points at the SAME (reused) resource row as the first.
    const secondPlanId = res.body.data.planId as string;
    const [firstDriving, secondDriving] = await Promise.all([
      prisma.resourceAssignment.findFirst({
        where: { activity: { plan: { projectId: firstProjectId } }, isDriving: true },
      }),
      prisma.resourceAssignment.findFirst({
        where: { activity: { planId: secondPlanId }, isDriving: true },
      }),
    ]);
    expect(secondDriving?.resourceId).toBe(firstDriving?.resourceId);
  });
});
