import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { importSchedule, type InterchangeReport } from '@repo/interchange';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { OrganizationRole } from '../src/common/auth/principal';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the schedule-interchange EXPORT endpoint (ADR-0050 M4a). A plan is seeded by
 * COMMITTING an XER through the import endpoint (reusing the import-side path), then exported and the bytes
 * fed straight back through `importSchedule` — the strongest API-level correctness gate: an import → export
 * → re-import round trip must recover the activity codes and the FS dependency. Also covers the anti-IDOR
 * 404 (a member of another org targeting this plan), an unsupported format (422), and the CQ-1 grant
 * (every role can export). Verified against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

/**
 * A P6 `clndr_data` blob for a standard Mon–Fri 08:00–16:00 week (P6 day numbering 1=Sun…7=Sat), one
 * non-working New-Year exception. Mirrors the pure package fixture (and interchange.e2e-spec) so the commit
 * seeds a calendar-bearing plan without importing the package's non-barrel test helpers.
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
  const exc = `(0||d|46023()())`; // 46023 === 2026-01-01 (Excel/OLE serial)
  return `(0||CalendarData()( (0||DaysOfWeek()( ${days} )) (0||Exceptions()( ${exc} )) ))`;
}

/** A valid XER with a named calendar, two tasks on it, and one FS link — the seed for the export round-trip. */
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

/**
 * A **rich** XER exercising the M4c export scope: a nested WBS (W1 → W2), a primary constraint (CS_MSOA =
 * SNET) on the child task, a progressed task (TK_Active + %complete + actual start + remaining), and a
 * LABOUR resource with a driving assignment. Committing this seeds a plan carrying every rich dimension so
 * the export → re-import round trip can prove they survive.
 */
function richXer(): string {
  const rows = [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    '%R\tP1\tRich\t2026-01-05 00:00\t2026-01-04 00:00\tC1',
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    `%R\tC1\tSite 6-Day\tY\t8\t${standardClndrData()}`,
    '%T\tPROJWBS',
    '%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name',
    '%R\tW1\tP1\tW1\tENG\tEngineering', // parent == self → a project-root WBS.
    '%R\tW2\tP1\tW1\tDES\tDesign',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt\tstatus_code\tcstr_type\tcstr_date\tcomplete_pct\tact_start_date\tremain_drtn_hr_cnt',
    [
      '%R',
      'T1',
      'P1',
      'W1',
      'C1',
      'A1000',
      'Mobilise',
      'TT_Task',
      '40',
      'TK_NotStart',
      'CS_MSOA',
      '2026-02-01',
      '',
      '',
      '',
    ].join('\t'),
    [
      '%R',
      'T2',
      'P1',
      'W2',
      'C1',
      'A1010',
      'Detailed Design',
      'TT_Task',
      '80',
      'TK_Active',
      '',
      '',
      '40',
      '2026-01-06 00:00',
      '24',
    ].join('\t'),
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tT1\tPR_FS\t0',
    '%T\tRSRC',
    '%F\trsrc_id\trsrc_short_name\trsrc_name\trsrc_type\tclndr_id',
    '%R\tRS1\tCREW\tSite Crew\tRT_Labor\tC1',
    '%T\tTASKRSRC',
    '%F\ttaskrsrc_id\ttask_id\trsrc_id\ttarget_qty\ttarget_qty_per_hr\tdriving_flag\tact_reg_qty',
    ['%R', 'X1', 'T1', 'RS1', '40', '', 'Y', '10'].join('\t'),
    '%E',
  ];
  return rows.join('\n');
}

