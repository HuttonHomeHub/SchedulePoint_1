import type { ActivitySummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { useMemo } from 'react';

import { useSwimlanes } from '../api/use-swimlanes';

import { manualSwimlaneInput } from './manual-membership';

import type { SwimlaneInput } from '@/features/tsld';
import { isWbsSwimlaneLevel, wbsSwimlaneInput } from '@/features/wbs';

/**
 * Whether alternate swimlanes carry the faint ground. The approved default of feature-spec SQ-6 is
 * yes. It is policy and not painting, so it lives with the host's lens model and reaches the painter
 * as `TsldPanel`'s `swimlaneGround`; reversing the answer is a one-line change and a test.
 */
export const SWIMLANE_GROUND = true;

/**
 * Whether the plan's swimlane picture exists for this session: its swimlanes are hand-made, or come
 * from the WBS at a valid level, and, where it matters, the planner can write. **The one gate** for
 * drawing it and auto-resolving in it; assigning is hand-made only and says so at its own call.
 *
 * A `WBS` source without a level (which the server refuses to store) reads as no picture rather than
 * as level 1, so a half-written plan draws and resolves swimlane-free.
 */
export function swimlanePictureOn(args: {
  source: SwimlaneSource;
  /** The plan's WBS level; only read for source `WBS`. */
  level?: number | null | undefined;
  /** Only the writers of auto-resolve pass this; the read-only scene has no use for it. */
  canEdit?: boolean;
}): boolean {
  const fromSource =
    args.source === 'MANUAL' || (args.source === 'WBS' && isWbsSwimlaneLevel(args.level));
  return fromSource && (args.canEdit ?? true);
}

/**
 * The swimlane input auto-resolve reads from the caches: `null` unless the picture is on and what the
 * source needs has loaded — the list for hand-made swimlanes, only the activities for the WBS.
 */
export function swimlanePictureInput(args: {
  on: boolean;
  source: SwimlaneSource;
  level?: number | null | undefined;
  activities: readonly ActivitySummary[] | undefined;
  list: readonly SwimlaneSummary[] | undefined;
}): SwimlaneInput | null {
  const { on, source, level, activities, list } = args;
  if (!on || activities === undefined) return null;
  if (source === 'WBS') {
    return isWbsSwimlaneLevel(level) ? wbsSwimlaneInput(activities, level) : null;
  }
  return list !== undefined ? manualSwimlaneInput(activities, list) : null;
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
 * The list itself is fetched whenever the plan has hand-made swimlanes ({@link swimlanePictureOn}),
 * independent of `shown`: a toggle made later then finds it cached and cannot cause a load that
 * would hold the diagram.
 *
 * Memoised on the two things that can change the input — the activities and the list — so it is
 * rebuilt once per data change and never per frame or per render.
 *
 * **Source `WBS` needs no list**: its swimlanes are the plan's summaries at the level, read from the
 * activities already loaded, so the input exists the moment the diagram can be drawn and `pending` is
 * never true. No frame paints the swimlane-free layout first (ui-architecture §6).
 */
export function useSwimlaneScene(args: {
  orgSlug: string;
  planId: string;
  source: SwimlaneSource;
  /** The plan's WBS level; only read for source `WBS`. */
  level?: number | null | undefined;
  activities: readonly ActivitySummary[] | undefined;
  shown: boolean;
}): SwimlaneScene {
  const { orgSlug, planId, source, level, activities, shown } = args;
  const picture = swimlanePictureOn({ source, level });
  const manual = picture && source === 'MANUAL';
  const list = useSwimlanes(orgSlug, planId, manual);
  const swimlanes = list.data;
  const drawn = picture && shown;
  const input = useMemo(
    () =>
      drawn ? swimlanePictureInput({ on: true, source, level, activities, list: swimlanes }) : null,
    [drawn, source, level, swimlanes, activities],
  );
  // `isPending` is true for a disabled query that has no data, so it is gated on `drawn`; an error
  // is not pending, so a failed list degrades to the swimlane-free diagram rather than a spinner
  // that never ends.
  return {
    input,
    pending: drawn && manual && list.isPending,
    failed: manual && list.isError,
    count: manual ? swimlanes?.length : undefined,
    refetch: () => void list.refetch(),
  };
}
