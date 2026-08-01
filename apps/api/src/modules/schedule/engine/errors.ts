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
