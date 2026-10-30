import type { ActivitySummary, CodeValueSummary, PlanCodeLane } from '@repo/types';
import { useMemo } from 'react';

import { useCodeSwimlaneLanes } from '../api/use-code-swimlane-lanes';

import { useCodeTypes, useCodeValues } from '@/features/codes';

/** What a code-sourced plan's swimlanes are built from, once it has arrived. */
export interface CodeSwimlaneSource {
  /** The source type's id and name; `undefined` until the types arrive, or when the type is gone. */
  type: { id: string; name: string } | undefined;
  /** The type's live values in order. */
  values: readonly CodeValueSummary[] | undefined;
  /**
   * The plan-wide lanes of the type, present only while the activity list is known **not** to carry
   * them (see {@link useCodeSwimlaneSource}); `undefined` otherwise, so a stale copy is never read.
   */
  planLanes: ReadonlyMap<string, PlanCodeLane> | undefined;
  /** Something the picture needs is on its way: the first paint holds the settled shape (ADR-0202). */
  pending: boolean;
  /** The type or its values could not be read. A failed lanes read is not this: it degrades to derived lanes (`lanesFailed`). */
  failed: boolean;
  /**
   * The plan-wide lanes were asked for and could not be read: the picture still draws, with derived
   * lanes, so the lens says so rather than let placed bars move without a word.
   */
  lanesFailed: boolean;
  /** Read the type and its values again, for the retry a failed picture offers. */
  refetch: () => void;
}

/**
 * The reads a code-sourced swimlane picture needs, from one hook so the scene and the host's
 * auto-resolve read the same queries (one fetch each): the type (its name words "No Area"), its values
 * (the bands), and — only when the activity list holds none of the type's lanes — the plan-wide lanes.
 *
 * **Why the lanes are conditional.** The list carries `codeSwimlaneLanes` only for the code the plan is
 * already drawn by, and only for activities that have a row. After the planner switches to another
 * code, nothing in a list fetched under the old source can say whether it is stale, so a list with no
 * entry for the type at all is asked to prove itself with the plan-wide read (a settled shape while it
 * loads, ADR-0202). Once any entry exists the list is current — every write refreshes it — and the
 * plan-wide copy is dropped rather than read beside it.
 *
 * `codeTypeId` is `null` for every other source: all three queries stay idle.
 */
export function useCodeSwimlaneSource(args: {
  orgSlug: string;
  planId: string;
  codeTypeId: string | null;
  activities: readonly ActivitySummary[] | undefined;
}): CodeSwimlaneSource {
  const { orgSlug, planId, codeTypeId, activities } = args;
  const on = codeTypeId !== null;
  const types = useCodeTypes(orgSlug, planId, on);
  const values = useCodeValues(orgSlug, planId, codeTypeId ?? undefined, on);

  const listHasLanes = useMemo(
    () =>
      codeTypeId !== null &&
      (activities?.some((a) => a.codeSwimlaneLanes?.some((l) => l.codeTypeId === codeTypeId)) ??
        false),
    [activities, codeTypeId],
  );
  const lanesWanted = on && activities !== undefined && !listHasLanes;
  const lanes = useCodeSwimlaneLanes(orgSlug, planId, codeTypeId ?? undefined, lanesWanted);
  const lanesData = lanes.data;
  const planLanes = useMemo(
    () =>
      lanesWanted && lanesData !== undefined
        ? new Map(lanesData.lanes.map((l) => [l.activityId, l]))
        : undefined,
    [lanesWanted, lanesData],
  );

  const typeRow = types.data?.find((t) => t.id === codeTypeId);
  const typeId = typeRow?.id;
  const typeName = typeRow?.name;
  // Memoised on the two fields so the identity holds while the row is unchanged: the input's one-slot
  // cache keys on it, and a fresh object per render would rebuild the input every time.
  const type = useMemo(
    () =>
      typeId === undefined || typeName === undefined ? undefined : { id: typeId, name: typeName },
    [typeId, typeName],
  );

  const failed = on && (types.isError || values.isError || (types.isSuccess && type === undefined));
  return {
    type,
    values: values.data,
    planLanes,
    pending:
      on && !failed && (types.isPending || values.isPending || (lanesWanted && lanes.isPending)),
    failed,
    lanesFailed: lanesWanted && lanes.isError,
    // The retry a failed picture offers reads everything it needs, a failed lanes read included.
    refetch: () => {
      void types.refetch();
      void values.refetch();
      if (lanesWanted) void lanes.refetch();
    },
  };
}
