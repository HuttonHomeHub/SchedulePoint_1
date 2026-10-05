import type {
  ActivityStep,
  ActivitySummary,
  CrossPlanDependencySummary,
  DependencySummary,
  ResourceAssignmentSummary,
} from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { Command } from './commands';
import { historyResultMessage, type PostedHistoryResult } from './history-result';
import { isNotFound, ReplayFailure, SINGLE_READ_LIMIT, type ReplayContext } from './replay';
import type { HistoryEntries, PlanEditHistory, StepOutcome } from './use-plan-edit-history';

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
  /**
   * The labels of the steps on each stack, nearest first — read when the history menu renders, not
   * held as state (see {@link PlanEditHistory.entries}).
   */
  entries: () => HistoryEntries;
  /**
   * Undo `count` steps in order (the history menu's "undo to here"), the nearest first. Stops at the
   * first step that does not apply and says so in ONE result — see {@link historyResultMessage}.
   */
  undoTo: (count: number) => void;
  /** Redo `count` steps in order, the mirror of {@link undoTo}. */
  redoTo: (count: number) => void;
}

/**
 * What one replay of one step came to, with the failure handling already done (the pen contract run,
 * the plan refetched after a set-aside). A single press and a run of several are both built on it,
 * so they cannot disagree about what a step's outcome means.
 */
type Step =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pen-lost' }
  | { readonly kind: 'failed'; readonly label: string; readonly detail?: string }
  | { readonly kind: 'set-aside'; readonly outcome: Extract<StepOutcome, { kind: 'set-aside' }> }
  | { readonly kind: 'applied'; readonly command: Command };

type StoppedStep = Extract<Step, { kind: 'failed' | 'set-aside' }>;

/** The result a step that did not apply posts; `steps` is set only by a run of several. */
function stoppedResult(
  direction: 'undo' | 'redo',
  step: StoppedStep,
  steps?: { done: number; total: number },
): PostedHistoryResult {
  if (step.kind === 'failed') {
    return {
      direction,
      outcome: 'failed',
      label: step.label,
      ...(step.detail !== undefined ? { detail: step.detail } : {}),
      ...(steps ? { steps } : {}),
    };
  }
  return {
    direction,
    outcome: 'set-aside',
    label: step.outcome.command.label,
    setAside: {
      reason: step.outcome.reason,
      subjectName: step.outcome.subjectName,
      nextLabel: step.outcome.nextLabel,
    },
    ...(steps ? { steps } : {}),
  };
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

  // Held across a whole run of steps: between two of them the store's own in-flight guard is down,
  // so without this a keystroke could slip a single undo into the middle of "undo to here".
  const rangeRunningRef = useRef(false);

  const replayOne = useCallback(
    async (direction: 'undo' | 'redo'): Promise<Step> => {
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
          if (err.cause instanceof ApiFetchError && err.cause.status === 423) onLockLost(err.cause);
          return { kind: 'failed', label, detail: err.detail };
        }
        if (err instanceof ApiFetchError && err.status === 423) {
          // Pen lost — the shared pen contract shows the lost-control banner and refetches the
          // lock. The history stays: a step is checked against the server before it writes.
          onLockLost(err);
          return { kind: 'pen-lost' };
        }
        // Anything else — the stacks stay intact so the user can retry.
        return { kind: 'failed', label };
      }
      if (outcome === null) return { kind: 'idle' };
      if (outcome.kind === 'set-aside') {
        refetchServerTruth();
        return { kind: 'set-aside', outcome };
      }
      return { kind: 'applied', command: outcome.command };
    },
    [history, replayContext, onLockLost, refetchServerTruth],
  );

  /** What a step that APPLIED sets in motion: the recalculation, and the reveal of what it changed. */
  const afterApplied = useCallback(
    (command: Command, recalculate: boolean): void => {
      if (recalculate) onReplayedRef.current?.();
      void revealSubjects(command.subjects);
    },
    [revealSubjects],
  );

  const run = useCallback(
    (direction: 'undo' | 'redo'): void => {
      if (rangeRunningRef.current) return;
      void (async () => {
        const step = await replayOne(direction);
        if (step.kind === 'idle' || step.kind === 'pen-lost') return;
        if (step.kind !== 'applied') {
          report(stoppedResult(direction, step));
          return;
        }
        report({
          direction,
          outcome: 'done',
          label: step.command.label,
          command: step.command,
        });
        afterApplied(step.command, step.command.affectsSchedule !== false);
      })();
    },
    [replayOne, report, afterApplied],
  );

  const runTo = useCallback(
    (direction: 'undo' | 'redo', count: number): void => {
      if (rangeRunningRef.current || count < 1) return;
      // One step is an ordinary press, and reads as one.
      if (count === 1) {
        run(direction);
        return;
      }
      rangeRunningRef.current = true;
      void (async () => {
        try {
          let done = 0;
          let last: Command | undefined;
          let recalculate = false;
          let stop: Exclude<Step, { kind: 'applied' }> = { kind: 'idle' };
          while (done < count) {
            const step = await replayOne(direction);
            if (step.kind !== 'applied') {
              stop = step;
              break;
            }
            done += 1;
            last = step.command;
            recalculate ||= step.command.affectsSchedule !== false;
          }
          // What DID run is acted on whether or not the run finished: the plan changed, so the engine
          // is told and the planner is shown the last thing reversed.
          if (last !== undefined) afterApplied(last, recalculate);
          if (stop.kind === 'pen-lost') return;
          if (stop.kind !== 'idle') {
            // The run STOPPED, and does not skip the step (see `rangeMessage`). If it stopped on the
            // first step nothing ran, so this is an ordinary single press and reads as one.
            report(stoppedResult(direction, stop, done === 0 ? undefined : { done, total: count }));
            return;
          }
          // Finished — or the stack ran out early, in which case `done` is all there was.
          if (last !== undefined) {
            report({
              direction,
              outcome: 'done',
              label: last.label,
              command: last,
              steps: { done, total: done },
            });
          }
        } finally {
          rangeRunningRef.current = false;
        }
      })();
    },
    [run, replayOne, report, afterApplied],
  );

  const undo = useCallback((): void => run('undo'), [run]);
  const redo = useCallback((): void => run('redo'), [run]);
  const undoTo = useCallback((count: number): void => runTo('undo', count), [runTo]);
  const redoTo = useCallback((count: number): void => runTo('redo', count), [runTo]);

  return useMemo(
    () => ({
      undo,
      redo,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.undoLabel,
      redoLabel: history.redoLabel,
      entries: history.entries,
      undoTo,
      redoTo,
    }),
    [
      undo,
      redo,
      undoTo,
      redoTo,
      history.entries,
      history.canUndo,
      history.canRedo,
      history.undoLabel,
      history.redoLabel,
    ],
  );
}
