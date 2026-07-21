import type {
  CanonicalActivity,
  CanonicalActivityStatus,
  CanonicalActivityType,
  CanonicalCalendar,
  CanonicalConstraintType,
  CanonicalModel,
  CanonicalPercentCompleteType,
  CanonicalRelationshipType,
  CanonicalResourceKind,
  CanonicalWorkWeek,
} from './canonical.js';
import type { ReportFinding } from './report.js';
import type { XerTableData } from './xer-serialiser.js';

/**
 * The **canonical → XER table emitter** (ADR-0050 M4, Task 4a.3 + M4c) — the inverse of
 * {@link adaptXerToCanonical}. It turns a {@link CanonicalModel} into the P6 `PROJECT` / `CALENDAR` /
 * `PROJWBS` / `TASK` / `TASKPRED` / `RSRC` / `TASKRSRC` tables, reversing the exact vocabulary the adapter
 * reads: the `TT_*` / `PR_*` / `CS_*` / `TK_*` / `CP_*` / `RT_*` enum spellings, the **working-minutes →
 * hours** unit convention (ADR-0036), P6's proprietary `clndr_data` work-pattern blob (reversing
 * {@link parseClndrData}), and the `wbs:<id>` WBS-key convention (reversing PROJWBS parentage). Emitting
 * these against the real field names the adapter reads is what makes the round trip (export → re-import)
 * close — for a **full plan**, not just the core network.
 *
 * Scope (M4c): the core network **plus** WBS summaries + parentage (ADR-0038), activity constraints
 * (primary + secondary + ALAP + expected-finish, ADR-0035 §7–§12), progress (ADR-0035 §6, ADR-0042), and
 * the resource library + assignments (ADR-0039/0040). XER can represent all of these exactly, so nothing in
 * this scope is dropped; the only reported findings are the genuinely lossy reserved-column cases (a
 * resource cost/max-units rate the XER RSRC mapping has no field for). Best-effort + honest (ADR-0035
 * reject/repair/report, bidirectional). Pure + deterministic: no I/O, clock or randomness.
 */

/** The P6 XER version string we advertise. A widely-compatible recent P6 schema; see the mapping contract. */
export const EXPORT_XER_VERSION = '18.8';

/** Canonical activity type → P6 `task_type`. `WBS_SUMMARY` has no `TASK` mapping (emitted via PROJWBS). */
const TYPE_TO_TASK_TYPE: Readonly<Record<Exclude<CanonicalActivityType, 'WBS_SUMMARY'>, string>> = {
  TASK: 'TT_Task',
  RESOURCE_DEPENDENT: 'TT_Rsrc',
  START_MILESTONE: 'TT_Mile',
  FINISH_MILESTONE: 'TT_FinMile',
};

/** Canonical relationship type → P6 `pred_type`. */
const TYPE_TO_PRED_TYPE: Readonly<Record<CanonicalRelationshipType, string>> = {
  FS: 'PR_FS',
  SS: 'PR_SS',
  FF: 'PR_FF',
  SF: 'PR_SF',
};

/**
 * Canonical `ConstraintType` → P6 `cstr_type` — the exact inverse of the adapter's `CSTR_TYPE_TO_CANONICAL`
 * so every constraint round-trips to its originating slot. `CS_ALAP` (as-late-as-possible) and `CS_EXPFIN`
 * (expected finish) are handled separately (they are not type/date constraints).
 */
const CONSTRAINT_TYPE_TO_CSTR: Readonly<Record<CanonicalConstraintType, string>> = {
  MSO: 'CS_MSO',
  SNET: 'CS_MSOA',
  SNLT: 'CS_MSOB',
  MFO: 'CS_MEO',
  FNET: 'CS_MEOA',
  FNLT: 'CS_MEOB',
  MANDATORY_START: 'CS_MANDSTART',
  MANDATORY_FINISH: 'CS_MANDFIN',
};

/** Canonical activity status → P6 `status_code` (inverse of the adapter's `STATUS_CODE_TO_CANONICAL`). */
const STATUS_TO_STATUS_CODE: Readonly<Record<CanonicalActivityStatus, string>> = {
  NOT_STARTED: 'TK_NotStart',
  IN_PROGRESS: 'TK_Active',
  COMPLETE: 'TK_Complete',
};

/** Canonical percent-complete type → P6 `complete_pct_type` (inverse of `PCT_TYPE_TO_CANONICAL`). */
const PCT_TYPE_TO_CODE: Readonly<Record<CanonicalPercentCompleteType, string>> = {
  DURATION: 'CP_Drtn',
  UNITS: 'CP_Units',
  PHYSICAL: 'CP_Phys',
};

