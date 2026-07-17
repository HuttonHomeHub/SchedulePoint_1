import { NEAR_CRITICAL_THRESHOLD_MINUTES } from './constants';
import {
  clampBackwardFinish,
  clampForwardStart,
  clampSecondaryBackwardFinish,
  isLoe,
  isMandatory,
  isMilestone,
  isSummary,
} from './constraints';
import { buildGraph } from './graph';
import {
  advanceWorking,
  offsetFromDataDate,
  rollBackwardToWorking,
  rollForwardToWorking,
} from './instants';
import {
  nextCalendarDay,
  remainingHonoursPredecessor,
  resolveProgress,
  type ProgressMode,
  type ResolvedProgress,
} from './progress';
import type {
  CriticalPathDefinition,
  EngineActivity,
  EngineEdge,
  EngineEdgeResult,
  EngineResult,
  EngineSummary,
  TotalFloatMode,
} from './types';
import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/** Inputs the CPM pass needs beyond the network itself. */
export interface ComputeOptions {
  /** The data date (`Plan.plannedStart`, `YYYY-MM-DD`) — the schedule's earliest instant. */
  dataDate: string;
  /**
   * The **plan** working-time calendar (ADR-0036/ADR-0037). Every activity that does not carry
   * its own `calendar` inherits this one — the byte-identical default path. Positions are
   * absolute working-instants, so each activity advances on **its own** calendar.
   */
  calendar: WorkingTimeCalendar;
  /**
   * The out-of-sequence recalc mode (M2, ADR-0035 §1). Governs how an **in-progress** activity's
   * remaining work treats predecessor logic; the three modes coincide on an unprogressed network.
   * Defaults to `RETAINED_LOGIC` (the P6 default, behaviour-preserving).
   */
  progressMode?: ProgressMode;
  /**
   * Expected-finish scheduling option (M4, ADR-0035 §9). When true, any **incomplete** activity that
   * carries an {@link EngineActivity.expectedFinish} has its remaining work recomputed so its early
   * finish lands on that date (floored at the start). Off (the default) ⇒ expected finishes are
   * ignored and the schedule is byte-identical to the pure-progress path.
   */
  useExpectedFinishDates?: boolean;
  /**
   * How criticality is decided (M6-F2, ADR-0035 §17–§20). `TOTAL_FLOAT` (the default) marks an
   * activity critical when its total float ≤ {@link criticalFloatThresholdMinutes}; `LONGEST_PATH`
   * marks the driving chain back from the latest-finishing activities. Off/absent ⇒ `TOTAL_FLOAT`,
   * byte-identical to the pre-M6 path.
   */
  criticalDefinition?: CriticalPathDefinition;
  /**
   * The total-float threshold (working **minutes**) at/below which an activity is critical under the
   * `TOTAL_FLOAT` definition (ADR-0035 §17). Defaults to 0 (P6/behaviour-preserving); a positive value
   * widens the critical band (e.g. treat ≤ 1 day of float as critical). Ignored under `LONGEST_PATH`.
   */
  criticalFloatThresholdMinutes?: number;
  /**
   * How total float is measured (M6-F3, ADR-0035 §18): `FINISH` (late−early finish, the default),
   * `START` (late−early start), or `SMALLEST` (the lesser). Off/absent ⇒ `FINISH`, byte-identical to
   * the pre-M6 path. Diverges from `FINISH` only on mixed calendars / progressed activities.
   */
  totalFloatMode?: TotalFloatMode;
  /**
   * Make open-ended activities critical (M6-F4, ADR-0035 §20). When true, every **open end** — an
   * activity with no predecessors OR no successors (a dangling either end, e.g. the fixture's
   * A9500/A3900/A12700) — is flagged critical, **OR-ed** with the active definition (so it never drops
   * an already-critical member). Off (the default) ⇒ byte-identical to the pre-M6 path (P6 default off).
   */
  makeOpenEndsCritical?: boolean;
}

/**
 * The calendar day of the working-minute at inclusive offset `index` on `calendar` (ADR-0023).
 * Take the instant one working-minute later (the exclusive boundary after `index`) and step back
 * a single real minute, so a start or finish that lands exactly on a **non-working gap** reads as
 * its true working day — the finish day for a finish, the next working day for a start — not the
 * empty gap instant. `index` is an offset **on `calendar`** (each activity uses its own).
 */
function workingIndexDate(calendar: WorkingTimeCalendar, dataDate: string, index: number): string {
  const endBoundary = calendar.addWorkingTime(dataDate, index + 1);
  const iso = endBoundary.length > 10 ? `${endBoundary}:00Z` : `${endBoundary}T00:00:00Z`;
  const instant = new Date(iso);
  instant.setUTCMinutes(instant.getUTCMinutes() - 1);
  return instant.toISOString().slice(0, 10);
}

/** The engine's full result: per-activity schedule, per-edge driving flags, plan roll-up. */
export interface EngineOutput {
  results: EngineResult[];
  edges: EngineEdgeResult[];
  summary: EngineSummary;
}

