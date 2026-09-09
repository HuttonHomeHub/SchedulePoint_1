import type { CrossPlanRevisionCompare, RevisionCompare, RevisionInclude } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

/** The literal the API takes for `to` to mean the plan as it stands now. */
export const LIVE_REVISION = 'live';

/**
 * Re-exported, never redeclared — see {@link RevisionInclude} in `@repo/types` for why. This
 * module's existing consumers keep importing it from here.
 */
export type { RevisionInclude };

/**
 * What the plan workspace asks for. **One constant rather than an inline array at the call site**,
 * so the panel's own tests and the journey assert against the same thing the product sends — an
 * inline literal is how a surface comes to be tested in a configuration it never ships in.
 */
export const REVISION_COMPARE_INCLUDES: readonly RevisionInclude[] = ['changes', 'ghosts'];

export function revisionCompareQueryOptions(
  orgSlug: string,
  planId: string,
  from: string | null,
  to: string,
  enabled = true,
  includes: readonly RevisionInclude[] = [],
) {
  // Sorted, so ['changes','progress'] and ['progress','changes'] are ONE cache entry rather than
  // two identical requests — the key is a value, and a caller's array order is not information.
  const sorted = [...includes].sort();
  return queryOptions({
    queryKey: scheduleKeys.revisionCompare(orgSlug, planId, from ?? '', to, sorted),
    queryFn: () =>
      apiFetch<RevisionCompare>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/revision-compare` +
          `?from=${encodeURIComponent(from ?? '')}&to=${encodeURIComponent(to)}` +
          sorted.map((i) => `&include=${encodeURIComponent(i)}`).join(''),
      ),
    // `from` is REQUIRED by the route, so a null one is not a request to make — it is the state
    // before the planner has chosen. Gating here rather than rendering an error keeps "you have
    // not picked yet" and "the server refused" as two different facts on screen.
    //
    // **`from === to` is NOT gated here, and that is the fix rather than an omission.** It used to
    // be, and a disabled query in TanStack Query v5 stays `status: 'pending'` FOREVER — so picking
    // one baseline on both sides (trivial with one baseline captured) rendered "Comparing…" with a
    // spinner, permanently, with no error and no way out. Worse than a blank panel, because it
    // signals that a request is in flight when none will ever be made. The API already has the
    // honest answer — a 422 saying "Pick two different revisions to compare", written precisely
    // because a 200 with an empty delta "would read as nothing changed rather than you asked the
    // wrong question" — and the client's own guard was making that message unreachable. The panel
    // now prevents the state at the picker AND the request is allowed through if it happens
    // anyway, so the server's sentence is the backstop rather than dead code. Found independently
    // by the M4 ux and accessibility reviews.
    enabled: enabled && from !== null,
    staleTime: 30_000,
  });
}

/**
 * A plan's revision comparison (ADR-0125): what entered and left the critical path between two
 * computed schedules, and how far the completion moved.
 *
 * A pure read — the server invokes no engine, takes no lock and writes nothing. **It reports what
 * moved and never what caused it**, so nothing downstream of this hook may present a row as a
 * cause; the payload carries no field that would let it.
 */
export function useRevisionCompare(
  orgSlug: string,
  planId: string,
  from: string | null,
  to: string,
  enabled = true,
  includes: readonly RevisionInclude[] = [],
): UseQueryResult<RevisionCompare> {
  return useQuery(revisionCompareQueryOptions(orgSlug, planId, from, to, enabled, includes));
}

/**
 * **The CROSS-plan comparison** — a revision of one plan against a revision of another, matched on
 * activity `code`.
 *
 * A separate hook rather than a widened one, mirroring the API: the two routes take different
 * params and return different shapes, and a single hook branching internally would make the
 * caller's `enabled` and cache key depend on a value it also has to reason about.
 *
 * **`toPlanId` is the ANCHOR** — the plan the reader has open — and every activity id in the
 * response resolves there. A row that exists only in the other plan carries a null `activityId`,
 * which is what a consumer branches on to decide whether an activation control applies at all.
 */
export function crossPlanRevisionCompareQueryOptions(
  orgSlug: string,
  toPlanId: string,
  fromPlanId: string | null,
  from: string,
  to: string,
  enabled = true,
  includes: readonly RevisionInclude[] = [],
) {
  // Sorted, for the reason the sibling gives: a caller's array order is not information, and two
  // orders of one set must be ONE cache entry rather than two identical requests.
  const sorted = [...includes].sort();
  return queryOptions({
    queryKey: scheduleKeys.crossPlanRevisionCompare(
      orgSlug,
      toPlanId,
      fromPlanId ?? '',
      from,
      to,
      sorted,
    ),
    queryFn: () =>
      apiFetch<CrossPlanRevisionCompare>(
        `/organizations/${orgSlug}/cross-plan-revision-compare` +
          `?fromPlanId=${encodeURIComponent(fromPlanId ?? '')}&toPlanId=${encodeURIComponent(toPlanId)}` +
          `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
          sorted.map((i) => `&include=${encodeURIComponent(i)}`).join(''),
      ),
    /**
     * No other plan chosen is not a request to make — it is the state before the planner has
     * picked one, which is a different fact from "the server refused" and renders differently.
     *
     * **The same-plan case is deliberately NOT gated here**, exactly as the sibling records: a
     * disabled query in TanStack Query v5 stays `status: 'pending'` forever, so gating it would
     * render "Comparing…" with a spinner permanently and no way out. The picker excludes the open
     * plan, and the server's 422 is the backstop rather than dead code.
     */
    enabled: enabled && fromPlanId !== null,
    staleTime: 30_000,
  });
}

export function useCrossPlanRevisionCompare(
  orgSlug: string,
  toPlanId: string,
  fromPlanId: string | null,
  from: string,
  to: string,
  enabled = true,
  includes: readonly RevisionInclude[] = [],
): UseQueryResult<CrossPlanRevisionCompare> {
  return useQuery(
    crossPlanRevisionCompareQueryOptions(
      orgSlug,
      toPlanId,
      fromPlanId,
      from,
      to,
      enabled,
      includes,
    ),
  );
}

/**
 * Which kind of comparison a payload is, **decided by a field that only one of them has**.
 *
 * `correlation` is present exactly when the two sides came from two different plans, so this is a
 * fact about the payload rather than a flag a caller has to keep in step with the request it made.
 * A boolean prop threaded beside the data would be the thing that eventually disagrees with it.
 */
export function isCrossPlanCompare(
  compare: RevisionCompare | CrossPlanRevisionCompare,
): compare is CrossPlanRevisionCompare {
  return 'correlation' in compare;
}
