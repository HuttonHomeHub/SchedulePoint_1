import type {
  CanonicalActivity,
  CanonicalActivityLayout,
  CanonicalAssignment,
  CanonicalCalendar,
  CanonicalCalendarException,
  CanonicalModel,
  CanonicalRelationship,
  CanonicalResource,
  CanonicalShift,
  CanonicalSwimlanes,
  CanonicalWorkWeek,
} from './canonical.js';
import type { ExportCalendar, ExportGraph, ExportPlan } from './export-graph.js';
import type { ImportCalendarShift, ImportWorkWindow } from './import-graph.js';
import {
  noteBodiesToPlainNotes,
  SCHEDULEPOINT_NOTES_TOPIC,
  stripInvisibleControls,
} from './note-text.js';
import type { ReportFinding } from './report.js';
import { foldSwimlaneName, isSwimlaneName } from './xer-layout-fields.js';

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

/** What the swimlane half of the layout resolved to: the canonical answer and who is in which swimlane. */
interface MappedSwimlanes {
  readonly model: CanonicalSwimlanes;
  /** Export key of a swimlane -> its name, for the swimlanes the file will list. Empty under a WBS source. */
  readonly nameOfKey: ReadonlyMap<string, string>;
}

/**
 * The plan-level swimlane field of a SchedulePoint XER (swimlanes M4-T5), or undefined when the plan has
 * none, so a swimlane-free plan exports exactly the bytes it always did.
 *
 * A plan "has swimlanes" when its source is not `NONE` or when it holds hand-made ones (a `NONE` plan can
 * keep them, switched off). Names are held to the same shape the reader holds them to
 * (`isSwimlaneName`, folded; the graph schema already caps the list at 100), so a file we write is never one our reader trims: a name
 * that fails, or repeats an earlier one ignoring case, is left out and reported once. A `WBS` source lists
 * no names and no membership - the reader ignores hand-made swimlanes under it, and the WBS the file
 * already carries is what puts each activity in its swimlane.
 */
function mapSwimlanes(graph: ExportGraph, findings: ReportFinding[]): MappedSwimlanes | undefined {
  const source = graph.plan.swimlaneSource ?? 'NONE';
  const listed = graph.swimlanes ?? [];
  if (source === 'NONE' && listed.length === 0) return undefined;
  if (source === 'WBS') {
    return {
      model: { source, wbsLevel: graph.plan.swimlaneWbsLevel ?? null, names: [] },
      nameOfKey: new Map(),
    };
  }

  const names: string[] = [];
  const nameOfKey = new Map<string, string>();
  const seen = new Set<string>();
  let refused = 0;
  for (const swimlane of listed) {
    const folded = foldSwimlaneName(swimlane.name);
    if (!isSwimlaneName(swimlane.name) || seen.has(folded)) {
      refused += 1;
      continue;
    }
    seen.add(folded);
    names.push(swimlane.name);
    nameOfKey.set(swimlane.key, swimlane.name);
  }
  if (refused > 0) {
    findings.push({
      kind: 'drop',
      entity: 'project',
      sourceRef: null,
      detail: `${String(refused)} swimlane(s) were not written to the exported file`,
      reason:
        'a swimlane name must be 1 to 80 characters without control characters and unique ignoring case (xer-layout-fields)',
    });
  }
  return { model: { source, wbsLevel: null, names }, nameOfKey };
}

/**
 * The picture one activity carries into a format that writes it: the placement, the row and, when it is
 * in a listed swimlane, the swimlane and the lane inside it. Absent when there is nothing to say. A
 * summary is never placed and never a member (ADR-0038).
 */
function mapLayout(
  activity: ExportGraph['activities'][number],
  carriesLayout: boolean,
  swimlanes: MappedSwimlanes | undefined,
): { layout?: CanonicalActivityLayout } {
  if (!carriesLayout) return {};
  const swimlane =
    activity.type === 'WBS_SUMMARY' || activity.swimlaneKey == null
      ? undefined
      : swimlanes?.nameOfKey.get(activity.swimlaneKey);
  if (activity.visualStart == null && activity.laneIndex == null && swimlane === undefined) {
    return {};
  }
  return {
    layout: {
      placedStart: activity.type === 'WBS_SUMMARY' ? null : (activity.visualStart ?? null),
      lane: activity.laneIndex ?? null,
      ...(swimlane === undefined ? {} : { swimlane, swimlaneLane: activity.swimlaneLane ?? null }),
    },
  };
}

