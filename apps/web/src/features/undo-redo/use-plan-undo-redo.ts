import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { historyResultMessage, type PostedHistoryResult } from './history-result';
import type { ReplayContext } from './replay';
import type { PlanEditHistory, StepOutcome } from './use-plan-edit-history';

import { activitiesQueryOptions } from '@/features/activities/api/use-activities';
import { planDependenciesQueryOptions } from '@/features/dependencies/api/use-dependencies';
import { ApiFetchError } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  dependencyKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

/** The user-visible undo/redo surface (ADR-0048 M3): the store wrapped in the replay contract. */
export interface PlanUndoRedo {
  /** Run the top undo step, announcing success or applying the ADR-0176 failure contract. */
  undo: () => void;
  /** Run the top redo step, announcing success or applying the ADR-0176 failure contract. */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The next undo step's label (for the toolbar's accessible name); null when nothing to undo. */
  undoLabel: string | null;
  /** The next redo step's label; null when nothing to redo. */
  redoLabel: string | null;
}

/**
 * Wrap a {@link PlanEditHistory} store with the ADR-0176 replay contract, composed from the existing
 * refetch/announce seams (never the engine, never derived columns — those are recomputed by the
 * ADR-0032 auto-recalc). Each step checks the server before it writes and answers one of:
 *
 * - **Applied.** The step's label is announced ("Undid move activity.") and a `done` result is handed
 *   to {@link onResult}.
 * - **Not applicable.** A row the step wrote was changed or deleted since, or the server refused the
 *   write (409/404, which a replay turns into the same answer). Nothing was written, the step has
 *   been **set aside** by the store — so the next press runs the step below — and server truth is
 *   refetched. No auto-retry, no client-side merge, no chaining: one press does one visible thing.
 * - **423 (pen lost).** The shared pen contract runs (the lost-control banner + lock refetch, exactly
 *   as a first-class edit does via `PlanPen.onWriteRejected`). The history is **kept**: it belongs to
 *   the page session, not the pen, and the controls shade until the pen is back (ADR-0176 D4). That
 *   banner is the SINGLE source of the announcement, so nothing is announced here.
 * - **Anything else.** A generic result is posted; the stacks are left intact (retryable).
 *
 * A failure is a result too, and is **not** announced when a host takes results (the strip is
 * `role="alert"`, so announcing as well would say it twice — ADR-0132).
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
   * Called after a replay that APPLIED and whose command can change the schedule (everything but
   * {@link Command.affectsSchedule} `=== false`). The workspace wires it to the auto-recalc `notify()`:
   * an inverse restoring a field the structure signature does not watch (a sub-day duration, a lag
   * in minutes, a calendar) would otherwise leave the engine-computed dates describing the edit
   * just reversed. Not called on a failed, set-aside or no-op replay.
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

  // Refetch server truth after a set-aside, mirroring the recalculate mutation's invalidation set: the
  // plan's activity list + dependencies + baseline variance, plus the whole org schedule namespace
  // (summary / earned-value / histogram) via the `scheduleKeys.all` prefix.
  const refetchServerTruth = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: dependencyKeys.byPlan(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: scheduleKeys.all(orgSlug) });
  }, [queryClient, orgSlug, planId]);

  // What a replay reads with. `staleTime: 0` because the whole point is to see the server NOW, and
  // going through the query cache means the same read refreshes what the views draw from. The plan's
  // whole list is one paged read (`apiFetchAllPages`), filtered to the ids asked for.
  const replayContext = useMemo<ReplayContext>(
    () => ({
      readActivities: async (ids) => {
        const rows = await queryClient.fetchQuery({
          ...activitiesQueryOptions(orgSlug, planId),
          staleTime: 0,
        });
        const wanted = new Set(ids);
        return new Map(rows.filter((row) => wanted.has(row.id)).map((row) => [row.id, row]));
      },
      readDependencies: async (ids) => {
        const rows = await queryClient.fetchQuery({
          ...planDependenciesQueryOptions(orgSlug, planId),
          staleTime: 0,
        });
        const wanted = new Set(ids);
        return new Map(rows.filter((row) => wanted.has(row.id)).map((row) => [row.id, row]));
      },
    }),
    [queryClient, orgSlug, planId],
  );

  const report = useCallback(
    (result: PostedHistoryResult): void => {
      if (result.outcome === 'done') announce(historyResultMessage(result));
      if (onResult) onResult(result);
      else if (result.outcome !== 'done') announce(historyResultMessage(result));
    },
    [announce, onResult],
  );

  const run = useCallback(
    (direction: 'undo' | 'redo'): void => {
      void (async () => {
        const label = (direction === 'undo' ? history.peekUndo() : history.peekRedo())?.label ?? '';
        let outcome: StepOutcome | null;
        try {
          outcome = await (direction === 'undo'
            ? history.undo(replayContext)
            : history.redo(replayContext));
        } catch (err) {
          if (err instanceof ApiFetchError && err.status === 423) {
            // Pen lost — the shared pen contract shows the lost-control banner and refetches the
            // lock. The history stays: a step is checked against the server before it writes.
            onLockLost(err);
            return;
          }
          // Anything else — the stacks stay intact so the user can retry.
          report({ direction, outcome: 'failed', label });
          return;
        }
        if (outcome === null) return;
        if (outcome.kind === 'set-aside') {
          refetchServerTruth();
          report({
            direction,
            outcome: 'set-aside',
            label: outcome.command.label,
            setAside: {
              reason: outcome.reason,
              subjectName: outcome.subjectName,
              nextLabel: outcome.nextLabel,
            },
          });
          return;
        }
        report({
          direction,
          outcome: 'done',
          label: outcome.command.label,
          command: outcome.command,
        });
        if (outcome.command.affectsSchedule !== false) onReplayed?.();
      })();
    },
    [history, replayContext, onLockLost, refetchServerTruth, report, onReplayed],
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
