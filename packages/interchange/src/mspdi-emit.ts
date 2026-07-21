import type {
  CanonicalActivity,
  CanonicalCalendar,
  CanonicalModel,
  CanonicalRelationship,
  CanonicalRelationshipType,
  CanonicalShift,
  CanonicalWorkWeek,
} from './canonical.js';
import { branch, leaf, type MspdiNode } from './mspdi-serialiser.js';
import type { ReportFinding } from './report.js';

/**
 * The **canonical → MSPDI element emitter** (ADR-0050 M4b, Task 4b.2) — the inverse of
 * {@link adaptMspdiToCanonical}. It turns a {@link CanonicalModel} into the Microsoft Project
 * `<Project>` / `<Calendars>/<Calendar>` / `<Tasks>/<Task>` / `<PredecessorLink>` element tree (the M4b
 * **core network**), reversing the exact vocabulary the adapter reads: the numeric `<Type>` link enum
 * (`0 = FF, 1 = FS, 2 = SF, 3 = SS` — confirmed from `LINK_TYPE_TO_CANONICAL`), the ISO-8601 `PT#H#M#S`
 * duration convention, the **tenths-of-a-minute** `<LinkLag>` unit, the `<WeekDays>/<WeekDay>` calendar
 * shape (`DayType` 1 = Sunday … 7 = Saturday, `<WorkingTimes>/<WorkingTime>` windows, `<TimePeriod>`
 * exceptions), and MSP's single-milestone model. Emitting these against the real element names the adapter
 * reads is what makes the round trip (export → re-import) close — the same {@link CanonicalModel} the XER
 * emitter serialises produces a valid MSPDI too (ADR-0050: "a format is a serialiser, not a second
 * pipeline").
 *
 * Best-effort + honest (ADR-0035 reject/repair/report, bidirectional): anything the M4b core-network scope
 * does not yet serialise — WBS summaries, constraints, progress, ALAP, resources/assignments (all M4c) — is
 * **dropped and reported**, never silently omitted, reusing the exact same finding shapes as the XER
 * emitter. Pure + deterministic: no I/O, clock or randomness.
 */

/** The MSPDI `<SaveVersion>` we advertise — a widely-readable recent MS Project schema (2013 = 14.0). */
export const EXPORT_MSPDI_VERSION = '14.0';

/** Canonical relationship type → MSP `<PredecessorLink><Type>` number (the inverse of LINK_TYPE_TO_CANONICAL). */
const TYPE_TO_LINK_NUMBER: Readonly<Record<CanonicalRelationshipType, string>> = {
  FF: '0',
  FS: '1',
  SF: '2',
  SS: '3',
};

/**
 * MSP `DayType` order 1..7 mapped back to the canonical work-week key (the inverse of the parser's
 * MSP_DAY_TO_KEY: 1 = Sunday … 7 = Saturday), so the base week emits in MSP's own day order.
 */
const MSP_DAY_ORDER: ReadonlyArray<[number, keyof CanonicalWorkWeek]> = [
  [1, 'sunday'],
  [2, 'monday'],
  [3, 'tuesday'],
  [4, 'wednesday'],
  [5, 'thursday'],
  [6, 'friday'],
  [7, 'saturday'],
];

/** Working-minutes → an ISO-8601 `PT#H#M#S` timespan (the inverse of the adapter's `durationToMinutes`). */
function minutesToIsoDuration(minutes: number): string {
  const whole = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  return `PT${hours}H${mins}M0S`;
}

/** Working-minutes → tenths-of-a-minute `<LinkLag>` (the inverse of the adapter's `linkLag / 10`). Signed. */
function minutesToLinkLag(minutes: number): string {
  return String(Math.trunc(minutes) * 10);
}

/** A `YYYY-MM-DD` date → an MSP datetime leaf value (`"2026-01-01T00:00:00"`); the adapter reads the date prefix. */
function toMspDateTime(isoDate: string): string {
  return `${isoDate}T00:00:00`;
}

/** A canonical `"HH:MM"` clock → an MSP `HH:MM:SS` time; `"24:00"` stays `"24:00:00"` (re-read as `24:00`). */
function clockToMsp(clock: string): string {
  return `${clock}:00`;
}

/** One `<WorkingTime>` window from a canonical shift. */
function workingTimeNode(shift: CanonicalShift): MspdiNode {
  return branch('WorkingTime', [
    leaf('FromTime', clockToMsp(shift.start)),
    leaf('ToTime', clockToMsp(shift.end)),
  ]);
}

/** A base-week `<WeekDay>` (DayType 1..7): DayWorking + optional `<WorkingTimes>` windows. */
function baseWeekDayNode(dayNumber: number, shifts: readonly CanonicalShift[]): MspdiNode {
  const working = shifts.length > 0;
  const children: MspdiNode[] = [
    leaf('DayType', String(dayNumber)),
    leaf('DayWorking', working ? '1' : '0'),
  ];
  if (working) {
    children.push(branch('WorkingTimes', shifts.map(workingTimeNode)));
  }
  return branch('WeekDay', children);
}

