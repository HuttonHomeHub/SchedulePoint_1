import type {
  CanonicalActivity,
  CanonicalActivityStatus,
  CanonicalActivityType,
  CanonicalAssignment,
  CanonicalCalendar,
  CanonicalConstraintType,
  CanonicalModel,
  CanonicalPercentCompleteType,
  CanonicalProgress,
  CanonicalProject,
  CanonicalRelationship,
  CanonicalRelationshipType,
  CanonicalResource,
  CanonicalResourceKind,
} from './canonical.js';
import type { ReportFinding } from './report.js';
import { fallbackWorkWeek, parseClndrData } from './xer-calendar.js';
import type { XerDocument } from './xer-parser.js';

/**
 * The **XER → canonical adapter** (ADR-0050, Task 1.3 step 1). This is the only place P6's XER
 * vocabulary and conventions live: table names (`PROJECT`/`TASK`/`TASKPRED`/`CALENDAR`), field names
 * (`task_code`, `pred_type`, `lag_hr_cnt`, …), the **hours → working-minutes** unit convention, the
 * `TT_*`/`PR_*` enum spellings, and the multi-project "first-with-report" rule. It turns a parsed
 * {@link XerDocument} into the format-neutral {@link CanonicalModel} plus a flat list of
 * {@link ReportFinding}s (unit coercions, unmapped kinds, dropped tables). Downstream steps never see
 * an XER concept.
 *
 * Pure + deterministic: no I/O, clock or randomness. Structural impossibilities the parser could not
 * catch (no PROJECT row, no usable data date) are returned as a typed error — everything else is
 * coerced/mapped and reported, never thrown.
 */

// ---------------------------------------------------------------------------------------------------------
// XER table + field names (the P6 vocabulary — kept together as the mapping contract's source spelling).
// ---------------------------------------------------------------------------------------------------------

const TABLE = {
  project: 'PROJECT',
  task: 'TASK',
  taskPred: 'TASKPRED',
  calendar: 'CALENDAR',
  // M2 tables (WBS / resources / assignments) — now mapped, no longer dropped (ADR-0038/0039/0040).
  projwbs: 'PROJWBS',
  rsrc: 'RSRC',
  taskRsrc: 'TASKRSRC',
} as const;

/** P6 `task_type` → canonical activity type. Types outside scope (e.g. `TT_LOE`) are absent (coerced + reported). */
const TASK_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalActivityType>> = {
  TT_Task: 'TASK',
  TT_Rsrc: 'RESOURCE_DEPENDENT', // resource-dependent scheduling (ADR-0039, M2).
  TT_Mile: 'START_MILESTONE',
  TT_FinMile: 'FINISH_MILESTONE',
};

/** P6 `pred_type` → canonical relationship type. */
const PRED_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalRelationshipType>> = {
  PR_FS: 'FS',
  PR_SS: 'SS',
  PR_FF: 'FF',
  PR_SF: 'SF',
};

/**
 * P6 `cstr_type` → canonical `ConstraintType` (ADR-0035 §7). `CS_ALAP` and `CS_EXPFIN` are handled
 * separately (they are not type/date constraints — ALAP sets the activity flag, Expected-Finish routes
 * to progress); any other value is dropped + reported.
 */
const CSTR_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalConstraintType>> = {
  CS_MSO: 'MSO',
  CS_MSOA: 'SNET',
  CS_MSOB: 'SNLT',
  CS_MEO: 'MFO',
  CS_MEOA: 'FNET',
  CS_MEOB: 'FNLT',
  CS_MANDSTART: 'MANDATORY_START',
  CS_MANDFIN: 'MANDATORY_FINISH',
};

/** P6 `status_code` → canonical activity status (a provisional source status; the validate step derives the final). */
const STATUS_CODE_TO_CANONICAL: Readonly<Record<string, CanonicalActivityStatus>> = {
  TK_NotStart: 'NOT_STARTED',
  TK_Active: 'IN_PROGRESS',
  TK_Complete: 'COMPLETE',
};