/** Canonical resource kind → P6 `rsrc_type` (inverse of the adapter's `RSRC_TYPE_TO_CANONICAL`). */
const KIND_TO_RSRC_TYPE: Readonly<Record<CanonicalResourceKind, string>> = {
  LABOUR: 'RT_Labor',
  EQUIPMENT: 'RT_Equip',
  MATERIAL: 'RT_Mat',
};

/** Canonical work-week key → P6 day number (1 = Sunday … 7 = Saturday), the inverse of the parser's P6_DAY_TO_KEY. */
const KEY_TO_P6_DAY: Readonly<Record<keyof CanonicalWorkWeek, number>> = {
  sunday: 1,
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6,
  saturday: 7,
};

/** The Excel/OLE serial-date epoch P6 counts exception dates from (1899-12-30) — mirrors xer-calendar. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * The `wbs:` key prefix the adapter stamps onto every WBS node's source-local id (so WBS and TASK id
 * counters, which can numerically collide in P6, stay disjoint). Exporting reverses it: a WBS-summary
 * activity's key / a real activity's WBS parent key is stripped back to the bare `wbs_id` P6 expects.
 */
const WBS_KEY_PREFIX = 'wbs:';

/** Reverse the adapter's `wbs:<id>` convention: strip the prefix back to the bare P6 `wbs_id`. */
function toWbsId(key: string): string {
  return key.startsWith(WBS_KEY_PREFIX) ? key.slice(WBS_KEY_PREFIX.length) : key;
}

/** `YYYY-MM-DD` → the Excel/OLE serial day-number (inverse of `serialToIsoDate`). */
function isoDateToSerial(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return 0;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((ms - EXCEL_EPOCH_MS) / MS_PER_DAY);
}

/** Working-minutes → an XER hours string (the inverse of the adapter's hoursToMinutes; `round(h*60) === min`). */
function minutesToHours(minutes: number): string {
  if (minutes === 0) return '0';
  return String(minutes / 60);
}

/**
 * Emit a P6 `clndr_data` blob from a canonical calendar — the inverse of {@link parseClndrData}. Emits a
 * `DaysOfWeek` region (one `(0||N()( … ))` entry per weekday 1–7, each carrying its `s|HH:MM|f|HH:MM`
 * windows) and an `Exceptions` region (one `(0||d|SERIAL( … ))` entry per dated exception). A non-working
 * day/exception carries no windows.
 */
function emitClndrData(calendar: CanonicalCalendar): string {
  const dayEntries: string[] = [];
  for (const key of Object.keys(KEY_TO_P6_DAY) as Array<keyof CanonicalWorkWeek>) {
    const dayNumber = KEY_TO_P6_DAY[key];
    const windows = calendar.workWeek[key]
      .map((shift) => `(s|${shift.start}|f|${shift.end})`)
      .join('');
    dayEntries.push(`(0||${dayNumber}()(${windows}))`);
  }
  // Emit days in P6 order (1..7) for readability, not object-key order.
  dayEntries.sort();

  const excEntries: string[] = calendar.exceptions.map((exception) => {
    const serial = isoDateToSerial(exception.date);
    const windows = exception.shifts.map((shift) => `(s|${shift.start}|f|${shift.end})`).join('');
    return `(0||d|${serial}(${windows}))`;
  });

  return (
    `(0||CalendarData()(` +
    `(0||DaysOfWeek()(${dayEntries.join('')}))` +
    `(0||Exceptions()(${excEntries.join('')}))` +
    `))`
  );
}

const PROJECT_FIELDS = [
  'proj_id',
  'proj_short_name',
  'last_recalc_date',
  'plan_start_date',
  'clndr_id',
] as const;
const CALENDAR_FIELDS = [
  'clndr_id',
  'clndr_name',
  'default_flag',
  'day_hr_cnt',
  'clndr_data',
] as const;
const PROJWBS_FIELDS = [
  'wbs_id',
  'proj_id',
  'parent_wbs_id',
  'wbs_short_name',
  'wbs_name',
] as const;
const TASK_FIELDS = [
  'task_id',
  'proj_id',
  'wbs_id',
  'task_code',
  'task_name',
  'task_type',
  'target_drtn_hr_cnt',
  'clndr_id',
  'status_code',
  // Constraints (primary + secondary + ALAP, ADR-0035 §7–§12).
  'cstr_type',
  'cstr_date',
  'cstr_type2',
  'cstr_date2',
  // Progress (ADR-0035 §6, ADR-0042).
  'complete_pct',
  'phys_complete_pct',
  'complete_pct_type',
  'act_start_date',
  'act_end_date',
  'suspend_date',
  'resume_date',
  'reend_date',
  'remain_drtn_hr_cnt',
] as const;
const TASKPRED_FIELDS = [
  'task_pred_id',
  'task_id',
  'pred_task_id',
  'pred_type',
  'lag_hr_cnt',
] as const;
const RSRC_FIELDS = ['rsrc_id', 'rsrc_short_name', 'rsrc_name', 'rsrc_type', 'clndr_id'] as const;
const TASKRSRC_FIELDS = [
  'taskrsrc_id',
  'task_id',
  'rsrc_id',
  'target_qty',
  'target_qty_per_hr',
  'driving_flag',
  'act_reg_qty',
] as const;

