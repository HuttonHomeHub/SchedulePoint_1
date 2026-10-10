import type { HistoryResult, PostedHistoryResult } from './history-result';
import type { PlanUndoRedo } from './use-plan-undo-redo';

import { historyPhrase } from '@/lib/history-phrase';

/**
 * The one follow-up button an undo/redo result's strip offers (undo-redo M1): the opposite press
 * after a success, a retry after a failure that left the stacks intact, nothing for a refusal or a
 * server conflict (a retry of either would only be refused again). Withheld while undo/redo is not
 * live, so a button never offers a write the keyboard would refuse.
 */
export function historyResultAction(
  result: HistoryResult,
  live: boolean,
  undoRedo: Pick<PlanUndoRedo, 'undo' | 'redo'>,
): { label: string; onClick: () => void } | undefined {
  if (!live) return undefined;
  if (result.outcome === 'done') {
    return result.direction === 'undo'
      ? { label: 'Redo', onClick: undoRedo.redo }
      : { label: 'Undo', onClick: undoRedo.undo };
  }
  if (result.outcome === 'failed') {
    return {
      label: 'Try again',
      onClick: result.direction === 'undo' ? undoRedo.undo : undoRedo.redo,
    };
  }
  return undefined;
}

/**
 * The refusal posted when `Ctrl+Z` fires while undo/redo is off (undo-redo M1-T4), or `null` when
 * there is no step to refuse — which leaves the key to the browser. The sentence is the shared
 * pen-gate one every shaded control uses, except under the Late-start overlay, where the planner
 * holds the pen and the reason is the overlay itself.
 */
export function blockedHistoryResult(params: {
  direction: 'undo' | 'redo';
  /** The next step's label in that direction, or `null` when there is none. */
  label: string | null;
  canEditSchedule: boolean;
  scheduleRefusal: (action: string) => string | null;
}): PostedHistoryResult | null {
  const { direction, label, canEditSchedule, scheduleRefusal } = params;
  if (label === null) return null;
  const reason = canEditSchedule
    ? `The Late-start overlay is on — editing is paused. Turn off Late-start overlay to ${direction}.`
    : (scheduleRefusal(historyPhrase(direction, label)) ?? `You can’t ${direction} right now.`);
  return { direction, outcome: 'blocked', label, reason };
}
