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

  /** Plan and write the lanes for a dissolve that has landed. Never rejects (see the store). */
  const storeLanes = useCallback(
    (
      before: ReturnType<typeof snapshot>,
      input: DissolveSummaryInput,
      result: DissolveSummaryResponse,
    ): Promise<void> =>
      store({
        before,
        changes: result.promoted.map((child) => ({ id: child.id, parentId: child.parentId })),
        saved: result.promoted,
        removed: [typeof input === 'string' ? input : input.activityId],
      }),
    [store],
  );

  const mutateAsync = useCallback(
    async (input: DissolveSummaryInput): Promise<DissolveSummaryResponse> => {
      const before = snapshot();
      const result = await dissolveAsync(input);
      await storeLanes(before, input, result);
      return result;
    },
    [snapshot, storeLanes, dissolveAsync],
  );

  // The caller's `onSuccess` runs before the lanes are written, as the editor's save does: the host
  // records its undo step from it, and a slow or failed lane write must not delay or lose that. A
  // throw from a caller's callback is logged, never left as an unhandled rejection.
  const mutate = useCallback(
    (input: DissolveSummaryInput, callbacks?: DissolveCallbacks): void => {
      const before = snapshot();
      void dissolveAsync(input).then(
        async (result) => {
          try {
            callbacks?.onSuccess?.(result);
          } catch (error) {
            console.error('A dissolve success callback threw', error);
          }
          await storeLanes(before, input, result);
        },
        (error: Error) => {
          try {
            callbacks?.onError?.(error);
          } catch (thrown) {
            console.error('A dissolve error callback threw', thrown);
          }
        },
      );
    },
    [snapshot, storeLanes, dissolveAsync],
  );

  return { mutate, mutateAsync, isPending: dissolve.isPending || lanes.isPending };
}
