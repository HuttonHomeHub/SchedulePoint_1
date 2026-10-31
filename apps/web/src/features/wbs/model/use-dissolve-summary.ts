import { useCallback } from 'react';

import { useStoreReparentLanes } from './use-store-reparent-lanes';

import {
  useDissolveSummary,
  type DissolveSummaryInput,
  type DissolveSummaryResponse,
} from '@/features/activities';

/** The per-call callbacks the dissolve surfaces pass; the subset of a mutation's they use. */
export interface DissolveCallbacks {
  onSuccess?: (result: DissolveSummaryResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * **The one way to dissolve a summary** (docs/TECH_DEBT.md #547).
 *
 * `useDissolveSummary` is the bare endpoint, and a dissolve is a membership change under a WBS
 * swimlane source: the promoted children join their grandparent's group. So after it lands this stores
 * the lane each child now occupies through {@link useStoreReparentLanes}, planned against the picture
 * without the dissolved summary, which is no longer a swimlane. Otherwise it is exactly the bare
 * write; a lane failure never rejects it (see the store's docblock).
 */
export function useDissolveSummaryInSwimlanes(orgSlug: string, planId: string) {
  const dissolve = useDissolveSummary(orgSlug, planId);
  const lanes = useStoreReparentLanes(orgSlug, planId);
  const { mutateAsync: dissolveAsync } = dissolve;
  const { snapshot, store } = lanes;

  const mutateAsync = useCallback(
    async (input: DissolveSummaryInput): Promise<DissolveSummaryResponse> => {
      const before = snapshot();
      const result = await dissolveAsync(input);
      const summaryId = typeof input === 'string' ? input : input.activityId;
      await store({
        before,
        changes: result.promoted.map((child) => ({ id: child.id, parentId: child.parentId })),
        saved: result.promoted,
        removed: [summaryId],
      });
      return result;
    },
    [snapshot, store, dissolveAsync],
  );

  const mutate = useCallback(
    (input: DissolveSummaryInput, callbacks?: DissolveCallbacks): void => {
      mutateAsync(input).then(
        (result) => callbacks?.onSuccess?.(result),
        (error: Error) => callbacks?.onError?.(error),
      );
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending: dissolve.isPending || lanes.isPending };
}
