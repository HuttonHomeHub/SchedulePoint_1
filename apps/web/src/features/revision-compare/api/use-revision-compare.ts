import type { RevisionCompare, RevisionInclude } from '@repo/types';
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
