import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Command } from './commands';
import type { NotApplicableReason, ReplayContext } from './replay';

/**
 * Maximum reversible steps kept per direction (ADR-0048): the newest 50 edits stay undoable; older
 * ones fall off the bottom of the stack. Bounds memory for a long editing session.
 */
export const MAX_HISTORY_DEPTH = 50;

/**
 * Interaction window (ms) within which two consecutively-recorded, same-key commands coalesce into one
 * undo step (ADR-0048 M2.3). Mirrors the ADR-0032 coalesced-recalc boundary: a pointer drag or a
 * held-key nudge fires its intermediate writes far tighter than this, so they fold into one step,
 * while two deliberate gestures (seconds apart) stay separate. An undo/redo or a different-key edit
 * also ends the window (a fresh gesture must never merge into a pre-undo step).
 */
export const COALESCE_WINDOW_MS = 500;

/**
 * What one replay came to. `applied` moved the step across the stacks; `set-aside` wrote nothing and
 * REMOVED the step (ADR-0176 D3): it stays off the stack so the next press runs the step below it,
 * and `nextLabel` is what that press would run, for the sentence that tells the planner so.
 */
export type StepOutcome =
  | { readonly kind: 'applied'; readonly command: Command }
  | {
      readonly kind: 'set-aside';
      readonly command: Command;
      readonly reason: NotApplicableReason;
      readonly subjectName: string;
      /** The step the next press in the same direction would run, or null when there is none. */
      readonly nextLabel: string | null;
    };

export interface PlanEditHistory {
  /** Push a just-applied edit's inverse onto the undo stack; clears the redo branch (linear history). */
  record: (command: Command) => void;
  /**
   * Whether `command` is the step the next undo would run. A notice that offers `Undo` beside a
   * sentence about ONE edit asks this before it keeps showing: once anything else is on top, its
   * button would undo a different edit from the one its sentence names — the ADR-0064 §7 defect,
   * where a confirmation outlived the edit its Undo was bound to.
   */
  isTop: (command: Command) => boolean;
  /**
   * Run the top undo command's inverse and, when it applied, move it to the redo stack. A step that
   * cannot apply is **set aside** instead: popped, the redo branch cleared, the coalescing window
   * ended — so the next press continues with the step below, and nothing chains by itself.
   * Resolves `null` when there is nothing to undo or a replay is already in flight. Rejects if the
   * replay throws (a lost pen, a transport failure) — the stacks are then left intact, so a retry is
   * meaningful.
   */
  undo: (ctx: ReplayContext) => Promise<StepOutcome | null>;
  /**
   * Re-apply the top redo command, then move it back to the undo stack. A redo that cannot apply
   * drops the whole redo branch (everything past it was built on a state that did not happen).
   * Resolves/rejects like {@link undo}.
   */
  redo: (ctx: ReplayContext) => Promise<StepOutcome | null>;
  /**
   * The step the next undo / redo would run, without running it — so {@link usePlanUndoRedo} can read
   * {@link Command.affectsSchedule} before the replay moves the command across.
   */
  peekUndo: () => Command | undefined;
  peekRedo: () => Command | undefined;
  /**
   * Drop both stacks — a plan switch, or the dissolve boundary. **Not** a pen release or loss: the
   * history survives a hand-off (ADR-0176 D4), because every step is checked against the server
   * before it writes.
   */
  clear: () => void;
  /**
   * Drop **only** the redo stack, leaving the undo stack intact — for an edit that makes the redo
   * branch untrustworthy without invalidating what came before it.
   */
  clearRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The next undo step's {@link Command.label} (M3 accessible name / announcement); null when empty. */
  undoLabel: string | null;
  /** The next redo step's {@link Command.label}; null when empty. */
  redoLabel: string | null;
}

/**
 * A bounded, in-memory, per-plan command stack for plan-authoring undo/redo (ADR-0048, dark M1).
 *
 * History is **linear**: recording a fresh edit clears the redo branch. It is scoped to the plan —
 * switching plans (a changed `planId`) resets both stacks. It is NOT scoped to the pen: a release or a
 * hand-off keeps it (ADR-0176 D4), because every replay is checked against the server first. The
 * stacks live in refs (they are replayed imperatively, not rendered); only
 * the derived `canUndo` / `canRedo` are state, so a consumer re-renders when reversibility changes.
 *
 * `undo` / `redo` are serialised by an in-flight guard so two replays never race, and a command is
 * moved across only **after** its replay applies — a rejected replay leaves the stacks intact and
 * surfaces the error to the caller, never swallowed; a replay that answers `not-applicable` is set
 * aside (see {@link StepOutcome}).
 */
