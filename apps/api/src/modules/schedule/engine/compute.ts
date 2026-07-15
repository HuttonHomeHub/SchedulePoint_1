import { NEAR_CRITICAL_THRESHOLD_MINUTES } from './constants';
import { clampBackwardFinish, clampForwardStart, isParkedMandatory } from './constraints';
import { buildGraph } from './graph';
import type {
  EngineActivity,
  EngineEdge,
  EngineEdgeResult,
  EngineResult,
  EngineSummary,
} from './types';
import type { WorkingTimeCalendar } from './working-time-calendar';

/** Inputs the CPM pass needs beyond the network itself. */
export interface ComputeOptions {
  /** The data date (`Plan.plannedStart`, `YYYY-MM-DD`) — offset 0. */
  dataDate: string;
  /** The working-time calendar seam (ADR-0036); MVP is all-minutes-work. */
  calendar: WorkingTimeCalendar;
}

/**
 * The calendar day of the working-minute at inclusive offset `index` (ADR-0036). Take the
 * instant one working-minute later (the exclusive boundary after `index`) and step back a
 * single real minute, so a start or finish that lands exactly on a **non-working gap**
 * (e.g. a Friday shift-close boundary is midnight Saturday) reads as its true working day —
 * Friday for a finish, the next working day for a start — not the empty gap instant.
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
    const duration = activity.durationMinutes;
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

  // Pass 2 — effective-Visual (ADR-0033, forward-only). Independent of the pure passes: it reads
  // only `earlyStart` (for the drift baseline) and never writes back, so `early*`/`late*`/float stay
  // a pure function of the network (golden-suite parity). Each activity's DISPLAY start is its
  // hand-placed `visualStart` when set — honoured exactly, even if infeasible (stay-and-flag) — else
  // its logic-earliest from predecessors' PROPAGATED (feasible) finishes. Successors are pushed from
  // the FEASIBLE finish (`prop = max(display, logicEarliest)`), so a conflicted bar never implies an
  // impossible downstream sequence (SQ-b: it pushes from feasible-earliest, not its illegal spot).
  // One extra O(V+E) topological pass; no backward pass.
  const visualDisplayStart = new Map<string, number>();
  const visualPropStart = new Map<string, number>();
  const visualPropFinish = new Map<string, number>();
  const visualConflictMap = new Map<string, boolean>();
  const visualDriftMap = new Map<string, number | null>();
  for (const id of graph.order) {
    const activity = graph.activities.get(id)!;
    const duration = activity.durationMinutes;
    let logicEarliest = 0;
    for (const edge of graph.incoming.get(id)!) {
      const predPs = visualPropStart.get(edge.predecessorId)!;
      const predPf = visualPropFinish.get(edge.predecessorId)!;
      const bound = forwardLowerBound(edge, predPs, predPf, duration);
      if (bound > logicEarliest) logicEarliest = bound;
    }
    logicEarliest = clampForwardStart(activity, logicEarliest, calendar, dataDate);
    const placed =
      activity.visualStart != null
        ? calendar.workingTimeBetween(dataDate, activity.visualStart)
        : null;
    const display = placed ?? logicEarliest;
    const prop = placed !== null ? Math.max(placed, logicEarliest) : logicEarliest;
    visualDisplayStart.set(id, display);
    visualPropStart.set(id, prop);
    visualPropFinish.set(id, prop + duration);
    // Conflict = a placement earlier than logic/lower-bound constraints allow (SQ-a stay-and-flag).
    // NB M0: this covers logic + lower-bound constraints (SNET/FNET/MSO/MFO-early, all folded into
    // `logicEarliest`); the upper-bound case (placed *after* an SNLT/FNLT ceiling) is a Pass-2
    // refinement to close with the test-engineer before the flag flips.
    visualConflictMap.set(id, placed !== null && placed < logicEarliest);
    visualDriftMap.set(id, placed !== null ? placed - earlyStart.get(id)! : null);
  }

  // Driving edges (M3): an incoming edge drives its successor when its forward bound is
  // exactly the successor's early start — the binding relationship (CPM/GPM "driver"). An
  // edge with a lower bound has slack; when a constraint clamped the start above every
  // incoming bound, no edge matches and none drives. This reads only the forward-pass maps,
  // so it never changes the computed dates (golden-suite parity holds).
  const edgeResults: EngineEdgeResult[] = [];
  for (const id of graph.order) {
    const successorStart = earlyStart.get(id)!;
    const successorDuration = graph.activities.get(id)!.durationMinutes;
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
    const duration = activity.durationMinutes;
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
    const duration = activity.durationMinutes;
    if (isParkedMandatory(activity.constraintType)) parkedConstraintCount += 1;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;
    const totalFloat = ls - es;
    const isCritical = totalFloat <= 0;
    const isNearCritical = totalFloat > 0 && totalFloat <= NEAR_CRITICAL_THRESHOLD_MINUTES;
    if (isCritical) criticalCount += 1;
    if (isNearCritical) nearCriticalCount += 1;

    // Inclusive finish offset (working MINUTES): a task's last working minute is EF − 1,
    // and its inclusive display DATE is the calendar day that minute falls in; a
    // zero-duration milestone sits on its start (ES = EF).
    const inclusiveFinishOffset = duration === 0 ? es : ef - 1;
    const inclusiveLateFinishOffset = duration === 0 ? ls : lf - 1;
    // Effective-Visual display (Pass 2): the bar's rendered start + inclusive finish.
    const vDisplay = visualDisplayStart.get(id)!;
    const vInclusiveFinishOffset = duration === 0 ? vDisplay : vDisplay + duration - 1;
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
      earlyStart: workingIndexDate(calendar, dataDate, es),
      earlyFinish: workingIndexDate(calendar, dataDate, inclusiveFinishOffset),
      lateStart: workingIndexDate(calendar, dataDate, ls),
      lateFinish: workingIndexDate(calendar, dataDate, inclusiveLateFinishOffset),
      visualEffectiveStart: workingIndexDate(calendar, dataDate, vDisplay),
      visualEffectiveFinish: workingIndexDate(calendar, dataDate, vInclusiveFinishOffset),
      visualConflict: visualConflictMap.get(id)!,
      visualDriftMinutes: visualDriftMap.get(id)!,
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
        : workingIndexDate(calendar, dataDate, maxInclusiveFinishOffset),
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
      return predEarlyFinish + edge.lagMinutes;
    case 'SS':
      return predEarlyStart + edge.lagMinutes;
    case 'FF':
      return predEarlyFinish + edge.lagMinutes - successorDuration;
    case 'SF':
      return predEarlyStart + edge.lagMinutes - successorDuration;
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
      return succLateStart - edge.lagMinutes;
    case 'SS':
      return succLateStart - edge.lagMinutes + predecessorDuration;
    case 'FF':
      return succLateFinish - edge.lagMinutes;
    case 'SF':
      return succLateFinish - edge.lagMinutes + predecessorDuration;
  }
}
