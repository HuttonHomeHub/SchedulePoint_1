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
 * key). This step is lossless — it changes shape, not meaning — so it emits no findings today; the array
 * is returned for symmetry (the reject/repair/report work happens in the validate step).
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

function mapCalendar(calendar: CanonicalCalendar): ImportCalendar {
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

  return { key: calendar.id, name: calendar.name, shifts, exceptions };
}

export interface MapResult {
  readonly graph: ImportGraph;
  readonly findings: ReportFinding[];
}

/** Map a canonical model to a (pre-validation) SchedulePoint import graph. Pure, lossless, deterministic. */
export function mapCanonicalToImportGraph(model: CanonicalModel): MapResult {
  const calendars: ImportCalendar[] = model.calendars.map(mapCalendar);

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

  return { graph, findings: [] };
}
