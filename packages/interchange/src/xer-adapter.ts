import type {
  CanonicalActivity,
  CanonicalActivityType,
  CanonicalCalendar,
  CanonicalModel,
  CanonicalProject,
  CanonicalRelationship,
  CanonicalRelationshipType,
} from './canonical.js';
import type { ReportFinding } from './report.js';
import { fallbackWorkWeek, parseClndrData } from './xer-calendar.js';
import type { XerDocument, XerTable } from './xer-parser.js';

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
  // Out-of-M1-scope tables reported as drops when present (mapping-contract M2 rows / Won't-have).
  projwbs: 'PROJWBS',
  rsrc: 'RSRC',
  taskRsrc: 'TASKRSRC',
} as const;

/** P6 `task_type` → canonical activity type. Types outside M1's network scope are absent (coerced + reported). */
const TASK_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalActivityType>> = {
  TT_Task: 'TASK',
  TT_Rsrc: 'TASK', // resource-dependent scheduling is M2 (ADR-0039) — treated as a plain task for M1.
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
function field(row: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = row[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** A finite numeric field value, or `undefined`. */
function numField(row: Readonly<Record<string, string>>, name: string): number | undefined {
  const raw = field(row, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** The `YYYY-MM-DD` prefix of an XER datetime (`"2026-01-05 08:00"` → `"2026-01-05"`), or `undefined`. */
function isoDateField(row: Readonly<Record<string, string>>, name: string): string | undefined {
  const raw = field(row, name);
  if (raw === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m === null ? undefined : `${m[1]}-${m[2]}-${m[3]}`;
}

function rowsOf(
  document: XerDocument,
  name: string,
): ReadonlyArray<Readonly<Record<string, string>>> {
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
    const parsed = parseClndrData(row['clndr_data'], clndrId);
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

  // --- Activities -----------------------------------------------------------------------------------
  const activities: CanonicalActivity[] = [];
  let constraintCount = 0;
  let progressCount = 0;
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
    let type = rawType === undefined ? 'TASK' : TASK_TYPE_TO_CANONICAL[rawType];
    if (type === undefined) {
      type = 'TASK';
      findings.push({
        kind: 'approximation',
        entity: 'activity',
        sourceRef: taskId,
        detail: `activity type "${rawType}" is not supported in M1; imported as TASK`,
        reason: 'out of M1 network scope (ADR-0050)',
      });
    }

    // Duration: XER stores hours (`target_drtn_hr_cnt`); ×60 → working-minutes.
    let durationMinutes = 0;
    if (type === 'TASK') {
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

    if (field(row, 'cstr_type') !== undefined) constraintCount += 1;
    if (
      field(row, 'act_start_date') !== undefined ||
      field(row, 'act_end_date') !== undefined ||
      field(row, 'phys_complete_pct') !== undefined
    ) {
      progressCount += 1;
    }

    activities.push({
      id: taskId,
      code,
      name: field(row, 'task_name') ?? code,
      type,
      durationMinutes,
      calendarId: resolvedCalendarId,
    });
  }

  if (constraintCount > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${constraintCount} activity constraint(s) were not imported`,
      reason: 'constraints are out of M1 scope (ADR-0050, M2)',
    });
  }
  if (progressCount > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `progress on ${progressCount} activity(ies) was not imported`,
      reason: 'progress is out of M1 scope (ADR-0050, M2)',
    });
  }

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
    let type = rawType === undefined ? undefined : PRED_TYPE_TO_CANONICAL[rawType];
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

  // --- Out-of-scope tables (M2) reported as drops ---------------------------------------------------
  reportDroppedTable(document.tables.get(TABLE.projwbs), 'WBS structure', 'ADR-0038, M2', findings);
  reportDroppedTable(document.tables.get(TABLE.rsrc), 'resources', 'ADR-0039, M2', findings);
  reportDroppedTable(
    document.tables.get(TABLE.taskRsrc),
    'resource assignments',
    'ADR-0039/0040, M2',
    findings,
  );

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
  };

  return { ok: true, model, findings };
}

/** Emit a single drop finding for a present-but-out-of-scope table, with its row count. */
function reportDroppedTable(
  table: XerTable | undefined,
  label: string,
  reason: string,
  findings: ReportFinding[],
): void {
  if (table === undefined || table.rows.length === 0) return;
  findings.push({
    kind: 'drop',
    entity: table.name,
    sourceRef: null,
    detail: `${table.rows.length} ${label} row(s) (${table.name}) were not imported`,
    reason: `out of M1 scope (${reason})`,
  });
}