describe.skipIf(!hasDatabase)('Interchange export API (e2e)', () => {
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
  const commitUrl = (projectId: string) =>
    `/api/v1/organizations/acme/projects/${projectId}/interchange/commit`;
  const exportUrl = (planId: string, format = 'xer') =>
    `/api/v1/organizations/acme/plans/${planId}/interchange/export/${format}`;

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

  /** Seed a plan by committing the calendar-bearing XER; returns the new plan id. */
  async function seedPlan(actor: Actor, projectId: string): Promise<string> {
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xerWithCalendar(), 'utf8'), 'imported.xer')
      .expect(201);
    return res.body.data.planId as string;
  }

  /** Seed a plan carrying every M4c rich dimension by committing {@link richXer}; returns the plan id. */
  async function seedRichPlan(actor: Actor, projectId: string): Promise<string> {
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(richXer(), 'utf8'), 'rich.xer')
      .expect(201);
    return res.body.data.planId as string;
  }

  it('exports a plan as XER: 200, octet-stream, attachment filename, and the bytes round-trip', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planId = await seedPlan(actor, projectId);

    const res = await actor.agent
      .get(exportUrl(planId))
      .responseType('blob') // Buffer the binary body into res.body.
      .expect(200)
      .expect('Content-Type', /application\/octet-stream/);

    // Attachment with the slugified plan name ("Imported" → imported.xer).
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="imported\.xer"/);

    // The report rides in the header as compact JSON.
    const report = JSON.parse(res.headers['x-interchange-report'] as string) as InterchangeReport;
    expect(report.mapped).toMatchObject({ activities: 2, relationships: 1, calendars: 1 });

    // The strongest correctness gate: re-import the exported bytes and recover the network.
    const bytes = res.body as Buffer;
    const reimport = importSchedule({ content: new Uint8Array(bytes), filename: 'roundtrip.xer' });
    expect(reimport.ok).toBe(true);
    if (reimport.ok) {
      expect(reimport.graph.activities.map((a) => a.code).sort()).toEqual(['A1000', 'A1010']);
      expect(reimport.graph.dependencies).toHaveLength(1);
      expect(reimport.graph.dependencies[0]?.type).toBe('FS');
      expect(reimport.graph.calendars).toHaveLength(1);
    }
  });

  it('lets every member role export (200), matching the CQ-1 read grant', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planId = await seedPlan(actor, projectId);

    for (const [email, role] of [
      ['viewer@example.com', 'VIEWER'],
      ['contributor@example.com', 'CONTRIBUTOR'],
      ['planner@example.com', 'PLANNER'],
    ] as const) {
      const member = await addMember(orgId, email, role);
      await member.agent.get(exportUrl(planId)).responseType('blob').expect(200);
    }
  });

  it('404s a member of another org targeting this plan (anti-IDOR)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planId = await seedPlan(actor, projectId);

    // Outsider is Org Admin of their OWN org (so they hold interchange:export somewhere and clear the
    // coarse guard), but they are not a member of acme → the org-scope resolver 404s acme's plan.
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(exportUrl(planId)).expect(404);
  });

  it('404s an unknown plan and 400s a malformed plan id', async () => {
    const { actor } = await adminWithOrg();
    await makeProject(actor);

    await actor.agent.get(exportUrl('00000000-0000-7000-8000-000000000000')).expect(404);
    await actor.agent.get(exportUrl('not-a-uuid')).expect(400);
  });

  it('exports a plan as MSPDI (.xml, application/xml) and the bytes round-trip', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planId = await seedPlan(actor, projectId);

    const res = await actor.agent
      .get(exportUrl(planId, 'mspdi'))
      .responseType('blob')
      .expect(200)
      .expect('Content-Type', /application\/xml/);

    // Attachment with the slugified plan name + the .xml extension ("Imported" → imported.xml).
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="imported\.xml"/);

    // The report rides in the header as compact JSON and names the MSPDI format.
    const report = JSON.parse(res.headers['x-interchange-report'] as string) as InterchangeReport;
    expect(report.detectedFormat).toBe('MSPDI');
    expect(report.mapped).toMatchObject({ activities: 2, relationships: 1, calendars: 1 });

    // The strongest correctness gate: re-import the exported MSPDI bytes and recover the network.
    const bytes = res.body as Buffer;
    const reimport = importSchedule({ content: new Uint8Array(bytes), filename: 'roundtrip.xml' });
    expect(reimport.ok).toBe(true);
    if (reimport.ok) {
      expect(reimport.report.detectedFormat).toBe('MSPDI');
      expect(reimport.graph.activities.map((a) => a.code).sort()).toEqual(['A1000', 'A1010']);
      expect(reimport.graph.dependencies).toHaveLength(1);
      expect(reimport.graph.dependencies[0]?.type).toBe('FS');
      expect(reimport.graph.calendars).toHaveLength(1);
    }
  });

  it('round-trips the rich scope (WBS + constraint + progress + resource assignment) for BOTH formats (M4c)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planId = await seedRichPlan(actor, projectId);

    for (const format of ['xer', 'mspdi'] as const) {
      const res = await actor.agent.get(exportUrl(planId, format)).responseType('blob').expect(200);

      const report = JSON.parse(res.headers['x-interchange-report'] as string) as InterchangeReport;
      // The rich dimensions are reported as mapped, not dropped.
      expect(report.mapped).toMatchObject({ activities: 2, wbsSummaries: 2, constraints: 1 });
      expect(report.mapped.resources).toBe(1);
      expect(report.mapped.assignments).toBe(1);
      expect(report.drops).toEqual([]);

      const bytes = res.body as Buffer;
      const reimport = importSchedule({ content: new Uint8Array(bytes), filename: `rt.${format}` });
      expect(reimport.ok).toBe(true);
      if (!reimport.ok) continue;
      const g = reimport.graph;

      // WBS: two summaries, and the child activities are parented into the summary tree.
      const summaries = g.activities.filter((a) => a.type === 'WBS_SUMMARY');
      expect(summaries).toHaveLength(2);
      const summaryKeys = new Set(summaries.map((s) => s.key));
      const child = g.activities.find((a) => a.code === 'A1000');
      expect(child?.parentKey).not.toBeNull();
      expect(summaryKeys.has(child?.parentKey ?? '')).toBe(true);

      // Constraint: the primary SNET survives on A1000.
      expect(child?.constraintType).toBe('SNET');

      // Progress: A1010 is in progress with its percent-complete.
      const progressed = g.activities.find((a) => a.code === 'A1010');
      expect(progressed?.progress?.status).toBe('IN_PROGRESS');
      expect(progressed?.progress?.percentComplete).toBe(40);

      // Resource + assignment survive; the driving flag is XER-exact (MSP has no driving concept).
      expect(g.resources.map((r) => r.name)).toContain('Site Crew');
      expect(g.assignments).toHaveLength(1);
      if (format === 'xer') expect(g.assignments[0]?.isDriving).toBe(true);
    }
  });

  it('422s an unsupported export format (csv / json)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planId = await seedPlan(actor, projectId);

    for (const format of ['csv', 'json']) {
      const res = await actor.agent.get(exportUrl(planId, format)).expect(422);
      expect(res.body.error?.details?.reason).toBe('EXPORT_UNSUPPORTED_FORMAT');
    }
  });

  it('401s without a session', async () => {
    await request(server()).get(exportUrl('00000000-0000-7000-8000-000000000000')).expect(401);
  });
});
