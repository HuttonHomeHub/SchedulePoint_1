import type {
  CanonicalActivity,
  CanonicalAssignment,
  CanonicalCalendar,
  CanonicalConstraintType,
  CanonicalModel,
  CanonicalProgress,
  CanonicalRelationship,
  CanonicalRelationshipType,
  CanonicalResource,
  CanonicalResourceKind,
  CanonicalShift,
  CanonicalWorkWeek,
} from './canonical.js';
import { branch, leaf, type MspdiNode } from './mspdi-serialiser.js';
import type { ReportFinding } from './report.js';

/**
 * The **canonical → MSPDI element emitter** (ADR-0050 M4b, Task 4b.2 + M4c) — the inverse of
 * {@link adaptMspdiToCanonical}. It turns a {@link CanonicalModel} into the Microsoft Project `<Project>`
 * element tree, reversing the exact vocabulary the adapter reads: the numeric `<Type>` link enum
 * (`0 = FF, 1 = FS, 2 = SF, 3 = SS`), the `<ConstraintType>` enum (`1 = ALAP, 2 = MSO … 7 = FNLT`), the
 * ISO-8601 `PT#H#M#S` duration convention, the **tenths-of-a-minute** `<LinkLag>` unit, the
 * `<WeekDays>/<WeekDay>` calendar shape, MSP's single-milestone model, and — new for M4c — the
 * **outline-level WBS** (`<Summary>` + `<OutlineLevel>`, reversing the adapter's summary-stack inference),
 * task constraints/progress, and the `<Resources>` / `<Assignments>` tables.
 *
 * Scope (M4c): the core network **plus** WBS summaries + parentage, constraints, progress, and
 * resources + assignments. Where Microsoft Project cannot represent a SchedulePoint concept exactly it
 * emits the nearest form and reports an **approximation** (never a silent drop): MSP has a single
 * constraint slot (a secondary constraint rides `<Deadline>`, only expressible as a Finish-No-Later-Than
 * bound; a mandatory constraint has no MSP equivalent), no suspend/resume/expected-finish progress, one
 * percent-complete measure (always duration-based on re-import), and no per-assignment driving flag or
 * production rate. XER, by contrast, carries all of these exactly (see {@link emitXerFromCanonical}). Pure +
 * deterministic: no I/O, clock or randomness.
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
 * Canonical `ConstraintType` → MSP `<ConstraintType>` number, the inverse of the adapter's
 * `CONSTRAINT_TYPE_TO_CANONICAL` (`2 = MSO, 3 = MFO, 4 = SNET, 5 = SNLT, 6 = FNET, 7 = FNLT`). MSP has **no**
 * mandatory-constraint concept, so `MANDATORY_START` / `MANDATORY_FINISH` are absent here (reported as an
 * approximation). ALAP is emitted separately as `<ConstraintType>1`.
 */
const CONSTRAINT_TYPE_TO_NUMBER: Readonly<Partial<Record<CanonicalConstraintType, string>>> = {
  MSO: '2',
  MFO: '3',
  SNET: '4',
  SNLT: '5',
  FNET: '6',
  FNLT: '7',
};

/**
 * Canonical resource kind → MSP `<Resource><Type>` number, the inverse of the adapter's
 * `RESOURCE_TYPE_TO_CANONICAL` (`0 = Material, 1 = Work/Labour, 2 = Cost→Equipment`). An EQUIPMENT resource
 * round-trips through MSP's Cost type (the adapter re-reads Cost as EQUIPMENT with its own approximation).
 */
