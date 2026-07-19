import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type { PlanEditHistory } from './use-plan-edit-history';

import { ApiFetchError } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  dependencyKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

/**
 * The conflict/pen-loss contract copy (ADR-0048 M3.1). Announced via the shared polite live region
 * (`useAnnounce`) so a screen-reader user hears why an undo/redo didn't apply — the visual canvas
 * change is otherwise silent to AT (WCAG 4.1.3). Exported for the unit tests.
 */
export const UNDO_CONFLICT_MESSAGE = 'Couldn’t undo — the plan changed; review and try again.';
export const REDO_CONFLICT_MESSAGE = 'Couldn’t redo — the plan changed; review and try again.';
export const PEN_LOST_MESSAGE = 'Editing is paused — you don’t hold the pen.';
export const UNDO_FAILED_MESSAGE = 'Couldn’t undo just now. Please try again.';
export const REDO_FAILED_MESSAGE = 'Couldn’t redo just now. Please try again.';

/** Lowercase a command label's first letter so it reads naturally after "Undid "/"Redid ". */
function phrase(label: string): string {
  return label.length > 0 ? `${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
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
 * On success the executed step's label is announced ("Undid move activity.").
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
}): PlanUndoRedo {
  const { history, orgSlug, planId, announce, onLockLost } = params;
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

  const handleFailure = useCallback(
    (direction: 'undo' | 'redo', err: unknown): void => {
      if (err instanceof ApiFetchError && err.status === 423) {
        // Pen lost — the history belongs to the pen session, so drop it whole; the shared pen contract
        // shows the lost-control banner + refetches the lock.
        onLockLost(err);
        history.clear();
        announce(PEN_LOST_MESSAGE);
        return;
      }
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 404)) {
        // Row moved / deleted — abort non-destructively, refetch, and drop the stale redo branch.
        refetchServerTruth();
        history.clearRedo();
        announce(direction === 'undo' ? UNDO_CONFLICT_MESSAGE : REDO_CONFLICT_MESSAGE);
        return;
      }
      // Anything else — leave the stacks intact so the user can retry.
      announce(direction === 'undo' ? UNDO_FAILED_MESSAGE : REDO_FAILED_MESSAGE);
    },
    [announce, history, onLockLost, refetchServerTruth],
  );

  const undo = useCallback((): void => {
    void (async () => {
      let label: string | null;
      try {
        label = await history.undo();
      } catch (err) {
        handleFailure('undo', err);
        return;
      }
      if (label !== null) announce(`Undid ${phrase(label)}.`);
    })();
  }, [history, handleFailure, announce]);

  const redo = useCallback((): void => {
    void (async () => {
      let label: string | null;
      try {
        label = await history.redo();
      } catch (err) {
        handleFailure('redo', err);
        return;
      }
      if (label !== null) announce(`Redid ${phrase(label)}.`);
    })();
  }, [history, handleFailure, announce]);

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
