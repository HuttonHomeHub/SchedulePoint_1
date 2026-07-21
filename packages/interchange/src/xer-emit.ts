import type {
  CanonicalActivity,
  CanonicalActivityType,
  CanonicalCalendar,
  CanonicalModel,
  CanonicalRelationshipType,
  CanonicalWorkWeek,
} from './canonical.js';
import type { ReportFinding } from './report.js';
import type { XerTableData } from './xer-serialiser.js';

/**
 * The **canonical → XER table emitter** (ADR-0050 M4, Task 4a.3) — the inverse of {@link adaptXerToCanonical}.
 * It turns a {@link CanonicalModel} into the P6 `PROJECT` / `CALENDAR` / `TASK` / `TASKPRED` tables (the
 * M4a **core network**), reversing the exact vocabulary the adapter reads: the `TT_*` / `PR_*` enum
 * spellings, the **working-minutes → hours** unit convention (ADR-0036), and P6's proprietary `clndr_data`
 * work-pattern blob (reversing {@link parseClndrData}). Emitting these against the real field names the
 * adapter reads is what makes the round trip (export → re-import) close.
 *
 * Best-effort + honest (ADR-0035 reject/repair/report, now bidirectional): anything the M4a core-network
 * scope does not yet serialise — WBS summaries, constraints, progress, ALAP, resources/assignments
 * (all M4c) — is **dropped and reported**, never silently omitted. Pure + deterministic: no I/O, clock or
 * randomness.
 */

/** The P6 XER version string we advertise. A widely-compatible recent P6 schema; see the mapping contract. */
export const EXPORT_XER_VERSION = '18.8';

/** Canonical activity type → P6 `task_type`. `WBS_SUMMARY` has no `TASK` mapping (emitted via PROJWBS at M4c). */
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
const TASK_FIELDS = [
  'task_id',
  'task_code',
  'task_name',
  'task_type',
  'target_drtn_hr_cnt',
  'clndr_id',
  'status_code',
] as const;
const TASKPRED_FIELDS = [
  'task_pred_id',
  'task_id',
  'pred_task_id',
  'pred_type',
  'lag_hr_cnt',
] as const;

export interface XerEmitResult {
  readonly tables: XerTableData[];
  readonly findings: ReportFinding[];
}

/** Emit the M4a core-network XER tables (PROJECT/CALENDAR/TASK/TASKPRED) from a canonical model. */
export function emitXerFromCanonical(model: CanonicalModel): XerEmitResult {
  const findings: ReportFinding[] = [];

  // --- PROJECT --------------------------------------------------------------------------------------
  const projectRow: Record<string, string> = {
    proj_id: model.project.id,
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

  // --- TASK -----------------------------------------------------------------------------------------
  const taskRows: Array<Record<string, string>> = [];
  let droppedSummaries = 0;
  let droppedParents = 0;
  let droppedConstraints = 0;
  let droppedProgress = 0;
  let droppedAlap = 0;
  for (const activity of model.activities) {
    if (activity.type === 'WBS_SUMMARY') {
      droppedSummaries += 1;
      continue;
    }
    if (activity.parentId !== null) droppedParents += 1;
    if (activity.constraintType !== null || activity.secondaryConstraintType !== null) {
      droppedConstraints += 1;
    }
    if (activity.progress !== null) droppedProgress += 1;
    if (activity.scheduleAsLateAsPossible) droppedAlap += 1;

    const typedActivity: CanonicalActivity = activity;
    const taskType =
      TYPE_TO_TASK_TYPE[typedActivity.type as Exclude<CanonicalActivityType, 'WBS_SUMMARY'>];
    taskRows.push({
      task_id: activity.id,
      task_code: activity.code,
      task_name: activity.name,
      task_type: taskType,
      target_drtn_hr_cnt: minutesToHours(activity.durationMinutes),
      clndr_id: activity.calendarId ?? '',
      status_code: 'TK_NotStart',
    });
  }

  // --- TASKPRED -------------------------------------------------------------------------------------
  const taskPredRows: Array<Record<string, string>> = model.relationships.map((relationship) => ({
    task_pred_id: relationship.id,
    task_id: relationship.successorId,
    pred_task_id: relationship.predecessorId,
    pred_type: TYPE_TO_PRED_TYPE[relationship.type],
    lag_hr_cnt: minutesToHours(relationship.lagMinutes),
  }));

  // --- Report the out-of-M4a-scope data we could not serialise (M4c completes these) ----------------
  if (droppedSummaries > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${droppedSummaries} WBS summary activit(y/ies) were not exported`,
      reason: 'WBS hierarchy export lands in a later milestone (ADR-0050 M4c)',
    });
  }
  if (droppedParents > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${droppedParents} activity WBS parent link(s) were not exported`,
      reason: 'WBS hierarchy export lands in a later milestone (ADR-0050 M4c)',
    });
  }
  if (droppedConstraints > 0) {
    findings.push({
      kind: 'drop',
      entity: 'constraint',
      sourceRef: null,
      detail: `${droppedConstraints} activity constraint(s) were not exported`,
      reason: 'constraint export lands in a later milestone (ADR-0050 M4c)',
    });
  }
  if (droppedProgress > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${droppedProgress} activity progress record(s) were not exported`,
      reason: 'progress export lands in a later milestone (ADR-0050 M4c)',
    });
  }
  if (droppedAlap > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${droppedAlap} as-late-as-possible flag(s) were not exported`,
      reason: 'ALAP export lands in a later milestone (ADR-0050 M4c)',
    });
  }
  if (model.resources.length > 0) {
    findings.push({
      kind: 'drop',
      entity: 'resource',
      sourceRef: null,
      detail: `${model.resources.length} resource(s) were not exported`,
      reason: 'resource export lands in a later milestone (ADR-0050 M4c)',
    });
  }
  if (model.assignments.length > 0) {
    findings.push({
      kind: 'drop',
      entity: 'assignment',
      sourceRef: null,
      detail: `${model.assignments.length} resource assignment(s) were not exported`,
      reason: 'resource-assignment export lands in a later milestone (ADR-0050 M4c)',
    });
  }

  const tables: XerTableData[] = [
    { name: 'PROJECT', fields: [...PROJECT_FIELDS], rows: [projectRow] },
    { name: 'CALENDAR', fields: [...CALENDAR_FIELDS], rows: calendarRows },
    { name: 'TASK', fields: [...TASK_FIELDS], rows: taskRows },
    { name: 'TASKPRED', fields: [...TASKPRED_FIELDS], rows: taskPredRows },
  ];

  return { tables, findings };
}
