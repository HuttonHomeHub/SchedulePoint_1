/**
 * Thrown by the engine's **defensive** DAG guard when a residual cycle survives
 * the topological sort.
 *
 * This should be unreachable in production: the write-path invariant (ADR-0021)
 * guarantees the dependency graph is acyclic via a plan-scoped lock and an
 * in-transaction reachability check on every edge insert. The guard exists so
 * that if that invariant is ever breached, the engine **fails loud** — it never
 * loops forever and never persists a garbage schedule. The service maps this to
 * a distinct, alarm-worthy 500 (see ADR-0022).
 */
export class ScheduleGraphNotADagError extends Error {
  /** The activity ids that could not be ordered (they sit on/behind a cycle). */
  readonly unresolvedActivityIds: readonly string[];

  constructor(unresolvedActivityIds: readonly string[]) {
    super(
      `Schedule graph is not a DAG: ${unresolvedActivityIds.length} activit${
        unresolvedActivityIds.length === 1 ? 'y' : 'ies'
      } could not be topologically ordered (residual cycle).`,
    );
    this.name = 'ScheduleGraphNotADagError';
    this.unresolvedActivityIds = unresolvedActivityIds;
  }
}

/**
 * Thrown when an edge references an activity id that is not in the node set — a
 * programming error in the caller (the service must load a consistent snapshot
 * of a plan's active activities and edges). Fails loud rather than silently
 * dropping the edge.
 */
export class UnknownActivityError extends Error {
  readonly activityId: string;

  constructor(activityId: string) {
    super(`Edge references unknown activity "${activityId}".`);
    this.name = 'UnknownActivityError';
    this.activityId = activityId;
  }
}

/**
 * Thrown when a calendar has no working time at all — an empty base week AND no working
 * exception. Nothing can ever be scheduled on it, so the engine refuses rather than looping
 * to its horizon.
 *
 * Unlike the two guards above this is **reachable from ordinary user input**, and became so
 * when ADR-0036 §2's window-only base week was finally accepted at the DTO (TECH_DEBT #79):
 * `workingWeekdays: 0` is a legitimate turnaround calendar the moment it carries a working
 * exception, and a plain 500 until it does. Named so the service can map it to a 422 that
 * says which calendar and what to add — the engine is the only layer that can see both
 * halves (ADR-0036 §2), so it is the only layer that can raise it, and the service is the
 * only layer that can phrase it.
 */
export class EmptyWorkingTimeCalendarError extends Error {
  constructor() {
    super('A working-time calendar must have at least one working minute.');
    this.name = 'EmptyWorkingTimeCalendarError';
  }
}

/**
 * Thrown when the working-time walker cannot find the requested minute within the engine's
 * horizon (`HORIZON_DAYS`, the ADR-0036 N11/N16 cap) — a calendar that HAS working time, placed
 * where the schedule cannot reach it: a dated blackout longer than the horizon, or a window-only
 * calendar whose one working exception sits years from the dates being walked.
 *
 * **Typed for `docs/TECH_DEBT.md` #205(b), on the ADR-0071 rule** — "the engine's own guard is a
 * typed error and a 422, not a 500". This guard predates that ruling and reached the client as a
 * bare `INTERNAL_ERROR` for a user-caused, user-fixable state (ADR-0067's Window-only preset makes
 * it authorable). Like {@link EmptyWorkingTimeCalendarError}, the engine raises it and the service
 * phrases it; unlike that one, it fires at WALK time, so the engine cannot say WHICH calendar —
 * the service names one only when the plan has exactly one in play.
 */
export class WorkingTimeHorizonExceededError extends Error {
  constructor() {
    super('addWorkingTime exceeded the working-time horizon (no reachable minute).');
    this.name = 'WorkingTimeHorizonExceededError';
  }
}
