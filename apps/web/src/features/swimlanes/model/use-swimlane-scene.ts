import type { ActivitySummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
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

/**
 * Whether alternate swimlanes carry the faint ground. The approved default of feature-spec SQ-6 is
 * yes. It is policy and not painting, so it lives with the host's lens model and reaches the painter
 * as `TsldPanel`'s `swimlaneGround`; reversing the answer is a one-line change and a test.
 */
export const SWIMLANE_GROUND = true;

/**
 * Whether the plan's swimlane picture exists for this session: the lens is offered, the plan's
 * swimlanes are hand-made (a `WBS` source has no input until M3) and, where it matters, the planner
 * can write. **The one gate** for fetching the swimlane list, drawing it and auto-resolving in it, so
 * that nothing behind the lens runs while the lens is withheld — a plan whose source was set through
 * the API still draws and resolves swimlane-free until `SWIMLANES_LENS_OFFERED` flips.
 */
export function swimlanePictureOn(args: {
  offered: boolean;
  source: SwimlaneSource;
  /** Only the writers of auto-resolve pass this; the read-only scene has no use for it. */
  canEdit?: boolean;
}): boolean {
  return args.offered && args.source === 'MANUAL' && (args.canEdit ?? true);
}

/**
 * The swimlane input auto-resolve reads from the caches: `null` unless the picture is on and both
 * the activities and the list are loaded.
 */
export function swimlanePictureInput(args: {
  on: boolean;
  activities: readonly ActivitySummary[] | undefined;
  list: readonly SwimlaneSummary[] | undefined;
}): SwimlaneInput | null {
  const { on, activities, list } = args;
  return on && activities !== undefined && list !== undefined
    ? manualSwimlaneInput(activities, list)
    : null;
}

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
  /**
   * How many swimlanes the plan has, once the list is known; absent before then and when the plan is
   * not hand-made. A hand-made plan can have none (undoing a setup removes the swimlanes and leaves the
   * source), and the lens and its command must say "none set up" then as they do for `NONE`.
   */
  count?: number | undefined;
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
  const manual = swimlanePictureOn({ offered, source });
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
    count: manual ? swimlanes?.length : undefined,
    refetch: () => void list.refetch(),
  };
}
