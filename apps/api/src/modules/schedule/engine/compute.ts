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
      const bound = forwardLowerBound(edge, predEs, predEf, duration, calendar, dataDate);
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
      const bound = forwardLowerBound(edge, predPs, predPf, duration, calendar, dataDate);
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
      const bound = forwardLowerBound(edge, predEs, predEf, successorDuration, calendar, dataDate);
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
      const bound = backwardUpperBound(edge, succLs, succLf, duration, calendar, dataDate);
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

/** The instant one real minute before `instant` (`YYYY-MM-DDTHH:MM`, dropping `T00:00`). */
function minusOneRealMinute(instant: string): string {
  const iso = instant.length > 10 ? `${instant}:00Z` : `${instant}T00:00:00Z`;
  const d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() - 1);
  const out = d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  return out.endsWith('T00:00') ? out.slice(0, 10) : out;
}

/**
 * The real instant of an anchor **offset**, resolved START- vs FINISH-aware (the ADR-0023
 * distinction). `addWorkingTime(dataDate, offset)` sits at the **pre-gap** boundary (the end
 * of the offset-th working minute); a **finish** anchor stays there, but a **start** anchor
 * that lands on a non-working gap belongs at the **post-gap** instant (the beginning of its
 * working minute). Getting this wrong makes the forward `+lag` and backward `−lag` walks
 * non-inverse across a gap, which shows up as spurious negative float on a critical chain.
 */
function anchorInstant(
  calendar: WorkingTimeCalendar,
  dataDate: string,
  offset: number,
  kind: 'start' | 'finish',
): string {
  const boundary = calendar.addWorkingTime(dataDate, offset);
  if (kind === 'finish') return boundary;
  // The first working instant at/after `boundary`: one working minute on, stepped back a
  // single real minute (identity when `boundary` is already working).
  return minusOneRealMinute(calendar.addWorkingTime(boundary, 1));
}

/**
 * Apply an edge's lag to an anchor **offset**, measured on the edge's lag calendar
 * (ADR-0036 §6, M3). The lag term is the only part of the relationship arithmetic that can
 * run on a calendar other than the plan calendar: a `signedLag` of `+168h` on the 24-Hour
 * calendar is 7 **elapsed** days, not 7 working days.
 *
 * **Undefined lag calendar → the fast, exact default:** `anchor + signedLag` in plan-offset
 * space (the pre-M3 arithmetic), so the whole golden suite stays byte-identical and no
 * calendar round-trip is paid on the default path. Otherwise: resolve the anchor offset to a
 * real instant (START/FINISH-aware, `anchorKind`), walk `signedLag` working-minutes on the
 * **lag** calendar (negative walks backward — the backward pass), and convert the landing
 * back to a plan-calendar offset. Forward (`+lag`, from a pred anchor) and backward (`−lag`,
 * from a succ anchor) route through this one helper, so the bounds stay exact inverses.
 */
function applyLag(
  anchorOffset: number,
  signedLag: number,
  edge: EngineEdge,
  calendar: WorkingTimeCalendar,
  dataDate: string,
  anchorKind: 'start' | 'finish',
): number {
  if (edge.lagCalendar === undefined || signedLag === 0) return anchorOffset + signedLag;
  const from = anchorInstant(calendar, dataDate, anchorOffset, anchorKind);
  const landing = edge.lagCalendar.addWorkingTime(from, signedLag);
  return calendar.workingTimeBetween(dataDate, landing);
}

/** The lower bound an incoming edge imposes on the successor's early start (spec §4). */
function forwardLowerBound(
  edge: EngineEdge,
  predEarlyStart: number,
  predEarlyFinish: number,
  successorDuration: number,
  calendar: WorkingTimeCalendar,
  dataDate: string,
): number {
  switch (edge.type) {
    case 'FS':
      return applyLag(predEarlyFinish, edge.lagMinutes, edge, calendar, dataDate, 'finish');
    case 'SS':
      return applyLag(predEarlyStart, edge.lagMinutes, edge, calendar, dataDate, 'start');
    case 'FF':
      return (
        applyLag(predEarlyFinish, edge.lagMinutes, edge, calendar, dataDate, 'finish') -
        successorDuration
      );
    case 'SF':
      return (
        applyLag(predEarlyStart, edge.lagMinutes, edge, calendar, dataDate, 'start') -
        successorDuration
      );
  }
}

/** The upper bound an outgoing edge imposes on the predecessor's late finish (spec §4). */
function backwardUpperBound(
  edge: EngineEdge,
  succLateStart: number,
  succLateFinish: number,
  predecessorDuration: number,
  calendar: WorkingTimeCalendar,
  dataDate: string,
): number {
  switch (edge.type) {
    case 'FS':
      return applyLag(succLateStart, -edge.lagMinutes, edge, calendar, dataDate, 'start');
    case 'SS':
      return (
        applyLag(succLateStart, -edge.lagMinutes, edge, calendar, dataDate, 'start') +
        predecessorDuration
      );
    case 'FF':
      return applyLag(succLateFinish, -edge.lagMinutes, edge, calendar, dataDate, 'finish');
    case 'SF':
      return (
        applyLag(succLateFinish, -edge.lagMinutes, edge, calendar, dataDate, 'finish') +
        predecessorDuration
      );
  }
}
