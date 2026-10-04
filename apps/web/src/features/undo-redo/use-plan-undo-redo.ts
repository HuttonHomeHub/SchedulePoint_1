import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  historyResultMessage,
  type HistoryOutcome,
  type PostedHistoryResult,
} from './history-result';
import type { PlanEditHistory } from './use-plan-edit-history';

import { ApiFetchError } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  dependencyKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

/**
 * The machine-readable reason on a `{ error: { details } }` envelope, when it carries one.
 *
 * Read rather than assumed (ADR-0076): `ApiFetchError` carries the whole envelope error as
 * `.error` (`lib/api/client.ts`), `DomainError.details` is copied straight through by
 * `all-exceptions.filter.ts`, and `lib/api/calendar-scope-errors.ts` already reads
 * `details.reason` exactly this way — so this is an established path, not a new one.
 */
function reasonOf(err: ApiFetchError): string | undefined {
  return (err.error.details as { reason?: string } | undefined)?.reason;
}

/** The user-visible undo/redo surface (ADR-0048 M3): the store wrapped in the conflict contract. */
export interface PlanUndoRedo {
  /** Run the top undo step, announcing success or applying the M3.1 failure contract. */
  undo: () => void;
  /** Run the top redo step, announcing success or applying the M3.1 failure contract. */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The next undo step's label (for the toolbar's accessible name); null when nothing to undo. */
  undoLabel: string | null;
  /** The next redo step's label; null when nothing to redo. */
  redoLabel: string | null;
}

/**
 * Wrap a {@link PlanEditHistory} store with the ADR-0048 M3.1 conflict + pen-loss contract, composed
 * from the existing refetch/announce seams (never the engine, never derived columns — those are
 * recomputed by the ADR-0032 auto-recalc). An inverse mutation is an ordinary write through the
 * unchanged pen (423) + optimistic-version (409) + RBAC gates, so a rejection means server truth moved
 * under the client stack:
 *
 * - **423 (pen lost).** The whole history is cleared (it belongs to the pen session, ADR-0048) and the
 *   caller's `onLockLost` runs the shared pen contract (the lost-control banner + lock refetch, exactly
 *   as a first-class edit does via `PlanPen.onWriteRejected`); a status message is announced.
 * - **409 / 404 (row moved / deleted).** The operation aborts **non-destructively** — the stacks are
 *   NOT re-popped — server truth is refetched (the plan's activity list + dependencies + variance +
 *   the org/plan schedule namespace, mirroring the recalc mutation's invalidation), the now-stale redo
 *   branch is cleared, and a status is announced. No auto-retry, no client-side merge.
 * - **Anything else.** A generic status is announced; the stacks are left intact (retryable).
 *
 * On success the executed step's label is announced ("Undid move activity.") and a `done` result is
 * handed to {@link onResult}. A failure is a result too, and is **not** announced when a host takes
 * results (the strip is `role="alert"`, so announcing as well would say it twice — ADR-0132).
 */
export function usePlanUndoRedo(params: {
  history: PlanEditHistory;
  orgSlug: string;
  planId: string;
  announce: (message: string) => void;
  /**
   * Run the shared pen contract for a lock (423) rejection — wired to `PlanPen.onWriteRejected`, which
   * surfaces the lost-control banner and refetches lock status. Kept as a callback so this feature does
   * not import the plan-lock feature (features depend downward on shared code only).
   */
  onLockLost: (err: unknown) => void;
  /**
   * Called after a replay that SUCCEEDED and whose command can change the schedule (everything but
   * {@link Command.affectsSchedule} `=== false`). The workspace wires it to the auto-recalc `notify()`:
   * an inverse restoring a field the structure signature does not watch (a sub-day duration, a lag
   * in minutes, a calendar) would otherwise leave the engine-computed dates describing the edit
   * just reversed. Not called on a failed or no-op replay.
   */
  onReplayed?: () => void;
  /**
   * Where a press's outcome goes to be SEEN — the dock strip (undo-redo M1). Kept as a callback
   * rather than returned state because this hook's return value feeds the toolbar-context memo
   * (`use-plan-edit-history.ts`'s identity invariant): a result held here would rebuild the
   * toolbar on every press. Absent, a failure is announced instead, as before.
   */
  onResult?: (result: PostedHistoryResult) => void;
}): PlanUndoRedo {
  const { history, orgSlug, planId, announce, onLockLost, onReplayed, onResult } = params;
  const queryClient = useQueryClient();

  // Refetch server truth after a 409/404, mirroring the recalculate mutation's invalidation set: the
  // plan's activity list + dependencies + baseline variance, plus the whole org schedule namespace
  // (summary / earned-value / histogram) via the `scheduleKeys.all` prefix.
  const refetchServerTruth = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: dependencyKeys.byPlan(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: scheduleKeys.all(orgSlug) });
  }, [queryClient, orgSlug, planId]);

  const report = useCallback(
    (result: PostedHistoryResult): void => {
      if (result.outcome === 'done') announce(historyResultMessage(result));
      if (onResult) onResult(result);
      else if (result.outcome !== 'done') announce(historyResultMessage(result));
    },
    [announce, onResult],
  );

  const handleFailure = useCallback(
    (direction: 'undo' | 'redo', label: string, err: unknown): void => {
      if (err instanceof ApiFetchError && err.status === 423) {
        // Pen lost — the history belongs to the pen session, so drop it whole; the shared pen contract
        // shows the lost-control banner + refetches the lock. That banner is its own `role="status"`
        // live region and is the SINGLE source of the announcement (see `usePlanPen`) — so we do NOT
        // also `announce(...)` here, which would be a double utterance for one event (a11y review).
        onLockLost(err);
        history.clear();
        return;
      }
      let outcome: HistoryOutcome = 'failed';
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 404)) {
        // Row moved / deleted — abort non-destructively, refetch, and drop the stale redo branch.
        // Everything below is unchanged for every reason; only the WORDS branch, and only for the
        // one reason whose recovery is a different action (#230 M2).
        refetchServerTruth();
        history.clearRedo();
        outcome = reasonOf(err) === 'PARENT_DELETED' ? 'parent-deleted' : 'conflict';
      }
      // Anything else — the stacks stay intact so the user can retry.
      report({ direction, outcome, label });
    },
    [history, onLockLost, refetchServerTruth, report],
  );

  const run = useCallback(
    (direction: 'undo' | 'redo'): void => {
      void (async () => {
        const command = direction === 'undo' ? history.peekUndo() : history.peekRedo();
        let label: string | null;
        try {
          label = await (direction === 'undo' ? history.undo() : history.redo());
        } catch (err) {
          handleFailure(direction, command?.label ?? '', err);
          return;
        }
        if (label === null) return;
        report({ direction, outcome: 'done', label, ...(command ? { command } : {}) });
        if (command?.affectsSchedule !== false) onReplayed?.();
      })();
    },
    [history, handleFailure, report, onReplayed],
  );

  const undo = useCallback((): void => run('undo'), [run]);
  const redo = useCallback((): void => run('redo'), [run]);

  return useMemo(
    () => ({
      undo,
      redo,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.undoLabel,
      redoLabel: history.redoLabel,
    }),
    [undo, redo, history.canUndo, history.canRedo, history.undoLabel, history.redoLabel],
  );
}
