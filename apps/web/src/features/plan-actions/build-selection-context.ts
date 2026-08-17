import type { ActivitySummary } from '@repo/types';

import { leadingConflictKey } from './conflict-remedy';
import type { SelectionBarContext, SelectionCanvasContext } from './selection-actions';

/**
 * **One builder, two hosts.**
 *
 * The object-action bar's context was assembled inside `TsldPanel`, which made it a canvas artefact
 * by accident of where it lived. The Gantt needs the same bar over the same objects — that is
 * ADR-0093's discriminator, and the promise ADR-0094 left outstanding when it took `Report progress`
 * off the command surface on the explicit basis that the Gantt would pick it up.
 *
 * Two hosts assembling this independently is the defect this epic has already found twice at one
 * layer up (`barDateSource`, `lateOverlayActive`): each host looks right on its own, and the two
 * views disagree about the same activity in a way only somebody opening both would see. So the
 * assembly moves here and both hosts call it.
 *
 * **`canvas` is the whole of the difference.** `SelectionBarContext.canvas` is
 * `SelectionCanvasContext | null`, and the two canvas-only items gate on `ctx.canvas !== null`
 * (`selection-actions.tsx`). A Gantt host passes `null` and those items disappear — not shaded,
 * absent, because zoom-to-selection and isolate are things the object cannot do in this view rather
 * than things this reader may not do (ADR-0082's omit branch). Nothing else about the object
 * changes with the projection, which is why nothing else is parameterised.
 */
export interface SelectionContextInput {
  /** The canvas half, supplied whole or not at all. `null` in a Gantt host. */
  canvas: SelectionCanvasContext | null;
  /** The plan's activities, for resolving the selected id. */
  activities: readonly ActivitySummary[];
  /** The primary selected id, or null/undefined when nothing is selected. */
  selectedId: string | null | undefined;
  /** How many activities are selected. A plural selection yields `null` — see below. */
  selectionCount: number;
  /** Fused role + pen (ADR-0060). One boolean, already decided by the workspace. */
  canEditSchedule: boolean;
  /**
   * Why a given pen-gated action is shut, or null when it is not. A **function**, not a string —
   * the refusal is per action (`selection-actions.tsx:65`), which I had typed as a plain message
   * until the compiler said otherwise.
   */
  scheduleRefusal: (action: string) => string | null;
  canReportProgress: boolean;
  /** Whether this activity may carry weighted steps — the host predicate, false when absent. */
  isStepsEligible?: ((activity: ActivitySummary) => boolean) | undefined;
  /** `reason` is required and present exactly when `enabled` is false — `BulkActionGate` never
   * invents one, so a host that cannot offer this must say why. */
  clearPlacement?: { enabled: boolean; reason: string | null } | undefined;
  onOpenLogic: (activity: ActivitySummary) => void;
  onEdit: (activity: ActivitySummary) => void;
  onDelete: (activity: ActivitySummary) => void;
  onDissolve?: ((activity: ActivitySummary) => void) | undefined;
  onDuplicate?: ((activity: ActivitySummary) => void) | undefined;
  onDuplicateBand?: ((activity: ActivitySummary) => void) | undefined;
  onResources?: ((activity: ActivitySummary) => void) | undefined;
  onProgress?: ((activity: ActivitySummary) => void) | undefined;
  onSteps?: ((activity: ActivitySummary) => void) | undefined;
  onClearVisualPlacement?: ((activity: ActivitySummary) => void) | undefined;
  /** `at` is the editor scope the remedy routes to — a closed union, not a free string
   * (`selection-actions.tsx:98`). Typed loosely here first, which the compiler rejected. */
  onOpenEditorAt?:
    ((activity: ActivitySummary, at: 'constraint' | 'resources') => void) | undefined;
}

/**
 * The context for the singular object bar, or `null` when there is nothing to act on.
 *
 * Returns `null` for a **plural** selection: `BulkSelectionBar` replaces the per-object bar rather
 * than joining it (ADR-0080), and docked into one 36 px row that does not wrap, rendering both
 * produces visible clipping and a control that is in the tab order but not on screen.
 */
export function buildSelectionBarContext(input: SelectionContextInput): SelectionBarContext | null {
  if (input.selectionCount > 1) return null;
  const activity = input.selectedId
    ? input.activities.find((a) => a.id === input.selectedId)
    : undefined;
  if (!activity) return null;

  return {
    canvas: input.canvas,
    targetName: activity.name,
    canEditSchedule: input.canEditSchedule,
    scheduleRefusal: input.scheduleRefusal,
    canReportProgress: input.canReportProgress,
    stepsEligible: input.isStepsEligible ? input.isStepsEligible(activity) : false,
    // A fact about the activity, not a policy a host could reasonably differ on.
    isSummary: activity.type === 'WBS_SUMMARY',
    onOpenLogic: () => input.onOpenLogic(activity),
    onEdit: () => input.onEdit(activity),
    onDelete: () => input.onDelete(activity),
    onDissolve: () => input.onDissolve?.(activity),
    onDuplicate: () => input.onDuplicate?.(activity),
    onDuplicateBand: () => input.onDuplicateBand?.(activity),
    onResources: () => input.onResources?.(activity),
    onProgress: () => input.onProgress?.(activity),
    onSteps: () => input.onSteps?.(activity),
    // Derived through the SAME `CONFLICT_FLAGS` the count and the filter run (ADR-0094 D2), so a
    // planner who arrived by pressing Next conflict and one who simply clicked the bar meet the
    // same remedy.
    conflictKey: leadingConflictKey(activity),
    // Shut with a reason when the host did not wire it — never enabled-but-inert.
    clearPlacement: input.clearPlacement ?? {
      enabled: false,
      reason: 'Clearing a placement is unavailable here',
    },
    onClearVisualPlacement: () => input.onClearVisualPlacement?.(activity),
    onOpenEditorAt: (at) => input.onOpenEditorAt?.(activity, at),
  };
}
