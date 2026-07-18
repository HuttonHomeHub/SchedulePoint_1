/**
 * Cross-plan **staleness** comparison (inter-project M2, ADR-0045 §5 / ADR-0035 §30.7) — the pure,
 * engine-free freshness compare the schedule **summary read** uses to tell a planner their plan's
 * persisted dates were derived against an OLDER upstream schedule and a programme recalculate is due.
 *
 * A single-plan recalc stamps only that plan's `schedule_computed_at`, leaving its downstream plans'
 * dates derived against a now-superseded upstream schedule. Rather than push a recalc (deferred to a
 * later slice, ADR-0045 §5), M2 tracks this by **pull**: on read we compare the plan's freshness cursor
 * against each plan in its upstream closure. This module holds only the comparison — the closure
 * resolution ({@link ./programme-order}) and the batched cursor load (the repository) live elsewhere.
 */

/** One upstream plan's schedule freshness cursor (`schedule_computed_at`; null = never calculated). */
export interface UpstreamFreshness {
  planId: string;
  computedAt: Date | null;
}

/** The staleness verdict surfaced on the summary — the flag plus the upstream ids that drive it. */
export interface Staleness {
  scheduleStale: boolean;
  staleUpstreamPlanIds: string[];
}

/**
 * An upstream makes the target **stale** iff it has been computed (non-null) AND either the target has
 * **never** been computed (null cursor) or the upstream was computed **strictly later** than the target.
 * A never-computed upstream contributes nothing (it has no dates that could be newer). The returned ids
 * are exactly those upstreams, in the order given (the caller passes the deterministic closure order);
 * `scheduleStale` is `true` iff at least one exists.
 */
export function computeStaleness(
  targetComputedAt: Date | null,
  upstreams: readonly UpstreamFreshness[],
): Staleness {
  const staleUpstreamPlanIds = upstreams
    .filter((u) => isUpstreamNewer(u.computedAt, targetComputedAt))
    .map((u) => u.planId);
  return { scheduleStale: staleUpstreamPlanIds.length > 0, staleUpstreamPlanIds };
}

/** Freshness compare: is `upstreamAt` a schedule the target's persisted dates predate? (See §30.7.) */
function isUpstreamNewer(upstreamAt: Date | null, targetAt: Date | null): boolean {
  if (upstreamAt === null) return false;
  if (targetAt === null) return true;
  return upstreamAt.getTime() > targetAt.getTime();
}