/** P6 `complete_pct_type` → canonical percent-complete type (ADR-0042). Unknown → `DURATION`. */
const PCT_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalPercentCompleteType>> = {
  CP_Drtn: 'DURATION',
  CP_Units: 'UNITS',
  CP_Phys: 'PHYSICAL',
};

/** P6 `rsrc_type` → canonical `ResourceKind` (ADR-0039). Unknown → `LABOUR` + reported. */
const RSRC_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalResourceKind>> = {
  RT_Labor: 'LABOUR',
  RT_Equip: 'EQUIPMENT',
  RT_Mat: 'MATERIAL',
};

/**
 * Look up an enum value by an **attacker-controlled** XER field value without inheriting an
 * `Object.prototype` member. A plain object literal returns real inherited members for keys like
 * `__proto__` / `constructor` / `toString` / `valueOf`, so `TABLE[key]` would be truthy (not
 * `undefined`) for those magic strings — silently bypassing the "unmapped → coerce + report" branch and
 * leaking a non-enum value downstream. Guarding with `Object.hasOwn` makes every unrecognised source
 * value (magic or not) miss, so the coerce-and-report contract holds for the whole XER key space.
 */
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Signed working-minute bound (± ~10 years) mirroring the domain `lag_minutes` / duration CHECK range. */
const MINUTE_BOUND = 5_256_000;

// ---------------------------------------------------------------------------------------------------------
// Typed adapter result.
// ---------------------------------------------------------------------------------------------------------

export interface XerAdaptError {
  readonly code: 'NO_PROJECT' | 'NO_DATA_DATE';
  readonly message: string;
}

export type XerAdaptResult =
  | { ok: true; model: CanonicalModel; findings: ReportFinding[] }
  | { ok: false; error: XerAdaptError };

// ---------------------------------------------------------------------------------------------------------
// Small typed accessors (XER row values are `string`; a missing field is `undefined`).
// ---------------------------------------------------------------------------------------------------------