/**
 * What an export leaves out of a plan that holds P6 activity codes (ADR-0210 D13): no format writes them
 * yet, and a plan whose swimlanes come from a code is written as having no swimlane source. Both are
 * reported, never lost silently (ADR-0050); a plan without codes reports nothing and writes the same bytes.
 */
function reportUnwrittenCodes(graph: ExportGraph, findings: ReportFinding[]): void {
  const types = graph.codeTypeCount ?? 0;
  if (types > 0) {
    findings.push({
      kind: 'drop',
      entity: 'project',
      sourceRef: null,
      detail: `${String(types)} code type(s) and the values set on activities were not written to the exported file`,
      reason:
        'an export does not write P6 activity codes yet; writing them waits for a real P6 file to confirm the format (ADR-0210)',
    });
  }
  if (graph.swimlaneCodeName !== undefined) {
    findings.push({
      kind: 'drop',
      entity: 'project',
      sourceRef: null,
      detail: `the plan's swimlanes come from the code ${graph.swimlaneCodeName}, which is not written; the exported file has no swimlanes made from it`,
      reason:
        'a code is not written by an export yet, so neither are swimlanes made from one (ADR-0210)',
    });
  }
}

/**
 * The notes the target format will write, and the findings for what it will not or cannot keep. ONE
 * producer for both formats, for the reason the placement finding gives below: two copies would drift
 * and each would look right alone. Every finding is aggregate. Authors and dates are never written, so
 * the approximation says so whenever any note is.
 */
function mapNotes(
  graph: ExportGraph,
  format: ExportMapOptions['notesFormat'],
  findings: ReportFinding[],
): { activityId: string; body: string }[] {
  const planNotes = graph.planNoteCount ?? 0;
  const overLimit = graph.unwrittenNoteCount ?? 0;
  const dropped = (count: number, detail: string, reason: string): void => {
    if (count > 0) findings.push({ kind: 'drop', entity: 'note', sourceRef: null, detail, reason });
  };
  const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

  if (format === undefined) return [];
  dropped(
    planNotes,
    `${plural(planNotes, 'plan note')} ${planNotes === 1 ? 'was' : 'were'} not written to the exported file`,
    'this format has no field for a note on the plan itself',
  );
  dropped(
    overLimit,
    `${plural(overLimit, 'activity note')} ${overLimit === 1 ? 'was' : 'were'} not written to the exported file`,
    'an export carries at most 20,000 notes',
  );

  const summaryIds = new Set(
    graph.activities.filter((a) => a.type === 'WBS_SUMMARY').map((activity) => activity.key),
  );
  const written: { activityId: string; body: string }[] = [];
  let onSummaries = 0;
  for (const note of graph.notes ?? []) {
    if (format === 'XER' && summaryIds.has(note.activityKey)) onSummaries += 1;
    else written.push({ activityId: note.activityKey, body: note.body });
  }
  dropped(
    onSummaries,
    `${plural(onSummaries, 'note')} on WBS summaries ${onSummaries === 1 ? 'was' : 'were'} not written to the exported file`,
    'a P6 memo belongs to a task, and a WBS summary exports as a PROJWBS row',
  );
  if (written.length === 0) return written;

  // The emitters strip direction overrides and zero-width characters (they can make a remark read
  // differently from what it says); the report says how many notes that touched.
  const stripped = written.filter((note) => stripInvisibleControls(note.body) !== note.body).length;
  if (stripped > 0) {
    findings.push({
      kind: 'approximation',
      entity: 'note',
      sourceRef: null,
      detail: `invisible direction and zero-width characters were removed from ${plural(stripped, 'note')}`,
      reason: 'they can make a note read differently from what it says',
    });
  }

  findings.push({
    kind: 'approximation',
    entity: 'note',
    sourceRef: null,
    detail:
      format === 'XER'
        ? `${plural(written.length, 'note')} written as the P6 notebook topic '${SCHEDULEPOINT_NOTES_TOPIC}'; authors and dates are not written`
        : `${plural(written.length, 'note')} written as task notes; authors and dates are not written`,
    reason:
      format === 'XER'
        ? 'P6 memos carry text only, so the author and date of each note stay in SchedulePoint'
        : 'an MSPDI task note carries text only, so the author and date of each note stay in SchedulePoint',
  });

  if (format === 'MSPDI') {
    const bodiesByActivity = new Map<string, string[]>();
    for (const note of written) {
      const list = bodiesByActivity.get(note.activityId);
      if (list === undefined) bodiesByActivity.set(note.activityId, [note.body]);
      else list.push(note.body);
    }
    let joined = 0;
    let cleaned = 0;
    for (const bodies of bodiesByActivity.values()) {
      if (bodies.length > 1) joined += 1;
      // Counted after the invisible characters, which have their own finding above.
      if (noteBodiesToPlainNotes(bodies.map(stripInvisibleControls)).removedForbidden) cleaned += 1;
    }
    if (joined > 0) {
      findings.push({
        kind: 'approximation',
        entity: 'note',
        sourceRef: null,
        detail: `the notes of ${joined} ${joined === 1 ? 'activity' : 'activities'} were joined into one task note each, separated by a rule`,
        reason:
          'an MSPDI task has a single Notes field, so re-importing this file gives one note, not several',
      });
    }
    if (cleaned > 0) {
      findings.push({
        kind: 'approximation',
        entity: 'note',
        sourceRef: null,
        detail: `characters XML 1.0 forbids were removed from the notes of ${cleaned} ${cleaned === 1 ? 'activity' : 'activities'}`,
        reason: 'the file would otherwise not be well-formed XML',
      });
    }
  }
  return written;
}

