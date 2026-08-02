import type {
  CanonicalCalendar,
  CanonicalModel,
  CanonicalShift,
  CanonicalWorkWeek,
} from './canonical.js';
import type {
  ImportActivity,
  ImportAssignment,
  ImportCalendar,
  ImportCalendarException,
  ImportCalendarScope,
  ImportCalendarShift,
  ImportDependency,
  ImportGraph,
  ImportResource,
  ImportWorkWindow,
} from './import-graph.js';
import type { ReportFinding } from './report.js';

/**
 * The **canonical → SchedulePoint import-graph mapper** (ADR-0050, Task 1.3 step 2). A pure vocabulary
 * translation from the format-neutral {@link CanonicalModel} to the domain-shaped {@link ImportGraph}:
 * per-day `"HH:MM"` work windows become flat weekday **minute** shift rows (`weekday` 0 = Monday …
 * 6 = Sunday), single-date exceptions become inclusive date ranges with minute windows, and every node
 * keeps its stable source id as its **import key** so dependencies, WBS parentage and assignments resolve.
 * M2's WBS `parentId`, constraint slots, progress, resources and assignments pass through unchanged (id →
 * key).
 *
 * It is lossless in *shape*, and it makes exactly ONE decision: the **calendar tier** each imported
 * calendar lands at (ADR-0053 §5 — see {@link resolveCalendarScope}). That decision is reported per
 * calendar, never silent, so the findings array is no longer always empty (the rest of the reject/repair/
 * report work still happens in the validate step).
 */

/** Canonical work-week keys in weekday order (0 = Monday … 6 = Sunday). */
const WEEK_ORDER: ReadonlyArray<keyof CanonicalWorkWeek> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** `"HH:MM"` (or `"24:00"`) → minutes from midnight, `[0, 1440]`. */
function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(':');
  return Number(h) * 60 + Number(m);
}

function shiftToWindow(shift: CanonicalShift): ImportWorkWindow {
  return { startMinute: clockToMinutes(shift.start), endMinute: clockToMinutes(shift.end) };
}

/**
 * Decide the **tier** one imported calendar lands at (ADR-0053 §5) and say why, in one place.
 *
 * The driving force: before this rule, every imported calendar was created in the shared **organisation**
 * library, so importing three P6 files silently added a dozen shared `Standard 5 Day` calendars every
 * other project then had to scroll past — schedule import was a tenant-wide pollution vector. The default
 * is therefore **PROJECT** (pinned by the persisting layer to the import's target project, and deleted
 * with it), and ORG is reserved for the two cases that genuinely need shared state:
 *
 * 1. **A calendar an imported resource holds** → forced **ORG**, whatever the source called it. A
 *    `Resource` is org-global, so `assertCalendarUsableBy` hard-rejects a project calendar on one
 *    (422 `RESOURCE_REQUIRES_ORG_CALENDAR`, ADR-0053 §2) — a project-scoped resource calendar would fail
 *    the commit, or worse, quietly reschedule the resource on the wrong calendar. Reported, because the
 *    import wrote shared tenant state.
 * 2. **A source GLOBAL (`CA_Base`) calendar** → **PROJECT** by default with a "promote it if you want it
 *    shared" recommendation, or **ORG** when the caller explicitly opts in with `globalCalendarScope`.
 *    A foreign file must never write the shared library on the strength of its own say-so.
 *
 * Rule 1 wins over rule 2 (a global calendar a resource holds is still forced to ORG) — otherwise the
 * commit would reject a perfectly importable file.
 */
function resolveCalendarScope(
  calendar: CanonicalCalendar,
  heldByResource: boolean,
  globalCalendarScope: ImportCalendarScope,
  findings: ReportFinding[],
): ImportCalendarScope {
  if (heldByResource) {
    findings.push({
      kind: 'approximation',
      entity: 'calendar',
      sourceRef: calendar.id,
      detail: `calendar “${calendar.name}” was created in the shared organisation library (organisation scope) because an imported resource uses it`,
      reason:
        'a resource is organisation-global, so it can only hold an organisation calendar (ADR-0053 §2)',
    });
    return 'ORG';
  }

  if (calendar.sourceType === 'GLOBAL') {
    if (globalCalendarScope === 'ORG') {
      findings.push({
        kind: 'approximation',
        entity: 'calendar',
        sourceRef: calendar.id,
        detail: `global calendar “${calendar.name}” was created in the shared organisation library (organisation scope) at your request`,
        reason: 'globalCalendarScope: "ORG" was requested for this import (ADR-0053 §5)',
      });
      return 'ORG';
    }
    findings.push({
      kind: 'approximation',
      entity: 'calendar',
      sourceRef: calendar.id,
      detail: `global calendar “${calendar.name}” was created in this project (project scope); promote it to the organisation library if other projects need it`,
      reason:
        'an imported file never writes the shared organisation library by default (ADR-0053 §5)',
    });
    return 'PROJECT';
  }

  return 'PROJECT';
}