export interface XerEmitResult {
  readonly tables: XerTableData[];
  readonly findings: ReportFinding[];
}

/**
 * Resolve an activity's two P6 constraint slots from its canonical constraint fields — the exact inverse of
 * the adapter's `mapConstraintSlot`. The **primary** slot holds the primary constraint (or `CS_ALAP` when
 * the activity is ALAP with no primary constraint); the **secondary** slot holds the secondary constraint
 * (or `CS_ALAP` when ALAP could not take the primary slot). Expected-finish rides a dedicated progress
 * column (`reend_date`), not a constraint slot, matching how the adapter reads it back
 * (`reend_date ?? expectedFinishFromConstraint`). The rare over-full case (a primary AND secondary
 * constraint AND ALAP) surfaces an honest ALAP approximation.
 */
function resolveConstraintColumns(
  activity: CanonicalActivity,
  findings: ReportFinding[],
): {
  cstr_type?: string;
  cstr_date?: string;
  cstr_type2?: string;
  cstr_date2?: string;
} {
  const columns: {
    cstr_type?: string;
    cstr_date?: string;
    cstr_type2?: string;
    cstr_date2?: string;
  } = {};

  let primaryTaken = false;
  let secondaryTaken = false;
  if (activity.constraintType !== null) {
    columns.cstr_type = CONSTRAINT_TYPE_TO_CSTR[activity.constraintType];
    if (activity.constraintDate !== null) columns.cstr_date = activity.constraintDate;
    primaryTaken = true;
  }
  if (activity.secondaryConstraintType !== null) {
    columns.cstr_type2 = CONSTRAINT_TYPE_TO_CSTR[activity.secondaryConstraintType];
    if (activity.secondaryConstraintDate !== null)
      columns.cstr_date2 = activity.secondaryConstraintDate;
    secondaryTaken = true;
  }

  if (activity.scheduleAsLateAsPossible) {
    if (!primaryTaken) columns.cstr_type = 'CS_ALAP';
    else if (!secondaryTaken) columns.cstr_type2 = 'CS_ALAP';
    else {
      findings.push({
        kind: 'approximation',
        entity: 'constraint',
        sourceRef: activity.id,
        detail:
          'as-late-as-possible could not be exported alongside a primary and secondary constraint (only two P6 constraint slots)',
        reason: 'P6 carries at most two constraint slots per activity (ADR-0035 §12)',
      });
    }
  }

  return columns;
}