export interface ExportMapResult {
  readonly model: CanonicalModel;
  readonly findings: ReportFinding[];
}

/** Map a SchedulePoint export graph to a canonical model. Pure + deterministic; near-lossless (see the module doc). */
export interface ExportMapOptions {
  /**
   * The target format writes SchedulePoint's layout — hand-placed starts and lanes — as its own fields
   * (layout-interchange: XER only; MSPDI is the deferred M5). Decides whether the canonical model carries
   * a `layout` at all, and what the one placement finding says: a format that carries the layout loses
   * nothing SchedulePoint needs back.
   */
  readonly carriesLayout?: boolean;
  /**
   * The target format states a summary's and a level-of-effort's duration (ADR-0197: MSPDI; XER has
   * no field for a summary's and P6 recomputes an LOE's). Decides whether the canonical activity
   * carries `derivedDurationMinutes`, so an emitter that cannot use it is never handed it.
   */
  readonly carriesDerivedDuration?: boolean;
  /**
   * How the target format writes activity notes, which decides what the one notes finding set says and
   * which notes it can place (notes-through-interchange M2). Absent = the format writes none, so the
   * model carries none.
   * - `XER`: one P6 memo per task under the SchedulePoint notebook topic. A WBS summary exports as a
   *   `PROJWBS` row, which `TASKMEMO` cannot key on, so its notes are counted and left out.
   * - `MSPDI`: one `<Notes>` per task, summaries included; several notes on one task are joined.
   */
  readonly notesFormat?: 'XER' | 'MSPDI';
}