/**
 * Run the planned CPM forward/backward pass over a plan's network on the **absolute
 * working-instant** axis (ADR-0037) and map to inclusive calendar dates (ADR-0023).
 *
 * Positions are minutes-from-epoch, so activities on **different calendars** are comparable in
 * one frame: each activity advances its own start→finish on its own `calendar` (falling back to
 * the plan calendar), and its float and dates are measured on that calendar. When every activity
 * inherits the plan calendar this is a monotone relabelling of the old plan-offset arithmetic, so
 * the golden suite is byte-identical (the ADR-0037 parity gate). Only when writing the exposed
 * offsets do we project back to a common plan-calendar frame; float stays on the activity's own
 * calendar (ADR-0037 §4, P6/ADR-0035).
 *
 * Moderate constraints (SNET/SNLT/FNET/FNLT/MSO/MFO) clamp the passes; the two `MANDATORY_*` kinds
 * are parked as MSO/MFO and counted. A constraint logic cannot satisfy surfaces as **negative
 * total float** (and criticality), never an error.
 *
 * @throws {ScheduleGraphNotADagError} via {@link buildGraph} if the graph cycles.
 */
export function computeSchedule(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  options: ComputeOptions,
): EngineOutput {
  const { dataDate, calendar: planCalendar } = options;
  const progressMode: ProgressMode = options.progressMode ?? 'RETAINED_LOGIC';
  const useExpectedFinishDates = options.useExpectedFinishDates ?? false;
  const criticalDefinition: CriticalPathDefinition = options.criticalDefinition ?? 'TOTAL_FLOAT';
  const criticalThreshold = options.criticalFloatThresholdMinutes ?? 0;
  const totalFloatMode: TotalFloatMode = options.totalFloatMode ?? 'FINISH';
  const makeOpenEndsCritical = options.makeOpenEndsCritical ?? false;
  // How many in-progress activities had their remaining work resized to an expected finish (§9).
  let expectedFinishAppliedCount = 0;
  const graph = buildGraph(activities, edges);
  const dataDateAbs = instantToAbsMinutes(dataDate);
  const calendarOf = (activity: EngineActivity): WorkingTimeCalendar =>
    activity.calendar ?? planCalendar;

  // Classify each activity's progress once (M2, ADR-0035 §1–§2), resolving its actuals to instants
  // on its own calendar. An all-NOT_STARTED plan leaves every branch below on the ordinary planned
  // path — a byte-identical relabelling of the pre-M2 arithmetic (the golden-suite parity gate).
  const progressOf = new Map<string, ResolvedProgress>();
  for (const activity of activities) {
    progressOf.set(activity.id, resolveProgress(activity, calendarOf(activity), dataDateAbs));
  }

  // Forward pass (topological order): earliest start/finish INSTANTS. `earlyStart` is the post-gap
  // beginning of the activity's first working minute; `earlyFinish` is the exclusive end boundary
  // after its last working minute (= the start, for a zero-duration milestone). A **complete**
  // activity is frozen on its actuals; an **in-progress** one keeps its frozen actual start while
  // its remaining work reschedules forward from the data date (ADR-0035 §1–§2).
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  // The duration the BACKWARD pass should use per activity: the original duration, except an
  // Expected-Finish-resized activity (§9), whose effective span is its recomputed remaining — so its
  // late dates stay consistent with its early dates. Byte-identical (= original) for every other case.
  const effectiveDurationById = new Map<string, number>();
  // Mandatory produce-and-flag (ADR-0035 §7): true when a MANDATORY_* pin forced the start earlier
  // than the network-earliest (a stronger logic bound) — the schedule is produced, the violation flagged.
  const constraintViolated = new Map<string, boolean>();
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    const progress = progressOf.get(id)!;
    if (progress.status === 'COMPLETE') {
      // Frozen: neither logic nor the data date moves a completed activity (§1). Successors gate
      // off its actual finish.
      const start = progress.actualStartInst ?? progress.actualFinishInst!;
      earlyStart.set(id, start);
      earlyFinish.set(id, progress.actualFinishInst!);
      continue;
    }
    const inProgress = progress.status === 'IN_PROGRESS';
    let lower = dataDateAbs; // the data date floors any (remaining) work — never before it (§2)
    for (const edge of graph.incoming.get(id)!) {
      // A Level-of-Effort predecessor never drives or bounds its successor (ADR-0035 §21): the LOE is
      // a hammock that spans its neighbours, so its own (derived) dates carry no logic downstream.
      if (isLoe(graph.activities.get(edge.predecessorId)!.type)) continue;
      // For an IN-PROGRESS activity's remaining work, the recalc mode decides whether this
      // predecessor's tie still holds (ADR-0035 §1): Retained Logic keeps all; Progress Override
      // drops incomplete predecessors; Actual Dates drops all. A not-started activity always
      // follows full logic (this skip never applies to it).
      if (
        inProgress &&
        !remainingHonoursPredecessor(progressMode, progressOf.get(edge.predecessorId)!.status)
      ) {
        continue;
      }
      const predStart = earlyStart.get(edge.predecessorId)!;
      const predFinish = earlyFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predStart, predFinish, cal, duration, planCalendar);
      if (bound > lower) lower = bound;
    }
    // Suspend/resume (§4): a resume date floors the remaining at max(data date, resume date), so a
    // resume AFTER the data date pushes the remaining work out to it. Applies to all recalc modes.
    if (inProgress && progress.resumeInst !== null && progress.resumeInst > lower) {
      lower = progress.resumeInst;
    }
    // Actual Dates additionally floors the remaining at the actual start — max(data date, actual
    // start) — so a FUTURE actual start schedules its remaining from that date (ADR-0035 §1/§6).
    // Under N07 (no actual after the data date) the actual start ≤ the data date, so this is a no-op
    // and Actual Dates coincides with Progress Override for past-dated actuals.
    if (inProgress && progressMode === 'ACTUAL_DATES' && progress.actualStartInst! > lower) {
      lower = progress.actualStartInst!;
    }
    // A mandatory pin that drives the start EARLIER than logic wants (predecessors) breaks the
    // relationship — flag it (ADR-0035 §7). A pin later than logic just delays (no broken edge).
    const logicLower = lower;
    lower = clampForwardStart(activity, lower, cal, dataDateAbs);
    if (isMandatory(activity.constraintType) && lower < logicLower) {
      constraintViolated.set(id, true);
    }
    const workStart = rollForwardToWorking(cal, lower);
    // Expected Finish (§9): with the plan option on, RECOMPUTE the work remaining from `workStart` so
    // the early finish lands on the target date (its working-end boundary, like an actual finish),
    // floored at `workStart` — a target on/before the start collapses it to zero, never negative. It
    // applies to any INCOMPLETE activity: an in-progress one's remaining, and a NOT-started one's full
    // duration (the ADR-0035 §9 example A6200 is not-started). Off/absent ⇒ the ordinary work stands.
    const efResizedMinutes =
      useExpectedFinishDates && activity.expectedFinish != null && duration > 0
        ? Math.max(
            0,
            cal.workingTimeBetween(
              absMinutesToInstant(workStart),
              absMinutesToInstant(
                rollBackwardToWorking(
                  cal,
                  dataDateAbs,
                  instantToAbsMinutes(nextCalendarDay(activity.expectedFinish)),
                ),
              ),
            ),
          )
        : null;
    if (efResizedMinutes !== null) expectedFinishAppliedCount += 1;
    // The backward pass uses the resized span for an EF activity so its late dates match its early ones.
    effectiveDurationById.set(id, efResizedMinutes ?? duration);
    if (inProgress) {
      // Frozen actual start; the REMAINING work reschedules forward from the ties retained by the
      // recalc mode, floored at the data date (§2) — `workStart` above. Expected Finish overrides
      // the pure-progress remaining when set.
      earlyStart.set(id, progress.actualStartInst!);
      const remaining = efResizedMinutes ?? progress.remainingMinutes;
      earlyFinish.set(id, remaining === 0 ? workStart : advanceWorking(cal, workStart, remaining));
    } else {
      // NOT_STARTED — the ordinary planned path (byte-identical to the pre-M2 engine), unless an
      // expected finish resizes the full duration.
      earlyStart.set(id, workStart);
      const work = efResizedMinutes ?? duration;
      earlyFinish.set(id, work === 0 ? workStart : advanceWorking(cal, workStart, work));
    }
  }

  // Pass 2 — effective-Visual (ADR-0033, forward-only). Independent of the pure passes: it reads
  // only `earlyStart` (for the drift baseline) and never writes back, so `early*`/`late*`/float stay
  // a pure function of the network (golden-suite parity). Each activity's DISPLAY start is its
  // hand-placed `visualStart` when set — honoured exactly, even if infeasible (stay-and-flag) — else
  // its logic-earliest. Successors are pushed from the FEASIBLE finish, so a conflicted bar never
  // implies an impossible downstream sequence. All on the activity's own calendar (ADR-0037).
  const visualDisplayStart = new Map<string, number>();
  const visualPropStart = new Map<string, number>();
  const visualPropFinish = new Map<string, number>();
  const visualConflictMap = new Map<string, boolean>();
  const visualDriftMap = new Map<string, number | null>();
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    let logicEarliest = dataDateAbs;
    for (const edge of graph.incoming.get(id)!) {
      // An LOE predecessor never pushes its successor in the effective-Visual pass either (§21).
      if (isLoe(graph.activities.get(edge.predecessorId)!.type)) continue;
      const predPs = visualPropStart.get(edge.predecessorId)!;
      const predPf = visualPropFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predPs, predPf, cal, duration, planCalendar);
      if (bound > logicEarliest) logicEarliest = bound;
    }
    logicEarliest = rollForwardToWorking(
      cal,
      clampForwardStart(activity, logicEarliest, cal, dataDateAbs),
    );
    const placed =
      activity.visualStart != null
        ? rollForwardToWorking(cal, instantToAbsMinutes(activity.visualStart))
        : null;
    const display = placed ?? logicEarliest;
    const prop = placed !== null ? Math.max(placed, logicEarliest) : logicEarliest;
    visualDisplayStart.set(id, display);
    visualPropStart.set(id, prop);
    visualPropFinish.set(id, duration === 0 ? prop : advanceWorking(cal, prop, duration));
    // Conflict = a placement earlier than logic/lower-bound constraints allow (stay-and-flag).
    visualConflictMap.set(id, placed !== null && placed < logicEarliest);
    // Drift = placement − pure-network early start, measured on the activity's own calendar.
    visualDriftMap.set(
      id,
      placed !== null ? offsetFromDataDate(cal, earlyStart.get(id)!, placed) : null,
    );
  }

  // Driving edges (M3): an incoming edge drives its successor when its forward bound is exactly the
  // successor's early start. Reads only the forward-pass maps, so it never changes the dates.
  const edgeResults: EngineEdgeResult[] = [];
  for (const id of graph.order) {
    const successor = graph.activities.get(id)!;
    const cal = calendarOf(successor);
    const successorStart = earlyStart.get(id)!;
    const successorDuration = successor.durationMinutes;
    const successorIsLoe = isLoe(successor.type);
    for (const edge of graph.incoming.get(id)!) {
      // An edge that touches a Level-of-Effort activity is never a driver (§21): an LOE never drives a
      // successor, and its own dates are derived from the span (below) rather than from these bounds, so
      // a bound check against them would be meaningless. Force non-driving on either side.
      if (successorIsLoe || isLoe(graph.activities.get(edge.predecessorId)!.type)) {
        edgeResults.push({ edgeId: edge.id, isDriving: false });
        continue;
      }
      const predStart = earlyStart.get(edge.predecessorId)!;
      const predFinish = earlyFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(
        edge,
        predStart,
        predFinish,
        cal,
        successorDuration,
        planCalendar,
      );
      // The bound drives when, rolled onto the successor's calendar, it is exactly its early start.
      edgeResults.push({
        edgeId: edge.id,
        isDriving: rollForwardToWorking(cal, bound) === successorStart,
      });
    }
  }

  // Project finish is the latest early-finish INSTANT across the whole plan. A Level-of-Effort activity
  // is excluded (§21): its finish is derived from its FF-successor (a real activity already in this max),
  // so it can never extend the project end — and it must never drive it. A WBS-summary is excluded the
  // same way (§24): its finish is rolled up from its branch (real activities already in this max), so it
  // can never define the project end either.
  let projectFinishInstant: number | null = null;
  for (const id of graph.order) {
    const type = graph.activities.get(id)!.type;
    if (isLoe(type) || isSummary(type)) continue;
    const ef = earlyFinish.get(id)!;
    if (projectFinishInstant === null || ef > projectFinishInstant) projectFinishInstant = ef;
  }

  // Longest-Path critical set (M6-F2, ADR-0035 §17–§20). Only built when the plan selects LONGEST_PATH.
  // Seed every activity whose early finish IS the project finish (the latest-finishing activities — the
  // true "finish drivers", including open ends that end last), then walk BACKWARD over the M3 driving
  // edges. This is the contiguous chain of binding ties, which is why an open-ended, hugely-negative-
  // float activity that no driving chain reaches is NOT on it (scenario S07's A12700), though it is
  // critical under `TOTAL_FLOAT ≤ 0`. Reuses the per-edge driving flags — no extra pass over the dates.
  const onLongestPath = new Set<string>();
  if (criticalDefinition === 'LONGEST_PATH' && projectFinishInstant !== null) {
    const drivingById = new Map<string, boolean>(edgeResults.map((e) => [e.edgeId, e.isDriving]));
    const stack: string[] = [];
    for (const id of graph.order) {
      // An LOE is never on the longest path (§21): skip it as a seed. Its incoming/outgoing edges are
      // all non-driving (above), so the backward walk never traverses one either. A WBS-summary is
      // never on the longest path (§24) and carries no edges at all, so it is skipped the same way.
      const type = graph.activities.get(id)!.type;
      if (isLoe(type) || isSummary(type)) continue;
      if (earlyFinish.get(id) === projectFinishInstant && !onLongestPath.has(id)) {
        onLongestPath.add(id);
        stack.push(id);
      }
    }
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const edge of graph.incoming.get(id)!) {
        if (drivingById.get(edge.id) === true && !onLongestPath.has(edge.predecessorId)) {
          onLongestPath.add(edge.predecessorId);
          stack.push(edge.predecessorId);
        }
      }
    }
  }

  // Backward pass (reverse topological order): latest finish/start INSTANTS. Open ends (no
  // successors) are seeded from the project finish. `lateFinish` is rolled back to the activity's
  // own working end boundary; `lateStart` is its own duration back from there.
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  const projectFinish = projectFinishInstant ?? dataDateAbs;
  for (let i = graph.order.length - 1; i >= 0; i -= 1) {
    const id = graph.order[i]!;
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const progress = progressOf.get(id)!;
    if (progress.status === 'COMPLETE') {
      // Frozen: a completed activity's late dates are its actuals — it carries zero float (§1).
      lateFinish.set(id, progress.actualFinishInst!);
      lateStart.set(id, progress.actualStartInst ?? progress.actualFinishInst!);
      continue;
    }
    // The Expected-Finish-resized span for an EF activity, else the original duration (§9). Keeps an
    // EF activity's late dates consistent with its early dates; byte-identical for every other case.
    const duration = effectiveDurationById.get(id) ?? activity.durationMinutes;
    let upper = projectFinish;
    for (const edge of graph.outgoing.get(id)!) {
      // A Level-of-Effort successor never constrains its predecessor's late finish (§21): the LOE hangs
      // off this activity, it does not pull it back. (The LOE's own late dates are derived below.)
      if (isLoe(graph.activities.get(edge.successorId)!.type)) continue;
      const succLs = lateStart.get(edge.successorId)!;
      const succLf = lateFinish.get(edge.successorId)!;
      const bound = backwardUpperBound(edge, succLs, succLf, cal, duration, planCalendar);
      if (bound < upper) upper = bound;
    }
    upper = clampBackwardFinish(activity, upper, cal, dataDateAbs);
    // The secondary constraint (ADR-0035 §10) drives the backward pass on top of the primary — a
    // no-op unless a secondary is set (the byte-identical single-constraint path).
    upper = clampSecondaryBackwardFinish(activity, upper, cal, dataDateAbs);
    let finish = rollBackwardToWorking(cal, dataDateAbs, upper);
    if (progress.status === 'IN_PROGRESS') {
      // The remaining work can't be scheduled to finish before its own early finish; the started
      // portion pins the late start at the actual start. Float is then measured on the finish side
      // (below), i.e. on the remaining work.
      const ef = earlyFinish.get(id)!;
      if (finish < ef) finish = ef;
      lateFinish.set(id, finish);
      lateStart.set(id, progress.actualStartInst!);
    } else {
      lateFinish.set(id, finish);
      lateStart.set(id, duration === 0 ? finish : advanceWorking(cal, finish, -duration));
    }
  }

  // LOE derivation pass (ADR-0035 §21). A Level-of-Effort activity's dates are DERIVED from its span —
  // the earliest of its SS-predecessors' starts to the latest of its FF-successors' finishes — rather
  // than from an input duration. Because an LOE never drove or bounded any of those neighbours (the
  // exclusions above), their early dates are already final; we read them here and OVERWRITE the LOE's
  // own early/late maps. Late is pinned to early, so the LOE carries a non-negative 0 float and never
  // inherits a downstream FNLT's negative float. Runs in topological order so a chained LOE resolves
  // after its drivers. `loeNoSpan` records the N12 case (surfaced in a later slice). No LOE ⇒ this loop
  // is empty and every prior map is untouched (the golden-suite parity gate).
  const loeNoSpan = new Map<string, boolean>();
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    if (!isLoe(activity.type)) continue;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    // Start = the earliest SS-predecessor start (the widest hammock cover); no SS predecessor ⇒ no span.
    let startBound: number | null = null;
    for (const edge of graph.incoming.get(id)!) {
      if (edge.type !== 'SS') continue;
      const predStart = earlyStart.get(edge.predecessorId)!;
      const predFinish = earlyFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predStart, predFinish, cal, duration, planCalendar);
      if (startBound === null || bound < startBound) startBound = bound;
    }
    // Finish = the latest FF-successor finish; no FF successor ⇒ no span.
    let finishBound: number | null = null;
    for (const edge of graph.outgoing.get(id)!) {
      if (edge.type !== 'FF') continue;
      const succStart = earlyStart.get(edge.successorId)!;
      const succFinish = earlyFinish.get(edge.successorId)!;
      const bound = backwardUpperBound(edge, succStart, succFinish, cal, duration, planCalendar);
      if (finishBound === null || bound > finishBound) finishBound = bound;
    }
    // N12 (ADR-0035 §21): an LOE missing either span end has no resolvable duration. Produce a defined
    // fallback — start at its SS end if present else the data date; zero length when the finish is
    // unknown — and flag it, never rejecting or crashing. The flag is surfaced in a later slice (F2).
    loeNoSpan.set(id, startBound === null || finishBound === null);
    const start = rollForwardToWorking(cal, startBound ?? dataDateAbs);
    const finish =
      finishBound === null
        ? start
        : Math.max(start, rollBackwardToWorking(cal, dataDateAbs, finishBound));
    earlyStart.set(id, start);
    earlyFinish.set(id, finish);
    lateStart.set(id, start);
    lateFinish.set(id, finish);
  }

  // WBS-summary rollup pass (ADR-0035 §24). A `WBS_SUMMARY` activity carries no logic (it has no
  // incoming/outgoing edges) and its dates are DERIVED from its branch: the earliest early-start to the
  // latest early-finish over its DIRECT children in the `parentId` containment tree. It is never
  // critical, never driving, never on the longest path and never defines the project finish (the
  // exclusions above), so nothing here can feed back into another activity's schedule. Runs AFTER the
  // LOE derivation pass so an LOE child already carries its final derived dates. Summaries are processed
  // **deepest-first** (by `parentId`-chain depth, descending) so a nested summary's children — including
  // child summaries — resolve before it; late is pinned to the rolled-up early instants, giving a
  // by-convention 0 float. An EMPTY summary (no children) collapses to the data date (the defined empty
  // convention). No summary ⇒ this loop is empty and every prior map is untouched (the parity gate).
  const summaryIds = graph.order.filter((id) => isSummary(graph.activities.get(id)!.type));
  if (summaryIds.length > 0) {
    const childrenByParent = new Map<string, string[]>();
    for (const id of graph.order) {
      const parentId = graph.activities.get(id)!.parentId;
      if (parentId === undefined || parentId === null) continue;
      const siblings = childrenByParent.get(parentId);
      if (siblings) siblings.push(id);
      else childrenByParent.set(parentId, [id]);
    }
    // Depth = the length of the `parentId` chain up to a top-level node; deepest-first ordering makes a
    // nested summary resolve after (below) its child summaries, so a parent reads finalised child dates.
    const depthOf = (id: string): number => {
      let depth = 0;
      let cursor: string | null | undefined = graph.activities.get(id)!.parentId;
      // A guard cap (≤ node count) keeps a malformed `parentId` cycle from spinning forever.
      while (cursor !== undefined && cursor !== null && depth <= graph.order.length) {
        depth += 1;
        cursor = graph.activities.get(cursor)?.parentId;
      }
      return depth;
    };
    const ordered = [...summaryIds].sort((a, b) => depthOf(b) - depthOf(a));
    for (const id of ordered) {
      const cal = calendarOf(graph.activities.get(id)!);
      const children = childrenByParent.get(id) ?? [];
      let esInst: number;
      let efInst: number;
      if (children.length === 0) {
        // Empty summary (§24): collapse to the data date — a defined zero-length point, never NaN.
        esInst = dataDateAbs;
        efInst = dataDateAbs;
      } else {
        esInst = Infinity;
        efInst = -Infinity;
        for (const childId of children) {
          const childEs = earlyStart.get(childId)!;
          const childEf = earlyFinish.get(childId)!;
          if (childEs < esInst) esInst = childEs;
          if (childEf > efInst) efInst = childEf;
        }
      }
      // Roll the branch onto the summary's own calendar working boundaries (like the LOE pass), then pin
      // late = early so the summary carries a by-convention 0 float and inherits no downstream negative.
      const start = rollForwardToWorking(cal, esInst);
      const finish =
        efInst <= start ? start : Math.max(start, rollBackwardToWorking(cal, dataDateAbs, efInst));
      earlyStart.set(id, start);
      earlyFinish.set(id, finish);
      lateStart.set(id, start);
      lateFinish.set(id, finish);
    }
  }

  // Map instants to inclusive dates, compute float (on the activity's own calendar) and
  // criticality, roll up. The exposed *Offset fields project onto the common **plan** calendar
  // frame (byte-identical to the old offsets on the all-inherit path); float uses the activity's
  // own calendar (ADR-0037 §4).
  const results: EngineResult[] = [];
  let criticalCount = 0;
  let nearCriticalCount = 0;
  let constraintViolationCount = 0;
  let constraintWarningCount = 0;
  let loeNoSpanCount = 0;
  let maxInclusiveFinishInstant: number | null = null;
  let projectFinishDate: string | null = null;
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    const activityIsLoe = isLoe(activity.type);
    const activityIsSummary = isSummary(activity.type);
    const progress = progressOf.get(id)!;
    if (constraintViolated.get(id)) constraintViolationCount += 1;
    if (loeNoSpan.get(id)) loeNoSpanCount += 1;
    // N15 (ADR-0035 §12): a Start-No-Earlier-Than whose date is before the data date is honoured but
    // cannot pull work before it — a WARNING (not a violation), derived purely from the inputs.
    if (
      activity.constraintType === 'SNET' &&
      activity.constraintDate !== undefined &&
      activity.constraintDate !== null &&
      activity.constraintDate < dataDate
    ) {
      constraintWarningCount += 1;
    }
    const esInst = earlyStart.get(id)!;
    const efInst = earlyFinish.get(id)!;
    const lsInst = lateStart.get(id)!;
    const lfInst = lateFinish.get(id)!;

    // Float is the working time between the early and late positions on the activity's OWN calendar
    // (P6). Both the finish-side (LF−EF) and start-side (LS−ES) spans are computed; the plan's
    // `totalFloatMode` (M6-F3, ADR-0035 §18) selects which is exposed as `totalFloat`. `FINISH` (the
    // default) matches the pre-M6 value — and, for a progressed activity, reflects the remaining work
    // (its start-side span collapses on the frozen actual start). On the all-inherit, unprogressed
    // path the two spans are equal, so every mode is byte-identical to the pre-M2 `lateStart − earlyStart`.
    const finishFloat = cal.workingTimeBetween(
      absMinutesToInstant(efInst),
      absMinutesToInstant(lfInst),
    );
    const startFloat = cal.workingTimeBetween(
      absMinutesToInstant(esInst),
      absMinutesToInstant(lsInst),
    );
    const totalFloat =
      totalFloatMode === 'START'
        ? startFloat
        : totalFloatMode === 'SMALLEST'
          ? Math.min(startFloat, finishFloat)
          : finishFloat;
    // Criticality by the plan's definition (M6-F2): the driving chain (LONGEST_PATH) or total float ≤
    // the threshold (TOTAL_FLOAT, default; threshold 0 ⇒ byte-identical to the pre-M6 `totalFloat <= 0`).
    const byDefinition =
      criticalDefinition === 'LONGEST_PATH'
        ? onLongestPath.has(id)
        : totalFloat <= criticalThreshold;
    // Make-open-ends-critical (M6-F4): OR an open end (no predecessors or no successors) into the
    // definition when the option is on — never dropping an already-critical member. Off ⇒ unchanged.
    const isOpenEnd = graph.incoming.get(id)!.length === 0 || graph.outgoing.get(id)!.length === 0;
    // A Level-of-Effort activity is NEVER critical (ADR-0035 §21), even though its pinned late = early
    // gives it total float 0 (which would otherwise satisfy `TOTAL_FLOAT ≤ 0`) and it is often an open
    // end. The guard overrides both the definition and the make-open-ends option. A WBS-summary is never
    // critical either (§24) — its pinned late = early gives it total float 0, and having no edges it is
    // always an open end, so the guard overrides both here as well.
    const isCritical =
      !activityIsLoe && !activityIsSummary && (byDefinition || (makeOpenEndsCritical && isOpenEnd));
    // Near-critical stays total-float-based and never overlaps critical: a positive-but-small float that
    // is not already flagged critical. On the default path (threshold 0) this equals the old predicate.
    const isNearCritical =
      !isCritical && totalFloat > 0 && totalFloat <= NEAR_CRITICAL_THRESHOLD_MINUTES;
    if (isCritical) criticalCount += 1;
    if (isNearCritical) nearCriticalCount += 1;

    // Free float (M6-F1, ADR-0035 §17–§20): how far the activity can slip its finish without delaying the
    // EARLY start of ANY successor. For each outgoing edge, `backwardUpperBound` seeded with the
    // SUCCESSOR'S EARLY dates (rather than its late dates) yields the finish instant beyond which this
    // activity would push that successor's early start; the tightest such gap — working time on the
    // activity's OWN calendar (P6/ADR-0037 §4) — is the free float. An OPEN END (no successors) can
    // slip up to its total float, so it takes that (the standard tail identity FF = TF). Free float
    // can never exceed total float (a universal CPM identity), so the result is capped at it.
    const effDurationForFF = effectiveDurationById.get(id) ?? duration;
    const outgoing = graph.outgoing.get(id)!;
    let freeFloat: number;
    if (activityIsLoe || activityIsSummary) {
      // A Level-of-Effort activity carries no float of its own (ADR-0035 §21): its span is pinned to its
      // neighbours, so it can slip by nothing — free float is 0, never the negative value the raw
      // FF-successor gap math would give for a hammock that ends at its latest (not tightest) successor.
      // A WBS-summary is the same (§24): its span is rolled up from its branch and it has no successors,
      // so its free float is 0 by convention rather than the tail identity FF = TF an open end would give.
      freeFloat = 0;
    } else if (outgoing.length === 0) {
      freeFloat = totalFloat;
    } else {
      let minGap = Infinity;
      for (const edge of outgoing) {
        const succEs = earlyStart.get(edge.successorId)!;
        const succEf = earlyFinish.get(edge.successorId)!;
        const bound = backwardUpperBound(edge, succEs, succEf, cal, effDurationForFF, planCalendar);
        const gap = cal.workingTimeBetween(absMinutesToInstant(efInst), absMinutesToInstant(bound));
        if (gap < minGap) minGap = gap;
      }
      freeFloat = Math.min(minGap, totalFloat);
    }
    // ALAP zero-free-float refinement (M6-F5, ADR-0035 §11). A flagged As-Late-As-Possible activity is
    // DISPLAYED as late as its successors allow — its effective placement consumes its free float, so at
    // that placement free float is 0. This is display-only: `early*`/`late*`/`totalFloat` stay a pure
    // function of the network (the placement start is `earlyStart + freeFloat`; an open end, with no
    // successors, falls back to its late dates per §11). Reporting `freeFloat = 0` is the machine-readable
    // signal of that placement.
    if (activity.scheduleAsLateAsPossible) freeFloat = 0;

    // Own-calendar offsets (for the inclusive-date mapping) and plan-frame offsets (exposed).
    const esOwn = offsetFromDataDate(cal, dataDateAbs, esInst);
    const efOwn = offsetFromDataDate(cal, dataDateAbs, efInst);
    const lsOwn = offsetFromDataDate(cal, dataDateAbs, lsInst);
    const lfOwn = offsetFromDataDate(cal, dataDateAbs, lfInst);
    // Point-like ⇒ finish maps to the start day (a milestone or a zero-length span). For a normal
    // activity this is exactly `duration === 0` (byte-identical); a Level-of-Effort activity has a
    // DERIVED span, so its point-ness is read from the computed instants (a no-span LOE collapses to
    // its start), not its always-zero input duration. A WBS-summary likewise has a DERIVED (rolled-up)
    // span — read from the instants — so an empty summary collapsed to the data date reads as point-like.
    const pointLike = activityIsLoe || activityIsSummary ? efInst === esInst : duration === 0;
    const inclusiveFinishOwn = pointLike ? esOwn : efOwn - 1;
    const inclusiveLateFinishOwn = pointLike ? lsOwn : lfOwn - 1;
    const vDisplayInst = visualDisplayStart.get(id)!;
    const vDisplayOwn = offsetFromDataDate(cal, dataDateAbs, vDisplayInst);
    const vInclusiveFinishOwn = duration === 0 ? vDisplayOwn : vDisplayOwn + duration - 1;

    // A frozen actual endpoint (M2) displays its actual date VERBATIM: the data-date-anchored offset
    // mapping is lossy for instants BEFORE the data date (a completed/started activity in the past —
    // a non-working gap between the actual and the data date collapses to zero working-minutes), and
    // "actuals never move" (ADR-0035 §1). Computed endpoints (≥ the data date) use the normal mapping.
    const started = progress.actualStartInst !== null;
    const isComplete = progress.status === 'COMPLETE';
    const earlyStartDate = started ? activity.actualStart! : workingIndexDate(cal, dataDate, esOwn);
    const earlyFinishDate = isComplete
      ? activity.actualFinish!
      : workingIndexDate(cal, dataDate, inclusiveFinishOwn);
    const lateStartDate = started ? activity.actualStart! : workingIndexDate(cal, dataDate, lsOwn);
    const lateFinishDate = isComplete
      ? activity.actualFinish!
      : workingIndexDate(cal, dataDate, inclusiveLateFinishOwn);

    // Project finish = the latest inclusive finish INSTANT, displayed on its own calendar. A task's
    // last occupied minute is `efInst − 1` (one real minute before its exclusive end boundary); a
    // milestone TYPE occupies its start instant. This keeps a finish milestone pinned one boundary
    // past a task that ends at the same instant winning the max. Keyed off the milestone **type**, not
    // `duration === 0` (ADR-0035 §22): a zero-duration TASK is a task here, so it loses the tie-break
    // to a finish milestone at the same instant (and `esInst === efInst` for it, so `efInst − 1` is
    // its own last minute).
    const inclusiveFinishInstant = isMilestone(activity.type) ? esInst : efInst - 1;
    // A Level-of-Effort activity never defines the project finish DATE either (§21) — consistent with
    // its exclusion from `projectFinishInstant` above; its span mirrors a real successor that is already
    // in this max. A WBS-summary is excluded the same way (§24): its rolled-up finish mirrors a real
    // branch member already in this max, so it can never define the project finish date.
    if (
      !activityIsLoe &&
      !activityIsSummary &&
      (maxInclusiveFinishInstant === null || inclusiveFinishInstant > maxInclusiveFinishInstant)
    ) {
      maxInclusiveFinishInstant = inclusiveFinishInstant;
      projectFinishDate = earlyFinishDate;
    }

    results.push({
      activityId: id,
      earlyStartOffset: offsetFromDataDate(planCalendar, dataDateAbs, esInst),
      earlyFinishOffset: offsetFromDataDate(planCalendar, dataDateAbs, efInst),
      lateStartOffset: offsetFromDataDate(planCalendar, dataDateAbs, lsInst),
      lateFinishOffset: offsetFromDataDate(planCalendar, dataDateAbs, lfInst),
      totalFloat,
      freeFloat,
      isCritical,
      isNearCritical,
      constraintViolated: constraintViolated.get(id) ?? false,
      loeNoSpan: loeNoSpan.get(id) ?? false,
      earlyStart: earlyStartDate,
      earlyFinish: earlyFinishDate,
      lateStart: lateStartDate,
      lateFinish: lateFinishDate,
      visualEffectiveStart: workingIndexDate(cal, dataDate, vDisplayOwn),
      visualEffectiveFinish: workingIndexDate(cal, dataDate, vInclusiveFinishOwn),
      visualConflict: visualConflictMap.get(id)!,
      visualDriftMinutes: visualDriftMap.get(id)!,
    });
  }

  const summary: EngineSummary = {
    activityCount: results.length,
    criticalCount,
    nearCriticalCount,
    constraintViolationCount,
    constraintWarningCount,
    loeNoSpanCount,
    expectedFinishAppliedCount,
    projectFinishOffset:
      projectFinishInstant === null
        ? null
        : offsetFromDataDate(planCalendar, dataDateAbs, projectFinishInstant),
    projectFinish: projectFinishDate,
  };

  return { results, edges: edgeResults, summary };
}

