import type { QueryClient } from '@tanstack/react-query';

import { codeKeys, SWIMLANE_LANES_SEGMENT } from './hierarchy-keys';

/**
 * Mark every plan-wide code lane read of the plan stale. Called by the writers that change a lane or a
 * code (the positions batch, the lane writes, the codes write), so a copy read before the write is
 * never taken for current when the picture next asks. The key carries a type id in the middle, so the
 * match is by predicate on its last segment rather than by prefix.
 */
export function invalidateCodeSwimlaneLanes(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: codeKeys.byPlan(orgSlug, planId),
    predicate: (query) => query.queryKey.at(-1) === SWIMLANE_LANES_SEGMENT,
  });
}