export function usePlanEditHistory(planId: string): PlanEditHistory {
  const undoStackRef = useRef<Command[]>([]);
  const redoStackRef = useRef<Command[]>([]);
  const runningRef = useRef(false);
  // When the top-of-undo-stack command was recorded (epoch ms). A same-key command recorded within
  // COALESCE_WINDOW_MS folds into it; set to -Infinity to end the window (after undo/redo/clear).
  const lastRecordAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // The top-of-stack labels are reactive state (not just refs) so the M3 toolbar controls can name
  // the pending action ("Undo move activity") and re-render when it changes.
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [redoLabel, setRedoLabel] = useState<string | null>(null);

  const sync = useCallback(() => {
    const undoStack = undoStackRef.current;
    const redoStack = redoStackRef.current;
    setCanUndo(undoStack.length > 0);
    setCanRedo(redoStack.length > 0);
    setUndoLabel(undoStack[undoStack.length - 1]?.label ?? null);
    setRedoLabel(redoStack[redoStack.length - 1]?.label ?? null);
  }, []);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastRecordAtRef.current = Number.NEGATIVE_INFINITY;
    sync();
  }, [sync]);

  const clearRedo = useCallback(() => {
    redoStackRef.current = [];
    sync();
  }, [sync]);

  // Reset on plan switch — history is per plan (ADR-0048, ADR-0176 D4). Runs on mount too, a no-op
  // over the already-empty stacks.
  useEffect(() => {
    clear();
  }, [planId, clear]);

  const record = useCallback(
    (command: Command) => {
      const undoStack = undoStackRef.current;
      const now = Date.now();
      const top = undoStack[undoStack.length - 1];
      // Coalesce (ADR-0048 M2.3): a same-key command recorded within the interaction window folds
      // into the current top step instead of pushing a new one, so a whole drag/nudge gesture is one
      // undo. The merged command spans the FIRST pre-edit and the LATEST post-edit state.
      if (
        command.coalescing !== undefined &&
        top?.coalescing !== undefined &&
        top.coalescing.key === command.coalescing.key &&
        now - lastRecordAtRef.current <= COALESCE_WINDOW_MS
      ) {
        undoStack[undoStack.length - 1] = command.coalescing.merge(top);
        lastRecordAtRef.current = now;
        // A fresh edit still invalidates the redo branch (linear history).
        redoStackRef.current = [];
        sync();
        return;
      }
      undoStack.push(command);
      // Bounded depth: drop the OLDEST when full so the newest edits stay undoable.
      if (undoStack.length > MAX_HISTORY_DEPTH) undoStack.shift();
      // Linear history — a new edit invalidates any redo branch.
      redoStackRef.current = [];
      lastRecordAtRef.current = now;
      sync();
    },
    [sync],
  );

  const isTop = useCallback(
    (command: Command): boolean =>
      undoStackRef.current[undoStackRef.current.length - 1] === command,
    [],
  );

  const peekUndo = useCallback(
    (): Command | undefined => undoStackRef.current[undoStackRef.current.length - 1],
    [],
  );
  const peekRedo = useCallback(
    (): Command | undefined => redoStackRef.current[redoStackRef.current.length - 1],
    [],
  );

  const undo = useCallback(
    async (ctx: ReplayContext): Promise<StepOutcome | null> => {
      if (runningRef.current) return null;
      const command = undoStackRef.current[undoStackRef.current.length - 1];
      if (!command) return null;
      runningRef.current = true;
      try {
        const result = await command.undo(ctx);
        // A step that cannot apply is set aside, not left on top: leaving it would make every
        // earlier step unreachable until a reload — the dead end ADR-0176 removes. The redo branch
        // goes with it, as it always has on a refusal, so no redo can resurrect a state built on a
        // step that did not apply.
        if (result.kind === 'not-applicable') {
          undoStackRef.current.pop();
          redoStackRef.current = [];
          lastRecordAtRef.current = Number.NEGATIVE_INFINITY;
          const next = undoStackRef.current[undoStackRef.current.length - 1];
          sync();
          return {
            kind: 'set-aside',
            command,
            reason: result.reason,
            subjectName: result.subjectName,
            nextLabel: next?.label ?? null,
          };
        }
        // Move it across only after the inverse succeeds; a throw above leaves the stacks untouched
        // and propagates out of this promise, so the planner can retry.
        undoStackRef.current.pop();
        redoStackRef.current.push(command);
        if (redoStackRef.current.length > MAX_HISTORY_DEPTH) redoStackRef.current.shift();
        // End the coalescing window — a new edit after an undo starts a fresh step, never merges into
        // the now-exposed top command.
        lastRecordAtRef.current = Number.NEGATIVE_INFINITY;
        sync();
        return { kind: 'applied', command };
      } finally {
        runningRef.current = false;
      }
    },
    [sync],
  );

  const redo = useCallback(
    async (ctx: ReplayContext): Promise<StepOutcome | null> => {
      if (runningRef.current) return null;
      const command = redoStackRef.current[redoStackRef.current.length - 1];
      if (!command) return null;
      runningRef.current = true;
      try {
        const result = await command.redo(ctx);
        if (result.kind === 'not-applicable') {
          // Everything beyond this step was redoable only on top of it.
          redoStackRef.current = [];
          lastRecordAtRef.current = Number.NEGATIVE_INFINITY;
          sync();
          return {
            kind: 'set-aside',
            command,
            reason: result.reason,
            subjectName: result.subjectName,
            nextLabel: null,
          };
        }
        redoStackRef.current.pop();
        undoStackRef.current.push(command);
        if (undoStackRef.current.length > MAX_HISTORY_DEPTH) undoStackRef.current.shift();
        // End the coalescing window — a new edit after a redo starts a fresh step.
        lastRecordAtRef.current = Number.NEGATIVE_INFINITY;
        sync();
        return { kind: 'applied', command };
      } finally {
        runningRef.current = false;
      }
    },
    [sync],
  );

  // Return a **stable** object: the callbacks are already stable (useCallback), so identity changes
  // only when a reactive field flips. Without this memo a fresh literal every render would cascade
  // through `usePlanUndoRedo` → `model.undoRedo` → the ADR-0031 toolbar-context memo, re-triggering
  // the Toolbar's resolve → partition → measure on every unrelated re-render (pen poll / query
  // settle) and defeating the documented perf invariant — mirroring `usePlanAutoRecalc`'s memoised
  // return.
  return useMemo(
    () => ({
      record,
      isTop,
      peekUndo,
      peekRedo,
      undo,
      redo,
      clear,
      clearRedo,
      canUndo,
      canRedo,
      undoLabel,
      redoLabel,
    }),
    [
      record,
      isTop,
      peekUndo,
      peekRedo,
      undo,
      redo,
      clear,
      clearRedo,
      canUndo,
      canRedo,
      undoLabel,
      redoLabel,
    ],
  );
}
