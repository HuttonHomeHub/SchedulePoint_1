import type { Command } from './commands';

import { historyPhrase } from '@/lib/history-phrase';

/**
 * What an undo/redo press came to, as the dock strip needs it (undo-redo M1-T2). A **result**
 * rather than a sentence: the strip chooses its role, its tone and its buttons from the outcome, and
 * a bare string could carry none of that.
 *
 * - `done` — the step ran.
 * - `conflict` / `parent-deleted` — the server refused it (409/404); nothing was written.
 * - `failed` — anything else; the stacks are intact so a retry is meaningful.
 * - `blocked` — the accelerator fired but the planner cannot edit right now; nothing was attempted.
 *
 * A lost pen (423) has no result: the shared pen banner is its one announcer.
 */
export type HistoryOutcome = 'done' | 'conflict' | 'parent-deleted' | 'failed' | 'blocked';

export interface HistoryResult {
  /** Stable per result, so a strip can be keyed on it and a repeat of the same outcome re-mounts. */
  readonly id: number;
  readonly direction: 'undo' | 'redo';
  readonly outcome: HistoryOutcome;
  /** The step's own label (`Command.label`). */
  readonly label: string;
  /** `blocked` only: the refusal sentence the host composed from the live pen/role state. */
  readonly reason?: string;
  /** `done` only: the step that ran, which is what the strip's lifetime is bound to. */
  readonly command?: Command;
}

/** A result before it has been given its id. */
export type PostedHistoryResult = Omit<HistoryResult, 'id'>;

/**
 * The conflict/pen-loss contract copy (ADR-0048 M3.1). Exported for the unit tests.
 *
 * The conflict wording no longer says "Refresh to see the latest": the 409 path has already
 * refetched server truth by the time anybody reads this, so the instruction asked for something
 * already done.
 */
export const UNDO_CONFLICT_MESSAGE =
  'This plan changed since you opened it — your undo wasn’t applied. The latest has been loaded.';
export const REDO_CONFLICT_MESSAGE =
  'This plan changed since you opened it — your redo wasn’t applied. The latest has been loaded.';
export const UNDO_FAILED_MESSAGE = 'Couldn’t undo just now. Please try again.';
export const REDO_FAILED_MESSAGE = 'Couldn’t redo just now. Please try again.';
/**
 * The 409 that means "a phase this was filed under has since been deleted" (`docs/TECH_DEBT.md`
 * #230 M2). The server refuses the restore rather than re-parenting the subtree to the top level,
 * which would silently discard the planner's structure — and refusing is correct, so the only thing
 * missing was words.
 *
 * It gets its own message because the general one is **actively wrong here**: refreshing does not
 * help, restoring the phase does. This says which action recovers it.
 *
 * **It does not name the phase, and that is a decision rather than an omission.** The client cannot:
 * the 409 carries only a reason, and the ancestor is itself soft-deleted, so it is not in the
 * activity list the client holds. Naming it needs the server to say which row blocked — real work,
 * for a state the UI cannot reach in one pen session (`apps/web/e2e-undo/undo.spec.ts` drives the
 * spec's own alternate flow and both undos succeed). Deferred with that reason rather than built.
 */
export const UNDO_PARENT_DELETED_MESSAGE =
  'Couldn’t undo — a phase this was filed under has since been deleted. Restore that phase first, then undo again.';
export const REDO_PARENT_DELETED_MESSAGE =
  'Couldn’t redo — a phase this was filed under has since been deleted. Restore that phase first, then try again.';

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
    case 'conflict':
      return undo ? UNDO_CONFLICT_MESSAGE : REDO_CONFLICT_MESSAGE;
    case 'parent-deleted':
      return undo ? UNDO_PARENT_DELETED_MESSAGE : REDO_PARENT_DELETED_MESSAGE;
    case 'failed':
      return undo ? UNDO_FAILED_MESSAGE : REDO_FAILED_MESSAGE;
    case 'blocked':
      return result.reason ?? `Can’t ${result.direction} right now.`;
  }
}
