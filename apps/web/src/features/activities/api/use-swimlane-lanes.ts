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
  /**
   * The same activity's lane in the swimlane-free layout, beside its swimlane lane. Sent by exactly
   * one caller: auto-resolve, which moves a bar in both pictures in one write (M2-T5). A lane move
   * on the swimlane layout never sends it (SC-1).
   */
  laneIndex?: number;
}

/** A row that moves only the swimlane-free lane, for a bar auto-resolve moves in that picture alone. */
export interface PlainLaneRow {
  id: string;
  version: number;
  laneIndex: number;
}

/** Whether any row files its activity in a swimlane (or in none), rather than only placing it. */
function changesMembership(positions: readonly (SwimlaneLaneRow | PlainLaneRow)[]): boolean {
  return positions.some((p) => 'swimlane' in p && p.swimlane.swimlaneId !== undefined);
}

/**
 * The batch lane write for the swimlane layout (swimlanes M2-T4): `PATCH …/activities/positions`
 * with `swimlane` rows and **no `laneIndex`**, so it cannot touch the swimlane-free layout (SC-1).
 * All-or-nothing, like `useBatchPositions`, and layout only — no recalculation.
 *
 * It settles into the activities list, which carries each member's stored lanes and its membership;
 * a write that left it stale would redraw the bars where they were until something else happened to
 * refetch. The plan's swimlane list is settled too, **but only when a row changed a bar's
 * membership**: a lane-only write (every drag, nudge and auto-resolve) cannot change which swimlanes
 * the plan has, and refetching the list for each one was a request per gesture that fed nothing.
 */
export function useWriteSwimlaneLanes(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { positions: (SwimlaneLaneRow | PlainLaneRow)[] }) =>
      apiFetch<ActivitySummary[]>(
        `/organizations/${orgSlug}/plans/${planId}/activities/positions`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        ...(changesMembership(input.positions)
          ? [queryClient.invalidateQueries({ queryKey: swimlaneKeys.byPlan(orgSlug, planId) })]
          : []),
      ]),
  });
}
