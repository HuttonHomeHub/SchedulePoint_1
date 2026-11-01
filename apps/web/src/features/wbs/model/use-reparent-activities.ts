import type { ActivitySummary } from '@repo/types';
import { useCallback } from 'react';

import { useStoreReparentLanes } from './use-store-reparent-lanes';

import { useUpdateActivityParents } from '@/features/activities';

type ParentsInput = Parameters<ReturnType<typeof useUpdateActivityParents>['mutateAsync']>[0];

/**
 * **The one way to write WBS parents** (swimlanes M3-T2, feature-spec §4.6; ui-architecture C11).
 *
 * `useUpdateActivityParents` is the bare endpoint and nothing outside this file calls it
 * (`reparent-callers.structural.test.ts` is the census). A parent write is a membership change when
 * the plan's swimlanes come from its WBS, and a mover that joins a group without a stored lane for it
 * is drawn at a lane the projection derives — one a recalculation may re-derive. So after the parents
 * land this stores the lane each mover (and each descendant that came with it) now occupies, through
 * {@link useStoreReparentLanes}: the lane it remembers for its new group when free, otherwise the
 * nearest. With any other source, and for a write that changes no group, it is exactly the bare write.
 *
 * **The parent write is the planner's edit; the lanes are its consequence.** A lane failure is
 * logged, announced ("Moved. Its position in the swimlane could not be saved.") and never rejects the
 * call — the parents have committed, the caller would otherwise report a failure and record no undo
 * step for work that happened, and the picture is still correct, only un-stored. There is no undo step
 * for the lanes either: undoing the parents puts the work back in a group where its old lane is still
 * stored.
 *
 * Planned against the cache's list at the moment of the call, and written at the versions the parent
 * write returned for the movers, because the refetch it triggers may not have landed.
 */
export function useReparentActivities(orgSlug: string, planId: string) {
  const parents = useUpdateActivityParents(orgSlug, planId);
  const lanes = useStoreReparentLanes(orgSlug, planId);
  const { mutateAsync: writeParents } = parents;
  const { snapshot, store } = lanes;

  const mutateAsync = useCallback(
    async (input: ParentsInput): Promise<ActivitySummary[]> => {
      const before = snapshot();
      const saved = await writeParents(input);
      await store({ before, changes: input.parents, saved });
      return saved;
    },
    [snapshot, store, writeParents],
  );

  return { mutateAsync, isPending: parents.isPending || lanes.isPending };
}