/** A trimmed, non-empty field value, or `undefined` (empty strings collapse to `undefined`). */
function field(row: ReadonlyMap<string, string>, name: string): string | undefined {
  const value = row.get(name);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** A finite numeric field value, or `undefined`. */
function numField(row: ReadonlyMap<string, string>, name: string): number | undefined {
  const raw = field(row, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** The `YYYY-MM-DD` prefix of an XER datetime (`"2026-01-05 08:00"` → `"2026-01-05"`), or `undefined`. */
function isoDateField(row: ReadonlyMap<string, string>, name: string): string | undefined {
  const raw = field(row, name);
  if (raw === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m === null ? undefined : `${m[1]}-${m[2]}-${m[3]}`;
}

function rowsOf(document: XerDocument, name: string): ReadonlyArray<ReadonlyMap<string, string>> {
  return document.tables.get(name)?.rows ?? [];
}

/**
 * Convert an hours value to working-minutes, clamped to the ± bound. Returns the coerced minutes plus a
 * flag when the conversion was **lossy** (rounded or clamped) — an exact hours→minutes conversion loses
 * no data and is therefore not reported; only rounding/clamping is an approximation worth surfacing.
 */
function hoursToMinutes(
  hours: number,
  signed: boolean,
): { minutes: number; rounded: boolean; clamped: boolean } {
  const rawMinutes = hours * 60;
  let minutes = Math.round(rawMinutes);
  const rounded = Math.abs(rawMinutes - minutes) > 1e-9;
  const lower = signed ? -MINUTE_BOUND : 0;
  let clamped = false;
  if (minutes < lower) {
    minutes = lower;
    clamped = true;
  } else if (minutes > MINUTE_BOUND) {
    minutes = MINUTE_BOUND;
    clamped = true;
  }
  return { minutes, rounded, clamped };
}

/**
 * Classify one P6 constraint slot (`cstr_type[2]` + `cstr_date[2]`). A recognised constraint yields a
 * type + its date (date may be null — the validate step drops an orphan); `CS_ALAP` sets the ALAP flag;
 * `CS_EXPFIN` routes its date to the Expected-Finish progress field; anything unrecognised is dropped +
 * reported. An absent slot yields `none`.
 */
type ConstraintSlot =
  | {
      readonly kind: 'constraint';
      readonly type: CanonicalConstraintType;
      readonly date: string | null;
    }
  | { readonly kind: 'alap' }
  | { readonly kind: 'expectedFinish'; readonly date: string | null }
  | { readonly kind: 'none' };

function mapConstraintSlot(
  row: ReadonlyMap<string, string>,
  typeField: string,
  dateField: string,
  taskId: string,
  findings: ReportFinding[],
): ConstraintSlot {
  const rawType = field(row, typeField);
  if (rawType === undefined) return { kind: 'none' };
  if (rawType === 'CS_ALAP') return { kind: 'alap' };
  if (rawType === 'CS_EXPFIN')
    return { kind: 'expectedFinish', date: isoDateField(row, dateField) ?? null };
  const type = lookup(CSTR_TYPE_TO_CANONICAL, rawType);
  if (type === undefined) {
    findings.push({
      kind: 'approximation',
      entity: 'constraint',
      sourceRef: taskId,
      detail: `constraint "${rawType}" is not supported and was dropped`,
      reason: 'unmapped constraint kind (ADR-0035 §7)',
    });
    return { kind: 'none' };
  }
  return { kind: 'constraint', type, date: isoDateField(row, dateField) ?? null };
}

/**
 * Map a TASK row's progress columns (ADR-0035 §6, ADR-0042) to a {@link CanonicalProgress}, or null when
 * the activity is un-progressed (a NOT_STARTED activity with no actuals/remaining/expected/physical). The
 * source `status_code` is provisional — the validate step derives the final status from the actuals.
 * `expectedFinishFromConstraint` is the date routed here from a `CS_EXPFIN` constraint (used when the row
 * has no dedicated `reend_date`).
 */
function mapProgress(
  row: ReadonlyMap<string, string>,
  expectedFinishFromConstraint: string | null,
): CanonicalProgress | null {
  const statusCode = field(row, 'status_code');
  const status: CanonicalActivityStatus =
    statusCode === undefined
      ? 'NOT_STARTED'
      : (lookup(STATUS_CODE_TO_CANONICAL, statusCode) ?? 'NOT_STARTED');

  const pct = numField(row, 'complete_pct');
  const percentComplete = pct === undefined ? 0 : Math.round(pct);
  const phys = numField(row, 'phys_complete_pct');
  const physicalPercentComplete = phys === undefined ? null : Math.round(phys);
  const pctTypeCode = field(row, 'complete_pct_type');
  const percentCompleteType: CanonicalPercentCompleteType =
    pctTypeCode === undefined
      ? 'DURATION'
      : (lookup(PCT_TYPE_TO_CANONICAL, pctTypeCode) ?? 'DURATION');

  const actualStart = isoDateField(row, 'act_start_date') ?? null;
  const actualFinish = isoDateField(row, 'act_end_date') ?? null;
  const suspendDate = isoDateField(row, 'suspend_date') ?? null;
  const resumeDate = isoDateField(row, 'resume_date') ?? null;
  const expectedFinish = isoDateField(row, 'reend_date') ?? expectedFinishFromConstraint;

  const remainHours = numField(row, 'remain_drtn_hr_cnt');
  const remainingDurationMinutes =
    remainHours === undefined ? null : hoursToMinutes(remainHours, false).minutes;

  // A NOT_STARTED activity with no progress signal at all carries no progress (null) — the domain default.
  const isDefault =
    status === 'NOT_STARTED' &&
    percentComplete === 0 &&
    physicalPercentComplete === null &&
    actualStart === null &&
    actualFinish === null &&
    suspendDate === null &&
    resumeDate === null &&
    expectedFinish === null &&
    remainingDurationMinutes === null;
  if (isDefault) return null;

  return {
    status,
    percentComplete,
    percentCompleteType,
    physicalPercentComplete,
    actualStart,
    actualFinish,
    remainingDurationMinutes,
    suspendDate,
    resumeDate,
    expectedFinish,
  };
}

// ---------------------------------------------------------------------------------------------------------
// The adapter.
// ---------------------------------------------------------------------------------------------------------

export function adaptXerToCanonical(
  document: XerDocument,
  filename: string | null,
): XerAdaptResult {
  const findings: ReportFinding[] = [];

  // --- Project (one plan per source project; multi-project → first + report) ------------------------
  const projectRows = rowsOf(document, TABLE.project);
  const firstProject = projectRows[0];
  if (firstProject === undefined) {
    return {
      ok: false,
      error: { code: 'NO_PROJECT', message: 'The XER file contains no PROJECT record to import.' },
    };
  }
  if (projectRows.length > 1) {
    findings.push({
      kind: 'drop',
      entity: 'project',
      sourceRef: null,
      detail: `${projectRows.length - 1} additional project(s) in the file were not imported`,
      reason: 'one plan per import — the first project is used (ADR-0050)',
    });
  }

  const projId = field(firstProject, 'proj_id') ?? 'PROJECT';
  const dataDate =
    isoDateField(firstProject, 'last_recalc_date') ?? isoDateField(firstProject, 'plan_start_date');
  if (dataDate === undefined) {
    return {
      ok: false,
      error: {
        code: 'NO_DATA_DATE',
        message: 'The XER project has no data date (last_recalc_date / plan_start_date).',
      },
    };
  }

  // --- Calendars ------------------------------------------------------------------------------------
  const calendarRows = rowsOf(document, TABLE.calendar);
  const knownCalendarIds = new Set<string>();
  const calendars: CanonicalCalendar[] = [];
  let defaultFlaggedCalendarId: string | undefined;
  for (const row of calendarRows) {
    const clndrId = field(row, 'clndr_id');
    if (clndrId === undefined) continue; // a calendar with no id cannot be referenced.
    knownCalendarIds.add(clndrId);
    if (field(row, 'default_flag') === 'Y') defaultFlaggedCalendarId ??= clndrId;

    const name = field(row, 'clndr_name') ?? `Calendar ${clndrId}`;
    const parsed = parseClndrData(row.get('clndr_data'), clndrId);
    findings.push(...parsed.findings);

    if (parsed.hasWorkingTime) {
      calendars.push({
        id: clndrId,
        name,
        workWeek: parsed.workWeek,
        exceptions: parsed.exceptions,
      });
    } else {
      const hoursPerDay = numField(row, 'day_hr_cnt');
      calendars.push({
        id: clndrId,
        name,
        workWeek: fallbackWorkWeek(hoursPerDay),
        exceptions: parsed.exceptions,
      });
      findings.push({
        kind: 'approximation',
        entity: 'calendar',
        sourceRef: clndrId,
        detail: `no readable weekly work pattern; approximated as Mon–Fri ${Math.min(24, Math.max(1, Math.round(hoursPerDay ?? 8)))}h/day`,
        reason: 'clndr_data absent or unreadable (ADR-0050)',
      });
    }
  }
  if (calendars.length > 0) {
    findings.push({
      kind: 'drop',
      entity: 'calendar',
      sourceRef: null,
      detail:
        'P6 calendar attributes beyond weekly work windows + dated exceptions (hours-per-day/-week, calendar type/inheritance) were not imported',
      reason: 'not expressible in the SchedulePoint calendar model (ADR-0036)',
    });
  }

  const projectClndrId = field(firstProject, 'clndr_id');
  const defaultCalendarId =
    projectClndrId !== undefined && knownCalendarIds.has(projectClndrId)
      ? projectClndrId
      : (defaultFlaggedCalendarId ?? calendars[0]?.id ?? null);

  const project: CanonicalProject = {
    id: projId,
    name: field(firstProject, 'proj_short_name') ?? projId,
    dataDate,
    defaultCalendarId,
  };

  // --- WBS structure (PROJWBS → WBS_SUMMARY activities, ADR-0038) ------------------------------------
  // WBS ids and TASK ids are disjoint P6 counters that can numerically collide, so a WBS node's key is
  // prefixed (`wbs:<wbs_id>`) — only the WBS key space is prefixed. The project-root WBS (parent absent or
  // self-referential) maps to a null parent.
  // Skip only WBS nodes explicitly belonging to another project (a row with no proj_id is treated as this
  // project's, mirroring the TASK loop, so it is never silently dropped).
  const isThisProjectWbs = (row: ReadonlyMap<string, string>): boolean => {
    const wbsProj = field(row, 'proj_id');
    return wbsProj === undefined || wbsProj === projId;
  };
  const wbsSummaries: CanonicalActivity[] = [];
  for (const row of rowsOf(document, TABLE.projwbs)) {
    if (!isThisProjectWbs(row)) continue;
    const wbsId = field(row, 'wbs_id');
    if (wbsId === undefined) continue;
    const parentWbsId = field(row, 'parent_wbs_id');
    const parentId =
      parentWbsId === undefined || parentWbsId === wbsId ? null : `wbs:${parentWbsId}`;
    wbsSummaries.push({
      id: `wbs:${wbsId}`,
      code: field(row, 'wbs_short_name') ?? wbsId,
      name: field(row, 'wbs_name') ?? field(row, 'wbs_short_name') ?? wbsId,
      type: 'WBS_SUMMARY',
      durationMinutes: 0,
      calendarId: null,
      parentId,
      constraintType: null,
      constraintDate: null,
      secondaryConstraintType: null,
      secondaryConstraintDate: null,
      scheduleAsLateAsPossible: false,
      progress: null,
    });
  }

  // --- Activities -----------------------------------------------------------------------------------
  const taskActivities: CanonicalActivity[] = [];
  for (const row of rowsOf(document, TABLE.task)) {
    const taskId = field(row, 'task_id');
    if (taskId === undefined) {
      findings.push({
        kind: 'drop',
        entity: 'activity',
        sourceRef: null,
        detail: 'a TASK row with no task_id was not imported',
        reason: 'missing stable identifier',
      });
      continue;
    }

    // Type mapping (unmapped → TASK + report).
    const rawType = field(row, 'task_type');
    let type = rawType === undefined ? 'TASK' : lookup(TASK_TYPE_TO_CANONICAL, rawType);
    if (type === undefined) {
      type = 'TASK';
      findings.push({
        kind: 'approximation',
        entity: 'activity',
        sourceRef: taskId,
        detail: `activity type "${rawType}" is not supported; imported as TASK`,
        reason: 'unmapped activity type (ADR-0050)',
      });
    }

    // Duration: XER stores hours (`target_drtn_hr_cnt`); ×60 → working-minutes. A milestone is 0; a
    // TASK / RESOURCE_DEPENDENT carries a real duration.
    let durationMinutes = 0;
    if (type === 'TASK' || type === 'RESOURCE_DEPENDENT') {
      const hours = numField(row, 'target_drtn_hr_cnt') ?? numField(row, 'remain_drtn_hr_cnt') ?? 0;
      const coerced = hoursToMinutes(hours, false);
      durationMinutes = coerced.minutes;
      if (coerced.rounded || coerced.clamped) {
        findings.push({
          kind: 'approximation',
          entity: 'activity',
          sourceRef: taskId,
          detail: `duration ${hours}h → ${durationMinutes}min${coerced.clamped ? ' (clamped to range)' : ' (rounded)'}`,
          reason: 'hours coerced to working-minutes (ADR-0036)',
        });
      }
    }

    let code = field(row, 'task_code');
    if (code === undefined) {
      code = taskId;
      findings.push({
        kind: 'approximation',
        entity: 'activity',
        sourceRef: taskId,
        detail: `activity had no task_code; using its id "${taskId}" as the code`,
        reason: 'code is required (ADR-0050)',
      });
    }

    const calendarId = field(row, 'clndr_id');
    let resolvedCalendarId: string | null = null;
    if (calendarId !== undefined) {
      if (knownCalendarIds.has(calendarId)) {
        resolvedCalendarId = calendarId;
      } else {
        findings.push({
          kind: 'approximation',
          entity: 'activity',
          sourceRef: taskId,
          detail: `activity calendar "${calendarId}" is unknown; falls back to the plan default`,
          reason: 'unresolved calendar reference',
        });
      }
    }

    // WBS parent: a real activity's `wbs_id` → its summary parent (see the WBS key-prefix note above).
    const wbsId = field(row, 'wbs_id');
    const parentId = wbsId === undefined ? null : `wbs:${wbsId}`;

    // Constraints (primary + secondary, ADR-0035 §7–§12) + ALAP + Expected-Finish routing.
    const primary = mapConstraintSlot(row, 'cstr_type', 'cstr_date', taskId, findings);
    const secondary = mapConstraintSlot(row, 'cstr_type2', 'cstr_date2', taskId, findings);
    let constraintType: CanonicalConstraintType | null = null;
    let constraintDate: string | null = null;
    let secondaryConstraintType: CanonicalConstraintType | null = null;
    let secondaryConstraintDate: string | null = null;
    let scheduleAsLateAsPossible = false;
    let expectedFinishFromConstraint: string | null = null;
    if (primary.kind === 'constraint') {
      constraintType = primary.type;
      constraintDate = primary.date;
    } else if (primary.kind === 'alap') {
      scheduleAsLateAsPossible = true;
    } else if (primary.kind === 'expectedFinish') {
      expectedFinishFromConstraint = primary.date;
    }
    if (secondary.kind === 'constraint') {
      secondaryConstraintType = secondary.type;
      secondaryConstraintDate = secondary.date;
    } else if (secondary.kind === 'alap') {
      scheduleAsLateAsPossible = true;
    } else if (secondary.kind === 'expectedFinish') {
      expectedFinishFromConstraint ??= secondary.date;
    }

    taskActivities.push({
      id: taskId,
      code,
      name: field(row, 'task_name') ?? code,
      type,
      durationMinutes,
      calendarId: resolvedCalendarId,
      parentId,
      constraintType,
      constraintDate,
      secondaryConstraintType,
      secondaryConstraintDate,
      scheduleAsLateAsPossible,
      progress: mapProgress(row, expectedFinishFromConstraint),
    });
  }

  // WBS summaries precede real activities (their hierarchy is defined first); duplicate-code repair keeps
  // the earliest, so a code shared by a summary and an activity resolves deterministically.
  const activities: CanonicalActivity[] = [...wbsSummaries, ...taskActivities];

  // --- Relationships --------------------------------------------------------------------------------
  const relationships: CanonicalRelationship[] = [];
  const predRows = rowsOf(document, TABLE.taskPred);
  for (let i = 0; i < predRows.length; i += 1) {
    const row = predRows[i];
    if (row === undefined) continue;
    const predId = field(row, 'pred_task_id');
    const succId = field(row, 'task_id');
    if (predId === undefined || succId === undefined) {
      findings.push({
        kind: 'drop',
        entity: 'relationship',
        sourceRef: field(row, 'task_pred_id') ?? null,
        detail: 'a TASKPRED row with a missing endpoint id was not imported',
        reason: 'malformed relationship (ADR-0050)',
      });
      continue;
    }

    const rawType = field(row, 'pred_type');
    let type = rawType === undefined ? undefined : lookup(PRED_TYPE_TO_CANONICAL, rawType);
    if (type === undefined) {
      type = 'FS';
      findings.push({
        kind: 'approximation',
        entity: 'relationship',
        sourceRef: field(row, 'task_pred_id') ?? `${predId}->${succId}`,
        detail: `relationship type "${rawType ?? '(none)'}" is not supported; imported as FS`,
        reason: 'unmapped relationship kind (ADR-0050)',
      });
    }

    const lagHours = numField(row, 'lag_hr_cnt') ?? 0;
    const coerced = hoursToMinutes(lagHours, true);
    if (coerced.rounded || coerced.clamped) {
      findings.push({
        kind: 'approximation',
        entity: 'relationship',
        sourceRef: field(row, 'task_pred_id') ?? `${predId}->${succId}`,
        detail: `lag ${lagHours}h → ${coerced.minutes}min${coerced.clamped ? ' (clamped to range)' : ' (rounded)'}`,
        reason: 'hours coerced to working-minutes (ADR-0036)',
      });
    }

    relationships.push({
      id: field(row, 'task_pred_id') ?? `REL-${i + 1}`,
      predecessorId: predId,
      successorId: succId,
      type,
      lagMinutes: coerced.minutes,
    });
  }

  // --- Resources (RSRC → the org resource library, ADR-0039) ----------------------------------------
  const resources: CanonicalResource[] = [];
  for (const row of rowsOf(document, TABLE.rsrc)) {
    const rsrcId = field(row, 'rsrc_id');
    if (rsrcId === undefined) {
      findings.push({
        kind: 'drop',
        entity: 'resource',
        sourceRef: null,
        detail: 'a RSRC row with no rsrc_id was not imported',
        reason: 'missing stable identifier',
      });
      continue;
    }
    const rawKind = field(row, 'rsrc_type');
    let kind = rawKind === undefined ? 'LABOUR' : lookup(RSRC_TYPE_TO_CANONICAL, rawKind);
    if (kind === undefined) {
      kind = 'LABOUR';
      findings.push({
        kind: 'approximation',
        entity: 'resource',
        sourceRef: rsrcId,
        detail: `resource type "${rawKind}" is not supported; imported as LABOUR`,
        reason: 'unmapped resource kind (ADR-0039)',
      });
    }
    const code = field(row, 'rsrc_short_name') ?? null;
    // The resource calendar reference is resolved (or nulled + reported) by the validate step.
    resources.push({
      id: rsrcId,
      name: field(row, 'rsrc_name') ?? code ?? rsrcId,
      code,
      kind,
      calendarId: field(row, 'clndr_id') ?? null,
      costPerUnit: null,
      maxUnitsPerHour: null,
    });
  }

  // --- Resource assignments (TASKRSRC → ResourceAssignment, ADR-0039/0040) ---------------------------
  const assignments: CanonicalAssignment[] = [];
  const taskRsrcRows = rowsOf(document, TABLE.taskRsrc);
  for (let i = 0; i < taskRsrcRows.length; i += 1) {
    const row = taskRsrcRows[i];
    if (row === undefined) continue;
    const taskId = field(row, 'task_id');
    const rsrcId = field(row, 'rsrc_id');
    if (taskId === undefined || rsrcId === undefined) {
      findings.push({
        kind: 'drop',
        entity: 'assignment',
        sourceRef: field(row, 'taskrsrc_id') ?? null,
        detail: 'a TASKRSRC row with a missing task_id/rsrc_id was not imported',
        reason: 'malformed assignment (ADR-0039)',
      });
      continue;
    }
    const budgetedUnits = Math.max(0, numField(row, 'target_qty') ?? 0);
    const unitsPerHourRaw = numField(row, 'target_qty_per_hr');
    const unitsPerHour = unitsPerHourRaw === undefined ? null : Math.max(0, unitsPerHourRaw);
    const actualUnits = Math.max(
      0,
      (numField(row, 'act_reg_qty') ?? 0) + (numField(row, 'act_ot_qty') ?? 0),
    );
    assignments.push({
      id: field(row, 'taskrsrc_id') ?? `ASG-${i + 1}`,
      activityId: taskId,
      resourceId: rsrcId,
      budgetedUnits,
      unitsPerHour,
      isDriving: field(row, 'driving_flag') === 'Y',
      actualUnits,
    });
  }

  const model: CanonicalModel = {
    source: {
      format: 'XER',
      version: document.header.version === '' ? null : document.header.version,
      filename: filename === null || filename === '' ? null : filename,
    },
    project,
    calendars,
    activities,
    relationships,
    resources,
    assignments,
  };

  return { ok: true, model, findings };
}
