import type { ActivitySummary, SwimlaneSource } from '@repo/types';
import { useMemo } from 'react';

import { useSwimlanes } from '../api/use-swimlanes';

import { manualSwimlaneInput } from './manual-membership';

import type { SwimlaneInput } from '@/features/tsld';

/**
 * Whether the plan workspace offers the Swimlanes lens at all. **`false` until M2-T11**, which is
 * what keeps every task before it dark: with the lens unoffered nothing is "shown", so no list is
 * fetched and no scene input is built (`implementation-plan.md` M2-T1, "Dark because").
 *
 * The lens's own toggle (`enabled: false` in the toolbar's lens roster) and this are two ends of
 * the same switch; T2 replaces this constant with the lens state, `override ?? (source !== 'NONE')`.
 */
export const SWIMLANES_LENS_OFFERED = false;

export interface SwimlaneScene {
  /** The input to the projection, or `null` when swimlanes are not being drawn. */
  input: SwimlaneInput | null;
  /**
   * Swimlanes are wanted but their list has not arrived. The host holds the diagram in its loading
   * state while this is true (ADR-0202): painting the swimlane-free layout first and then jumping
   * every bar into its swimlane is the one frame this exists to prevent.
   */
  pending: boolean;
}

/**
 * Compose the scene's swimlane input, **only while swimlanes are shown**.
 *
 * Memoised on the two things that can change it — the activities and the list — so it is rebuilt
 * once per data change and never per frame or per render.
 *
 * Source `WBS` yields no input here: its membership is derived from the summaries and arrives with
 * M3. Until then a WBS plan draws swimlane-free, as it does today.
 */
export function useSwimlaneScene(args: {
  orgSlug: string;
  planId: string;
  source: SwimlaneSource;
  activities: readonly ActivitySummary[] | undefined;
  shown: boolean;
}): SwimlaneScene {
  const { orgSlug, planId, source, activities, shown } = args;
  const wanted = shown && source === 'MANUAL';
  const list = useSwimlanes(orgSlug, planId, wanted);
  const swimlanes = list.data;
  const input = useMemo(
    () =>
      wanted && swimlanes !== undefined && activities !== undefined
        ? manualSwimlaneInput(activities, swimlanes)
        : null,
    [wanted, swimlanes, activities],
  );
  // `isPending` is true for a disabled query that has no data, so it is gated on `wanted`; an error
  // is not pending, so a failed list degrades to the swimlane-free diagram rather than a spinner
  // that never ends.
  return { input, pending: wanted && list.isPending };
}