/**
 * Walk an edge's lag from an anchor **instant** on the edge's resolved lag calendar (ADR-0036 §6 /
 * ADR-0037). The stored anchor already encodes the START-vs-FINISH gap distinction (an early/late
 * finish is an end boundary; a start is the post-gap minute start), so the walk is a single
 * `addWorkingTime` — no offset→instant resolution needed. `edge.lagCalendar` undefined = the plan
 * calendar (PROJECT_DEFAULT, and PRED/SUCC when the endpoint inherits): byte-identical to the old
 * `anchor + lag` offset arithmetic. `TWENTY_FOUR_HOUR` measures an **elapsed** lag; the service
 * resolves `PREDECESSOR`/`SUCCESSOR` to the endpoint activity's calendar (M5).
 */
function applyLag(
  anchor: number,
  signedLag: number,
  edge: EngineEdge,
  planCalendar: WorkingTimeCalendar,
): number {
  const lagCalendar = edge.lagCalendar ?? planCalendar;
  return advanceWorking(lagCalendar, anchor, signedLag);
}

/** The lower bound (a **start** instant) an incoming edge imposes on the successor's early start. */
function forwardLowerBound(
  edge: EngineEdge,
  predEarlyStart: number,
  predEarlyFinish: number,
  successorCalendar: WorkingTimeCalendar,
  successorDuration: number,
  planCalendar: WorkingTimeCalendar,
): number {
  switch (edge.type) {
    case 'FS':
      return applyLag(predEarlyFinish, edge.lagMinutes, edge, planCalendar);
    case 'SS':
      return applyLag(predEarlyStart, edge.lagMinutes, edge, planCalendar);
    case 'FF':
      return advanceWorking(
        successorCalendar,
        applyLag(predEarlyFinish, edge.lagMinutes, edge, planCalendar),
        -successorDuration,
      );
    case 'SF':
      return advanceWorking(
        successorCalendar,
        applyLag(predEarlyStart, edge.lagMinutes, edge, planCalendar),
        -successorDuration,
      );
  }
}

/** The upper bound (a **finish** instant) an outgoing edge imposes on the predecessor's late finish. */
function backwardUpperBound(
  edge: EngineEdge,
  succLateStart: number,
  succLateFinish: number,
  predecessorCalendar: WorkingTimeCalendar,
  predecessorDuration: number,
  planCalendar: WorkingTimeCalendar,
): number {
  switch (edge.type) {
    case 'FS':
      return applyLag(succLateStart, -edge.lagMinutes, edge, planCalendar);
    case 'SS':
      return advanceWorking(
        predecessorCalendar,
        applyLag(succLateStart, -edge.lagMinutes, edge, planCalendar),
        predecessorDuration,
      );
    case 'FF':
      return applyLag(succLateFinish, -edge.lagMinutes, edge, planCalendar);
    case 'SF':
      return advanceWorking(
        predecessorCalendar,
        applyLag(succLateFinish, -edge.lagMinutes, edge, planCalendar),
        predecessorDuration,
      );
  }
}
