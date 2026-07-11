import type { WorkingDayCalendar } from './calendar';
import { NEAR_CRITICAL_THRESHOLD_WORKING_DAYS } from './constants';
import { clampBackwardFinish, clampForwardStart, isParkedMandatory } from './constraints';
import { buildGraph } from './graph';
import type {
  EngineActivity,
  EngineEdge,
  EngineEdgeResult,
  EngineResult,
  EngineSummary,
} from './types';

/** Inputs the CPM pass needs beyond the network itself. */
export interface ComputeOptions {
  /** The data date (`Plan.plannedStart`, `YYYY-MM-DD`) — offset 0. */
  dataDate: string;
  /** The working-day calendar seam (ADR-0023); MVP is all-days-work. */
  calendar: WorkingDayCalendar;
}

/** The engine's full result: per-activity schedule, per-edge driving flags, plan roll-up. */
export interface EngineOutput {
  results: EngineResult[];
  edges: EngineEdgeResult[];
  summary: EngineSummary;
}

/**
 * Run the planned CPM forward/backward pass over a plan's network and map the
 * continuous working-day offsets to inclusive calendar dates (ADR-0023).
 *
 * The engine works internally in **continuous integer working-day offsets** from
 * the data date (offset 0): for activity `a`, `finishOffset = startOffset + Dₐ`,
 * so the relationship arithmetic is clean and off-by-one-free. Only when writing
 * the display dates do we switch to the **inclusive** convention
 * (`early_finish = DD + EF − 1` for a task; `= early_start` for a zero-duration
 * milestone).
 *
 * Moderate constraints (SNET/SNLT/FNET/FNLT/MSO/MFO) clamp the passes; the two
 * `MANDATORY_*` kinds are parked as MSO/MFO and counted in `parkedConstraintCount`
 * (ADR-0023 §6). A constraint that logic cannot satisfy surfaces as **negative
 * total float** (and criticality), never an error.
 *
 * @throws {ScheduleGraphNotADagError} via {@link buildGraph} if the graph cycles.
 */
