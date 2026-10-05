import type { Command } from './commands';
import type { NotApplicableReason } from './replay';

import { historyPhrase } from '@/lib/history-phrase';

/**
 * What an undo/redo press came to, as the dock strip needs it (undo-redo M1-T2). A **result**
 * rather than a sentence: the strip chooses its role, its tone and its buttons from the outcome, and
 * a bare string could carry none of that.
 *
 * - `done` — the step ran.
 * - `set-aside` — the step could not apply (a row it wrote was changed or deleted since, or the
 *   server refused it); nothing was written and the step is gone from the history, so the next press
 *   continues with the one below it (ADR-0176 D3).
 * - `failed` — anything else (a network failure, a 5xx); the stacks are intact so a retry is
 *   meaningful.
 * - `blocked` — the accelerator fired but the planner cannot edit right now; nothing was attempted.
 *
 * A lost pen (423) has no result: the shared pen banner is its one announcer, and the history is kept.
 */
export type HistoryOutcome = 'done' | 'set-aside' | 'failed' | 'blocked';

/** Why a step was set aside, and what the next press would run — the strip's explanation. */
export interface SetAside {
  readonly reason: NotApplicableReason;
  /** The row (or link) the sentence names. */
  readonly subjectName: string;
  /** `undo` only: the step the next press runs, or null when the history is now empty. */
  readonly nextLabel: string | null;
}

export interface HistoryResult {
  /** Stable per result, so a strip can be keyed on it and a repeat of the same outcome re-mounts. */
  readonly id: number;
  readonly direction: 'undo' | 'redo';
  readonly outcome: HistoryOutcome;
  /** The step's own label (`Command.label`). */
  readonly label: string;
  /** `blocked` only: the refusal sentence the host composed from the live pen/role state. */
  readonly reason?: string;
  /**
   * `failed` only, optional: what a replay that failed part-way knows about the state it left the plan
   * in, as a plain sentence (an assignment removed and not put back). Replaces the generic retry line.
   */
  readonly detail?: string;
  /** `set-aside` only: why, and what comes next. */
  readonly setAside?: SetAside;
  /** `done` only: the step that ran, which is what the strip's lifetime is bound to. */
  readonly command?: Command;
}

/** A result before it has been given its id. */
export type PostedHistoryResult = Omit<HistoryResult, 'id'>;

export const UNDO_FAILED_MESSAGE = 'Couldn’t undo just now. Please try again.';
export const REDO_FAILED_MESSAGE = 'Couldn’t redo just now. Please try again.';

/**
 * The clause that says what went wrong with a set-aside step, in the planner's words ("skipped", not
 * the code's "set aside"). Each names the thing and says WHEN it changed — after the planner's own
 * edit — because "was changed" with no subject or time is what a planner cannot act on.
 *
 * `parent-deleted` is the 409 that means "a phase this was filed under has since been deleted"
 * (`docs/TECH_DEBT.md` #230 M2): the server refuses the restore rather than re-parenting the subtree
 * to the top level, which would silently discard the planner's structure. It does not name the
 * phase — the client cannot: the 409 carries only a reason, and the ancestor is itself soft-deleted,
 * so it is not in the list the client holds.
 */
function setAsideClause(setAside: SetAside): string {
  switch (setAside.reason) {
    case 'changed':
      return `${setAside.subjectName} was changed after your edit`;
    case 'gone':
      return `${setAside.subjectName} was deleted after your edit`;
    case 'parent-deleted':
      return 'the phase it was filed under was deleted after your edit';
    case 'duplicate':
      return 'it is already there';
    case 'cycle':
      return 'it would make a loop in the logic';
    case 'already-restored':
      return `“${setAside.subjectName}” was already brought back`;
    case 'unfiled':
      return `“${setAside.subjectName}” is back, but its activities could not be moved back under it`;
  }
}

/** Whether the result is a refusal or a failure — the strip's `role="alert"` half. */
export function isHistoryFailure(result: HistoryResult): boolean {
  return result.outcome !== 'done';
}

/**
 * The sentence for a result. The same string feeds the strip and — for a success only — the live
 * region, which is what makes the two channels agree (the `LayoutResolvedStrip` rule).
 */
export function historyResultMessage(result: HistoryResult | PostedHistoryResult): string {
  const undo = result.direction === 'undo';
  switch (result.outcome) {
    case 'done':
      return `${historyPhrase(undo ? 'Undid' : 'Redid', result.label)}.`;
    case 'set-aside': {
      const { setAside } = result;
      const head = historyPhrase(undo ? 'Couldn’t undo' : 'Couldn’t redo', result.label);
      if (setAside === undefined) return `${head}. That step was skipped.`;
      const next =
        undo && setAside.nextLabel !== null
          ? ` ${historyPhrase('Undo again to continue with', setAside.nextLabel)}.`
          : '';
      return `${head} — ${setAsideClause(setAside)}, so that step was skipped.${next}`;
    }
    case 'failed':
      if (result.detail !== undefined) {
        return `${historyPhrase(undo ? 'Couldn’t undo' : 'Couldn’t redo', result.label)}. ${result.detail}`;
      }
      return undo ? UNDO_FAILED_MESSAGE : REDO_FAILED_MESSAGE;
    case 'blocked':
      return result.reason ?? `Can’t ${result.direction} right now.`;
  }
}