/** An exception `<WeekDay>` (DayType 0 + `<TimePeriod>`): a dated non-working day or exceptional working day. */
function exceptionWeekDayNode(exception: CanonicalCalendar['exceptions'][number]): MspdiNode {
  const working = exception.working && exception.shifts.length > 0;
  const children: MspdiNode[] = [
    leaf('DayType', '0'),
    leaf('DayWorking', working ? '1' : '0'),
    branch('TimePeriod', [
      leaf('FromDate', toMspDateTime(exception.date)),
      leaf('ToDate', toMspDateTime(exception.date)),
    ]),
  ];
  if (working) {
    children.push(branch('WorkingTimes', exception.shifts.map(workingTimeNode)));
  }
  return branch('WeekDay', children);
}

/** A `<Calendar>` element from a canonical calendar: UID + Name + `<WeekDays>` (base week + exceptions). */
function calendarNode(calendar: CanonicalCalendar): MspdiNode {
  const weekDays: MspdiNode[] = MSP_DAY_ORDER.map(([dayNumber, key]) =>
    baseWeekDayNode(dayNumber, calendar.workWeek[key]),
  );
  for (const exception of calendar.exceptions) {
    weekDays.push(exceptionWeekDayNode(exception));
  }
  return branch('Calendar', [
    leaf('UID', calendar.id),
    leaf('Name', calendar.name),
    branch('WeekDays', weekDays),
  ]);
}

/** A `<PredecessorLink>` (nested in the successor task) from a canonical relationship. */
function predecessorLinkNode(relationship: CanonicalRelationship): MspdiNode {
  return branch('PredecessorLink', [
    leaf('PredecessorUID', relationship.predecessorId),
    leaf('Type', TYPE_TO_LINK_NUMBER[relationship.type]),
    leaf('LinkLag', minutesToLinkLag(relationship.lagMinutes)),
  ]);
}

export interface MspdiEmitResult {
  readonly root: MspdiNode;
  readonly findings: ReportFinding[];
}

/** Emit the M4b core-network MSPDI `<Project>` tree (Project/Calendars/Tasks/PredecessorLinks) from a model. */
export function emitMspdiFromCanonical(model: CanonicalModel): MspdiEmitResult {
  const findings: ReportFinding[] = [];

  // --- Calendars ------------------------------------------------------------------------------------
  const calendarNodes: MspdiNode[] = model.calendars.map(calendarNode);

  // --- Predecessor links grouped by successor (MSP nests them inside the successor <Task>) -----------
  const linksBySuccessor = new Map<string, CanonicalRelationship[]>();
  for (const relationship of model.relationships) {
    const list = linksBySuccessor.get(relationship.successorId);
    if (list === undefined) linksBySuccessor.set(relationship.successorId, [relationship]);
    else list.push(relationship);
  }

  // --- Tasks ----------------------------------------------------------------------------------------
  const taskNodes: MspdiNode[] = [];
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
    const isMilestone =
      typedActivity.type === 'START_MILESTONE' || typedActivity.type === 'FINISH_MILESTONE';

    const children: MspdiNode[] = [
      leaf('UID', activity.id),
      leaf('Name', activity.name),
      // The adapter reads the code from <WBS> (falling back to <ID>); emit it as <WBS>.
      leaf('WBS', activity.code),
    ];
    if (isMilestone) children.push(leaf('Milestone', '1'));
    children.push(leaf('Duration', minutesToIsoDuration(activity.durationMinutes)));
    if (activity.calendarId !== null) children.push(leaf('CalendarUID', activity.calendarId));
    for (const relationship of linksBySuccessor.get(activity.id) ?? []) {
      children.push(predecessorLinkNode(relationship));
    }

    taskNodes.push(branch('Task', children));
  }

  // --- The <Project> root ---------------------------------------------------------------------------
  const projectChildren: MspdiNode[] = [
    leaf('SaveVersion', EXPORT_MSPDI_VERSION),
    leaf('UID', model.project.id),
    leaf('Name', model.project.name),
    leaf('CurrentDate', toMspDateTime(model.project.dataDate)),
  ];
  if (model.project.defaultCalendarId !== null) {
    projectChildren.push(leaf('CalendarUID', model.project.defaultCalendarId));
  }
  projectChildren.push(branch('Calendars', calendarNodes));
  projectChildren.push(branch('Tasks', taskNodes));

  const root = branch('Project', projectChildren);

  // --- Report the out-of-M4b-scope data we could not serialise (M4c completes these) ----------------
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

  return { root, findings };
}
