import type { SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { useCallback, useMemo } from 'react';

import {
  useCreateSwimlane,
  useDeleteSwimlane,
  useRenameSwimlane,
  useReorderSwimlanes,
  useRestoreSwimlane,
  useSetPlanSwimlaneSource,
} from '../api/use-swimlane-mutations';

import { movedSwimlane, orderBody } from './swimlane-order';

import {
  swimlaneAddCommand,
  swimlaneDeleteCommand,
  swimlaneRenameCommand,
  swimlaneReorderCommand,
  swimlaneSourceCommand,
  type Command,
  type SwimlaneBasisChoice,
} from '@/features/undo-redo';

export interface SwimlaneActions {
  /** Create swimlanes at the end, in order; one undo step. Resolves what the server saved. */
  add: (names: readonly string[]) => Promise<SwimlaneSummary[]>;
  /** Create one swimlane directly after another; one undo step. */
  addAfter: (name: string, after: string) => Promise<SwimlaneSummary>;
  rename: (swimlane: SwimlaneSummary, name: string) => Promise<SwimlaneSummary>;
  /** Move one place up or down within `list`. Resolves `false` when it is already at that end. */
  move: (list: readonly SwimlaneSummary[], id: string, delta: -1 | 1) => Promise<boolean>;
  remove: (swimlane: SwimlaneSummary) => Promise<void>;
  /** Switch the plan to hand-made swimlanes. A plan setting, so it is not an undo step. */
  setManualSource: (plan: { id: string; version: number }) => Promise<void>;
  /**
   * Choose where the plan's swimlanes come from — by hand, or one per WBS group at a level — as one
   * undo step. It writes the plan record and nothing else: lanes are stored per basis, so the old
   * picture is still there to come back to.
   */
  switchSource: (plan: SwimlanePlanFacts, to: SwimlaneBasisChoice) => Promise<void>;
}

/** What a source write needs of the plan: its lock, and the choice it holds now (the undo's "before"). */
export interface SwimlanePlanFacts {
  id: string;
  version: number;
  swimlaneSource: SwimlaneSource;
  swimlaneWbsLevel: number | null;
}

/**
 * The swimlane writes, each recorded for undo (ADR-0048, ADR-0176; `coverage.ts`).
 *
 * `record` is the workspace's history seam, or absent where there is no history (the unit tests).
 * **A history fault must never break a write that already succeeded** — the swimlane is on the server
 * and the planner has been told so, and losing its undo step is the smaller failure — so recording is
 * the last thing each write does, inside its own try.
 *
 * The returned object is stable across renders with equal inputs: `mutateAsync` of a TanStack Query
 * mutation is a stable reference, and the hook memoises on those, so a host can hand it to a
 * memoised gutter without rewriting every label on each render.
 */
export function useSwimlaneActions(
  orgSlug: string,
  planId: string,
  record?: (command: Command) => void,
): SwimlaneActions {
  const create = useCreateSwimlane(orgSlug, planId).mutateAsync;
  const renameSwimlane = useRenameSwimlane(orgSlug, planId).mutateAsync;
  const reorder = useReorderSwimlanes(orgSlug, planId).mutateAsync;
  const removeSwimlane = useDeleteSwimlane(orgSlug, planId).mutateAsync;
  const restore = useRestoreSwimlane(orgSlug, planId).mutateAsync;
  const setSource = useSetPlanSwimlaneSource(orgSlug).mutateAsync;

  const remember = useCallback(
    (command: Command): void => {
      try {
        record?.(command);
      } catch (error) {
        console.error('Could not record a swimlane change for undo', error);
      }
    },
    [record],
  );

  const add = useCallback(
    async (names: readonly string[]): Promise<SwimlaneSummary[]> => {
      // One at a time and in order: each `POST` appends, so the order typed is the order saved. A
      // failure part-way keeps what was created and still records it, so Undo takes back exactly that.
      const created: SwimlaneSummary[] = [];
      try {
        for (const name of names) created.push(await create({ name }));
      } finally {
        if (created.length > 0) {
          remember(swimlaneAddCommand({ created, remove: removeSwimlane, restore }));
        }
      }
      return created;
    },
    [create, remember, removeSwimlane, restore],
  );

  const addAfter = useCallback(
    async (name: string, after: string): Promise<SwimlaneSummary> => {
      const row = await create({ name, after });
      remember(swimlaneAddCommand({ created: [row], remove: removeSwimlane, restore }));
      return row;
    },
    [create, remember, removeSwimlane, restore],
  );

  const rename = useCallback(
    async (swimlane: SwimlaneSummary, name: string): Promise<SwimlaneSummary> => {
      const after = await renameSwimlane({
        swimlaneId: swimlane.id,
        name,
        version: swimlane.version,
      });
      remember(
        swimlaneRenameCommand({
          swimlaneId: swimlane.id,
          before: swimlane.name,
          after,
          rename: renameSwimlane,
        }),
      );
      return after;
    },
    [remember, renameSwimlane],
  );

  const move = useCallback(
    async (list: readonly SwimlaneSummary[], id: string, delta: -1 | 1): Promise<boolean> => {
      const next = movedSwimlane(list, id, delta);
      const moved = list.find((s) => s.id === id);
      if (next === null || moved === undefined) return false;
      const after = await reorder({ order: orderBody(next) });
      remember(swimlaneReorderCommand({ before: list, after, movedName: moved.name, reorder }));
      return true;
    },
    [remember, reorder],
  );

  const remove = useCallback(
    async (swimlane: SwimlaneSummary): Promise<void> => {
      await removeSwimlane({ swimlaneId: swimlane.id, version: swimlane.version });
      remember(swimlaneDeleteCommand({ deleted: swimlane, remove: removeSwimlane, restore }));
    },
    [remember, removeSwimlane, restore],
  );

  const setManualSource = useCallback(
    async (plan: { id: string; version: number }): Promise<void> => {
      await setSource({ planId: plan.id, version: plan.version, source: 'MANUAL' });
    },
    [setSource],
  );

  const switchSource = useCallback(
    async (plan: SwimlanePlanFacts, to: SwimlaneBasisChoice): Promise<void> => {
      await setSource({
        planId: plan.id,
        version: plan.version,
        source: to.source,
        level: to.level,
      });
      remember(
        swimlaneSourceCommand({
          planId: plan.id,
          before: { source: plan.swimlaneSource, level: plan.swimlaneWbsLevel },
          after: to,
          setSource,
        }),
      );
    },
    [remember, setSource],
  );

  return useMemo(
    () => ({ add, addAfter, rename, move, remove, setManualSource, switchSource }),
    [add, addAfter, rename, move, remove, setManualSource, switchSource],
  );
}
