import { NEAR_CRITICAL_THRESHOLD_MINUTES } from './constants';
import { clampBackwardFinish, clampForwardStart, isParkedMandatory } from './constraints';
import { buildGraph } from './graph';
import {
  advanceWorking,
  offsetFromDataDate,
  rollBackwardToWorking,
  rollForwardToWorking,
} from './instants';
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
  const graph = buildGraph(activities, edges);
  const dataDateAbs = instantToAbsMinutes(dataDate);
  const calendarOf = (activity: EngineActivity): WorkingTimeCalendar =>
    activity.calendar ?? planCalendar;

  // Forward pass (topological order): earliest start/finish INSTANTS. `earlyStart` is the post-gap
  // beginning of the activity's first working minute; `earlyFinish` is the exclusive end boundary
  // after its last working minute (= the start, for a zero-duration milestone).
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    let lower = dataDateAbs; // the data date is the earliest any activity can start
    for (const edge of graph.incoming.get(id)!) {
      const predStart = earlyStart.get(edge.predecessorId)!;
      const predFinish = earlyFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predStart, predFinish, cal, duration, planCalendar);
      if (bound > lower) lower = bound;
    }
    lower = clampForwardStart(activity, lower, cal, dataDateAbs);
    const start = rollForwardToWorking(cal, lower);
    earlyStart.set(id, start);
    earlyFinish.set(id, duration === 0 ? start : advanceWorking(cal, start, duration));
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
    let upper = projectFinish;
    for (const edge of graph.outgoing.get(id)!) {
      const succLs = lateStart.get(edge.successorId)!;
      const succLf = lateFinish.get(edge.successorId)!;
      const bound = backwardUpperBound(edge, succLs, succLf, cal, duration, planCalendar);
      if (bound < upper) upper = bound;
    }
    upper = clampBackwardFinish(activity, upper, cal, dataDateAbs);
    const finish = rollBackwardToWorking(cal, dataDateAbs, upper);
    lateFinish.set(id, finish);
    lateStart.set(id, duration === 0 ? finish : advanceWorking(cal, finish, -duration));
  }

  // Map instants to inclusive dates, compute float (on the activity's own calendar) and
  // criticality, roll up. The exposed *Offset fields project onto the common **plan** calendar
  // frame (byte-identical to the old offsets on the all-inherit path); float uses the activity's
  // own calendar (ADR-0037 §4).
  const results: EngineResult[] = [];
  let criticalCount = 0;
  let nearCriticalCount = 0;
  let parkedConstraintCount = 0;
  let maxInclusiveFinishInstant: number | null = null;
  let projectFinishDate: string | null = null;
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const cal = calendarOf(activity);
    const duration = activity.durationMinutes;
    if (isParkedMandatory(activity.constraintType)) parkedConstraintCount += 1;
    const esInst = earlyStart.get(id)!;
    const efInst = earlyFinish.get(id)!;
    const lsInst = lateStart.get(id)!;
    const lfInst = lateFinish.get(id)!;

    // Float is the working time from early to late start on the activity's OWN calendar (P6).
    const totalFloat = cal.workingTimeBetween(
      absMinutesToInstant(esInst),
      absMinutesToInstant(lsInst),
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

    // Project finish = the latest inclusive finish INSTANT, displayed on its own calendar. A task's
    // last occupied minute is `efInst − 1` (one real minute before its exclusive end boundary); a
    // milestone occupies its start instant. This keeps a finish milestone pinned one boundary past a
    // task that ends at the same instant winning the max (as the old inclusive-offset compare did).
    const inclusiveFinishInstant = duration === 0 ? esInst : efInst - 1;
    if (maxInclusiveFinishInstant === null || inclusiveFinishInstant > maxInclusiveFinishInstant) {
      maxInclusiveFinishInstant = inclusiveFinishInstant;
      projectFinishDate = workingIndexDate(cal, dataDate, inclusiveFinishOwn);
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
      earlyStart: workingIndexDate(cal, dataDate, esOwn),
      earlyFinish: workingIndexDate(cal, dataDate, inclusiveFinishOwn),
      lateStart: workingIndexDate(cal, dataDate, lsOwn),
      lateFinish: workingIndexDate(cal, dataDate, inclusiveLateFinishOwn),
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
    parkedConstraintCount,
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
