import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { OrganizationRole } from '../src/common/auth/principal';
import { acquireCalendarWriteLock } from '../src/common/db/calendar-advisory-lock';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

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
function standardClndrData(
  options: { saturdayWorks?: boolean; exceptionSerial?: number } = {},
): string {
  const workDay = (day: number): string => `(0||${day}()( (0||0(s|08:00|f|16:00)) ))`;
  const restDay = (day: number): string => `(0||${day}()())`;
  const days = [
    restDay(1),
    workDay(2),
    workDay(3),
    workDay(4),
    workDay(5),
    workDay(6),
    options.saturdayWorks === true ? workDay(7) : restDay(7),
  ].join('');
  // 46023 === 2026-01-01 (Excel/OLE serial, base 1899-12-30) — a non-working exception.
  const exc = `(0||d|${options.exceptionSerial ?? 46023}()())`;
  return `(0||CalendarData()( (0||DaysOfWeek()( ${days} )) (0||Exceptions()( ${exc} )) ))`;
}

/**
 * A valid XER with a named calendar (NOT "Standard", to avoid colliding with the org-seeded calendar),
 * two tasks on it, and one FS link — the calendar-bearing happy-path fixture for commit. The project
 * name is parameterised so two files can be imported into ONE project (plan names are unique per
 * project) while deliberately sharing a CALENDAR name — the ADR-0053 §5 collision case. `clndrData`
 * lets a second file carry the SAME name with a DIFFERENT working week (ADR-0208: same name is not
 * enough to reuse; identical content is).
 */
function xerWithCalendar(projectName = 'Imported', clndrData = standardClndrData()): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    `%R\tP1\t${projectName}\t2026-01-05 00:00\t2026-01-04 00:00\tC1`,
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    `%R\tC1\tSite 6-Day\tY\t8\t${clndrData}`,
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

/** Two project calendars of ONE name and identical content, each used by a task (ADR-0208 claim rule). */
function twoIdenticalCalendarsXer(projectName: string): string {
  const data = standardClndrData();
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    `%R\tP1\t${projectName}\t2026-01-05 00:00\t2026-01-04 00:00\tC1`,
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    `%R\tC1\tSite 6-Day\tY\t8\t${data}`,
    `%R\tC2\tSite 6-Day\tN\t8\t${data}`,
    '%T\tTASK',
    '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tC1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tC2\tA1010\tDesign\tTT_Task\t80',
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
 * material (non-driving) assignment on two coded resources (CREW-A / MAT-C), no CALENDAR table. The
 * commit still always CREATES calendars — an import never reuses one (ADR-0053 §5) — it just no longer
 * collides on the name (a taken name is suffixed + reported); this fixture keeps the RESOURCE
 * resolve-or-create path isolated from that, so a same-org re-import reuses the two resources by code.
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
 * The same two resource NAMES as {@link resourceOnlyXer} under DIFFERENT codes — the resource-name
 * collision. Nothing identifies these as the rows already in the library (the codes miss), but the
 * org-unique `uq_resources_org_name` will refuse the insert, so the import must ask rather than guess.
 * Before the collision prompt existed, importing this after `resourceOnlyXer` was a flat 409.
 */
function collidingResourceXer(): string {
  return resourceOnlyXer().replace('CREW-A', 'CREW-Z').replace('MAT-C', 'MAT-Z');
}

/**
 * A three-calendar XER exercising every `clndr_type` (ADR-0053 §5): a project calendar an activity uses,
 * a P6 GLOBAL (`CA_Base`) calendar, and a RESOURCE (`CA_Rsrc`) calendar an imported labour resource
 * holds. The three land at three different places, which is the whole point of the M5 mapping.
 */
function tieredCalendarXer(planName = 'Tiered', clndrData = standardClndrData()): string {
  const row = (...fields: string[]): string => `%R\t${fields.join('\t')}`;
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    row('P1', planName, '2026-01-05 00:00', '2026-01-04 00:00', 'C1'),
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tclndr_type\tdefault_flag\tday_hr_cnt\tclndr_data',
    row('C1', 'Site 6-Day', 'CA_Project', 'Y', '8', clndrData),
    row('C2', 'Enterprise 5-Day', 'CA_Base', 'N', '8', clndrData),
    row('C3', 'Crew Shift', 'CA_Rsrc', 'N', '8', clndrData),
    '%T\tTASK',
    '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    row('T1', 'P1', 'C1', 'A100', 'Mobilise', 'TT_Task', '40'),
    row('T2', 'P1', 'C2', 'A110', 'Design', 'TT_Task', '40'),
    '%T\tRSRC',
    '%F\trsrc_id\trsrc_name\trsrc_short_name\trsrc_type\tclndr_id',
    row('RA', 'Site Crew', 'CREW-A', 'RT_Labor', 'C3'), // holds the CA_Rsrc calendar
    '%T\tTASKRSRC',
    '%F\ttaskrsrc_id\ttask_id\trsrc_id\ttarget_qty\tdriving_flag',
    row('X1', 'T1', 'RA', '40', 'N'),
    '%E',
  ].join('\n');
}

/** One crew (RSRC row) in {@link crewXer}; `calendar` is a calendar id the file defines, or null for none. */
interface CrewXerCrew {
  id: string;
  name: string;
  code: string | null;
  calendar: string | null;
}

/**
 * A crew-bearing XER whose parts vary one at a time, for the ADR-0208 D7 matrix (a calendar only matched
 * resources hold is not created). `C1` "Site 6-Day" is the project calendar both tasks use unless
 * `secondTaskCalendar` / `planCalendar` say otherwise; `C3` "Crew Shift" and the optional `C4` "Night
 * Shift" are `CA_Rsrc` calendars crews hold. The default crew is {@link tieredCalendarXer}'s own
 * (`Site Crew`, code `CREW-A`, holding `C3`), so a second file with only `crewData` changed is the #554
 * case.
 */
function crewXer(
  options: {
    planName?: string;
    siteData?: string;
    crewData?: string;
    nightData?: string;
    crews?: CrewXerCrew[];
    secondTaskCalendar?: string;
    planCalendar?: string;
  } = {},
): string {
  const row = (...fields: string[]): string => `%R\t${fields.join('\t')}`;
  const crews = options.crews ?? [{ id: 'RA', name: 'Site Crew', code: 'CREW-A', calendar: 'C3' }];
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    row(
      'P1',
      options.planName ?? 'Crewed',
      '2026-01-05 00:00',
      '2026-01-04 00:00',
      options.planCalendar ?? 'C1',
    ),
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tclndr_type\tdefault_flag\tday_hr_cnt\tclndr_data',
    row('C1', 'Site 6-Day', 'CA_Project', 'Y', '8', options.siteData ?? standardClndrData()),
    row('C3', 'Crew Shift', 'CA_Rsrc', 'N', '8', options.crewData ?? standardClndrData()),
    ...(options.nightData === undefined
      ? []
      : [row('C4', 'Night Shift', 'CA_Rsrc', 'N', '8', options.nightData)]),
    '%T\tTASK',
    '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    row('T1', 'P1', 'C1', 'A100', 'Mobilise', 'TT_Task', '40'),
    row('T2', 'P1', options.secondTaskCalendar ?? 'C1', 'A110', 'Design', 'TT_Task', '40'),
    '%T\tRSRC',
    '%F\trsrc_id\trsrc_name\trsrc_short_name\trsrc_type\tclndr_id',
    ...crews.map((crew) =>
      row(crew.id, crew.name, crew.code ?? '', 'RT_Labor', crew.calendar ?? ''),
    ),
    '%T\tTASKRSRC',
    '%F\ttaskrsrc_id\ttask_id\trsrc_id\ttarget_qty\tdriving_flag',
    ...crews.slice(0, 1).map((crew) => row('X1', 'T1', crew.id, '40', 'N')),
    '%E',
  ].join('\n');
}

/**
 * The MSPDI equivalent of {@link crewXer}'s default: one crew with a `<Code>` holding its own calendar.
 * MSPDI goes through the same mapper, so a code match must leave out the crew's calendar the same way
 * (spec F16 was read, not run, until this fixture).
 */
