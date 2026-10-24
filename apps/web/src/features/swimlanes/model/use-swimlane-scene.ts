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
   * Swimlanes are shown but their list has not arrived **yet**. The host holds the diagram in its
   * loading state for the FIRST load only (ADR-0202): painting the swimlane-free layout and then
   * jumping every bar into its swimlane is the one frame this exists to prevent. Once the panel
   * has painted the host never unmounts it for this, or a later toggle would drop focus,
   * selection and viewport; it latches that itself, because only it knows what has painted.
   */
  pending: boolean;
  /** The list could not be loaded (after one retry). The lens words this; the diagram draws swimlane-free. */
  failed: boolean;
  /** Try the list again. */
  refetch: () => void;
}

/**
 * Compose the scene's swimlane input, **only while swimlanes are shown**.
 *
 * The list itself is fetched whenever the lens is `offered` and the plan has hand-made swimlanes,
 * independent of `shown`: a toggle made later then finds it cached and cannot cause a load that
 * would hold the diagram.
 *
 * Memoised on the two things that can change the input — the activities and the list — so it is
 * rebuilt once per data change and never per frame or per render.
 *
 * Source `WBS` yields no input here: its membership is derived from the summaries and arrives with
 * M3. Until then a WBS plan draws swimlane-free, as it does today.
 */
export function useSwimlaneScene(args: {
  orgSlug: string;
  planId: string;
  source: SwimlaneSource;
  activities: readonly ActivitySummary[] | undefined;
  /** The lens is offered at all (`SWIMLANES_LENS_OFFERED`). */
  offered: boolean;
  shown: boolean;
}): SwimlaneScene {
  const { orgSlug, planId, source, activities, offered, shown } = args;
  const manual = offered && source === 'MANUAL';
  const list = useSwimlanes(orgSlug, planId, manual);
  const swimlanes = list.data;
  const drawn = manual && shown;
  const input = useMemo(
    () =>
      drawn && swimlanes !== undefined && activities !== undefined
        ? manualSwimlaneInput(activities, swimlanes)
        : null,
    [drawn, swimlanes, activities],
  );
  // `isPending` is true for a disabled query that has no data, so it is gated on `drawn`; an error
  // is not pending, so a failed list degrades to the swimlane-free diagram rather than a spinner
  // that never ends.
  return {
    input,
    pending: drawn && list.isPending,
    failed: manual && list.isError,
    refetch: () => void list.refetch(),
  };
}
