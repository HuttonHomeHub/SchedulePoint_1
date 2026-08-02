import type {
  CanonicalActivity,
  CanonicalAssignment,
  CanonicalCalendar,
  CanonicalCalendarException,
  CanonicalModel,
  CanonicalRelationship,
  CanonicalResource,
  CanonicalShift,
  CanonicalWorkWeek,
} from './canonical.js';
import type { ExportCalendar, ExportGraph, ExportPlan } from './export-graph.js';
import type { ImportCalendarShift, ImportWorkWindow } from './import-graph.js';
import type { ReportFinding } from './report.js';

/**
 * The **SchedulePoint export-graph → canonical mapper** (ADR-0050 M4, Task 4a.2) — the dual of
 * {@link mapCanonicalToImportGraph}. A pure vocabulary translation from the domain-shaped
 * {@link ExportGraph} back to the format-neutral {@link CanonicalModel}: flat weekday **minute** shift
 * rows become per-day `"HH:MM"` work windows, inclusive date-range exceptions expand to one canonical
 * per-date exception each, and every node keeps its domain key as its source-local id so relationships,
 * WBS parentage and assignments still resolve. Constraints / progress / resources pass through unchanged.
 *
 * It is the near-inverse of the import mapper — near, not exact, because the domain carries two shapes the
 * canonical model cannot: a **multi-day** exception range (expanded to per-date exceptions — lossless, the
 * same set of dates) and an exception **label** (the canonical model / XER `clndr_data` have no slot — a
 * reported drop). Everything else is a pure shape change, so like the import mapper it is lossless and
 * deterministic; the reported findings cover only those two genuine coercions.
 */

/** A stable synthetic project id for the single exported plan (the source-local id the emitter uses as `proj_id`). */
const SYNTHETIC_PROJECT_ID = 'SP_PLAN';

/** Canonical work-week keys in weekday order (0 = Monday … 6 = Sunday) — mirrors the import mapper's WEEK_ORDER. */
const WEEK_ORDER: ReadonlyArray<keyof CanonicalWorkWeek> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** Minutes from midnight `[0, 1440]` → `"HH:MM"` (1440 → the exclusive end-of-day `"24:00"`). */
function minutesToClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function windowToShift(window: ImportWorkWindow): CanonicalShift {
  return { start: minutesToClock(window.startMinute), end: minutesToClock(window.endMinute) };
}