const KIND_TO_RESOURCE_NUMBER: Readonly<Record<CanonicalResourceKind, string>> = {
  MATERIAL: '0',
  LABOUR: '1',
  EQUIPMENT: '2',
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

/** Whole units (of work) → an ISO-8601 `PT#H#M#S` timespan the adapter reads back as `minutes / 60` units. */
function unitsToIsoWork(units: number): string {
  return minutesToIsoDuration(Math.round(units * 60));
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

/** An activity paired with its computed MSP outline level (1-based; a WBS root is level 1). */
interface OrderedActivity {
  readonly activity: CanonicalActivity;
  readonly level: number;
}

/**
 * Flatten the WBS forest into the document order + `<OutlineLevel>` MSP expects — the inverse of the
 * adapter's summary-stack parent inference. A pre-order DFS emits each summary immediately before its
 * subtree (so a summary's children are contiguous and deeper-levelled), which is exactly what lets the
 * adapter reconstruct each task's `parentId` from the nearest shallower preceding summary. Any activity
 * whose `parentId` does not resolve to an in-model activity is treated as a root (defensive; the export
 * graph is already validated).
 */
function orderActivitiesForOutline(activities: readonly CanonicalActivity[]): OrderedActivity[] {
  const byId = new Map(activities.map((a) => [a.id, a] as const));
  const childrenOf = new Map<string, CanonicalActivity[]>();
  const roots: CanonicalActivity[] = [];
  for (const activity of activities) {
    const parentId = activity.parentId;
    if (parentId !== null && byId.has(parentId)) {
      const list = childrenOf.get(parentId);
      if (list === undefined) childrenOf.set(parentId, [activity]);
      else list.push(activity);
    } else {
      roots.push(activity);
    }
  }

  const ordered: OrderedActivity[] = [];
  const visit = (activity: CanonicalActivity, level: number): void => {
    ordered.push({ activity, level });
    // Only a WBS summary parents a subtree (ADR-0038); guard so a stray child never recurses forever.
    if (activity.type === 'WBS_SUMMARY') {
      for (const child of childrenOf.get(activity.id) ?? []) visit(child, level + 1);
    }
  };
  for (const root of roots) visit(root, 1);
  return ordered;
}

/**
 * Emit a task's `<ConstraintType>`/`<ConstraintDate>` + `<Deadline>` children, reversing the adapter's
 * `mapConstraints`. The primary constraint (or ALAP) fills MSP's single constraint slot; a secondary
 * constraint is approximated as a `<Deadline>` (a soft Finish-No-Later-Than target — MSP's only second
 * finish bound). Genuinely inexpressible cases (a mandatory primary, a non-FNLT secondary, ALAP colliding
 * with a primary constraint) are reported as approximations.
 */
function constraintNodes(activity: CanonicalActivity, findings: ReportFinding[]): MspdiNode[] {
  const nodes: MspdiNode[] = [];

  // --- Primary constraint slot (a constraint, or ALAP) ---
  let primarySlotUsed = false;
  if (activity.constraintType !== null) {
    const number = CONSTRAINT_TYPE_TO_NUMBER[activity.constraintType];
    if (number === undefined) {
      findings.push({
        kind: 'approximation',
        entity: 'constraint',
        sourceRef: activity.id,
        detail: `constraint "${activity.constraintType}" has no Microsoft Project equivalent and was dropped`,
        reason: 'MSP has no mandatory-constraint type (ADR-0035 §7)',
      });
    } else {
      nodes.push(leaf('ConstraintType', number));
      if (activity.constraintDate !== null)
        nodes.push(leaf('ConstraintDate', toMspDateTime(activity.constraintDate)));
      primarySlotUsed = true;
    }
  }
  if (activity.scheduleAsLateAsPossible) {
    if (!primarySlotUsed) {
      // ALAP is MSP ConstraintType 1. The primary slot is now consumed, but nothing below reads the
      // flag again (the secondary constraint rides <Deadline>), so we don't re-assign it.
      nodes.push(leaf('ConstraintType', '1'));
    } else {
      findings.push({
        kind: 'approximation',
        entity: 'constraint',
        sourceRef: activity.id,
        detail:
          'as-late-as-possible could not be exported alongside a primary constraint (MSP has one constraint slot)',
        reason: 'MSP carries a single constraint per task (ADR-0035 §12)',
      });
    }
  }

  // --- Secondary constraint → a <Deadline> (best-effort) ---
  if (activity.secondaryConstraintType !== null) {
    if (activity.secondaryConstraintType === 'FNLT' && activity.secondaryConstraintDate !== null) {
      nodes.push(leaf('Deadline', toMspDateTime(activity.secondaryConstraintDate)));
      findings.push({
        kind: 'approximation',
        entity: 'constraint',
        sourceRef: activity.id,
        detail: `secondary Finish-No-Later-Than constraint exported as an MSP deadline (${activity.secondaryConstraintDate})`,
        reason:
          'MSP has one constraint slot; a secondary constraint rides <Deadline> (ADR-0035 §12)',
      });
    } else {
      findings.push({
        kind: 'approximation',
        entity: 'constraint',
        sourceRef: activity.id,
        detail: `secondary "${activity.secondaryConstraintType}" constraint could not be represented in Microsoft Project and was dropped`,
        reason: 'MSP can only express a secondary finish bound as a deadline (ADR-0035 §12)',
      });
    }
  }

  return nodes;
}

/**
 * Emit a progressed task's MSP progress children, reversing the adapter's `mapProgress`. MSP carries
 * percent-complete, physical percent-complete, actual start/finish and remaining duration; it has **no**
 * suspend/resume/expected-finish and **one** percent-complete measure (re-read as duration-based), so those
 * are reported as approximations rather than silently lost.
 */
function progressNodes(
  activity: CanonicalActivity,
  progress: CanonicalProgress,
  findings: ReportFinding[],
): MspdiNode[] {
  const nodes: MspdiNode[] = [leaf('PercentComplete', String(progress.percentComplete))];
  if (progress.physicalPercentComplete !== null)
    nodes.push(leaf('PhysicalPercentComplete', String(progress.physicalPercentComplete)));
  if (progress.actualStart !== null)
    nodes.push(leaf('ActualStart', toMspDateTime(progress.actualStart)));
  if (progress.actualFinish !== null)
    nodes.push(leaf('ActualFinish', toMspDateTime(progress.actualFinish)));
  if (progress.remainingDurationMinutes !== null)
    nodes.push(leaf('RemainingDuration', minutesToIsoDuration(progress.remainingDurationMinutes)));

  if (progress.percentCompleteType !== 'DURATION') {
    findings.push({
      kind: 'approximation',
      entity: 'progress',
      sourceRef: activity.id,
      detail: `percent-complete type "${progress.percentCompleteType}" is re-read as duration-based on import`,
      reason: 'MSP has a single percent-complete measure (ADR-0042)',
    });
  }
  if (progress.suspendDate !== null || progress.resumeDate !== null) {
    findings.push({
      kind: 'approximation',
      entity: 'progress',
      sourceRef: activity.id,
      detail: 'suspend/resume dates were not exported',
      reason: 'MSP has no suspend/resume progress concept (ADR-0035 §6)',
    });
  }
  if (progress.expectedFinish !== null) {
    findings.push({
      kind: 'approximation',
      entity: 'progress',
      sourceRef: activity.id,
      detail: 'expected-finish date was not exported',
      reason: 'MSP has no expected-finish progress concept (ADR-0035 §6)',
    });
  }

  return nodes;
}

/** A `<Resource>` element from a canonical resource (ADR-0039). */
function resourceNode(resource: CanonicalResource, findings: ReportFinding[]): MspdiNode {
  if (resource.costPerUnit !== null || resource.maxUnitsPerHour !== null) {
    findings.push({
      kind: 'approximation',
      entity: 'resource',
      sourceRef: resource.id,
      detail: `resource "${resource.name}" cost/max-units rate was not exported`,
      reason: 'the MSPDI resource mapping carries no rate the importer reads (ADR-0039/0042)',
    });
  }
  const children: MspdiNode[] = [
    leaf('UID', resource.id),
    leaf('Name', resource.name),
    leaf('Type', KIND_TO_RESOURCE_NUMBER[resource.kind]),
  ];
  if (resource.code !== null) children.push(leaf('Code', resource.code));
  if (resource.calendarId !== null) children.push(leaf('CalendarUID', resource.calendarId));
  return branch('Resource', children);
}

/** An `<Assignment>` element from a canonical assignment (ADR-0039/0040). */
function assignmentNode(assignment: CanonicalAssignment, findings: ReportFinding[]): MspdiNode {
  // MSP has neither a driving flag nor a per-assignment production rate — both are honest approximations.
  if (assignment.isDriving) {
    findings.push({
      kind: 'approximation',
      entity: 'assignment',
      sourceRef: assignment.id,
      detail: 'the driving-resource flag was not exported',
      reason: 'MSP has no driving-assignment concept (ADR-0039)',
    });
  }
  if (assignment.unitsPerHour !== null) {
    findings.push({
      kind: 'approximation',
      entity: 'assignment',
      sourceRef: assignment.id,
      detail: 'the units-per-hour production rate was not exported',
      reason: 'MSP has no per-assignment production rate (ADR-0040)',
    });
  }
  return branch('Assignment', [
    leaf('UID', assignment.id),
    leaf('TaskUID', assignment.activityId),
    leaf('ResourceUID', assignment.resourceId),
    leaf('Work', unitsToIsoWork(assignment.budgetedUnits)),
    leaf('ActualWork', unitsToIsoWork(assignment.actualUnits)),
  ]);
}

/** Emit the full-plan MSPDI `<Project>` tree (Project/Calendars/Tasks/Resources/Assignments) from a model. */
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

  // --- Tasks (WBS summaries + real activities, in outline order) -------------------------------------
  const taskNodes: MspdiNode[] = [];
  for (const { activity, level } of orderActivitiesForOutline(model.activities)) {
    const isSummary = activity.type === 'WBS_SUMMARY';
    const isMilestone = activity.type === 'START_MILESTONE' || activity.type === 'FINISH_MILESTONE';

    const children: MspdiNode[] = [
      leaf('UID', activity.id),
      leaf('Name', activity.name),
      // The adapter reads the code from <WBS> (falling back to <ID>); emit it as <WBS>.
      leaf('WBS', activity.code),
      leaf('OutlineLevel', String(level)),
    ];
    if (isSummary) children.push(leaf('Summary', '1'));
    if (isMilestone) children.push(leaf('Milestone', '1'));
    children.push(leaf('Duration', minutesToIsoDuration(activity.durationMinutes)));
    if (activity.calendarId !== null) children.push(leaf('CalendarUID', activity.calendarId));

    // Constraints + progress ride the real-activity <Task>s (a summary carries neither).
    if (!isSummary) {
      children.push(...constraintNodes(activity, findings));
      if (activity.progress !== null)
        children.push(...progressNodes(activity, activity.progress, findings));
    }

    for (const relationship of linksBySuccessor.get(activity.id) ?? []) {
      children.push(predecessorLinkNode(relationship));
    }

    taskNodes.push(branch('Task', children));
  }

  // --- Resources + assignments ----------------------------------------------------------------------
  const resourceNodes: MspdiNode[] = model.resources.map((resource) =>
    resourceNode(resource, findings),
  );
  const assignmentNodes: MspdiNode[] = model.assignments.map((assignment) =>
    assignmentNode(assignment, findings),
  );

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
  if (resourceNodes.length > 0) projectChildren.push(branch('Resources', resourceNodes));
  if (assignmentNodes.length > 0) projectChildren.push(branch('Assignments', assignmentNodes));

  const root = branch('Project', projectChildren);

  return { root, findings };
}
