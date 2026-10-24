import type { ActivitySummary } from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { useUpdateActivityParents, useWriteSwimlaneLanes } from '@/features/activities';
import { usePlan } from '@/features/plans';
import { planReparentLanes } from '@/features/tsld/model/reparent-lanes';
import { activityKeys } from '@/lib/query/hierarchy-keys';

/** Said when the parents landed and the lanes did not, so the move is not mistaken for a failure. */
const LANES_NOT_SAVED = 'Moved. Its position in the swimlane could not be saved.';

type ParentsInput = Parameters<ReturnType<typeof useUpdateActivityParents>['mutateAsync']>[0];

/**
 * **The one way to write WBS parents** (swimlanes M3-T2, feature-spec §4.6; ui-architecture C11).
 *
 * `useUpdateActivityParents` is the bare endpoint and nothing outside this file calls it
 * (`reparent-callers.structural.test.ts` is the census). A parent write is a membership change when
 * the plan's swimlanes come from its WBS, and a mover that joins a group without a stored lane for it
 * is drawn at a lane the projection derives — one a recalculation may re-derive. So after the parents
 * land this stores the lane each mover (and each descendant that came with it) now occupies, planned
 * by {@link planReparentLanes}: the lane it remembers for its new group when free, otherwise the
 * nearest. With any other source, and for a write that changes no group, it is exactly the bare write.
 *
 * **The parent write is the planner's edit; the lanes are its consequence.** A lane failure is
 * logged, announced ("Moved. Its position in the swimlane could not be saved.") and never rejects the call — the parents have committed, the caller would otherwise report a
 * failure and record no undo step for work that happened, and the picture is still correct, only
 * un-stored. There is no undo step for the lanes either: undoing the parents puts the work back in a
 * group where its old lane is still stored.
 *
 * Planned against the cache's list at the moment of the call, and written at the versions the parent
 * write returned for the movers, because the refetch it triggers may not have landed.
 */
export function useReparentActivities(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const parents = useUpdateActivityParents(orgSlug, planId);
  const lanes = useWriteSwimlaneLanes(orgSlug, planId);
  const plan = usePlan(orgSlug, planId);
  const announce = useAnnounce();
  const { mutateAsync: writeParents } = parents;
  const { mutateAsync: writeLanes } = lanes;
  const source = plan.data?.swimlaneSource ?? 'NONE';
  const level = plan.data?.swimlaneWbsLevel ?? null;
  const dataDate = plan.data?.plannedStart ?? null;

  const mutateAsync = useCallback(
    async (input: ParentsInput): Promise<ActivitySummary[]> => {
      const before = queryClient.getQueryData<ActivitySummary[]>(
        activityKeys.listByPlan(orgSlug, planId),
      );
      const saved = await writeParents(input);
      if (before === undefined) return saved;
      const unsaved = (cause: unknown): void => {
        console.error('Could not save where the moved activities sit in their swimlanes', cause);
        announce(LANES_NOT_SAVED);
      };
      try {
        const placements = planReparentLanes({
          activities: before,
          changes: input.parents,
          source,
          level,
          dataDate,
        });
        if (placements.length === 0) return saved;
        const versions = new Map(before.map((a) => [a.id, a.version]));
        for (const row of saved) versions.set(row.id, row.version);
        const positions = placements.flatMap((p) => {
          const version = versions.get(p.id);
          return version === undefined
            ? []
            : [{ id: p.id, version, swimlane: { laneIndex: p.lane } }];
        });
        // Never a smaller batch than the one planned: a bar the list no longer holds means the plan
        // changed under the move, and the lanes are left to the projection.
        if (positions.length < placements.length) {
          unsaved(
            new Error(
              `no version for ${placements
                .filter((p) => !versions.has(p.id))
                .map((p) => p.id)
                .join(', ')}`,
            ),
          );
          return saved;
        }
        await writeLanes({ positions });
      } catch (error) {
        unsaved(error);
      }
      return saved;
    },
    [queryClient, orgSlug, planId, writeParents, writeLanes, source, level, dataDate, announce],
  );

  return { mutateAsync, isPending: parents.isPending || lanes.isPending };
}