/** Emit a full-plan XER (PROJECT/CALENDAR/PROJWBS/TASK/TASKPRED/RSRC/TASKRSRC) from a canonical model. */
export function emitXerFromCanonical(model: CanonicalModel): XerEmitResult {
  const findings: ReportFinding[] = [];
  const projId = model.project.id;

  // --- PROJECT --------------------------------------------------------------------------------------
  const projectRow: Record<string, string> = {
    proj_id: projId,
    proj_short_name: model.project.name,
    last_recalc_date: model.project.dataDate,
    plan_start_date: model.project.dataDate,
    clndr_id: model.project.defaultCalendarId ?? '',
  };

  // --- CALENDAR -------------------------------------------------------------------------------------
  const calendarRows: Array<Record<string, string>> = model.calendars.map((calendar) => ({
    clndr_id: calendar.id,
    clndr_name: calendar.name,
    default_flag: calendar.id === model.project.defaultCalendarId ? 'Y' : 'N',
    day_hr_cnt: '8',
    clndr_data: emitClndrData(calendar),
  }));

  // --- PROJWBS (a row per WBS_SUMMARY activity, ADR-0038) -------------------------------------------
  const projwbsRows: Array<Record<string, string>> = [];
  const taskRows: Array<Record<string, string>> = [];
  for (const activity of model.activities) {
    if (activity.type === 'WBS_SUMMARY') {
      // Reverse `parentId = wbs:<parent_wbs_id>`; the project-root summary (parent null) has no parent.
      const parentWbsId = activity.parentId === null ? '' : toWbsId(activity.parentId);
      projwbsRows.push({
        wbs_id: toWbsId(activity.id),
        proj_id: projId,
        parent_wbs_id: parentWbsId,
        wbs_short_name: activity.code,
        wbs_name: activity.name,
      });
      continue;
    }

    // --- TASK (a real activity) ---------------------------------------------------------------------
    const taskType = TYPE_TO_TASK_TYPE[activity.type];
    const row: Record<string, string> = {
      task_id: activity.id,
      proj_id: projId,
      // Reverse `parentId = wbs:<wbs_id>`: a real activity's WBS parent becomes its `wbs_id` reference.
      wbs_id: activity.parentId === null ? '' : toWbsId(activity.parentId),
      task_code: activity.code,
      task_name: activity.name,
      task_type: taskType,
      target_drtn_hr_cnt: minutesToHours(activity.durationMinutes),
      clndr_id: activity.calendarId ?? '',
      status_code:
        activity.progress === null
          ? 'TK_NotStart'
          : STATUS_TO_STATUS_CODE[activity.progress.status],
      ...resolveConstraintColumns(activity, findings),
    };

    // Progress columns (ADR-0035 §6, ADR-0042) — written only for a progressed activity.
    const progress = activity.progress;
    if (progress !== null) {
      row.complete_pct = String(progress.percentComplete);
      if (progress.physicalPercentComplete !== null)
        row.phys_complete_pct = String(progress.physicalPercentComplete);
      row.complete_pct_type = PCT_TYPE_TO_CODE[progress.percentCompleteType];
      if (progress.actualStart !== null) row.act_start_date = progress.actualStart;
      if (progress.actualFinish !== null) row.act_end_date = progress.actualFinish;
      if (progress.suspendDate !== null) row.suspend_date = progress.suspendDate;
      if (progress.resumeDate !== null) row.resume_date = progress.resumeDate;
      if (progress.expectedFinish !== null) row.reend_date = progress.expectedFinish;
      if (progress.remainingDurationMinutes !== null)
        row.remain_drtn_hr_cnt = minutesToHours(progress.remainingDurationMinutes);
    }

    taskRows.push(row);
  }

  // --- TASKPRED -------------------------------------------------------------------------------------
  const taskPredRows: Array<Record<string, string>> = model.relationships.map((relationship) => ({
    task_pred_id: relationship.id,
    task_id: relationship.successorId,
    pred_task_id: relationship.predecessorId,
    pred_type: TYPE_TO_PRED_TYPE[relationship.type],
    lag_hr_cnt: minutesToHours(relationship.lagMinutes),
  }));

  // --- RSRC (the org resource library, ADR-0039) ----------------------------------------------------
  const rsrcRows: Array<Record<string, string>> = model.resources.map((resource) => {
    // P6's RSRC has no rate columns the adapter reads back, so a reserved cost/max-units rate is lossy.
    if (resource.costPerUnit !== null || resource.maxUnitsPerHour !== null) {
      findings.push({
        kind: 'approximation',
        entity: 'resource',
        sourceRef: resource.id,
        detail: `resource "${resource.name}" cost/max-units rate was not exported`,
        reason: 'the XER RSRC table carries no rate column the importer reads (ADR-0039/0042)',
      });
    }
    return {
      rsrc_id: resource.id,
      rsrc_short_name: resource.code ?? '',
      rsrc_name: resource.name,
      rsrc_type: KIND_TO_RSRC_TYPE[resource.kind],
      clndr_id: resource.calendarId ?? '',
    };
  });

  // --- TASKRSRC (resource assignments, ADR-0039/0040) -----------------------------------------------
  const taskRsrcRows: Array<Record<string, string>> = model.assignments.map((assignment) => {
    const row: Record<string, string> = {
      taskrsrc_id: assignment.id,
      task_id: assignment.activityId,
      rsrc_id: assignment.resourceId,
      target_qty: String(assignment.budgetedUnits),
      driving_flag: assignment.isDriving ? 'Y' : 'N',
      act_reg_qty: String(assignment.actualUnits),
    };
    if (assignment.unitsPerHour !== null) row.target_qty_per_hr = String(assignment.unitsPerHour);
    return row;
  });

  // Emit the core-network tables always; emit the rich tables only when they carry rows so a plain
  // core-network plan serialises to the same minimal file it did before M4c.
  const tables: XerTableData[] = [
    { name: 'PROJECT', fields: [...PROJECT_FIELDS], rows: [projectRow] },
    { name: 'CALENDAR', fields: [...CALENDAR_FIELDS], rows: calendarRows },
  ];
  if (projwbsRows.length > 0) {
    tables.push({ name: 'PROJWBS', fields: [...PROJWBS_FIELDS], rows: projwbsRows });
  }
  tables.push({ name: 'TASK', fields: [...TASK_FIELDS], rows: taskRows });
  tables.push({ name: 'TASKPRED', fields: [...TASKPRED_FIELDS], rows: taskPredRows });
  if (rsrcRows.length > 0) {
    tables.push({ name: 'RSRC', fields: [...RSRC_FIELDS], rows: rsrcRows });
  }
  if (taskRsrcRows.length > 0) {
    tables.push({ name: 'TASKRSRC', fields: [...TASKRSRC_FIELDS], rows: taskRsrcRows });
  }

  return { tables, findings };
}
