import { advanceWorking } from './instants';
import type { EngineEdge } from './types';
import type { WorkingTimeCalendar } from './working-time-calendar';

/*
 * **The bound one edge imposes, in absolute working-instants** (#385, spec D2). These three
 * functions are the engine's whole link arithmetic: the lag walk, and the per-type forward and
 * backward bound. They lived private at the foot of `compute.ts` and moved here byte-for-byte,
 * gaining only `export`, so the cross-plan derivation can call the rule the in-plan passes call
 * instead of restating it (a second copy is how #385 happened). `compute.spec.ts` and the
 * conformance suites passing unedited through the move are the proof it changed nothing (the
 * ADR-0078 move rule); `edge-bounds.structural.spec.ts` holds `compute.ts` to importing them.
 */

/**
 * Walk an edge's lag from an anchor **instant** on the edge's resolved lag calendar (ADR-0036 §6 /
 * ADR-0037). The stored anchor already encodes the START-vs-FINISH gap distinction (an early/late
 * finish is an end boundary; a start is the post-gap minute start), so the walk is a single
 * `addWorkingTime` — no offset→instant resolution needed. `edge.lagCalendar` undefined = the plan
 * calendar (PROJECT_DEFAULT, and PRED/SUCC when the endpoint inherits): byte-identical to the old
 * `anchor + lag` offset arithmetic. `TWENTY_FOUR_HOUR` measures an **elapsed** lag; the service
 * resolves `PREDECESSOR`/`SUCCESSOR` to the endpoint activity's calendar (M5).
 */
export function applyLag(
  anchor: number,
  signedLag: number,
  edge: EngineEdge,
  planCalendar: WorkingTimeCalendar,
): number {
  const lagCalendar = edge.lagCalendar ?? planCalendar;
  return advanceWorking(lagCalendar, anchor, signedLag);
}

/** The lower bound (a **start** instant) an incoming edge imposes on the successor's early start. */
export function forwardLowerBound(
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
export function backwardUpperBound(
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
