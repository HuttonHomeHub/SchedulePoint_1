import { useCallback, useMemo, useRef, useState } from 'react';

import type { HistoryResult, PostedHistoryResult } from './history-result';
import type { PlanEditHistory } from './use-plan-edit-history';

/** The latest undo/redo outcome the dock strip should show, and how to post or clear one. */
export interface HistoryResultState {
  /** The result to display, or null — already filtered by the lifetime rule below. */
  result: HistoryResult | null;
  post: (result: PostedHistoryResult) => void;
  dismiss: () => void;
}

/**
 * Holds the one result the dock strip shows (undo-redo M1-T2/T3).
 *
 * **Lives beside `usePlanUndoRedo`, not inside it**, so a press does not change the object the
 * toolbar's context memo keys on (`use-plan-edit-history.ts`'s invariant — the same reason
 * `autoResolve.notice` is its own field on the model).
 *
 * **Lifetime.** A success is bound to the step it ran, by the `isTop` rule the overlap notice uses
 * (`use-auto-resolve-overlaps.ts`): an undo's Redo button is only honest while that step is still on
 * top of the redo stack, a redo's Undo button while it is on top of the undo stack. Once a later edit
 * or press changes the top the strip goes, rather than offering a button for a step its sentence no
 * longer describes. A failure or refusal has no step to be bound to and stays until dismissed or
 * replaced by the next result. Both are scoped to the plan, so switching plans drops them.
 *
 * Re-render comes from the history's own reactive labels: every recording, undo, redo and clear moves
 * `undoLabel`/`redoLabel` or `canUndo`/`canRedo` in the same render pass that consumes this hook.
 */
export function useHistoryResult(history: PlanEditHistory, planId: string): HistoryResultState {
  const [held, setHeld] = useState<{ planId: string; result: HistoryResult } | null>(null);
  const nextId = useRef(1);

  const post = useCallback(
    (result: PostedHistoryResult): void => {
      setHeld({ planId, result: { ...result, id: nextId.current++ } });
    },
    [planId],
  );
  const dismiss = useCallback((): void => setHeld(null), []);

  // Not memoised, deliberately: the stacks live in refs, so this must be re-read on every render —
  // the history's reactive labels move in the same pass as any change to them, which is what
  // schedules the render. A memo keyed on those labels would have to list values it never reads.
  // The candidate's identity is stable (it is `held.result`), so the memo below still is.
  const result = ((): HistoryResult | null => {
    if (held === null || held.planId !== planId) return null;
    const { result: candidate } = held;
    if (candidate.outcome !== 'done') return candidate;
    const { command } = candidate;
    if (command === undefined) return null;
    const stillTop =
      candidate.direction === 'undo' ? history.peekRedo() === command : history.isTop(command);
    return stillTop ? candidate : null;
  })();

  return useMemo(() => ({ result, post, dismiss }), [result, post, dismiss]);
}
