import type { ActivitySummary } from '@repo/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, swimlaneKeys } from '@/lib/query/hierarchy-keys';

/**
 * One activity's lane **inside its swimlane**, with the version it was read at (optimistic lock).
 * There is no basis: the server derives it from the plan's source and the activity's membership
 * (`docs/API.md`, "The positions batch"), and a basis sent here is a 422.
 */
export interface SwimlaneLaneRow {
  id: string;
  version: number;
  swimlane: {
    /**
     * File the activity in this swimlane, or `null` to file it in none. Omitted keeps its
     * membership; sent only when the move changes it, and refused on a WBS plan.
     */
    swimlaneId?: string | null;
    laneIndex: number;
  };
}

/**
 * The batch lane write for the swimlane layout (swimlanes M2-T4): `PATCH …/activities/positions`
 * with `swimlane` rows and **no `laneIndex`**, so it cannot touch the swimlane-free layout (SC-1).
 * All-or-nothing, like `useBatchPositions`, and layout only — no recalculation.
 *
 * It settles into the activities list **and** the plan's swimlane list. The list carries each
 * member's stored lanes and its membership, which this write changes; the swimlane list is what the
 * diagram's scene input is built from, and a write that left either stale would redraw the bars
 * where they were until something else happened to refetch.
 */
export function useWriteSwimlaneLanes(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { positions: SwimlaneLaneRow[] }) =>
      apiFetch<ActivitySummary[]>(
        `/organizations/${orgSlug}/plans/${planId}/activities/positions`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: swimlaneKeys.byPlan(orgSlug, planId) }),
      ]),
  });
}