function mapCalendar(calendar: CanonicalCalendar, scope: ImportCalendarScope): ImportCalendar {
  const shifts: ImportCalendarShift[] = [];
  for (let weekday = 0; weekday < WEEK_ORDER.length; weekday += 1) {
    const key = WEEK_ORDER[weekday];
    if (key === undefined) continue;
    for (const shift of calendar.workWeek[key]) {
      const window = shiftToWindow(shift);
      shifts.push({ weekday, startMinute: window.startMinute, endMinute: window.endMinute });
    }
  }

  const exceptions: ImportCalendarException[] = calendar.exceptions.map((exception) => ({
    startDate: exception.date,
    endDate: exception.date,
    label: null,
    windows: exception.shifts.map(shiftToWindow),
  }));

  return {
    key: calendar.id,
    name: calendar.name,
    scope,
    // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes` treats an explicit
    // `undefined` as a present key, and the graph schema is `.strict()`.
    ...(calendar.hoursPerDay === undefined ? {} : { hoursPerDay: calendar.hoursPerDay }),
    shifts,
    exceptions,
  };
}

export interface MapResult {
  readonly graph: ImportGraph;
  readonly findings: ReportFinding[];
}

/** Caller-supplied mapping choices. Absent = the safe defaults, so an existing caller is unaffected. */
export interface MapOptions {
  /**
   * Where a source **global** (P6 `CA_Base`) calendar should land (ADR-0053 §5). `PROJECT` (the default)
   * keeps a foreign file out of the shared organisation library; `ORG` is the explicit opt-in for a
   * planner who really is importing their enterprise calendar set. Everything else is unaffected: a
   * project calendar always lands at `PROJECT`, and a resource's calendar is always forced to `ORG`.
   */
  readonly globalCalendarScope?: ImportCalendarScope;
}

/** Map a canonical model to a (pre-validation) SchedulePoint import graph. Pure, lossless, deterministic. */
export function mapCanonicalToImportGraph(
  model: CanonicalModel,
  options: MapOptions = {},
): MapResult {
  const findings: ReportFinding[] = [];
  const globalCalendarScope = options.globalCalendarScope ?? 'PROJECT';

  // Which calendars an imported RESOURCE holds — the set that must land in the shared org library
  // whatever the source called them (rule 1 above). Built once, consulted per calendar.
  const resourceHeldCalendarIds = new Set(
    model.resources
      .map((resource) => resource.calendarId)
      .filter((id): id is string => id !== null),
  );

  const calendars: ImportCalendar[] = model.calendars.map((calendar) =>
    mapCalendar(
      calendar,
      resolveCalendarScope(
        calendar,
        resourceHeldCalendarIds.has(calendar.id),
        globalCalendarScope,
        findings,
      ),
    ),
  );

  const activities: ImportActivity[] = model.activities.map((activity) => ({
    key: activity.id,
    code: activity.code,
    name: activity.name,
    type: activity.type,
    durationMinutes: activity.durationMinutes,
    calendarKey: activity.calendarId,
    parentKey: activity.parentId,
    constraintType: activity.constraintType,
    constraintDate: activity.constraintDate,
    secondaryConstraintType: activity.secondaryConstraintType,
    secondaryConstraintDate: activity.secondaryConstraintDate,
    scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
    progress: activity.progress,
  }));

  const dependencies: ImportDependency[] = model.relationships.map((relationship) => ({
    key: relationship.id,
    predecessorKey: relationship.predecessorId,
    successorKey: relationship.successorId,
    type: relationship.type,
    lagMinutes: relationship.lagMinutes,
  }));

  const resources: ImportResource[] = model.resources.map((resource) => ({
    key: resource.id,
    name: resource.name,
    code: resource.code,
    kind: resource.kind,
    calendarKey: resource.calendarId,
    costPerUnit: resource.costPerUnit,
    maxUnitsPerHour: resource.maxUnitsPerHour,
  }));

  const assignments: ImportAssignment[] = model.assignments.map((assignment) => ({
    key: assignment.id,
    activityKey: assignment.activityId,
    resourceKey: assignment.resourceId,
    budgetedUnits: assignment.budgetedUnits,
    unitsPerHour: assignment.unitsPerHour,
    isDriving: assignment.isDriving,
    // Carried through rather than defaulted, so a parser that learns to read a lag needs no change
    // here (ADR-0071 §5). 0 from every parser today.
    lagMinutes: assignment.lagMinutes,
    actualUnits: assignment.actualUnits,
  }));

  const graph: ImportGraph = {
    plan: {
      name: model.project.name,
      dataDate: model.project.dataDate,
      defaultCalendarKey: model.project.defaultCalendarId,
    },
    calendars,
    activities,
    dependencies,
    resources,
    assignments,
  };

  return { graph, findings };
}
