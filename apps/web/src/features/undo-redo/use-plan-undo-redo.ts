import type {
  ActivityStep,
  ActivitySummary,
  CrossPlanDependencySummary,
  DependencySummary,
  ResourceAssignmentSummary,
} from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { historyResultMessage, type PostedHistoryResult } from './history-result';
import { isNotFound, ReplayFailure, SINGLE_READ_LIMIT, type ReplayContext } from './replay';
import type { PlanEditHistory, StepOutcome } from './use-plan-edit-history';

import { activitiesQueryOptions } from '@/features/activities/api/use-activities';
import { activityStepsQueryOptions } from '@/features/activities/api/use-activity-steps';
import {
  planDependenciesQueryOptions,
  predecessorsQueryOptions,
  successorsQueryOptions,
} from '@/features/dependencies/api/use-dependencies';
import { assignmentsQueryOptions } from '@/features/resources/api/use-resources';
import { ApiFetchError, apiFetch } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  crossPlanDependencyKeys,
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
  /**
   * Called after a replay that APPLIED, with the first activity of the step's {@link
   * Command.subjects} that is still in the plan — so the workspace can select it and bring it into
   * view (undo-redo M4). Not called when none survives (an undone create), and never on a failed or
   * set-aside step: those changed nothing, so there is nothing to show. Read through a ref like
   * {@link onReplayed}, for the same identity reason.
   */
  onReveal?: (activityId: string) => void;
}): PlanUndoRedo {
  const { history, orgSlug, planId, announce, onLockLost, onReplayed, onResult, onReveal } = params;
  const queryClient = useQueryClient();
  // The workspace passes an inline arrow here (it closes over a hook declared later), so reading it
  // through a ref keeps `run` — and the object this hook returns, which feeds the toolbar-context
  // memo — from being rebuilt on every render.
  const onReplayedRef = useRef(onReplayed);
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onReplayedRef.current = onReplayed;
    onRevealRef.current = onReveal;
  });

  // Refetch server truth after a set-aside, mirroring the recalculate mutation's invalidation set: the
  // plan's activity list + dependencies + baseline variance, plus the whole org schedule namespace
  // (summary / earned-value / histogram) via the `scheduleKeys.all` prefix.
  const refetchServerTruth = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: dependencyKeys.byPlan(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) });
    void queryClient.invalidateQueries({ queryKey: scheduleKeys.all(orgSlug) });
  }, [queryClient, orgSlug, planId]);

  // What a replay reads with. `staleTime: 0` because the whole point is to see the server NOW.
  //
  // **A step that names a few rows reads those rows; only a bigger one walks the plan.** The list is
  // paged and walked sequentially, so on a 2,000-activity plan it is about twenty round trips before
  // the write can even start — for a step that touched one bar. Up to `SINGLE_READ_LIMIT` rows go
  // through the per-row endpoints in parallel (a 404 is "gone"); above it, one walk is cheaper.
  const replayContext = useMemo<ReplayContext>(() => {
    const fresh = { staleTime: 0 } as const;
    const walkActivities = () =>
      queryClient.fetchQuery({ ...activitiesQueryOptions(orgSlug, planId), ...fresh });
    const walkDependencies = () =>
      queryClient.fetchQuery({ ...planDependenciesQueryOptions(orgSlug, planId), ...fresh });
    /** One row by id through the detail endpoint; absent when the server says 404. */
    async function readOne<T extends { id: string }>(
      queryKey: readonly unknown[],
      path: string,
    ): Promise<T | undefined> {
      try {
        return await queryClient.fetchQuery({
          queryKey,
          queryFn: () => apiFetch<T>(path),
          ...fresh,
        });
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }
    /** A list read; absent when the server says 404 (its owner is gone). */
    async function readList<T>(read: () => Promise<T[]>): Promise<readonly T[] | undefined> {
      try {
        return await read();
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    }
    const byId = <T extends { id: string }>(rows: readonly (T | undefined)[]) =>
      new Map(rows.flatMap((row) => (row === undefined ? [] : [[row.id, row] as const])));
    const unique = (ids: readonly string[]) => [...new Set(ids)];
    return {
      readActivities: async (ids) => {
        const wanted = unique(ids);
        if (wanted.length > SINGLE_READ_LIMIT) {
          const set = new Set(wanted);
          return byId((await walkActivities()).filter((row) => set.has(row.id)));
        }
        return byId(
          await Promise.all(
            wanted.map((id) =>
              readOne<ActivitySummary>(
                activityKeys.detail(orgSlug, id),
                `/organizations/${orgSlug}/activities/${id}`,
              ),
            ),
          ),
        );
      },
      readDependencies: async (ids) => {
        const wanted = unique(ids);
        if (wanted.length > SINGLE_READ_LIMIT) {
          const set = new Set(wanted);
          return byId((await walkDependencies()).filter((row) => set.has(row.id)));
        }
        return byId(
          await Promise.all(
            wanted.map((id) =>
              readOne<DependencySummary>(
                dependencyKeys.detail(orgSlug, id),
                `/organizations/${orgSlug}/dependencies/${id}`,
              ),
            ),
          ),
        );
      },
      readLinksOf: async (ids) => {
        const wanted = unique(ids);
        if (wanted.length > SINGLE_READ_LIMIT) {
          const set = new Set(wanted);
          return byId(
            (await walkDependencies()).filter(
              (row) => set.has(row.predecessor.id) || set.has(row.successor.id),
            ),
          );
        }
        const lists = await Promise.all(
          wanted.flatMap((id) => [
            queryClient.fetchQuery({ ...predecessorsQueryOptions(orgSlug, id), ...fresh }),
            queryClient.fetchQuery({ ...successorsQueryOptions(orgSlug, id), ...fresh }),
          ]),
        );
        return byId(lists.flat());
      },
      readChildrenOf: async (parentIds) => {
        const parents = new Set(parentIds);
        return byId(
          (await walkActivities()).filter(
            (row) => row.parentId !== null && parents.has(row.parentId),
          ),
        );
      },
      // The three lists below hang off an activity, so a 404 on one means THAT ACTIVITY is gone.
      readSteps: (activityId) =>
        readList<ActivityStep>(() =>
          queryClient.fetchQuery({ ...activityStepsQueryOptions(orgSlug, activityId), ...fresh }),
        ),
      readAssignments: (activityId) =>
        readList<ResourceAssignmentSummary>(() =>
          queryClient.fetchQuery({ ...assignmentsQueryOptions(orgSlug, activityId), ...fresh }),
        ),
      readCrossPlanLink: (linkId) =>
        readOne<CrossPlanDependencySummary>(
          crossPlanDependencyKeys.detail(orgSlug, linkId),
          `/organizations/${orgSlug}/cross-plan-dependencies/${linkId}`,
        ),
    };
  }, [queryClient, orgSlug, planId]);

  const report = useCallback(
    (result: PostedHistoryResult): void => {
      if (result.outcome === 'done') announce(historyResultMessage(result));
      if (onResult) onResult(result);
      else if (result.outcome !== 'done') announce(historyResultMessage(result));
    },
    [announce, onResult],
  );

  // Reveal AFTER the plan's list has been refreshed: the replay's own mutation invalidated it, but
  // the row the planner is about to be shown carries the dates the step just restored, and centring
  // on the stale ones would land the view where the bar WAS. `cancelRefetch: false` joins the refetch
  // already in flight rather than restarting it, so this adds no request. A failed refresh reveals
  // nothing — the strip and the announcement already said what happened.
  const revealSubjects = useCallback(
    async (subjects: readonly string[]): Promise<void> => {
      if (subjects.length === 0 || onRevealRef.current === undefined) return;
      try {
        await queryClient.invalidateQueries(
          { queryKey: activityKeys.listByPlan(orgSlug, planId) },
          { cancelRefetch: false },
        );
      } catch {
        return;
      }
      const present = new Set(
        queryClient
          .getQueryData<ActivitySummary[]>(activitiesQueryOptions(orgSlug, planId).queryKey)
          ?.map((row) => row.id),
      );
      const first = subjects.find((id) => present.has(id));
      if (first !== undefined) onRevealRef.current?.(first);
    },
    [queryClient, orgSlug, planId],
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
          if (err instanceof ReplayFailure) {
            // The step failed part-way and says what state it left the plan in; the planner is told
            // that, whatever the cause — and a lost pen under it still runs the pen contract.
            if (err.cause instanceof ApiFetchError && err.cause.status === 423)
              onLockLost(err.cause);
            report({ direction, outcome: 'failed', label, detail: err.detail });
            return;
          }
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
        if (outcome.command.affectsSchedule !== false) onReplayedRef.current?.();
        void revealSubjects(outcome.command.subjects);
      })();
    },
    [history, replayContext, onLockLost, refetchServerTruth, report, revealSubjects],
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