export function computeSchedule(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  options: ComputeOptions,
): EngineOutput {
  const { dataDate, calendar } = options;
  const graph = buildGraph(activities, edges);

  // Forward pass (topological order): earliest start/finish offsets.
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const duration = activity.durationDays;
    let start = 0; // the data date is the earliest any activity can start
    for (const edge of graph.incoming.get(id)!) {
      const predEs = earlyStart.get(edge.predecessorId)!;
      const predEf = earlyFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predEs, predEf, duration);
      if (bound > start) start = bound;
    }
    start = clampForwardStart(activity, start, calendar, dataDate);
    earlyStart.set(id, start);
    earlyFinish.set(id, start + duration);
  }

  // Driving edges (M3): an incoming edge drives its successor when its forward bound is
  // exactly the successor's early start — the binding relationship (CPM/GPM "driver"). An
  // edge with a lower bound has slack; when a constraint clamped the start above every
  // incoming bound, no edge matches and none drives. This reads only the forward-pass maps,
  // so it never changes the computed dates (golden-suite parity holds).
  const edgeResults: EngineEdgeResult[] = [];
  for (const id of graph.order) {
    const successorStart = earlyStart.get(id)!;
    const successorDuration = graph.activities.get(id)!.durationDays;
    for (const edge of graph.incoming.get(id)!) {
      const predEs = earlyStart.get(edge.predecessorId)!;
      const predEf = earlyFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predEs, predEf, successorDuration);
      edgeResults.push({ edgeId: edge.id, isDriving: bound === successorStart });
    }
  }

  // Project finish is the latest early-finish across the whole plan.
  let projectFinishOffset: number | null = null;
  for (const id of graph.order) {
    const ef = earlyFinish.get(id)!;
    if (projectFinishOffset === null || ef > projectFinishOffset) projectFinishOffset = ef;
  }

  // Backward pass (reverse topological order): latest finish/start offsets. Open
  // ends (no successors) are seeded from the project finish.
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  const projectFinish = projectFinishOffset ?? 0;
  for (let i = graph.order.length - 1; i >= 0; i -= 1) {
    const id = graph.order[i]!;
    const activity = graph.activities.get(id)!;
    const duration = activity.durationDays;
    let finish = projectFinish;
    for (const edge of graph.outgoing.get(id)!) {
      const succLs = lateStart.get(edge.successorId)!;
      const succLf = lateFinish.get(edge.successorId)!;
      const bound = backwardUpperBound(edge, succLs, succLf, duration);
      if (bound < finish) finish = bound;
    }
    finish = clampBackwardFinish(activity, finish, calendar, dataDate);
    lateFinish.set(id, finish);
    lateStart.set(id, finish - duration);
  }

  // Map offsets to inclusive dates, compute float and criticality, roll up. The
  // project finish DATE is the latest inclusive early-finish across the plan —
  // which, for a finish milestone pinned at offset T, is a day later than a task
  // ending at T (whose inclusive last day is T − 1). Tracking the max inclusive
  // finish offset keeps this in step with the C1 `max(early_finish)` aggregate.
  const results: EngineResult[] = [];
  let criticalCount = 0;
  let nearCriticalCount = 0;
  let parkedConstraintCount = 0;
  let maxInclusiveFinishOffset: number | null = null;
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const duration = activity.durationDays;
    if (isParkedMandatory(activity.constraintType)) parkedConstraintCount += 1;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;
    const totalFloat = ls - es;
    const isCritical = totalFloat <= 0;
    const isNearCritical = totalFloat > 0 && totalFloat <= NEAR_CRITICAL_THRESHOLD_WORKING_DAYS;
    if (isCritical) criticalCount += 1;
    if (isNearCritical) nearCriticalCount += 1;

    // Inclusive finish offset: a task's last working day is EF − 1; a
    // zero-duration milestone sits on its start day (ES = EF).
    const inclusiveFinishOffset = duration === 0 ? es : ef - 1;
    const inclusiveLateFinishOffset = duration === 0 ? ls : lf - 1;
    if (maxInclusiveFinishOffset === null || inclusiveFinishOffset > maxInclusiveFinishOffset) {
      maxInclusiveFinishOffset = inclusiveFinishOffset;
    }

    results.push({
      activityId: id,
      earlyStartOffset: es,
      earlyFinishOffset: ef,
      lateStartOffset: ls,
      lateFinishOffset: lf,
      totalFloat,
      isCritical,
      isNearCritical,
      earlyStart: calendar.addWorkingDays(dataDate, es),
      earlyFinish: calendar.addWorkingDays(dataDate, inclusiveFinishOffset),
      lateStart: calendar.addWorkingDays(dataDate, ls),
      lateFinish: calendar.addWorkingDays(dataDate, inclusiveLateFinishOffset),
    });
  }

  const summary: EngineSummary = {
    activityCount: results.length,
    criticalCount,
    nearCriticalCount,
    parkedConstraintCount,
    projectFinishOffset,
    projectFinish:
      maxInclusiveFinishOffset === null
        ? null
        : calendar.addWorkingDays(dataDate, maxInclusiveFinishOffset),
  };

  return { results, edges: edgeResults, summary };
}

/** The lower bound an incoming edge imposes on the successor's early start (spec §4). */
function forwardLowerBound(
  edge: EngineEdge,
  predEarlyStart: number,
  predEarlyFinish: number,
  successorDuration: number,
): number {
  switch (edge.type) {
    case 'FS':
      return predEarlyFinish + edge.lagDays;
    case 'SS':
      return predEarlyStart + edge.lagDays;
    case 'FF':
      return predEarlyFinish + edge.lagDays - successorDuration;
    case 'SF':
      return predEarlyStart + edge.lagDays - successorDuration;
  }
}

/** The upper bound an outgoing edge imposes on the predecessor's late finish (spec §4). */
function backwardUpperBound(
  edge: EngineEdge,
  succLateStart: number,
  succLateFinish: number,
  predecessorDuration: number,
): number {
  switch (edge.type) {
    case 'FS':
      return succLateStart - edge.lagDays;
    case 'SS':
      return succLateStart - edge.lagDays + predecessorDuration;
    case 'FF':
      return succLateFinish - edge.lagDays;
    case 'SF':
      return succLateFinish - edge.lagDays + predecessorDuration;
  }
}
