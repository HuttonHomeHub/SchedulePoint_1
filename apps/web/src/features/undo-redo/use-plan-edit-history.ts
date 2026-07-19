import { useCallback, useEffect, useRef, useState } from 'react';

import type { Command } from './commands';

/**
 * Maximum reversible steps kept per direction (ADR-0048): the newest 50 edits stay undoable; older
 * ones fall off the bottom of the stack. Bounds memory for a long editing session.
 */
export const MAX_HISTORY_DEPTH = 50;

export interface PlanEditHistory {
  /** Push a just-applied edit's inverse onto the undo stack; clears the redo branch (linear history). */
  record: (command: Command) => void;
  /** Run the top undo command's inverse, then move it to the redo stack. Rejects if the inverse throws. */
  undo: () => Promise<void>;
  /** Re-apply the top redo command, then move it back to the undo stack. Rejects if it throws. */
  redo: () => Promise<void>;
  /** Drop both stacks (plan switch, and — wired by the caller in M3 — pen loss / conflict). */
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * A bounded, in-memory, per-plan command stack for plan-authoring undo/redo (ADR-0048, dark M1).
 *
 * History is **linear**: recording a fresh edit clears the redo branch. It is scoped to the plan —
 * switching plans (a changed `planId`) resets both stacks — matching the per-plan + per-pen-session
 * lifetime of the pen (ADR-0028); pen-loss and conflict resets call {@link PlanEditHistory.clear}
 * from the M3 surface. The stacks live in refs (they are replayed imperatively, not rendered); only
 * the derived `canUndo` / `canRedo` are state, so a consumer re-renders when reversibility changes.
 *
 * `undo` / `redo` are serialised by an in-flight guard so two replays never race, and a command is
 * moved across only **after** its replay resolves — a rejected replay leaves the stacks intact and
 * surfaces the error to the caller (M3 renders it), never swallowed.
 */
export function usePlanEditHistory(planId: string): PlanEditHistory {
  const undoStackRef = useRef<Command[]>([]);
  const redoStackRef = useRef<Command[]>([]);
  const runningRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    sync();
  }, [sync]);

  // Reset on plan switch — history is per plan + pen session (ADR-0048). Runs on mount too, a no-op
  // over the already-empty stacks.
  useEffect(() => {
    clear();
  }, [planId, clear]);

  const record = useCallback(
    (command: Command) => {
      const undoStack = undoStackRef.current;
      undoStack.push(command);
      // Bounded depth: drop the OLDEST when full so the newest edits stay undoable.
      if (undoStack.length > MAX_HISTORY_DEPTH) undoStack.shift();
      // Linear history — a new edit invalidates any redo branch.
      redoStackRef.current = [];
      sync();
    },
    [sync],
  );

  const undo = useCallback(async () => {
    if (runningRef.current) return;
    const command = undoStackRef.current[undoStackRef.current.length - 1];
    if (!command) return;
    runningRef.current = true;
    try {
      await command.undo();
      // Move it across only after the inverse succeeds; a throw above leaves the stacks untouched
      // and propagates out of this promise (M3 shows the error and the user can retry).
      undoStackRef.current.pop();
      redoStackRef.current.push(command);
      if (redoStackRef.current.length > MAX_HISTORY_DEPTH) redoStackRef.current.shift();
      sync();
    } finally {
      runningRef.current = false;
    }
  }, [sync]);

  const redo = useCallback(async () => {
    if (runningRef.current) return;
    const command = redoStackRef.current[redoStackRef.current.length - 1];
    if (!command) return;
    runningRef.current = true;
    try {
      await command.redo();
      redoStackRef.current.pop();
      undoStackRef.current.push(command);
      if (undoStackRef.current.length > MAX_HISTORY_DEPTH) undoStackRef.current.shift();
      sync();
    } finally {
      runningRef.current = false;
    }
  }, [sync]);

  return { record, undo, redo, clear, canUndo, canRedo };
}
