import { NEAR_CRITICAL_THRESHOLD_MINUTES } from './constants';
import {
  clampBackwardFinish,
  clampForwardStart,
  clampSecondaryBackwardFinish,
  isMandatory,
  isMilestone,
} from './constraints';
import { buildGraph } from './graph';
import {
  advanceWorking,
  offsetFromDataDate,
  rollBackwardToWorking,
  rollForwardToWorking,
} from './instants';
import {
  remainingHonoursPredecessor,
  resolveProgress,
  type ProgressMode,
  type ResolvedProgress,
} from './progress';
import type {
  EngineActivity,
  EngineEdge,
  EngineEdgeResult,
  EngineResult,
  EngineSummary,
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
    if (inProgress) {
      // Frozen actual start; the REMAINING work reschedules forward from the ties retained by the
      // recalc mode, floored at the data date (§2) — `workStart` above.
      earlyStart.set(id, progress.actualStartInst!);
      earlyFinish.set(
        id,
        progress.remainingMinutes === 0
          ? workStart
          : advanceWorking(cal, workStart, progress.remainingMinutes),
      );
    } else {
      // NOT_STARTED — the ordinary planned path (byte-identical to the pre-M2 engine).
      earlyStart.set(id, workStart);
      earlyFinish.set(id, duration === 0 ? workStart : advanceWorking(cal, workStart, duration));
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
    for (const edge of graph.incoming.get(id)!) {
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

  // Project finish is the latest early-finish INSTANT across the whole plan.
  let projectFinishInstant: number | null = null;
  for (const id of graph.order) {
    const ef = earlyFinish.get(id)!;
    if (projectFinishInstant === null || ef > projectFinishInstant) projectFinishInstant = ef;
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
    const duration = activity.durationMinutes;
    const progress = progressOf.get(id)!;
    if (progress.status === 'COMPLETE') {
      // Frozen: a completed activity's late dates are its actuals — it carries zero float (§1).
      lateFinish.set(id, progress.actualFinishInst!);
      lateStart.set(id, progress.actualStartInst ?? progress.actualFinishInst!);
      continue;
    }
    let upper = projectFinish;
    for (const edge of graph.outgoing.get(id)!) {
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

  // Map instants to inclusive dates, compute float (on the activity's own calendar) and
  // criticality, roll up. The exposed *Offset fields project onto the common **plan** calendar
  // frame (byte-identical to the old offsets on the all-inherit path); float uses the activity's
  // own calendar (ADR-0037 §4).
  const results: EngineResult[] = [];
  let criticalCount = 0;
  let nearCriticalCount = 0;
  let constraintViolationCount = 0;
  let constraintWarningCount = 0;
  let maxInclusiveFinishInstant: number | null = null;
  let projectFinishDate: string | null = null;
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    const progress = progressOf.get(id)!;
    if (constraintViolated.get(id)) constraintViolationCount += 1;
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

    // Float is the working time from early to late FINISH on the activity's OWN calendar (P6).
    // Measured on the finish side so a progressed activity's float reflects its remaining work
    // (its early→late START span differs from a full duration once it is under way); for an
    // unprogressed activity the start-side and finish-side spans are equal, so this is byte-identical
    // to the pre-M2 `lateStart − earlyStart` (the golden-suite parity gate).
    const totalFloat = cal.workingTimeBetween(
      absMinutesToInstant(efInst),
      absMinutesToInstant(lfInst),
    );
    const isCritical = totalFloat <= 0;
    const isNearCritical = totalFloat > 0 && totalFloat <= NEAR_CRITICAL_THRESHOLD_MINUTES;
    if (isCritical) criticalCount += 1;
    if (isNearCritical) nearCriticalCount += 1;

    // Own-calendar offsets (for the inclusive-date mapping) and plan-frame offsets (exposed).
    const esOwn = offsetFromDataDate(cal, dataDateAbs, esInst);
    const efOwn = offsetFromDataDate(cal, dataDateAbs, efInst);
    const lsOwn = offsetFromDataDate(cal, dataDateAbs, lsInst);
    const lfOwn = offsetFromDataDate(cal, dataDateAbs, lfInst);
    const inclusiveFinishOwn = duration === 0 ? esOwn : efOwn - 1;
    const inclusiveLateFinishOwn = duration === 0 ? lsOwn : lfOwn - 1;
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
    if (maxInclusiveFinishInstant === null || inclusiveFinishInstant > maxInclusiveFinishInstant) {
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
      isCritical,
      isNearCritical,
      constraintViolated: constraintViolated.get(id) ?? false,
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
