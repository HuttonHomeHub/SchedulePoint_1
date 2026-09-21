import type { PlacementMigrationReport } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { placementMigrationKeys } from '@/lib/query/hierarchy-keys';

export { placementMigrationKeys };

export function placementMigrationQueryOptions(orgSlug: string, planId: string, enabled = true) {
  return queryOptions({
    queryKey: placementMigrationKeys.forPlan(orgSlug, planId),
    queryFn: () =>
      apiFetch<PlacementMigrationReport>(
        `/organizations/${orgSlug}/plans/${planId}/placement-migration`,
      ),
    enabled,
    /**
     * **`Infinity`, and it is the honest value rather than a large number.** These rows are
     * written by a shipped SQL migration inside `prisma migrate deploy` and by nothing else, so
     * within one page load the answer cannot change — a refetch could only ever return what it
     * already has. The one event that changes it is a deploy, which replaces the bundle.
     */
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * What the one-time placement migration (one-planning-surface M-I) changed on this plan.
 *
 * **A plan with nothing migrated returns `count: 0`, which is the common case and not an error.**
 * The strip only ever touched plans carrying a *binding* `SNET` (start no earlier than) written by a drag
 * before the collapse, so most plans — and every plan created since — have nothing to report.
 *
 * Reads ride on `plan:read`, so there is no permission branch here: every member of the
 * organisation sees the same report, which is what makes it something a planner can be pointed at
 * by somebody else in the room.
 */
export function usePlacementMigration(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<PlacementMigrationReport> {
  return useQuery(placementMigrationQueryOptions(orgSlug, planId, enabled));
}
