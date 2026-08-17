import type { GanttCellGate } from './cell-gate';

/**
 * **The Gantt grid's cell-edit model — pure, so it can be reasoned about without a browser.**
 *
 * M2 turns the chart's identity grid into something a planner types into. The state that governs
 * one open cell is small and its edges are all timing, which is exactly the combination that gets
 * written inline in a component and then debugged in a browser for a day. It lives here instead: no
 * React, no fetch, no DOM, so every edge below is a unit test that runs in milliseconds.
 *
 * **Scope is per cell, not per grid**, and that is ADR-0060's ruling at cell granularity rather
 * than a new idea. That decision established that one merged Save across scopes has to pick a
 * single permission rule, and would silently remove a Contributor's ability to report progress
 * while a Planner holds the pen. A grid row spans both kinds of field — `name` and `duration` are
 * definition writes (pen-gated, ADR-0028); `percentComplete` is a progress write and deliberately
 * is not (ADR-0060 Q-C). One cell knows which it is; a grid-wide "editing" flag could not.
 *
 * **The trap this model exists to close is a stale seed**, and it is not hypothetical: it is
 * `docs/TECH_DEBT.md` #83, found by `apps/web/e2e-sub-day/` on its first run. A cell is seeded from
 * the row it renders. The row is a query result that the ADR-0032 coalesced recalculation refreshes
 * on its own schedule — so a refresh can land *between* a planner's keystroke and the render that
 * records it. Ask a captured "is it dirty?" flag and you read a stale `false` and overwrite what was
 * just typed, with no error and no cue.
 *
 * {@link reduceCellEdit}'s `reseed` therefore compares the **current text against the seed**, never
 * a flag: a cell whose text still is character-for-character what it was opened with has not been
 * typed in, whatever order the events arrived in. `useDurationSeed` reached the same conclusion for
 * one field in a dialog; this is that rule for every editable cell in the grid.
 */

/** The columns a planner may type into. Q2 folded Start and Finish in after three reviews. */
export type GanttCellKey = 'name' | 'duration' | 'percentComplete' | 'earlyStart' | 'earlyFinish';

/**
 * Which permission a write through this cell needs.
 *
 * `definition` needs the ADR-0028 pen; `progress` needs only the role. They are different rules,
 * which is the whole reason this is per-cell (see the module docblock).
 */
export type GanttCellScope = 'definition' | 'progress';

/**
 * The scope of every editable cell, exhaustively.
 *
 * A `Record` over the key union rather than a lookup with a default: adding a cell key becomes a
 * **typecheck failure** here instead of a cell that silently inherits whichever scope the default
 * happened to be. ADR-0094 D4 made its remedy map total for the same reason — a new flag reaching a
 * planner with nothing behind it is the failure mode, and permission is a worse thing to guess at
 * than a remedy.
 */
export const GANTT_CELL_SCOPES: Record<GanttCellKey, GanttCellScope> = {
  name: 'definition',
  duration: 'definition',
  earlyStart: 'definition',
  earlyFinish: 'definition',
  percentComplete: 'progress',
};

/** Which cell, on which activity. */
export interface GanttCellTarget {
  activityId: string;
  key: GanttCellKey;
}

/**
 * One open cell, or none.
 *
 * `seed` rides along in every non-idle state because it is what "has this been typed in?" is asked
 * against, and it must survive a failed commit — a planner who typed `4h`, hit a 423 and is looking
 * at their own text has not returned to the opened state.
 */
export type GanttCellEditState =
  | { status: 'idle' }
  | { status: 'editing'; target: GanttCellTarget; text: string; seed: string }
  | { status: 'committing'; target: GanttCellTarget; text: string; seed: string }
  | {
      status: 'error';
      target: GanttCellTarget;
      text: string;
      seed: string;
      message: string;
    };

export type GanttCellEditAction =
  /** Open a cell for editing, seeded from what the row currently reads. */
  | { type: 'begin'; target: GanttCellTarget; seed: string }
  /** The planner typed. */
  | { type: 'change'; text: string }
  /** Enter or Tab — hand the text to the caller's mutation. */
  | { type: 'commit' }
  /** The write succeeded. */
  | { type: 'resolved' }
  /** The write was refused (423 pen, 409 version, 422 validation…). */
  | { type: 'failed'; message: string }
  /** Escape, or a click away that discards. */
  | { type: 'cancel' }
  /**
   * The underlying row changed while a cell was open — a recalculation, a peer's write, a refetch.
   * Applied only to an **untouched** cell; see the module docblock.
   */
  | { type: 'reseed'; target: GanttCellTarget; seed: string };

export const IDLE: GanttCellEditState = { status: 'idle' };

const sameTarget = (a: GanttCellTarget, b: GanttCellTarget): boolean =>
  a.activityId === b.activityId && a.key === b.key;

