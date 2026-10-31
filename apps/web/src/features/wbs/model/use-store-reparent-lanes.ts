import type { ActivitySummary } from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { useWriteSwimlaneLanes } from '@/features/activities';
import { usePlan } from '@/features/plans';
import { planReparentLanes } from '@/features/tsld/model/reparent-lanes';
import { activityKeys } from '@/lib/query/hierarchy-keys';

/** Said when the parents landed and the lanes did not, so the move is not mistaken for a failure. */
const LANES_NOT_SAVED = 'Moved. Its position in the swimlane could not be saved.';

export interface StoreReparentLanesArgs {
  /** The plan's list as it stood BEFORE the write, from {@link StoreReparentLanes.snapshot}. */
  before: ActivitySummary[] | undefined;
  /** The parent each mover now has. */
  changes: readonly { id: string; parentId: string | null }[];
  /** The rows the write answered, whose versions the lane write must carry. */
  saved: readonly { id: string; version: number }[];
  /** Activities the write removed (a dissolved summary), planned against as absent. */
  removed?: readonly string[] | undefined;
}

export interface StoreReparentLanes {
  /** The cache's list at the moment of the call; take it BEFORE the write that changes membership. */
  snapshot: () => ActivitySummary[] | undefined;
  /** Store the lanes the movers now occupy. Never rejects: see {@link useStoreReparentLanes}. */
  store: (args: StoreReparentLanesArgs) => Promise<void>;
  isPending: boolean;
}

/**
 * **The one lane-store write after a WBS membership change** (docs/TECH_DEBT.md #547).
 *
 * Under a WBS swimlane source a mover that joins a group without a stored lane for it is drawn at a
 * lane the projection derives, which a recalculation may re-derive. So after any write that changes
 * membership this stores the lane each mover (and each descendant that came with it) now occupies,
 * planned by {@link planReparentLanes}. The three writes that change membership share it: the parents
 * write (`useReparentActivities`), the activity editor's General save when `parentId` changed, and a
 * summary dissolve. With any other source, and for a write that changes no group, it writes nothing.
 *
 * **The membership write is the planner's edit; the lanes are its consequence.** A lane failure is
 * logged, announced and never rejects — the parents have committed, so the caller would otherwise
 * report a failure for work that happened, and the picture is still correct, only un-stored. It is
 * written at the versions the membership write returned, because the refetch it triggers may not have
 * landed.
 */
export function useStoreReparentLanes(orgSlug: string, planId: string): StoreReparentLanes {
  const queryClient = useQueryClient();
  const lanes = useWriteSwimlaneLanes(orgSlug, planId);
  const plan = usePlan(orgSlug, planId);
  const announce = useAnnounce();
  const { mutateAsync: writeLanes } = lanes;
  const source = plan.data?.swimlaneSource ?? 'NONE';
  const level = plan.data?.swimlaneWbsLevel ?? null;
  const dataDate = plan.data?.plannedStart ?? null;

  const snapshot = useCallback(
    () => queryClient.getQueryData<ActivitySummary[]>(activityKeys.listByPlan(orgSlug, planId)),
    [queryClient, orgSlug, planId],
  );

  const store = useCallback(
    async ({ before, changes, saved, removed }: StoreReparentLanesArgs): Promise<void> => {
      if (before === undefined) return;
      const unsaved = (cause: unknown): void => {
        console.error('Could not save where the moved activities sit in their swimlanes', cause);
        announce(LANES_NOT_SAVED);
      };
      try {
        const placements = planReparentLanes({
          activities: before,
          changes,
          source,
          level,
          dataDate,
          removed,
        });
        if (placements.length === 0) return;
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
          return;
        }
        await writeLanes({ positions });
      } catch (error) {
        unsaved(error);
      }
    },
    [writeLanes, source, level, dataDate, announce],
  );

  return { snapshot, store, isPending: lanes.isPending };
}