export function mapExportGraphToCanonical(
  graph: ExportGraph,
  options: ExportMapOptions = {},
): ExportMapResult {
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

  const swimlanes = options.carriesLayout === true ? mapSwimlanes(graph, findings) : undefined;

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
    // The picture: the placement and the lane. On the canonical model only for a format that writes it
    // (XER), so no other emitter can start reading a field it was never meant to carry (M3 security
    // review). A summary is never placed, so its placement is dropped here.
    ...mapLayout(activity, options.carriesLayout === true, swimlanes),
    ...(options.carriesDerivedDuration === true &&
    (activity.type === 'WBS_SUMMARY' || activity.type === 'LEVEL_OF_EFFORT') &&
    activity.derivedDurationMinutes != null
      ? { derivedDurationMinutes: activity.derivedDurationMinutes }
      : {}),
  }));

  // The hand-placement (one-planning-surface; amended by layout-interchange M3). Reported **only when
  // there is something to say** — a programme nobody has hand-placed has nothing another tool would show
  // differently, and a standing finding on every export trains a reader to skip the section.
  //
  // A format that carries the layout (XER) writes every placement and lane as SchedulePoint's own fields,
  // so SchedulePoint loses nothing and the finding is an **approximation**: other tools cannot read the
  // fields and show each activity at its computed dates. A format that does not (MSPDI, until M5) drops
  // the placement outright. Lanes alone are never reported: no tool other than SchedulePoint has lanes.
  //
  // ONE producer. Neither `export-xer.ts` nor `export-mspdi.ts` repeats it — two copies would drift,
  // and the drift would be invisible because each looks right alone (ADR-0065). A structural test
  // pins that neither serialiser so much as mentions the field.
  const placedActivities = graph.activities.filter(
    (activity) => activity.visualStart !== null && activity.visualStart !== undefined,
  );
  if (placedActivities.length > 0 && options.carriesLayout === true) {
    const lanes = graph.activities.filter((activity) => activity.laneIndex != null).length;
    findings.push({
      kind: 'approximation',
      entity: 'activity',
      sourceRef: null,
      detail: `${String(placedActivities.length)} hand-placed start(s) and ${String(lanes)} lane(s) written as SchedulePoint layout fields; P6 and other tools show every activity at its computed dates`,
      reason:
        'a hand-placement is a SchedulePoint concept; only SchedulePoint reads these fields back (layout-interchange)',
    });
  } else if (placedActivities.length > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${String(placedActivities.length)} activity(ies) carry a hand-placed start, which is not written to the exported file`,
      reason:
        'this format has no field for a hand-placement; the receiving tool will read every activity at its computed dates (one-planning-surface)',
    });
  }

  // The swimlanes, reported by the same rule as the placement: only when the plan has some. XER writes them
  // as SchedulePoint's own fields (only SchedulePoint reads them back); a format without the fields
  // loses them outright. ONE producer, for the reason the placement finding gives above.
  if (swimlanes !== undefined) {
    const members = graph.activities.filter(
      (activity) => activity.swimlaneKey != null && swimlanes.nameOfKey.has(activity.swimlaneKey),
    ).length;
    findings.push({
      kind: 'approximation',
      entity: 'project',
      sourceRef: null,
      detail:
        swimlanes.model.source === 'WBS'
          ? 'the plan takes its swimlanes from the WBS; the source and level were written as a SchedulePoint layout field, but lanes inside swimlanes are not carried (they are packed again on import) and hand-made swimlanes kept on the plan are not written'
          : `${String(swimlanes.model.names.length)} swimlane(s) and ${String(members)} membership(s) written as SchedulePoint layout fields; P6 and other tools show no swimlanes`,
      reason:
        'a swimlane is a SchedulePoint concept; only SchedulePoint reads these fields back (swimlanes M4-T5)',
    });
  } else if (
    (graph.plan.swimlaneSource ?? 'NONE') !== 'NONE' ||
    (graph.swimlanes?.length ?? 0) > 0
  ) {
    findings.push({
      kind: 'drop',
      entity: 'project',
      sourceRef: null,
      detail: "the plan's swimlanes are not written to the exported file",
      reason:
        'this format has no field for a swimlane; the receiving tool shows none (swimlanes M4-T5)',
    });
  }

  reportUnwrittenCodes(graph, findings);
  const notes = mapNotes(graph, options.notesFormat, findings);

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
    ...(swimlanes === undefined ? {} : { swimlanes: swimlanes.model }),
    ...(notes.length === 0 ? {} : { notes }),
  };

  return { model, findings };
}