/**
 * The transition table.
 *
 * Two rules are worth stating because they are the ones a component written inline gets wrong:
 *
 * 1. **`committing` is not editable and not cancellable.** A write is in flight; letting Escape
 *    return the cell to idle would leave the planner looking at the old value while the new one
 *    lands a moment later — a UI that lies about what the plan says. `cancel` during a commit is
 *    therefore ignored rather than racing it. (Aborting the request is a different feature, and
 *    would need the API to support it.)
 * 2. **A failed commit keeps the text.** The planner's input is the most expensive thing on screen.
 *    `error` → `change` clears the message and returns to `editing`, so correcting the value is one
 *    keystroke rather than a retype.
 */
export function reduceCellEdit(
  state: GanttCellEditState,
  action: GanttCellEditAction,
): GanttCellEditState {
  switch (action.type) {
    case 'begin':
      // Beginning elsewhere mid-flight is refused: the commit owns the cell until it settles, and
      // two open cells is a state this model deliberately cannot represent.
      if (state.status === 'committing') return state;
      return {
        status: 'editing',
        target: action.target,
        text: action.seed,
        seed: action.seed,
      };

    case 'change':
      if (state.status === 'editing') return { ...state, text: action.text };
      // Typing after a refusal is how a planner fixes it — the message goes, the value stays.
      if (state.status === 'error') {
        return {
          status: 'editing',
          target: state.target,
          text: action.text,
          seed: state.seed,
        };
      }
      return state;

    case 'commit':
      return state.status === 'editing' ? { ...state, status: 'committing' } : state;

    case 'resolved':
      return state.status === 'committing' ? IDLE : state;

    case 'failed':
      return state.status === 'committing'
        ? {
            status: 'error',
            target: state.target,
            text: state.text,
            seed: state.seed,
            message: action.message,
          }
        : state;

    case 'cancel':
      // See rule 1 above: a commit in flight is not cancellable here.
      return state.status === 'committing' ? state : IDLE;

    case 'reseed': {
      if (state.status !== 'editing') return state;
      if (!sameTarget(state.target, action.target)) return state;
      // **The whole point.** Compare the text to the seed, never a captured dirty flag: a keystroke
      // and a refetch are independent events, and a flag read from the wrong render silently
      // discards the keystroke (TECH_DEBT #83).
      if (state.text !== state.seed) return state;
      return { ...state, text: action.seed, seed: action.seed };
    }
  }
}

/** The cell currently open, or null. One accessor so callers stop re-narrowing the union. */
export function openCell(state: GanttCellEditState): GanttCellTarget | null {
  return state.status === 'idle' ? null : state.target;
}

/** True when this exact cell is the open one, whatever phase it is in. */
export function isCellOpen(state: GanttCellEditState, target: GanttCellTarget): boolean {
  const open = openCell(state);
  return open !== null && sameTarget(open, target);
}

/**
 * Whether the open cell's text differs from what it was opened with.
 *
 * Exported because a caller needs it to decide whether closing discards anything — and because
 * deriving it anywhere else would re-create the flag this model exists to avoid.
 */
export function isCellDirty(state: GanttCellEditState): boolean {
  return state.status !== 'idle' && state.text !== state.seed;
}

/**
 * Everything a row needs to render its cells as editable, bundled.
 *
 * **One optional prop rather than eight**, and absent means today's read-only grid renders
 * byte-for-byte — which is what keeps every pre-existing `GanttPanel` test meaningful through this
 * change rather than merely passing. It is also the honest shape for the print surface, which
 * shares `GANTT_COLUMNS` and must never grow an editing path.
 */
export interface GanttGridEditing {
  state: GanttCellEditState;
  /** Whether the plan has been calculated — the dates are read-only until it has. */
  hasComputedSchedule: boolean;
  /** Resolve the gate for one cell. Injected so the row never imports the editor's gating. */
  gateFor: (key: GanttCellKey, activityId: string) => GanttCellGate;
  begin: (target: GanttCellTarget, seed: string) => void;
  change: (text: string) => void;
  commit: () => void;
  cancel: () => void;
  /** The message from the last refusal, or null. */
  errorMessage: string | null;
}

/**
 * The grid column keys that map to an editable cell.
 *
 * `percentComplete` is deliberately present in {@link GanttCellKey} and absent here: the grid has
 * no Progress column yet. Carrying it in the model means adding that column later is a column, not
 * a re-decision about which permission a progress write needs — and the gate test already covers
 * it, so the answer cannot quietly change in between.
 */
export const GANTT_EDITABLE_COLUMNS: Partial<Record<string, GanttCellKey>> = {
  name: 'name',
  duration: 'duration',
  earlyStart: 'earlyStart',
  earlyFinish: 'earlyFinish',
};