/** Every `YYYY-MM-DD` date in the inclusive `[from, to]` range (pure UTC arithmetic; single date when from === to). */
function expandExceptionDates(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [from];
  const dates: string[] = [];
  const MS_PER_DAY = 86_400_000;
  for (let ms = start; ms <= end; ms += MS_PER_DAY) {
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

/**
 * Derive what the FOREIGN format should call this calendar from its SchedulePoint tier (ADR-0053 §5) —
 * the inverse of the import mapper's `resolveCalendarScope`, and the reason an export→import round trip
 * preserves the tier instead of flattening every calendar into the shared library.
 *
 * The resource test comes FIRST, mirroring the import rule that forces a resource's calendar to `ORG`:
 * emitting `CA_Rsrc` is what makes a re-import put it back in the shared library (where a resource can
 * legally hold it) rather than in whichever project happened to receive the file.
 *
 * Note the deliberate asymmetry on the remaining ORG rows: they emit `CA_Base`, but a re-import lands a
 * `CA_Base` calendar at PROJECT scope unless the importer explicitly passes `globalCalendarScope: 'ORG'`.
 * That is the point — the file states the tier faithfully, and the *receiving* tenant decides whether a
 * foreign file may write its shared library.
 */
function calendarSourceType(
  calendar: ExportCalendar,
  heldByResource: boolean,
): CanonicalCalendar['sourceType'] {
  if (heldByResource) return 'RESOURCE';
  return calendar.scope === 'ORG' ? 'GLOBAL' : 'PROJECT';
}

/** Map one export calendar (weekday minute shifts + dated ranges) back to a canonical calendar. */
function mapCalendar(
  calendar: ExportCalendar,
  sourceType: CanonicalCalendar['sourceType'],
  findings: ReportFinding[],
): CanonicalCalendar {
  const workWeek: CanonicalWorkWeek = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  for (const shift of calendar.shifts as readonly ImportCalendarShift[]) {
    const key = WEEK_ORDER[shift.weekday];
    if (key === undefined) continue;
    workWeek[key] = [...workWeek[key], windowToShift(shift)];
  }

  const exceptions: CanonicalCalendarException[] = [];
  let droppedLabels = 0;
  for (const exception of calendar.exceptions) {
    if (exception.label !== null) droppedLabels += 1;
    const shifts = exception.windows.map(windowToShift);
    for (const date of expandExceptionDates(exception.startDate, exception.endDate)) {
      exceptions.push({ date, working: shifts.length > 0, shifts });
    }
  }
  if (droppedLabels > 0) {
    findings.push({
      kind: 'drop',
      entity: 'calendar',
      sourceRef: calendar.key,
      detail: `${droppedLabels} calendar exception label(s) were dropped`,
      reason: 'the interchange formats carry no exception label (ADR-0050)',
    });
  }

  return {
    id: calendar.key,
    name: calendar.name,
    sourceType,
    // Spread, never `undefined`: `exactOptionalPropertyTypes` counts an explicit `undefined` as a
    // present key, and the canonical schema is `.strict()`.
    ...(calendar.hoursPerDay === undefined ? {} : { hoursPerDay: calendar.hoursPerDay }),
    workWeek,
    exceptions,
  };
}

function mapPlan(plan: ExportPlan): CanonicalModel['project'] {
  return {
    id: SYNTHETIC_PROJECT_ID,
    name: plan.name,
    dataDate: plan.dataDate,
    defaultCalendarId: plan.defaultCalendarKey,
  };
}

export interface ExportMapResult {
  readonly model: CanonicalModel;
  readonly findings: ReportFinding[];
}

/** Map a SchedulePoint export graph to a canonical model. Pure + deterministic; near-lossless (see the module doc). */
export function mapExportGraphToCanonical(graph: ExportGraph): ExportMapResult {
  const findings: ReportFinding[] = [];

  // Which calendars an exported resource holds — the set that must be emitted as resource calendars so
  // the tier survives a round trip (see `calendarSourceType`). Built once, consulted per calendar.
  const resourceHeldCalendarKeys = new Set(
    graph.resources
      .map((resource) => resource.calendarKey)
      .filter((key): key is string => key !== null),
  );

  const calendars: CanonicalCalendar[] = graph.calendars.map((calendar) =>
    mapCalendar(
      calendar,
      calendarSourceType(calendar, resourceHeldCalendarKeys.has(calendar.key)),
      findings,
    ),
  );

  const activities: CanonicalActivity[] = graph.activities.map((activity) => ({
    id: activity.key,
    code: activity.code,
    name: activity.name,
    type: activity.type,
    durationMinutes: activity.durationMinutes,
    calendarId: activity.calendarKey,
    parentId: activity.parentKey,
    constraintType: activity.constraintType,
    constraintDate: activity.constraintDate,
    secondaryConstraintType: activity.secondaryConstraintType,
    secondaryConstraintDate: activity.secondaryConstraintDate,
    scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
    progress: activity.progress,
  }));

  const relationships: CanonicalRelationship[] = graph.dependencies.map((dependency) => ({
    id: dependency.key,
    predecessorId: dependency.predecessorKey,
    successorId: dependency.successorKey,
    type: dependency.type,
    lagMinutes: dependency.lagMinutes,
  }));

  const resources: CanonicalResource[] = graph.resources.map((resource) => ({
    id: resource.key,
    name: resource.name,
    code: resource.code,
    kind: resource.kind,
    calendarId: resource.calendarKey,
    costPerUnit: resource.costPerUnit,
    maxUnitsPerHour: resource.maxUnitsPerHour,
  }));

  const assignments: CanonicalAssignment[] = graph.assignments.map((assignment) => ({
    id: assignment.key,
    activityId: assignment.activityKey,
    resourceId: assignment.resourceKey,
    budgetedUnits: assignment.budgetedUnits,
    unitsPerHour: assignment.unitsPerHour,
    isDriving: assignment.isDriving,
    actualUnits: assignment.actualUnits,
    lagMinutes: assignment.lagMinutes,
  }));

  // The join lag (ADR-0071 §1) reaches the canonical model and stops there: neither serialiser writes
  // it, because this repository has never seen a real export carrying one and will not invent a column
  // name (ADR-0071 §5). Reported **only when there is something to lose** — a plan whose resources all
  // join with their activities loses nothing, and a standing finding on every export would train a
  // reader to skip the section that matters. The count is named so a planner can tell whether the
  // programme they are handing over is one of the affected ones.
  const laggedAssignments = graph.assignments.filter((assignment) => assignment.lagMinutes > 0);
  if (laggedAssignments.length > 0) {
    findings.push({
      kind: 'drop',
      entity: 'assignment',
      sourceRef: null,
      detail: `${String(laggedAssignments.length)} resource assignment(s) carry a join delay, which is not written to the exported file`,
      reason:
        'no interchange format this repository has verified carries a per-assignment lag; the receiving tool will read every resource as starting with its activity (ADR-0071 §5)',
    });
  }

  const model: CanonicalModel = {
    source: { format: 'XER', version: null, filename: null },
    project: mapPlan(graph.plan),
    calendars,
    activities,
    relationships,
    resources,
    assignments,
  };

  return { model, findings };
}