function crewMspdi(planName: string, crewSaturdayWorks: boolean): string {
  const weekDays = (saturdayWorks: boolean): string =>
    [1, 2, 3, 4, 5, 6, 7]
      .map((dayType) => {
        const working = dayType >= 2 && dayType <= 6 ? true : dayType === 7 && saturdayWorks;
        const times = working
          ? '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes>'
          : '';
        return `<WeekDay><DayType>${dayType}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>${times}</WeekDay>`;
      })
      .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    '<UID>P1</UID>',
    `<Name>${planName}</Name>`,
    '<SaveVersion>14</SaveVersion>',
    '<CurrentDate>2026-01-05T00:00:00</CurrentDate>',
    '<CalendarUID>1</CalendarUID>',
    '<Calendars>',
    `<Calendar><UID>1</UID><Name>Site 6-Day</Name><WeekDays>${weekDays(false)}</WeekDays></Calendar>`,
    `<Calendar><UID>3</UID><Name>Crew Shift</Name><WeekDays>${weekDays(crewSaturdayWorks)}</WeekDays></Calendar>`,
    '</Calendars>',
    '<Tasks>',
    '<Task><UID>1</UID><Name>Mobilise</Name><Duration>PT40H0M0S</Duration></Task>',
    '<Task><UID>2</UID><Name>Design</Name><Duration>PT40H0M0S</Duration></Task>',
    '</Tasks>',
    '<Resources>',
    '<Resource><UID>1</UID><Name>Site Crew</Name><Type>1</Type><Code>CREW-A</Code><CalendarUID>3</CalendarUID></Resource>',
    '</Resources>',
    '<Assignments></Assignments>',
    '</Project>',
  ].join('');
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
  let throttlerStorage: ThrottlerStorage;

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
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
  });

  async function resetDatabase(): Promise<void> {
    // FK-safe order: children before parents. The commit endpoint creates plans/activities/dependencies/
    // calendars (Task 1.5) and, from M2, resources + assignments (ADR-0039) — cleared before projects.
    // Assignments reference activities AND resources, so they go first.
    // Weighted steps hold `activity_id` (ADR-0044 §33), and they are the THIRD table to fail this
    // way — after `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a). Found the
    // same way and recorded here rather than in one file: a full API run on 2026-08-31 failed 282
    // tests across 10 files in `beforeEach` on `activity_steps_activity_id_fkey`, and by the time
    // anyone looked the database was clean, because a later suite in the same run had swept it.
    // The log was kept, which is the only reason this was diagnosable at all.
    // Baselines and their snapshot rows hold `plan_id` / `baseline_id` (ADR-0025), and they are the
    // FOURTH table to fail this way — after `plan_shares`, `resource_assignments` and
    // `activity_steps` (`docs/TECH_DEBT.md` #119a). Found on 2026-09-01, when a full API run failed
    // all 45 tests in `activities.e2e-spec.ts` on `baselines_plan_id_fkey`: 25 of 33 plan-sweeping
    // specs deleted plans without deleting baselines first, so a baseline surviving in the shared
    // `app_test` poisons whichever spec sweeps next. **Which writer left it is not claimed** — the
    // log names the constraint and not the producer, and every in-suite creator sweeps (directly, or
    // via `clearDomainData`), so the residue came from outside this run: an earlier aborted run or a
    // Playwright journey against the same database, exactly as #119a's 2026-08-28 entry describes.
    // Diagnosed the same day only because `scripts/e2e-local.sh` tees the whole log to a file — the
    // observer piped the command through `tail` exactly as that row warns them not to, and the
    // mechanism caught what the habit lost. That is ADR-0058 working as advertised.
    // **The shared list, not a private copy** (`docs/TECH_DEBT.md` #119a). This hand-rolled its own
    // sweep and omitted `plan_shares`, so `plan.deleteMany()` died on `plan_shares_plan_id_fkey`
    // whenever a Playwright run left a share behind on the same database — the failure that took all
    // 45 of `activities.e2e-spec.ts` down. `clearDomainData` is a strict superset in the same
    // deepest-first order, ending identically, and it handles the append-only audit triggers itself.
    await clearDomainData(prisma);
  }

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    // Per-route throttle counters are shared across the file's tests inside one 60 s window; adding the
    // code compensation case tipped the 8-round calendar race into a 429. Isolation, not a weaker bound.
    resetThrottleCounters(throttlerStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('carries a zero-duration advisory through the API, and no key for a file with none (ADR-0162)', async () => {
    // `InterchangeReportResponseDto.from` rebuilds the report field by field, so a key the pure
    // pipeline produces reaches the client only if the DTO maps it. This is what proves it does.
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const zeroXer = validXer().replace(
      '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
      '%R\tT2\tP1\tA1010\tHandover\tTT_Task\t0',
    );
    expect(zeroXer).not.toBe(validXer());

    const res = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(zeroXer, 'utf8'), 'zero.xer')
      .expect(200);
    expect(res.body.data.advisories).toEqual([
      {
        code: 'ZERO_DURATION_TASK',
        entity: 'activity',
        sourceRef: 'A1010',
        detail:
          'imported as a task with no duration; a zero-length event is usually a milestone — convert it after import',
      },
    ]);

    const none = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(200);
    expect('advisories' in none.body.data).toBe(false);
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

  it('names P6 activity codes as dropped instead of losing them silently (still 200)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    // Confirmed columns only (docs/specs/p6-activity-codes/m0-record.md); no value table.
    const xer = validXer().replace(
      /%E$/,
      [
        '%T\tACTVTYPE',
        '%F\tactv_code_type_id\tactv_code_type\tproj_id\tactv_code_type_scope',
        '%R\t1\tArea\tP1\tAS_Project',
        '%T\tTASKACTV',
        '%F\ttask_id\tactv_code_type_id\tactv_code_id\tproj_id',
        '%R\tT1\t1\t10\tP1',
        '%R\tT2\t1\t11\tP1',
        '%E',
      ].join('\n'),
    );

    const res = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(xer, 'utf8'), 'codes.xer')
      .expect(200);

    expect(res.body.data.drops).toEqual([
      {
        kind: 'drop',
        entity: 'P6 activity codes',
        sourceRef: null,
        detail: '1 code type (Area) and 2 values set on activities were not imported',
        reason:
          'SchedulePoint cannot keep these yet. Your activities, dates, logic and WBS are unaffected, and the codes stay in the original file (ADR-0050)',
      },
    ]);
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
    // Lanes are PACKED, not source order (ADR-0069). These two are an FS chain — one
    // finishes before the other starts — so they share a lane rather than taking one each. Before
    // phase 3 this asserted `[0, 1]`, which is the defect stated as a test: every imported activity
    // got its own lane, so a 500-activity file opened as 500 lanes holding one bar apiece.
    expect(activities.map((a) => a.laneIndex)).toEqual([0, 0]);
    // Recalculated: the engine wrote early dates onto the activities.
    expect(activities.every((a) => a.earlyStart !== null)).toBe(true);
  });

  it('removes swimlane rows when the post-commit recalculation fails (compensation)', async () => {
    // No import writes swimlanes yet, so the recalculation is made to fail AFTER rows are placed on
    // the new plan, which is the order that matters: `activities.swimlane_id` and the lane rows are
    // RESTRICT keys, so a compensation that skipped them would raise 23503 and leave the plan.
    const { ScheduleService } = await import('../src/modules/schedule/schedule.service');
    const schedule = app.get(ScheduleService, { strict: false });
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    let seededPlanId: string | undefined;
    vi.spyOn(schedule, 'recalculate').mockImplementation(async (_principal, _slug, planId) => {
      seededPlanId = planId;
      const activity = await prisma.activity.findFirstOrThrow({ where: { planId } });
      const swimlane = await prisma.swimlane.create({
        data: { organizationId: orgId, planId, name: 'Groundworks', position: 0 },
      });
      await prisma.activity.update({
        where: { id: activity.id },
        data: { swimlaneId: swimlane.id },
      });
      await prisma.activitySwimlaneLane.create({
        data: {
          organizationId: orgId,
          activityId: activity.id,
          basis: 'SWIMLANE',
          swimlaneId: swimlane.id,
          laneIndex: 1,
        },
      });
      throw new Error('recalculation failed');
    });

    await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(500);

    expect(seededPlanId).toBeDefined();
    expect(await prisma.plan.count({ where: { id: seededPlanId as string } })).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
    expect(await prisma.swimlane.count()).toBe(0);
    expect(await prisma.activitySwimlaneLane.count()).toBe(0);
  });

  it('removes code rows and clears the swimlane pointer when the recalculation fails (compensation)', async () => {
    // No import writes activity codes yet (M5), so they are placed on the new plan the way the
    // swimlane case above places swimlanes: inside the mocked recalculation, after the commit. The
    // plan names its own code type as its swimlane source, which is the RESTRICT cycle a compensation
    // that skipped the pointer, or deleted the types before clearing it, would leave behind (23503).
    const { ScheduleService } = await import('../src/modules/schedule/schedule.service');
    const schedule = app.get(ScheduleService, { strict: false });
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    let seededPlanId: string | undefined;
    vi.spyOn(schedule, 'recalculate').mockImplementation(async (_principal, _slug, planId) => {
      seededPlanId = planId;
      const activity = await prisma.activity.findFirstOrThrow({ where: { planId } });
      const type = await prisma.codeType.create({
        data: { organizationId: orgId, planId, name: 'Area', position: 0 },
      });
      const value = await prisma.codeValue.create({
        data: { organizationId: orgId, codeTypeId: type.id, shortCode: 'L1', position: 0 },
      });
      await prisma.codeValueAssignment.create({
        data: {
          organizationId: orgId,
          planId,
          activityId: activity.id,
          codeTypeId: type.id,
          codeValueId: value.id,
        },
      });
      await prisma.codeSwimlaneLane.createMany({
        data: [value.id, null].map((codeValueId, laneIndex) => ({
          organizationId: orgId,
          planId,
          activityId: activity.id,
          codeTypeId: type.id,
          codeValueId,
          laneIndex,
        })),
      });
      // Through the real switch (M4-T2): the import itself cannot set the source until M5.
      const planPath = `/api/v1/organizations/acme/plans/${planId}`;
      const planNow = await actor.agent.get(planPath).expect(200);
      await actor.agent
        .patch(planPath)
        .send({
          swimlaneSource: 'ACTIVITY_CODE',
          swimlaneCodeTypeId: type.id,
          version: planNow.body.data.version,
        })
        .expect(200);
      throw new Error('recalculation failed');
    });

    await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(500);

    expect(seededPlanId).toBeDefined();
    expect(await prisma.plan.count({ where: { id: seededPlanId as string } })).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
    expect(await prisma.codeSwimlaneLane.count()).toBe(0);
    expect(await prisma.codeValueAssignment.count()).toBe(0);
    expect(await prisma.codeValue.count()).toBe(0);
    expect(await prisma.codeType.count()).toBe(0);
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
    // The whole request (batched persist + recalc + layout) stays comfortably under a generous CI
    // bound; the persist transaction alone is a handful of `createMany`s, far under the 5s
    // interactive-txn timeout.
    expect(elapsedMs).toBeLessThan(60_000);

    // **The readability claim, at the scale it matters** (ADR-0069). Source order gave every
    // activity its own lane, so this plan opened as 2,000 lanes with one bar each — the canvas
    // equivalent of a 2,000-page document with one word per page. Packed, the lane count is a
    // function of how many activities genuinely overlap in time, which on any real programme is a
    // small fraction of its size.
    const lanes = await prisma.activity.findMany({
      where: { planId },
      select: { laneIndex: true },
    });
    const distinctLanes = new Set(lanes.map((a) => a.laneIndex)).size;
    expect(distinctLanes).toBeLessThan(2000 / 4);
    // Lanes are contiguous from 0 — a packer that left gaps would draw empty rows through the
    // middle of the diagram, which reads as missing work rather than as spare room.
    expect(Math.max(...lanes.map((a) => a.laneIndex))).toBe(distinctLanes - 1);
  }, 60_000);

  // ---- Activity notes through the importer (notes-through-interchange M1, ADR-0046) --------------------

  /** A two-activity XER whose tasks carry the given `TASKMEMO` rows (`task_memo` is the last column). */
  function xerWithMemos(memos: ReadonlyArray<readonly [taskId: string, memo: string]>): string {
    const base = validXer().replace(/\n%E$/, '');
    return [
      base,
      '%T\tTASKMEMO',
      '%F\tmemo_id\tproj_id\ttask_id\tmemo_type_id\ttask_memo',
      ...memos.map(([taskId, memo], i) => `%R\tM${i + 1}\tP1\t${taskId}\tMT1\t${memo}`),
      '%E',
    ].join('\n');
  }

  const notesUrl = (activityId: string) =>
    `/api/v1/organizations/acme/activities/${activityId}/notes`;

  it('commits TASKMEMO rows as notes authored by the importer, in source order', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const other = await addMember(orgId, 'other@example.com', 'PLANNER');
    const xer = xerWithMemos([
      ['T1', 'First remark'],
      ['T2', 'On the other activity'],
      ['T1', 'Second remark'],
      ['T1', 'Third remark'],
    ]);

    const dry = await planner.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(xer, 'utf8'), 'memos.xer')
      .expect(200);
    // A preview creates nothing: no plan and so no note.
    expect(await prisma.note.count()).toBe(0);
    const res = await planner.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xer, 'utf8'), 'memos.xer')
      .expect(201);

    // The preview and the commit count the same notes.
    expect(dry.body.data.mapped.notes).toBe(4);
    expect(res.body.data.report.mapped.notes).toBe(4);

    const planId = res.body.data.planId as string;
    const rows = await prisma.note.findMany({ where: { planId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((n) => n.body)).toEqual([
      'First remark',
      'On the other activity',
      'Second remark',
      'Third remark',
    ]);
    expect(rows.every((n) => n.entityType === 'ACTIVITY' && n.deletedAt === null)).toBe(true);
    expect(
      rows.every((n) => n.createdBy === planner.userId && n.updatedBy === planner.userId),
    ).toBe(true);
    expect(rows.every((n) => n.organizationId === orgId)).toBe(true);

    // The thread is newest first, so the source order reads back reversed — and deterministically.
    const t1 = await prisma.activity.findFirstOrThrow({ where: { planId, code: 'A1000' } });
    const thread = await planner.agent.get(notesUrl(t1.id)).expect(200);
    expect((thread.body.data as { body: string }[]).map((n) => n.body)).toEqual([
      'Third remark',
      'Second remark',
      'First remark',
    ]);

    // The importer owns them: they can edit one, and nobody else can (ADR-0046's author-only rule).
    const noteId = (thread.body.data as { id: string; version: number }[])[0]!.id;
    await other.agent
      .patch(`/api/v1/organizations/acme/notes/${noteId}`)
      .send({ body: 'Not mine to change', version: 1 })
      .expect(403);
    await planner.agent
      .patch(`/api/v1/organizations/acme/notes/${noteId}`)
      .send({ body: 'Changed by the importer', version: 1 })
      .expect(200);
  });

  it('leaves the schedule untouched by notes: the same file with and without memos computes the same dates', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const plain = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer().replace('Sample', 'Plain'), 'utf8'), 'plain.xer')
      .expect(201);
    const noted = await actor.agent
      .post(commitUrl(projectId))
      .attach(
        'file',
        Buffer.from(xerWithMemos([['T1', 'A remark']]).replace('Sample', 'Noted'), 'utf8'),
        'noted.xer',
      )
      .expect(201);

    const dates = async (planId: string) =>
      (await prisma.activity.findMany({ where: { planId }, orderBy: { code: 'asc' } })).map((a) => [
        a.code,
        a.earlyStart?.toISOString(),
        a.earlyFinish?.toISOString(),
        a.lateStart?.toISOString(),
        a.lateFinish?.toISOString(),
        a.isCritical,
      ]);
    const plainDates = await dates(plain.body.data.planId as string);
    expect(plainDates.every((row) => row[1] !== undefined)).toBe(true);
    expect(await dates(noted.body.data.planId as string)).toEqual(plainDates);
    expect(await prisma.note.count({ where: { planId: plain.body.data.planId as string } })).toBe(
      0,
    );
  });

  it('stores hostile and unrepresentable memo text as inert plain text, and still commits', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    // `&#0;` decodes to a NUL, which PostgreSQL `text` refuses; the text step must remove it or the
    // whole import would roll back on one byte.
    const hostile =
      '<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">link</a> a&#0;b';
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xerWithMemos([['T1', hostile]]), 'utf8'), 'hostile.xer')
      .expect(201);

    const stored = await prisma.note.findMany({
      where: { planId: res.body.data.planId as string },
    });
    expect(stored.map((n) => n.body)).toEqual(['link ab']);
    expect(stored[0]!.body).not.toContain('<script');
    expect(stored[0]!.body).not.toContain('\u0000');
  });

  it('inserts more notes than one statement can bind in a single batch', async () => {
    // PostgreSQL binds at most 32,767 parameters per statement, so this table's `createMany` is split by
    // Prisma at roughly 3,600 rows. 4,000 notes pin that the batched insert crosses the boundary intact.
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const memos = Array.from({ length: 4000 }, (_, i): [string, string] => [
      i % 2 === 0 ? 'T1' : 'T2',
      `Remark ${String(i)}`,
    ]);
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xerWithMemos(memos), 'utf8'), 'many.xer')
      .expect(201);

    expect(res.body.data.report.mapped.notes).toBe(4000);
    const planId = res.body.data.planId as string;
    expect(await prisma.note.count({ where: { planId } })).toBe(4000);
    const stored = await prisma.note.findMany({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      select: { body: true },
    });
    expect(stored[0]?.body).toBe('Remark 0');
    expect(stored[3999]?.body).toBe('Remark 3999');
  });

  it('splits a memo over 5,000 characters into notes that each satisfy the CHECK, and reports it', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const long = `${'a'.repeat(3000)} ${'b'.repeat(3000)}`;
    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xerWithMemos([['T1', long]]), 'utf8'), 'long.xer')
      .expect(201);

    expect(res.body.data.report.mapped.notes).toBe(2);
    expect(res.body.data.report.approximations).toEqual([
      expect.objectContaining({ entity: 'note', detail: '1 long note was split into 2 notes' }),
    ]);
    const stored = await prisma.note.findMany({
      where: { planId: res.body.data.planId as string },
    });
    expect(stored.map((n) => n.body.length).sort()).toEqual([3000, 3000]);
  });

  it('removes the imported notes with the plan when the post-commit recalculation fails (compensation)', async () => {
    // Notes are RESTRICT into activities and the plan, so a compensation that deleted the activities
    // first would raise 23503 and leave a half-imported plan behind.
    const { ScheduleService } = await import('../src/modules/schedule/schedule.service');
    const schedule = app.get(ScheduleService, { strict: false });
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    let seenPlanId: string | undefined;
    let notesAtFailure = 0;
    vi.spyOn(schedule, 'recalculate').mockImplementation(async (_principal, _slug, planId) => {
      seenPlanId = planId;
      notesAtFailure = await prisma.note.count({ where: { planId } });
      throw new Error('recalculation failed');
    });

    await actor.agent
      .post(commitUrl(projectId))
      .attach(
        'file',
        Buffer.from(
          xerWithMemos([
            ['T1', 'One'],
            ['T2', 'Two'],
          ]),
          'utf8',
        ),
        'x.xer',
      )
      .expect(500);

    expect(notesAtFailure).toBe(2);
    expect(seenPlanId).toBeDefined();
    expect(await prisma.plan.count({ where: { id: seenPlanId as string } })).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
    expect(await prisma.note.count()).toBe(0);
  });

  it('records how many notes an import created on its audit row', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    await actor.agent
      .post(commitUrl(projectId))
      .attach(
        'file',
        Buffer.from(
          xerWithMemos([
            ['T1', 'One'],
            ['T2', 'Two'],
          ]),
          'utf8',
        ),
        'x.xer',
      )
      .expect(201);

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'interchange.imported' },
    });
    expect((event.changes as { after: Record<string, unknown> }).after).toMatchObject({
      noteCount: 2,
    });
  });

  // ---- Activity notes through export, and back (notes-through-interchange M2, FC-1 and FC-2) -----------

  const exportUrl = (planId: string, format: 'xer' | 'mspdi') =>
    `/api/v1/organizations/acme/plans/${planId}/interchange/export/${format}`;

  async function activityId(planId: string, code: string): Promise<string> {
    return (await prisma.activity.findFirstOrThrow({ where: { planId, code } })).id;
  }

  /** Per activity code, the bodies of the plan's active activity notes, oldest first. */
  async function bodiesByCode(planId: string): Promise<Record<string, string[]>> {
    const rows = await prisma.note.findMany({
      where: { planId, entityType: 'ACTIVITY', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { activity: { select: { code: true } } },
    });
    const out: Record<string, string[]> = {};
    for (const row of rows) {
      const code = row.activity?.code ?? '?';
      (out[code] ??= []).push(row.body);
    }
    return out;
  }

  it('exports a plan’s notes to XER and re-imports them: same bodies, same order, per code (FC-1)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const source = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'source.xer')
      .expect(201);
    const sourceId = source.body.data.planId as string;
    const a1 = await activityId(sourceId, 'A1000');
    const a2 = await activityId(sourceId, 'A1010');

    const bodies = [
      'plain',
      'A & B < C > D "quoted"',
      'tab\there',
      'blank\n\nlines\n\n\nand three',
      'literal <hr> and <script>alert(1)</script>',
      'ünïcödé — 日本語',
      'x'.repeat(5000),
    ];
    for (const body of bodies) {
      await actor.agent
        .post(`/api/v1/organizations/acme/activities/${a1}/notes`)
        .send({ body })
        .expect(201);
    }
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a2}/notes`)
      .send({ body: 'on the second' })
      .expect(201);
    // A plan note and a deleted note: neither may reach the file.
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${sourceId}/notes`)
      .send({ body: 'plan level' })
      .expect(201);
    const doomed = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a2}/notes`)
      .send({ body: 'withdrawn' })
      .expect(201);
    await actor.agent
      .delete(`/api/v1/organizations/acme/notes/${doomed.body.data.id as string}`)
      .expect(204);

    const exported = await actor.agent
      .get(exportUrl(sourceId, 'xer'))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const report = JSON.parse(String(exported.headers['x-interchange-report'])) as {
      mapped: { notes?: number };
      drops: { detail: string }[];
    };
    expect(report.mapped.notes).toBe(bodies.length + 1);
    expect(report.drops.map((d) => d.detail)).toContain(
      '1 plan note was not written to the exported file',
    );
    expect((exported.body as Buffer).toString('utf8')).not.toContain('withdrawn');

    const secondProject = await makeSecondProject(actor);
    const reimport = await actor.agent
      .post(commitUrl(secondProject))
      .attach('file', exported.body as Buffer, 'exported.xer')
      .expect(201);
    const copyId = reimport.body.data.planId as string;
    const copy = await bodiesByCode(copyId);
    expect(copy['A1000']).toEqual(bodies);
    expect(copy['A1010']).toEqual(['on the second']);
    expect(await prisma.note.count({ where: { planId: copyId, entityType: 'PLAN' } })).toBe(0);
  });

  it('exports notes to MSPDI: one note comes back as it was, several as one joined note (FC-2)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const source = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'source.xer')
      .expect(201);
    const sourceId = source.body.data.planId as string;
    const a1 = await activityId(sourceId, 'A1000');
    const a2 = await activityId(sourceId, 'A1010');
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a1}/notes`)
      .send({ body: 'first & <foremost>' })
      .expect(201);
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a1}/notes`)
      .send({ body: 'second' })
      .expect(201);
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a2}/notes`)
      .send({ body: 'only one\nacross lines' })
      .expect(201);

    const exported = await actor.agent
      .get(exportUrl(sourceId, 'mspdi'))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const secondProject = await makeSecondProject(actor);
    const reimport = await actor.agent
      .post(commitUrl(secondProject))
      .attach('file', exported.body as Buffer, 'exported.xml')
      .expect(201);
    const copy = await bodiesByCode(reimport.body.data.planId as string);
    expect(copy['A1010']).toEqual(['only one\nacross lines']);
    expect(copy['A1000']).toEqual(['first & <foremost>\n\n————\n\nsecond']);
  });

  it('leaves out notes on a soft-deleted activity without counting them as lost', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const source = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'source.xer')
      .expect(201);
    const sourceId = source.body.data.planId as string;
    const a1 = await activityId(sourceId, 'A1000');
    const a2 = await activityId(sourceId, 'A1010');
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a1}/notes`)
      .send({ body: 'kept' })
      .expect(201);
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${a2}/notes`)
      .send({ body: 'on an activity deleted behind the note’s back' })
      .expect(201);
    // Only the activity is soft-deleted, so its note is still `deleted_at IS NULL`: the exact shape
    // the export read must exclude by the activity, not by the note.
    await prisma.activity.update({ where: { id: a2 }, data: { deletedAt: new Date() } });

    const exported = await actor.agent
      .get(exportUrl(sourceId, 'xer'))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((exported.body as Buffer).toString('utf8')).not.toContain('deleted behind');
    const report = JSON.parse(String(exported.headers['x-interchange-report'])) as {
      mapped: { notes?: number };
      drops: { entity: string }[];
    };
    expect(report.mapped.notes).toBe(1);
    expect(report.drops.some((d) => d.entity === 'note')).toBe(false);
  });

  it('exports a plan without notes exactly as before: no memo tables, no note finding', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    const source = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'source.xer')
      .expect(201);
    const exported = await actor.agent
      .get(exportUrl(source.body.data.planId as string, 'xer'))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((exported.body as Buffer).toString('utf8')).not.toMatch(/MEMOTYPE|TASKMEMO/);
    const report = JSON.parse(String(exported.headers['x-interchange-report'])) as {
      mapped: Record<string, unknown>;
      approximations: { entity: string }[];
      drops: { entity: string }[];
    };
    expect('notes' in report.mapped).toBe(false);
    expect([...report.approximations, ...report.drops].some((f) => f.entity === 'note')).toBe(
      false,
    );
  });

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
    const clash = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(409);
    // The hand-made path's wording, not the global "would duplicate" fallback (#541).
    expect(clash.body.error.message).toBe('A plan with this name already exists for this project.');
    expect(clash.body.error.details).toMatchObject({ reason: 'NAME_TAKEN' });

    // Still exactly one plan and one plan's worth of activities/dependencies — the failed commit
    // created nothing.
    expect(await prisma.plan.count({ where: { projectId } })).toBe(1);
    const planId = (await prisma.plan.findFirstOrThrow({ where: { projectId } })).id;
    expect(await prisma.activity.count({ where: { planId } })).toBe(2);
    expect(await prisma.activityDependency.count({ where: { planId } })).toBe(1);
  });

  it('refuses the DRY-RUN with the same 409 when the plan name is taken, but not for a deleted plan (#541)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(201);

    const clash = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(409);
    expect(clash.body.error.message).toBe('A plan with this name already exists for this project.');
    expect(clash.body.error.details).toMatchObject({ reason: 'NAME_TAKEN' });

    // The unique is partial on live rows, so a plan in the bin frees the name and the preview agrees.
    await prisma.plan.updateMany({ where: { projectId }, data: { deletedAt: new Date() } });
    await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(validXer(), 'utf8'), 'sample.xer')
      .expect(200);
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

  // ---- Resource-name collisions: ask, never guess -------------------------

  /**
   * Import `resourceOnlyXer` into a fresh project, then dry-run `collidingResourceXer` (same names,
   * different codes) into a second project. Returns the second project and the collisions reported.
   */
  async function seedCollision(): Promise<{
    actor: Actor;
    orgId: string;
    projectId: string;
    collisions: { resourceKey: string; name: string; existing: { name: string } }[];
  }> {
    const { actor, orgId } = await adminWithOrg();
    await actor.agent
      .post(commitUrl(await makeProject(actor)))
      .attach('file', Buffer.from(resourceOnlyXer(), 'utf8'), 'resourced.xer')
      .expect(201);

    const projectId = await makeSecondProject(actor);
    const dry = await actor.agent
      .post(dryRunUrl(projectId))
      .attach('file', Buffer.from(collidingResourceXer(), 'utf8'), 'colliding.xer')
      .expect(200);
    return { actor, orgId, projectId, collisions: dry.body.data.resourceCollisions ?? [] };
  }

  it('dry-run REPORTS a resource-name collision instead of leaving it to blow up on commit', async () => {
    const { collisions } = await seedCollision();

    // Both names are taken by the first import's rows; the codes (CREW-Z / MAT-Z) match nothing, so
    // neither row is IDENTIFIED — which is precisely the ambiguity the planner has to settle.
    expect(collisions.map((c) => c.name).sort()).toEqual(['Ready-Mix', 'Site Crew']);
    // Each names the library row it clashes with, so a planner can tell whether it is the same crew.
    expect(collisions.every((c) => c.existing.name === c.name)).toBe(true);
    expect(collisions.every((c) => c.resourceKey.length > 0)).toBe(true);
  });

  it('refuses a commit that leaves a reported collision unanswered (422, naming them)', async () => {
    const { actor, orgId, projectId } = await seedCollision();

    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(collidingResourceXer(), 'utf8'), 'colliding.xer')
      .expect(422);

    expect(res.body.error.details.reason).toBe('UNRESOLVED_RESOURCE_COLLISIONS');
    expect(res.body.error.details.collisions).toHaveLength(2);
    // Nothing was created — the refusal happens inside the one transaction that writes the graph.
    expect(await prisma.resource.count({ where: { organizationId: orgId, deletedAt: null } })).toBe(
      2,
    );
    expect(await prisma.plan.count({ where: { projectId, deletedAt: null } })).toBe(0);
  });

  it('REUSE_EXISTING binds the imported assignments to the library rows already there', async () => {
    const { actor, orgId, projectId, collisions } = await seedCollision();
    const resolutions = Object.fromEntries(
      collisions.map((c) => [c.resourceKey, 'REUSE_EXISTING']),
    );

    const res = await actor.agent
      .post(commitUrl(projectId))
      .field('resourceResolutions', JSON.stringify(resolutions))
      .attach('file', Buffer.from(collidingResourceXer(), 'utf8'), 'colliding.xer')
      .expect(201);

    // No new library rows: the two imported resources resolved onto the two that were already there.
    expect(await prisma.resource.count({ where: { organizationId: orgId, deletedAt: null } })).toBe(
      2,
    );
    const driving = await prisma.resourceAssignment.findFirstOrThrow({
      where: { activity: { planId: res.body.data.planId as string }, isDriving: true },
      include: { resource: true },
    });
    // Bound to the ORIGINAL row — code CREW-A, not the file's CREW-Z. The file's own code did not
    // overwrite it, which is exactly what "reuse" costs and why the report says so.
    expect(driving.resource.code).toBe('CREW-A');
    expect(res.body.data.report.repairs).toContainEqual(
      expect.objectContaining({
        entity: 'resource',
        detail: expect.stringContaining('matched to the existing library resource'),
      }),
    );
  });

  it('CREATE_COPY creates a separate, renamed resource so the file’s own rate and calendar survive', async () => {
    const { actor, orgId, projectId, collisions } = await seedCollision();
    const resolutions = Object.fromEntries(collisions.map((c) => [c.resourceKey, 'CREATE_COPY']));

    const res = await actor.agent
      .post(commitUrl(projectId))
      .field('resourceResolutions', JSON.stringify(resolutions))
      .attach('file', Buffer.from(collidingResourceXer(), 'utf8'), 'colliding.xer')
      .expect(201);

    // Four rows now — the two originals plus two copies, each under a name the org-unique accepts.
    const resources = await prisma.resource.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    expect(resources).toHaveLength(4);
    const copy = resources.find((r) => r.code === 'CREW-Z');
    expect(copy?.name).toMatch(/^Site Crew \(imported \d{4}-\d{2}-\d{2}\)$/);
    expect(res.body.data.report.repairs).toContainEqual(
      expect.objectContaining({
        entity: 'resource',
        detail: expect.stringContaining('was created as'),
      }),
    );
  });

  it('rejects a malformed resourceResolutions field with a 422 rather than a 500', async () => {
    const { actor, projectId } = await seedCollision();

    await actor.agent
      .post(commitUrl(projectId))
      .field('resourceResolutions', 'not-json')
      .attach('file', Buffer.from(collidingResourceXer(), 'utf8'), 'colliding.xer')
      .expect(422);

    await actor.agent
      .post(commitUrl(projectId))
      .field('resourceResolutions', JSON.stringify({ 'RSRC:RA': 'MERGE_SOMEHOW' }))
      .attach('file', Buffer.from(collidingResourceXer(), 'utf8'), 'colliding.xer')
      .expect(422);
  });

  // ---- M5: calendar tiering (ADR-0053 §5, US-9) ---------------------------

  it('creates imported calendars in the TARGET PROJECT, leaving the shared org library untouched', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);
    // The org library as it stands before the import (the seeded "Standard" calendar).
    const orgCalendarsBefore = await prisma.calendar.count({
      where: { organizationId: orgId, scope: 'ORG', deletedAt: null },
    });

    const planId = (
      await actor.agent
        .post(commitUrl(projectId))
        .attach('file', Buffer.from(xerWithCalendar(), 'utf8'), 'imported.xer')
        .expect(201)
    ).body.data.planId as string;

    // The headline acceptance criterion: the import added ZERO rows to the shared library …
    expect(
      await prisma.calendar.count({
        where: { organizationId: orgId, scope: 'ORG', deletedAt: null },
      }),
    ).toBe(orgCalendarsBefore);
    // … and its calendar is pinned to the project it was imported into.
    const imported = await prisma.calendar.findFirstOrThrow({
      where: { organizationId: orgId, name: 'Site 6-Day', deletedAt: null },
    });
    expect(imported.scope).toBe('PROJECT');
    expect(imported.projectId).toBe(projectId);

    // The plan really uses it (the tier did not break the binding).
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.calendarId).toBe(imported.id);
  });

  it('stores the file’s own shift windows and standard working day, not a flattened 24-hour week', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(xerWithCalendar(), 'utf8'), 'imported.xer')
      .expect(201);

    const imported = await prisma.calendar.findFirstOrThrow({
      where: { organizationId: orgId, name: 'Site 6-Day', deletedAt: null },
      include: { shifts: { orderBy: { weekday: 'asc' } } },
    });

    // The fixture works P6 days 2–6 — Monday–Friday — 08:00–16:00. Every window used to be
    // flattened to a whole day, so an imported eight-hour calendar scheduled as a 24-hour one
    // (ADR-0036/0067).
    expect(imported.shifts.map((s) => [s.weekday, s.startMinute, s.endMinute])).toEqual([
      [0, 480, 960],
      [1, 480, 960],
      [2, 480, 960],
      [3, 480, 960],
      [4, 480, 960],
    ]);
    // And P6's `day_hr_cnt` of 8 is the stored day↔minute factor (ADR-0068) — with the old default
    // of 1440 the file's own 40-hour task read back as 0.6 days.
    expect(imported.hoursPerDayMinutes).toBe(480);
  });

  it('maps each clndr_type to its tier: CA_Project/CA_Base → project, a resource’s CA_Rsrc → org', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    const res = await actor.agent
      .post(commitUrl(projectId))
      .attach('file', Buffer.from(tieredCalendarXer(), 'utf8'), 'tiered.xer')
      .expect(201);

    const byName = new Map(
      (
        await prisma.calendar.findMany({
          where: { organizationId: orgId, deletedAt: null },
        })
      ).map((c) => [c.name, c]),
    );
    // A project calendar and a global one both land project-local (the safe default) …
    expect(byName.get('Site 6-Day')).toMatchObject({ scope: 'PROJECT', projectId });
    expect(byName.get('Enterprise 5-Day')).toMatchObject({ scope: 'PROJECT', projectId });
    // … and the calendar the imported RESOURCE holds is forced into the shared library, because a
    // resource is org-global and can hold nothing else (ADR-0053 §2).
    expect(byName.get('Crew Shift')).toMatchObject({ scope: 'ORG', projectId: null });

    // The resource really holds it — the forcing is what keeps that binding legal.
    const resource = await prisma.resource.findFirstOrThrow({ where: { code: 'CREW-A' } });
    expect(resource.calendarId).toBe(byName.get('Crew Shift')?.id);

    // Nothing was silent: both decisions are named in the report.
    const findings = res.body.data.report.approximations as { detail: string }[];
    expect(findings.some((f) => /Crew Shift/.test(f.detail) && /organisation/.test(f.detail))).toBe(
      true,
    );
    expect(
      findings.some((f) => /Enterprise 5-Day/.test(f.detail) && /promote/i.test(f.detail)),
    ).toBe(true);
  });

  it('honours globalCalendarScope=ORG: the file’s global calendars join the shared library', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    await actor.agent
      .post(commitUrl(projectId))
      .field('globalCalendarScope', 'ORG')
      .attach('file', Buffer.from(tieredCalendarXer(), 'utf8'), 'tiered.xer')
      .expect(201);

    const global = await prisma.calendar.findFirstOrThrow({
      where: { organizationId: orgId, name: 'Enterprise 5-Day', deletedAt: null },
    });
    expect(global).toMatchObject({ scope: 'ORG', projectId: null });
    // The project calendar is unaffected — the option is about GLOBAL calendars only.
    const project = await prisma.calendar.findFirstOrThrow({
      where: { organizationId: orgId, name: 'Site 6-Day', deletedAt: null },
    });
    expect(project).toMatchObject({ scope: 'PROJECT', projectId });
  });

  it('422s an unknown globalCalendarScope value (the option is validated, not trusted)', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    await actor.agent
      .post(commitUrl(projectId))
      .field('globalCalendarScope', 'PLAN')
      .attach('file', Buffer.from(xerWithCalendar(), 'utf8'), 'imported.xer')
      .expect(422);
  });

  /** The `repair` findings the commit/dry-run report carries about calendars. */
  const calendarRepairs = (repairs: unknown): { detail: string; reason: string }[] =>
    (repairs as { entity: string; detail: string; reason: string }[]).filter(
      (f) => f.entity === 'calendar',
    );

  const SIX_DAY = () => standardClndrData({ saturdayWorks: true });

  async function importFile(
    actor: Actor,
    projectId: string,
    xer: string,
    fields: Record<string, string> = {},
  ) {
    let req = actor.agent.post(commitUrl(projectId));
    for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
    return req.attach('file', Buffer.from(xer, 'utf8'), 'rev.xer').expect(201);
  }

  /** A stored copy of a calendar under another name — what an earlier import's variant looks like. */
  async function cloneCalendar(
    id: string,
    name: string,
    createdAt: Date,
    tier?: 'ORG' | 'PROJECT',
  ): Promise<string> {
    const src = await prisma.calendar.findUniqueOrThrow({
      where: { id },
      include: { shifts: true, exceptions: { include: { windows: true } } },
    });
    const copy = await prisma.calendar.create({
      data: {
        organizationId: src.organizationId,
        name,
        scope: tier ?? src.scope,
        projectId: (tier ?? src.scope) === 'ORG' ? null : src.projectId,
        hoursPerDayMinutes: src.hoursPerDayMinutes,
        createdAt,
        shifts: {
          create: src.shifts.map((s) => ({
            weekday: s.weekday,
            startMinute: s.startMinute,
            endMinute: s.endMinute,
          })),
        },
        exceptions: {
          create: src.exceptions.map((e) => ({
            organizationId: src.organizationId,
            startDate: e.startDate,
            endDate: e.endDate,
            label: e.label,
            windows: {
              create: e.windows.map((w) => ({
                startMinute: w.startMinute,
                endMinute: w.endMinute,
              })),
            },
          })),
        },
      },
    });
    return copy.id;
  }

  it('suffixes a same-named calendar whose working week differs, and reports the rename', async () => {
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    await importFile(actor, projectId, xerWithCalendar());

    // A SECOND file into the SAME project, carrying a calendar of the SAME name but a DIFFERENT
    // working week (Saturday worked). Name alone never reuses a calendar (ADR-0208): reusing this one
    // would silently reschedule the import. Only the source project name differs, because plan names
    // are unique per project.
    const res = await importFile(actor, projectId, xerWithCalendar('Imported Again', SIX_DAY()));

    const calendars = await prisma.calendar.findMany({
      where: { organizationId: orgId, projectId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    expect(calendars).toHaveLength(2);
    expect(calendars[0]?.name).toBe('Site 6-Day');
    expect(calendars[1]?.name).toMatch(/^Site 6-Day \(imported \d{4}-\d{2}-\d{2}\)/);
    expect(calendars[1]?.id).not.toBe(calendars[0]?.id);

    const findings = calendarRepairs(res.body.data.report.repairs);
    expect(findings.some((f) => /was created as/.test(f.detail))).toBe(true);
    expect(findings.some((f) => /was matched to the existing calendar/.test(f.detail))).toBe(false);
  });

  it('imports same-named calendars of differing content three times into one project, each under a free name', async () => {
    // Regression for #540: the second import took the "(imported <date>)" variant, so the third
    // probed only the base name, picked that same variant and aborted on the calendar unique. The
    // content differs on purpose (ADR-0208): identical files would now reuse instead of suffixing.
    const { actor, orgId } = await adminWithOrg();
    const projectId = await makeProject(actor);

    await importFile(actor, projectId, xerWithCalendar('Rev A'));
    await importFile(actor, projectId, xerWithCalendar('Rev B', SIX_DAY()));
    await importFile(
      actor,
      projectId,
      xerWithCalendar('Rev C', standardClndrData({ exceptionSerial: 46024 })),
    );

    const calendars = await prisma.calendar.findMany({
      where: { organizationId: orgId, projectId, deletedAt: null },
    });
    const names = calendars.map((c) => c.name);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    expect(names).toContain('Site 6-Day');
  });

  it('names the coming rename in the DRY-RUN report when the content differs', async () => {
    const { actor } = await adminWithOrg();
    const projectId = await makeProject(actor);
    await importFile(actor, projectId, xerWithCalendar());

    // A different plan name: the same one is refused before any report (#541).
    const res = await actor.agent
      .post(dryRunUrl(projectId))
      .attach(
        'file',
        Buffer.from(xerWithCalendar('Imported Again', SIX_DAY()), 'utf8'),
        'again.xer',
      )
      .expect(200);

    expect(
      calendarRepairs(res.body.data.repairs).some((f) => /was created as/.test(f.detail)),
    ).toBe(true);
    // A dry run is still stateless — nothing was created by looking.
    expect(await prisma.plan.count({ where: { projectId } })).toBe(1);
  });

  describe('calendar reuse (ADR-0208)', () => {
    it('reuses an identical calendar: one row, both plans bound to it, and the dry-run said so first', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));

      const dry = await actor.agent
        .post(dryRunUrl(projectId))
        .attach('file', Buffer.from(xerWithCalendar('Rev B'), 'utf8'), 'b.xer')
        .expect(200);
      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const calendars = await prisma.calendar.findMany({
        where: { organizationId: orgId, projectId, deletedAt: null },
      });
      expect(calendars).toHaveLength(1);
      const planA = await prisma.plan.findUniqueOrThrow({ where: { id: first.body.data.planId } });
      const planB = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(planA.calendarId).toBe(calendars[0]?.id);
      expect(planB.calendarId).toBe(calendars[0]?.id);
      expect(
        await prisma.activity.count({
          where: { planId: planB.id, calendarId: planB.calendarId as string },
        }),
      ).toBe(2);

      // The reviewed report and the persisted one carry the same sentence (one shared resolver).
      const reviewed = calendarRepairs(dry.body.data.repairs).map((f) => f.detail);
      const persisted = calendarRepairs(second.body.data.report.repairs).map((f) => f.detail);
      expect(reviewed).toEqual([
        'calendar “Site 6-Day” was matched to the existing calendar “Site 6-Day”',
      ]);
      expect(persisted).toEqual(reviewed);
      expect(calendarRepairs(second.body.data.report.repairs)[0]?.reason).toBe(
        'it has the same working week, exceptions and hours per day, so a copy would differ only in its name (ADR-0208)',
      );

      // The provenance row counts the reuse (ADR-0208 D4).
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'interchange.imported', subjectId: planB.id },
      });
      expect((audit.changes as { after?: unknown } | null)?.after).toMatchObject({
        calendarsReused: 1,
      });
    });

    it('persists the same dates on a reused calendar as on a fresh copy of it', async () => {
      const { actor } = await adminWithOrg();
      const projectA = await makeProject(actor);
      const projectB = await makeSecondProject(actor);

      await importFile(actor, projectA, xerWithCalendar('Rev A'));
      const reused = await importFile(actor, projectA, xerWithCalendar('Rev B'));
      const copied = await importFile(actor, projectB, xerWithCalendar('Rev B'));

      // A is a reuse and B a copy: the same bytes must schedule identically either way.
      expect(await prisma.calendar.count({ where: { projectId: projectA, deletedAt: null } })).toBe(
        1,
      );
      const datesOf = async (planId: string) =>
        prisma.activity.findMany({
          where: { planId },
          orderBy: { code: 'asc' },
          select: {
            code: true,
            earlyStart: true,
            earlyFinish: true,
            lateStart: true,
            lateFinish: true,
            totalFloat: true,
          },
        });
      const onReuse = await datesOf(reused.body.data.planId);
      const onCopy = await datesOf(copied.body.data.planId);
      expect(onReuse).toHaveLength(2);
      expect(onReuse.every((a) => a.earlyStart !== null && a.lateFinish !== null)).toBe(true);
      expect(onReuse).toEqual(onCopy);
    });

    it('prefers the exact name over an older variant', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const exactId = (
        await prisma.plan.findUniqueOrThrow({ where: { id: first.body.data.planId } })
      ).calendarId as string;
      // An identical variant that is OLDER than the exact one: a "oldest first" rule alone picks it.
      await cloneCalendar(
        exactId,
        'Site 6-Day (imported 2026-10-20)',
        new Date('2026-01-01T00:00:00Z'),
      );

      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(plan.calendarId).toBe(exactId);
      expect(
        await prisma.calendar.count({
          where: { organizationId: orgId, projectId, deletedAt: null },
        }),
      ).toBe(2);
    });

    it('reuses the importer’s own variant when it is the only identical calendar', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      await prisma.calendar.update({
        where: { id: original.calendarId as string },
        data: { name: 'Site 6-Day (imported 2026-10-20)' },
      });

      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(plan.calendarId).toBe(original.calendarId);
      expect(await prisma.calendar.count({ where: { projectId, deletedAt: null } })).toBe(1);
    });

    it('never reuses an identical calendar that is archived', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      await prisma.calendar.update({
        where: { id: original.calendarId as string },
        data: { archivedAt: new Date() },
      });

      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(plan.calendarId).not.toBe(original.calendarId);
      const renamed = calendarRepairs(second.body.data.report.repairs).filter((f) =>
        /was created as/.test(f.detail),
      );
      expect(renamed).toHaveLength(1);
      expect(renamed[0]?.reason).toMatch(/could not be reused: an import reuses only an active/);
    });

    it('never reuses an identical calendar that is in the bin', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      await prisma.plan.update({ where: { id: original.id }, data: { deletedAt: new Date() } });
      await prisma.activity.updateMany({
        where: { planId: original.id },
        data: { deletedAt: new Date() },
      });
      await prisma.calendar.update({
        where: { id: original.calendarId as string },
        data: { deletedAt: new Date() },
      });

      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(plan.calendarId).not.toBe(original.calendarId);
    });

    it('never reuses an identical calendar from another project', async () => {
      const { actor } = await adminWithOrg();
      const projectA = await makeProject(actor);
      const projectB = await makeSecondProject(actor);
      const inB = await importFile(actor, projectB, xerWithCalendar('Rev A'));
      const bCalendar = (
        await prisma.plan.findUniqueOrThrow({ where: { id: inB.body.data.planId } })
      ).calendarId;

      const inA = await importFile(actor, projectA, xerWithCalendar('Rev A'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: inA.body.data.planId } });
      expect(plan.calendarId).not.toBe(bCalendar);
      const own = await prisma.calendar.findUniqueOrThrow({
        where: { id: plan.calendarId as string },
      });
      expect(own.projectId).toBe(projectA);
    });

    it('never reuses an identical shared calendar from another organisation', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const other = await signUp('other@example.com');
      const otherOrg = await other.agent
        .post('/api/v1/organizations')
        .send({ name: 'Other' })
        .expect(201);
      const otherSlug = otherOrg.body.data.slug as string;
      const otherClient = await other.agent
        .post(`/api/v1/organizations/${otherSlug}/clients`)
        .send({ name: 'Elsewhere' })
        .expect(201);
      const otherProject = await other.agent
        .post(`/api/v1/organizations/${otherSlug}/clients/${otherClient.body.data.id}/projects`)
        .send({ name: 'Elsewhere' })
        .expect(201);
      await other.agent
        .post(
          `/api/v1/organizations/${otherSlug}/projects/${otherProject.body.data.id}/interchange/commit`,
        )
        .field('globalCalendarScope', 'ORG')
        .attach('file', Buffer.from(tieredCalendarXer(), 'utf8'), 'tiered.xer')
        .expect(201);

      await importFile(actor, projectId, tieredCalendarXer(), { globalCalendarScope: 'ORG' });

      const mine = await prisma.calendar.findMany({
        where: { name: 'Enterprise 5-Day', scope: 'ORG', deletedAt: null },
      });
      expect(mine).toHaveLength(2);
      expect(mine.map((c) => c.organizationId).sort()).toEqual(
        [orgId, otherOrg.body.data.id as string].sort(),
      );
      const task = await prisma.activity.findFirstOrThrow({
        where: { organizationId: orgId, code: 'A110' },
      });
      const bound = await prisma.calendar.findUniqueOrThrow({
        where: { id: task.calendarId as string },
      });
      expect(bound.organizationId).toBe(orgId);
    });

    it('never reuses a calendar whose only difference is an exception label', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      const touched = await prisma.calendarException.updateMany({
        where: { calendarId: original.calendarId as string },
        data: { label: 'Renamed by hand' },
      });
      expect(touched.count).toBeGreaterThan(0);

      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(plan.calendarId).not.toBe(original.calendarId);
    });

    // ---- ADR-0208 D7: a calendar only matched resources hold is not created (#554) ----------------------

    /** The calendar findings in a report's `approximations`, about the calendar the detail names. */
    const approximationsAbout = (
      report: unknown,
      calendarName: string,
    ): { detail: string; reason: string; sourceRef: string | null }[] =>
      (
        report as {
          approximations: {
            entity: string;
            detail: string;
            reason: string;
            sourceRef: string | null;
          }[];
        }
      ).approximations.filter(
        (f) => f.entity === 'calendar' && f.detail.includes(`“${calendarName}”`),
      );
    const TIER_SENTENCE = 'was created in the shared organisation library';
    const crewShiftCopies = (orgId: string) =>
      prisma.calendar.count({
        where: {
          organizationId: orgId,
          name: { startsWith: 'Crew Shift (imported' },
          deletedAt: null,
        },
      });
    const auditAfterOf = async (planId: string): Promise<Record<string, unknown>> =>
      (
        (
          await prisma.auditEvent.findFirstOrThrow({
            where: { action: 'interchange.imported', subjectId: planId },
          })
        ).changes as { after: Record<string, unknown> }
      ).after;

    it('leaves out the file’s identical copy of a library crew’s calendar and still reuses the others, per tier', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, tieredCalendarXer());

      const again = await importFile(actor, projectId, tieredCalendarXer('Tiered Again'));

      expect(
        await prisma.calendar.count({
          where: { name: { startsWith: 'Crew Shift' }, deletedAt: null },
        }),
      ).toBe(1);
      expect(
        await prisma.calendar.count({
          where: { name: { startsWith: 'Site 6-Day' }, deletedAt: null },
        }),
      ).toBe(1);
      // `Crew Shift` is no longer "matched to the existing calendar": it is not created at all, because
      // the only resource holding it matched the library crew. The other two are reused as before.
      expect(
        calendarRepairs(again.body.data.report.repairs)
          .map((f) => f.detail)
          .sort(),
      ).toEqual([
        'calendar “Enterprise 5-Day” was matched to the existing calendar “Enterprise 5-Day”',
        'calendar “Site 6-Day” was matched to the existing calendar “Site 6-Day”',
      ]);
      const crewShift = approximationsAbout(again.body.data.report, 'Crew Shift');
      expect(crewShift).toHaveLength(1);
      expect(crewShift[0]?.detail).toBe(
        'calendar “Crew Shift” was not created: the only resources in the file that use it ' +
          '(“Site Crew”) matched existing resources, which keep their own calendars',
      );
      expect(crewShift[0]?.reason).toBe(
        'the calendar each of them already has is the same as the file’s, so nothing was lost',
      );
    });

    it('still reuses an identical shared-library calendar when a NEW crew holds it (ADR-0208 at the org tier)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());
      const original = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-A' },
      });

      const second = await importFile(
        actor,
        projectId,
        crewXer({
          planName: 'Crewed Again',
          crews: [
            { id: 'RA', name: 'Site Crew', code: 'CREW-A', calendar: 'C3' },
            { id: 'RB', name: 'Night Crew', code: 'CREW-B', calendar: 'C3' },
          ],
        }),
      );

      // CREW-A matched and CREW-B was inserted, and both hold C3: an inserted holder keeps it in the
      // graph (E8), and it is identical to the library's, so it is REUSED rather than copied (E10).
      expect(
        await prisma.calendar.count({
          where: { organizationId: orgId, name: { startsWith: 'Crew Shift' }, deletedAt: null },
        }),
      ).toBe(1);
      const night = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-B' },
      });
      expect(night.calendarId).toBe(original.calendarId);
      expect(approximationsAbout(second.body.data.report, 'Crew Shift')).toHaveLength(1);
      expect(approximationsAbout(second.body.data.report, 'Crew Shift')[0]?.detail).toContain(
        TIER_SENTENCE,
      );
      expect(calendarRepairs(second.body.data.report.repairs).map((f) => f.detail)).toContain(
        'calendar “Crew Shift” was matched to the existing calendar “Crew Shift”',
      );
    });

    it('creates no copy of a reused resource’s calendar, in the dry-run or the commit (docs/TECH_DEBT.md #554)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, tieredCalendarXer());
      const crewBefore = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-A' },
      });
      const revision = tieredCalendarXer('Tiered Again', SIX_DAY());

      const dry = await actor.agent
        .post(dryRunUrl(projectId))
        .attach('file', Buffer.from(revision, 'utf8'), 'rev.xer')
        .expect(200);
      const committed = await importFile(actor, projectId, revision);

      // The reviewed report and the persisted one carry the same single sentence for the calendar,
      // saying the hours differ, and neither still carries the mapper's tier sentence for it.
      for (const report of [dry.body.data, committed.body.data.report]) {
        const found = approximationsAbout(report, 'Crew Shift');
        expect(found).toHaveLength(1);
        expect(found[0]?.detail).toContain('was not created');
        expect(found[0]?.detail).not.toContain(TIER_SENTENCE);
        expect(found[0]?.reason).toBe(
          'the file gives “Site Crew” a different working week, so its work is scheduled on the ' +
            'calendar the library already holds; an import never changes an existing resource’s calendar',
        );
      }

      // The headline: nothing was added to the shared library for the crew.
      expect(await crewShiftCopies(orgId)).toBe(0);
      expect(
        await prisma.calendar.count({
          where: { organizationId: orgId, name: 'Crew Shift', deletedAt: null },
        }),
      ).toBe(1);

      // Parity: every binding and every date is what it was when the copy was created and unused.
      const crewAfter = await prisma.resource.findUniqueOrThrow({ where: { id: crewBefore.id } });
      expect(crewAfter.calendarId).toBe(crewBefore.calendarId);
      expect(crewAfter.version).toBe(crewBefore.version);
      const plan = await prisma.plan.findUniqueOrThrow({
        where: { id: committed.body.data.planId },
      });
      expect(plan.calendarId).not.toBeNull();
      const activities = await prisma.activity.findMany({ where: { planId: plan.id } });
      expect(activities).toHaveLength(2);
      expect(activities.every((a) => a.calendarId !== null)).toBe(true);
      expect(activities.every((a) => a.earlyStart !== null && a.earlyFinish !== null)).toBe(true);

      // Counted on the provenance row (the allow-list in audit-redactor).
      expect(await auditAfterOf(plan.id)).toMatchObject({ calendarsSkipped: 1 });
    });

    it('leaves the calendar out for a REUSE_EXISTING answer and keeps it for CREATE_COPY (E2, E3, E12)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());
      const differing = (planName: string) =>
        crewXer({
          planName,
          crewData: SIX_DAY(),
          crews: [{ id: 'RA', name: 'Site Crew', code: 'CREW-Z', calendar: 'C3' }],
        });

      const dry = await actor.agent
        .post(dryRunUrl(projectId))
        .attach('file', Buffer.from(differing('Reuse'), 'utf8'), 'rev.xer')
        .expect(200);
      const collisions = dry.body.data.resourceCollisions as { resourceKey: string }[];
      expect(collisions).toHaveLength(1);
      // E12: an unanswered collision is previewed as an insert, so the preview still shows the calendar
      // as created. The commit, which has the answer, decides.
      expect(approximationsAbout(dry.body.data, 'Crew Shift')[0]?.detail).toContain(TIER_SENTENCE);

      const reuse = await importFile(actor, projectId, differing('Reuse'), {
        resourceResolutions: JSON.stringify({ [collisions[0]!.resourceKey]: 'REUSE_EXISTING' }),
      });
      expect(await crewShiftCopies(orgId)).toBe(0);
      expect(approximationsAbout(reuse.body.data.report, 'Crew Shift')[0]?.detail).toContain(
        'was not created',
      );

      const copy = await importFile(actor, projectId, differing('Copy'), {
        resourceResolutions: JSON.stringify({ [collisions[0]!.resourceKey]: 'CREATE_COPY' }),
      });
      // The copy is a new crew and holds the file's calendar, so the calendar is created and bound.
      expect(await crewShiftCopies(orgId)).toBe(1);
      const created = await prisma.resource.findFirstOrThrow({
        where: {
          organizationId: orgId,
          code: 'CREW-Z',
          name: { startsWith: 'Site Crew (imported' },
        },
        include: { calendar: true },
      });
      expect(created.calendar?.name).toMatch(/^Crew Shift \(imported /);
      const finding = approximationsAbout(copy.body.data.report, 'Crew Shift');
      expect(finding).toHaveLength(1);
      expect(finding[0]?.detail).toContain(TIER_SENTENCE);
      expect(await auditAfterOf(copy.body.data.planId)).toMatchObject({ calendarsSkipped: 0 });
    });

    it('leaves the calendar out for an ARCHIVED library crew, which is matched and unarchived (E4)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());
      await prisma.resource.updateMany({
        where: { organizationId: orgId, code: 'CREW-A' },
        data: { archivedAt: new Date() },
      });

      const second = await importFile(
        actor,
        projectId,
        crewXer({ planName: 'Again', crewData: SIX_DAY() }),
      );

      expect(await crewShiftCopies(orgId)).toBe(0);
      expect(
        (
          await prisma.resource.findFirstOrThrow({
            where: { organizationId: orgId, code: 'CREW-A' },
          })
        ).archivedAt,
      ).toBeNull();
      expect(approximationsAbout(second.body.data.report, 'Crew Shift')[0]?.detail).toContain(
        'was not created',
      );
    });

    it('creates the calendar when an activity also uses it (E6)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());

      const second = await importFile(
        actor,
        projectId,
        crewXer({ planName: 'Again', crewData: SIX_DAY(), secondTaskCalendar: 'C3' }),
      );

      // Created at the tier the mapper chose (ORG), and bound to the activity that uses it.
      const copy = await prisma.calendar.findFirstOrThrow({
        where: {
          organizationId: orgId,
          name: { startsWith: 'Crew Shift (imported' },
          deletedAt: null,
        },
      });
      expect(copy.scope).toBe('ORG');
      const design = await prisma.activity.findFirstOrThrow({
        where: { planId: second.body.data.planId, code: 'A110' },
      });
      expect(design.calendarId).toBe(copy.id);
      expect(approximationsAbout(second.body.data.report, 'Crew Shift')[0]?.detail).toContain(
        TIER_SENTENCE,
      );
    });

    it('creates the calendar when it is the plan’s default (E7)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());

      const second = await importFile(
        actor,
        projectId,
        crewXer({ planName: 'Again', crewData: SIX_DAY(), planCalendar: 'C3' }),
      );

      const plan = await prisma.plan.findUniqueOrThrow({
        where: { id: second.body.data.planId },
      });
      const bound = await prisma.calendar.findUniqueOrThrow({
        where: { id: plan.calendarId as string },
      });
      expect(bound.name).toMatch(/^Crew Shift \(imported /);
      expect(await crewShiftCopies(orgId)).toBe(1);
    });

    it('creates the calendar for an inserted holder and binds only that one (E8)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());
      const original = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-A' },
      });

      await importFile(
        actor,
        projectId,
        crewXer({
          planName: 'Again',
          crewData: SIX_DAY(),
          crews: [
            { id: 'RA', name: 'Site Crew', code: 'CREW-A', calendar: 'C3' },
            { id: 'RB', name: 'Night Crew', code: 'CREW-B', calendar: 'C3' },
          ],
        }),
      );

      const copy = await prisma.calendar.findFirstOrThrow({
        where: {
          organizationId: orgId,
          name: { startsWith: 'Crew Shift (imported' },
          deletedAt: null,
        },
      });
      const night = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-B' },
      });
      expect(night.calendarId).toBe(copy.id);
      // The matched crew keeps the calendar it had; the import never rebinds a library row.
      const kept = await prisma.resource.findUniqueOrThrow({ where: { id: original.id } });
      expect(kept.calendarId).toBe(original.calendarId);
    });

    it('treats a second row with the same code as the first, so only the first’s calendar is created (E5)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);

      const res = await importFile(
        actor,
        projectId,
        crewXer({
          nightData: SIX_DAY(),
          crews: [
            { id: 'RA', name: 'Site Crew', code: 'CREW-A', calendar: 'C3' },
            { id: 'RB', name: 'Night Crew', code: 'CREW-A', calendar: 'C4' },
          ],
        }),
      );

      // The first row is inserted and holds `Crew Shift`; the second matched it and held a different,
      // unshared calendar, which therefore has no use.
      expect(
        await prisma.calendar.count({
          where: { organizationId: orgId, name: 'Crew Shift', deletedAt: null },
        }),
      ).toBe(1);
      expect(
        await prisma.calendar.count({
          where: { organizationId: orgId, name: { startsWith: 'Night Shift' }, deletedAt: null },
        }),
      ).toBe(0);
      const night = approximationsAbout(res.body.data.report, 'Night Shift');
      expect(night).toHaveLength(1);
      expect(night[0]?.detail).toContain('was not created');
      expect(night[0]?.reason).toContain('different working week');
      expect(approximationsAbout(res.body.data.report, 'Crew Shift')[0]?.detail).toContain(
        TIER_SENTENCE,
      );
    });

    it('says the working week differs when the matched library crew has no calendar at all (E15)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(
        actor,
        projectId,
        crewXer({ crews: [{ id: 'RA', name: 'Site Crew', code: 'CREW-A', calendar: null }] }),
      );

      const second = await importFile(actor, projectId, crewXer({ planName: 'Again' }));

      expect(await crewShiftCopies(orgId)).toBe(0);
      const found = approximationsAbout(second.body.data.report, 'Crew Shift');
      expect(found[0]?.detail).toContain('was not created');
      expect(found[0]?.reason).toContain('a different working week');
    });

    it('inserts the crew and creates its calendar when the library crew is gone by commit time (E13)', async () => {
      // The dry-run is a preview; the commit decides under its locks, from its own read. Parked on a
      // reused calendar's advisory lock, i.e. AFTER the commit's prediction and BEFORE its transaction
      // reads the library, the library crew is deleted.
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, crewXer());
      const siteCalendarId = (
        await prisma.plan.findUniqueOrThrow({ where: { id: first.body.data.planId } })
      ).calendarId as string;
      const revision = crewXer({ planName: 'Again', crewData: SIX_DAY() });

      const dry = await actor.agent
        .post(dryRunUrl(projectId))
        .attach('file', Buffer.from(revision, 'utf8'), 'rev.xer')
        .expect(200);
      expect(approximationsAbout(dry.body.data, 'Crew Shift')[0]?.detail).toContain(
        'was not created',
      );

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let held!: () => void;
      const parked = new Promise<void>((resolve) => (held = resolve));
      const holder = prisma.$transaction(
        async (tx) => {
          await acquireCalendarWriteLock(tx, siteCalendarId);
          held();
          await gate;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      await parked;
      let status: Promise<{ status: number; body: { data: { planId: string } } }> | undefined;
      try {
        status = actor.agent
          .post(commitUrl(projectId))
          .attach('file', Buffer.from(revision, 'utf8'), 'rev.xer')
          .then((res) => res);
        const deadline = Date.now() + 10_000;
        for (;;) {
          const waiting = await prisma.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event = 'advisory'
              AND query ILIKE '%pg_advisory_xact_lock%'`;
          if ((waiting[0]?.n ?? 0) > 0) break;
          if (Date.now() > deadline) throw new Error('the commit never waited on the lock');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await prisma.resource.updateMany({
          where: { organizationId: orgId, code: 'CREW-A' },
          data: { deletedAt: new Date() },
        });
      } finally {
        release();
        await holder;
      }

      const res = await status;
      expect(res.status).toBe(201);
      const crew = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-A', deletedAt: null },
        include: { calendar: true },
      });
      expect(crew.calendar?.name).toMatch(/^Crew Shift \(imported /);
      expect(await crewShiftCopies(orgId)).toBe(1);
    });

    it('leaves out a code-matched MSPDI crew’s calendar the same way (E16)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewMspdi('Rev A', false));
      expect(
        await prisma.calendar.count({
          where: { organizationId: orgId, name: 'Crew Shift', scope: 'ORG', deletedAt: null },
        }),
      ).toBe(1);

      const second = await importFile(actor, projectId, crewMspdi('Rev B', true));

      expect(await crewShiftCopies(orgId)).toBe(0);
      const found = approximationsAbout(second.body.data.report, 'Crew Shift');
      expect(found).toHaveLength(1);
      expect(found[0]?.detail).toContain('was not created');
      expect(found[0]?.reason).toContain('different working week');
    });

    it('never created a left-out calendar, so a failed recalculation deletes none of the library’s', async () => {
      const { ScheduleService } = await import('../src/modules/schedule/schedule.service');
      const schedule = app.get(ScheduleService, { strict: false });
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, crewXer());
      const before = await prisma.calendar.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      vi.spyOn(schedule, 'recalculate').mockRejectedValue(new Error('recalculation failed'));
      await actor.agent
        .post(commitUrl(projectId))
        .attach(
          'file',
          Buffer.from(
            crewXer({ planName: 'Again', siteData: SIX_DAY(), crewData: SIX_DAY() }),
            'utf8',
          ),
          'rev.xer',
        )
        .expect(500);

      // Compensation deletes exactly what was created; the crew's calendar, which the failed import
      // left out and therefore never created, is still bound to the crew it belongs to.
      expect(await prisma.plan.count({ where: { projectId, name: 'Again' } })).toBe(0);
      const after = await prisma.calendar.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      expect(after).toEqual(before);
      const crew = await prisma.resource.findFirstOrThrow({
        where: { organizationId: orgId, code: 'CREW-A', deletedAt: null },
        include: { calendar: true },
      });
      expect(crew.calendar?.name).toBe('Crew Shift');
    });

    it('creates the second of two identical source calendars as a copy when one candidate exists', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      await importFile(actor, projectId, xerWithCalendar('Rev A'));

      const res = await importFile(actor, projectId, twoIdenticalCalendarsXer('Rev B'));

      // One existing calendar is claimed by one source calendar; the other is created.
      const calendars = await prisma.calendar.findMany({
        where: { organizationId: orgId, projectId, deletedAt: null },
      });
      expect(calendars).toHaveLength(2);
      const findings = calendarRepairs(res.body.data.report.repairs).map((f) => f.detail);
      expect(findings.filter((d) => /was matched to the existing calendar/.test(d))).toHaveLength(
        1,
      );
    });

    it('gives the exact-name candidate to the first calendar in the file and the variant to the second', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const exactId = (
        await prisma.plan.findUniqueOrThrow({ where: { id: first.body.data.planId } })
      ).calendarId as string;
      const variantId = await cloneCalendar(
        exactId,
        'Site 6-Day (imported 2026-10-20)',
        new Date('2026-01-01T00:00:00Z'),
      );

      const res = await importFile(actor, projectId, twoIdenticalCalendarsXer('Rev B'));

      const onPlan = await prisma.activity.findMany({
        where: { planId: res.body.data.planId },
        select: { code: true, calendarId: true },
        orderBy: { code: 'asc' },
      });
      // File order: C1 (A1000) takes the exact name, C2 (A1010) takes the next candidate.
      expect(onPlan).toEqual([
        { code: 'A1000', calendarId: exactId },
        { code: 'A1010', calendarId: variantId },
      ]);
      expect(await prisma.calendar.count({ where: { projectId, deletedAt: null } })).toBe(2);
    });

    it('does not use an identical shared-library calendar for a project calendar', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      // Promote the only identical calendar to the shared library, as a planner can.
      await prisma.calendar.update({
        where: { id: original.calendarId as string },
        data: { scope: 'ORG', projectId: null },
      });

      const second = await importFile(actor, projectId, xerWithCalendar('Rev B'));

      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: second.body.data.planId } });
      expect(plan.calendarId).not.toBe(original.calendarId);
      const bound = await prisma.calendar.findUniqueOrThrow({
        where: { id: plan.calendarId as string },
      });
      expect(bound).toMatchObject({ scope: 'PROJECT', projectId });
    });

    it('does not use an identical project calendar for a shared-library calendar', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      // The default tier puts the file's global calendar in the project ...
      await importFile(actor, projectId, tieredCalendarXer());
      expect(
        await prisma.calendar.count({
          where: { name: 'Enterprise 5-Day', scope: 'PROJECT', projectId },
        }),
      ).toBe(1);

      // ... so asking for the library must create a library calendar, not bind to that one.
      await importFile(actor, projectId, tieredCalendarXer('Tiered Again'), {
        globalCalendarScope: 'ORG',
      });

      const shared = await prisma.calendar.findMany({
        where: { organizationId: orgId, name: 'Enterprise 5-Day', scope: 'ORG', deletedAt: null },
      });
      expect(shared).toHaveLength(1);
      const task = await prisma.activity.findFirstOrThrow({
        where: { plan: { name: 'Tiered Again' }, code: 'A110' },
      });
      expect(task.calendarId).toBe(shared[0]?.id);
    });

    it('re-resolves under the lock: a calendar edited after the preview is copied, not reused', async () => {
      // The dry-run is advisory (as it is for names). The commit decides under its locks, so a
      // candidate that changed between the two must not be bound.
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      const calendarId = original.calendarId as string;

      const dry = await actor.agent
        .post(dryRunUrl(projectId))
        .attach('file', Buffer.from(xerWithCalendar('Rev B'), 'utf8'), 'b.xer')
        .expect(200);
      expect(calendarRepairs(dry.body.data.repairs)[0]?.detail).toMatch(/was matched/);

      // Park the commit on the calendar's advisory lock, i.e. AFTER its prediction and BEFORE its
      // in-transaction read, change the calendar, and let the commit through.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let held!: () => void;
      const parked = new Promise<void>((resolve) => (held = resolve));
      const holder = prisma.$transaction(
        async (tx) => {
          await acquireCalendarWriteLock(tx, calendarId);
          held();
          await gate;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      await parked;
      let status:
        | Promise<{
            status: number;
            body: { data: { planId: string; report: { repairs: unknown } } };
          }>
        | undefined;
      try {
        status = actor.agent
          .post(commitUrl(projectId))
          .attach('file', Buffer.from(xerWithCalendar('Rev B'), 'utf8'), 'b.xer')
          .then((res) => res);
        const deadline = Date.now() + 10_000;
        for (;;) {
          const waiting = await prisma.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event = 'advisory'
              AND query ILIKE '%pg_advisory_xact_lock%'`;
          if ((waiting[0]?.n ?? 0) > 0) break;
          if (Date.now() > deadline) throw new Error('the commit never waited on the lock');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await prisma.calendarException.updateMany({
          where: { calendarId },
          data: { label: 'Edited after the preview' },
        });
      } finally {
        release();
        await holder;
      }

      const res = await status;
      expect(res.status).toBe(201);
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: res.body.data.planId } });
      expect(plan.calendarId).not.toBe(calendarId);
      expect(calendarRepairs(res.body.data.report.repairs).map((f) => f.detail)).toEqual([
        expect.stringMatching(/was created as/),
      ]);
    });

    it('keeps a reused calendar, intact, when the recalculation fails and the import rolls back', async () => {
      const { ScheduleService } = await import('../src/modules/schedule/schedule.service');
      const schedule = app.get(ScheduleService, { strict: false });
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const first = await importFile(actor, projectId, xerWithCalendar('Rev A'));
      const original = await prisma.plan.findUniqueOrThrow({
        where: { id: first.body.data.planId },
      });
      const calendarId = original.calendarId as string;
      const before = await prisma.calendar.findUniqueOrThrow({
        where: { id: calendarId },
        include: { shifts: true, exceptions: { include: { windows: true } } },
      });

      vi.spyOn(schedule, 'recalculate').mockRejectedValue(new Error('recalculation failed'));
      await actor.agent
        .post(commitUrl(projectId))
        .attach('file', Buffer.from(xerWithCalendar('Rev B'), 'utf8'), 'rev.xer')
        .expect(500);

      // The failed plan is gone; the calendar it had bound, and everything under it, is not.
      expect(await prisma.plan.count({ where: { projectId, name: 'Rev B' } })).toBe(0);
      const after = await prisma.calendar.findUniqueOrThrow({
        where: { id: calendarId },
        include: { shifts: true, exceptions: { include: { windows: true } } },
      });
      expect(after.deletedAt).toBeNull();
      expect(after.shifts).toHaveLength(before.shifts.length);
      expect(after.exceptions).toHaveLength(before.exceptions.length);
      expect(after.exceptions.flatMap((e) => e.windows)).toHaveLength(
        before.exceptions.flatMap((e) => e.windows).length,
      );
      expect(before.shifts.length).toBeGreaterThan(0);
      expect(before.exceptions.length).toBeGreaterThan(0);
    });

    it('never leaves a plan bound to a calendar that a racing delete removed (8 rounds)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const outcomes = { reused: 0, copied: 0 };

      for (let round = 0; round < 8; round += 1) {
        const seed = await importFile(actor, projectId, xerWithCalendar(`Seed ${round}`));
        const seeded = await prisma.plan.findUniqueOrThrow({
          where: { id: seed.body.data.planId },
        });
        const calendarId = seeded.calendarId as string;
        // Unused, so the delete may win: the seeding plan leaves the live set.
        await prisma.activity.updateMany({
          where: { planId: seeded.id },
          data: { deletedAt: new Date() },
        });
        await prisma.plan.update({ where: { id: seeded.id }, data: { deletedAt: new Date() } });

        const [del, imp] = await Promise.all([
          actor.agent.delete(`/api/v1/organizations/acme/calendars/${calendarId}`),
          actor.agent
            .post(commitUrl(projectId))
            .attach('file', Buffer.from(xerWithCalendar(`Race ${round}`), 'utf8'), 'rev.xer'),
        ]);

        expect(imp.status).toBe(201);
        const plan = await prisma.plan.findUniqueOrThrow({ where: { id: imp.body.data.planId } });
        const bound = await prisma.calendar.findUniqueOrThrow({
          where: { id: plan.calendarId as string },
        });
        expect(bound.deletedAt).toBeNull();
        if (plan.calendarId === calendarId) {
          expect(del.status).toBe(409);
          outcomes.reused += 1;
        } else {
          expect([204, 409]).toContain(del.status);
          outcomes.copied += 1;
        }

        await prisma.activity.updateMany({
          where: { planId: plan.id },
          data: { deletedAt: new Date() },
        });
        await prisma.plan.update({ where: { id: plan.id }, data: { deletedAt: new Date() } });
        await prisma.calendar.updateMany({
          where: { organizationId: orgId, projectId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }
      expect(outcomes.reused + outcomes.copied).toBe(8);
    });
  });
});
