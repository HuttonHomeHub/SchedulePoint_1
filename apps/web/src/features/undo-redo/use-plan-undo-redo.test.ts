import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  autoArrangeCommand,
  createVersionLedger,
  dependencyEditCommand,
  relaneCommand,
} from './commands';
import {
  REDO_CONFLICT_MESSAGE,
  REDO_FAILED_MESSAGE,
  REDO_PARENT_DELETED_MESSAGE,
  UNDO_CONFLICT_MESSAGE,
  UNDO_FAILED_MESSAGE,
  UNDO_PARENT_DELETED_MESSAGE,
  type PostedHistoryResult,
} from './history-result';
import type { PlanEditHistory } from './use-plan-edit-history';
import { usePlanUndoRedo } from './use-plan-undo-redo';

import { ApiFetchError } from '@/lib/api/client';

/**
 * M3.1 conflict + pen-loss contract (ADR-0048). The store's own suite covers replay/coalescing; here
 * the inverse is mocked to REJECT so we can assert each failure branch: 409/404 → refetch + clear redo
 * (non-destructive), 423 → clear whole history + run the shared pen contract, other → generic status.
 */

const err = (status: number, details?: unknown): ApiFetchError =>
  new ApiFetchError(status, {
    code: 'X',
    message: 'nope',
    ...(details === undefined ? {} : { details }),
  });

/** A minimal history double whose undo/redo resolve or reject as the test sets up. */
function fakeHistory(over: Partial<PlanEditHistory> = {}): PlanEditHistory {
  return {
    record: vi.fn(),
    isTop: vi.fn().mockReturnValue(false),
    peekUndo: vi.fn().mockReturnValue(undefined),
    peekRedo: vi.fn().mockReturnValue(undefined),
    undo: vi.fn().mockResolvedValue('Move activity'),
    redo: vi.fn().mockResolvedValue('Add link'),
    clear: vi.fn(),
    clearRedo: vi.fn(),
    versions: createVersionLedger(),
    canUndo: true,
    canRedo: true,
    undoLabel: 'Move activity',
    redoLabel: 'Add link',
    ...over,
  };
}

function setup(history: PlanEditHistory, onResult?: (result: PostedHistoryResult) => void) {
  const announce = vi.fn();
  const onLockLost = vi.fn();
  const onReplayed = vi.fn();
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(
    () =>
      usePlanUndoRedo({
        history,
        orgSlug: 'acme',
        planId: 'p1',
        announce,
        onLockLost,
        onReplayed,
        ...(onResult ? { onResult } : {}),
      }),
    { wrapper },
  );
  return { result, announce, onLockLost, onReplayed, invalidateSpy };
}

beforeEach(() => vi.clearAllMocks());

describe('usePlanUndoRedo — success', () => {
  it('announces the executed step label on a successful undo / redo', async () => {
    const { result, announce } = setup(fakeHistory());
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Undid move activity.'));
    act(() => result.current.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Redid add link.'));
  });

  it('exposes the store’s canUndo/canRedo + labels', () => {
    const { result } = setup(fakeHistory({ canUndo: true, canRedo: false, redoLabel: null }));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undoLabel).toBe('Move activity');
    expect(result.current.redoLabel).toBeNull();
  });
});

/**
 * F-2 (undo-redo-best-in-class M0-T2): the structure signature cannot see a sub-day duration, a lag
 * in minutes or a calendar, so an inverse that restores one never recalculated. A successful replay
 * now says so itself, except for the layout-only commands that declare `affectsSchedule: false`.
 */
describe('usePlanUndoRedo — recalculation after a replay', () => {
  const noop = vi.fn();
  const lag = dependencyEditCommand({
    updateDependency: noop,
    before: { id: 'd1', type: 'FS', lagMinutes: 0, version: 1 },
    after: { id: 'd1', type: 'FS', lagMinutes: 90, version: 2 },
    label: 'Edit link',
  } as unknown as Parameters<typeof dependencyEditCommand>[0]);
  const relane = relaneCommand({
    repositionLane: noop,
    activityId: 'a1',
    fromLaneIndex: 0,
    toLaneIndex: 1,
    version: 1,
    activityName: 'Excavate',
  });
  const arrange = autoArrangeCommand({
    batchPositions: noop,
    before: [],
    after: [],
    versions: new Map(),
  });

  it('a schedule-affecting command defaults to affecting the schedule', () => {
    expect(lag.affectsSchedule).not.toBe(false);
  });

  it('the two layout-only builders declare they do not', () => {
    expect(relane.affectsSchedule).toBe(false);
    expect(arrange.affectsSchedule).toBe(false);
  });

  it('notifies after a successful undo and redo of a schedule-affecting step', async () => {
    const { result, onReplayed } = setup(
      fakeHistory({
        peekUndo: vi.fn().mockReturnValue(lag),
        peekRedo: vi.fn().mockReturnValue(lag),
      }),
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onReplayed).toHaveBeenCalledTimes(1));
    act(() => result.current.redo());
    await waitFor(() => expect(onReplayed).toHaveBeenCalledTimes(2));
  });

  it('does not notify after a lane-only replay', async () => {
    const { result, announce, onReplayed } = setup(
      fakeHistory({
        peekUndo: vi.fn().mockReturnValue(relane),
        peekRedo: vi.fn().mockReturnValue(arrange),
      }),
    );
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Undid move activity.'));
    act(() => result.current.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Redid add link.'));
    expect(onReplayed).not.toHaveBeenCalled();
  });

  it('does not notify when the replay failed or there was nothing to replay', async () => {
    const failing = setup(
      fakeHistory({
        peekUndo: vi.fn().mockReturnValue(lag),
        undo: vi.fn().mockRejectedValue(err(500)),
      }),
    );
    act(() => failing.result.current.undo());
    await waitFor(() => expect(failing.announce).toHaveBeenCalledWith(UNDO_FAILED_MESSAGE));
    expect(failing.onReplayed).not.toHaveBeenCalled();

    const empty = setup(fakeHistory({ undo: vi.fn().mockResolvedValue(null) }));
    act(() => empty.result.current.undo());
    await waitFor(() => expect(empty.result.current.canUndo).toBe(true));
    expect(empty.onReplayed).not.toHaveBeenCalled();
  });
});

describe('usePlanUndoRedo — 409 / 404 conflict (abort non-destructively)', () => {
  for (const status of [409, 404]) {
    it(`undo ${status}: refetches server truth, clears ONLY redo, announces, no re-pop`, async () => {
      const history = fakeHistory({ undo: vi.fn().mockRejectedValue(err(status)) });
      const { result, announce, onLockLost, invalidateSpy } = setup(history);

      act(() => result.current.undo());

      await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_CONFLICT_MESSAGE));
      expect(history.clearRedo).toHaveBeenCalledTimes(1);
      expect(history.clear).not.toHaveBeenCalled(); // non-destructive: undo stack intact
      expect(onLockLost).not.toHaveBeenCalled();
      // The refetch invalidates the plan's activity list + the org/plan schedule namespace.
      const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContainEqual(JSON.stringify(['activities', 'acme', 'plan', 'p1']));
      expect(keys).toContainEqual(JSON.stringify(['schedule', 'acme']));
    });
  }

  it('redo 409: clears redo + announces the redo-flavoured conflict copy', async () => {
    const history = fakeHistory({ redo: vi.fn().mockRejectedValue(err(409)) });
    const { result, announce } = setup(history);
    act(() => result.current.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_CONFLICT_MESSAGE));
    expect(history.clearRedo).toHaveBeenCalledTimes(1);
  });

  /**
   * **The one 409 whose recovery is a different action** (`docs/TECH_DEBT.md` #230 M2). The general
   * copy tells the reader to refresh, and refreshing does not help — restoring the phase does. So
   * the words branch and nothing else does.
   *
   * The reason is read from `error.details.reason`, which was verified rather than assumed: it is
   * the same path `lib/api/calendar-scope-errors.ts` already reads, and the server's
   * `ConflictError('…', { reason })` is copied straight into the envelope by the exceptions filter.
   *
   * **This branch is the only cover this case has, and that is deliberate.** Its journey does not
   * exist because the state is not reachable from one pen session — `apps/web/e2e-undo` drives the
   * spec's own alternate flow and both undos succeed, because the stack is LIFO and a cascade never
   * sweeps an already-deleted subtree. It stays reachable across sessions (a stale tab, a pen
   * hand-off), which is why the words are worth having at all.
   */
  it('undo 409 PARENT_DELETED: says which action recovers it, not "refresh"', async () => {
    const history = fakeHistory({
      undo: vi.fn().mockRejectedValue(err(409, { reason: 'PARENT_DELETED' })),
    });
    const { result, announce } = setup(history);
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_PARENT_DELETED_MESSAGE));
    expect(announce).not.toHaveBeenCalledWith(UNDO_CONFLICT_MESSAGE);
    // Everything else about the branch is unchanged — only the words move.
    expect(history.clearRedo).toHaveBeenCalledTimes(1);
    expect(history.clear).not.toHaveBeenCalled();
  });

  it('redo 409 PARENT_DELETED: the redo-flavoured wording', async () => {
    const history = fakeHistory({
      redo: vi.fn().mockRejectedValue(err(409, { reason: 'PARENT_DELETED' })),
    });
    const { result, announce } = setup(history);
    act(() => result.current.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_PARENT_DELETED_MESSAGE));
  });

  /**
   * The pinned positive that stops the branch swallowing every 409: a conflict with SOME OTHER
   * reason, and a conflict with no `details` at all, both still get the general copy. Without
   * these, "the new message appears" would be indistinguishable from "the new message always
   * appears".
   */
  it('keeps the general copy for a 409 with another reason, or none', async () => {
    for (const details of [{ reason: 'VERSION_CONFLICT' }, undefined]) {
      const history = fakeHistory({ undo: vi.fn().mockRejectedValue(err(409, details)) });
      const { result, announce } = setup(history);
      act(() => result.current.undo());
      await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_CONFLICT_MESSAGE));
      expect(announce).not.toHaveBeenCalledWith(UNDO_PARENT_DELETED_MESSAGE);
    }
  });
});

describe('usePlanUndoRedo — 423 pen lost (clear whole history)', () => {
  it('clears the whole history and runs the shared pen contract, WITHOUT a second announcement', async () => {
    const history = fakeHistory({ undo: vi.fn().mockRejectedValue(err(423)) });
    const { result, announce, onLockLost } = setup(history);

    act(() => result.current.undo());

    // The shared pen contract (the `EditLockBanner`'s own live region) is the single source of the
    // pen-loss announcement — this feature must NOT `announce(...)` a second, near-identical utterance.
    await waitFor(() => expect(onLockLost).toHaveBeenCalledTimes(1));
    expect(history.clear).toHaveBeenCalledTimes(1);
    expect(history.clearRedo).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('usePlanUndoRedo — other errors (leave stacks intact)', () => {
  it('announces a generic status and does not mutate the stacks', async () => {
    const history = fakeHistory({ redo: vi.fn().mockRejectedValue(err(500)) });
    const { result, announce, onLockLost, invalidateSpy } = setup(history);

    act(() => result.current.redo());

    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_FAILED_MESSAGE));
    expect(history.clear).not.toHaveBeenCalled();
    expect(history.clearRedo).not.toHaveBeenCalled();
    expect(onLockLost).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('a non-ApiFetchError on undo is the generic branch too', async () => {
    const history = fakeHistory({ undo: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result, announce } = setup(history);
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_FAILED_MESSAGE));
  });
});

/**
 * M1-T2: an outcome is handed to the dock as a RESULT, and each event is spoken exactly once — a
 * success through the polite region, a failure by the strip's `role="alert"` (ADR-0132).
 */
describe('usePlanUndoRedo — results for the dock strip', () => {
  const step = { label: 'Edit “Excavate”', undo: vi.fn(), redo: vi.fn() };

  it('a success posts a `done` result bound to its step and announces once', async () => {
    const onResult = vi.fn();
    const { result, announce } = setup(
      fakeHistory({
        peekUndo: vi.fn().mockReturnValue(step),
        undo: vi.fn().mockResolvedValue(step.label),
      }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith({
      direction: 'undo',
      outcome: 'done',
      label: step.label,
      command: step,
    });
    expect(announce).toHaveBeenCalledExactlyOnceWith('Undid edit “Excavate”.');
  });

  it('a redo success posts the redo direction', async () => {
    const onResult = vi.fn();
    const { result } = setup(
      fakeHistory({
        peekRedo: vi.fn().mockReturnValue(step),
        redo: vi.fn().mockResolvedValue(step.label),
      }),
      onResult,
    );
    act(() => result.current.redo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'redo', outcome: 'done' }),
    );
  });

  const failures: [string, unknown, string][] = [
    ['a 409', err(409), 'conflict'],
    ['a 404', err(404), 'conflict'],
    ['a 409 PARENT_DELETED', err(409, { reason: 'PARENT_DELETED' }), 'parent-deleted'],
    ['a 500', err(500), 'failed'],
    ['a thrown Error', new Error('boom'), 'failed'],
  ];
  for (const [name, error, outcome] of failures) {
    it(`${name} posts a \`${outcome}\` result and is NOT also announced`, async () => {
      const onResult = vi.fn();
      const { result, announce } = setup(
        fakeHistory({
          peekUndo: vi.fn().mockReturnValue(step),
          undo: vi.fn().mockRejectedValue(error),
        }),
        onResult,
      );
      act(() => result.current.undo());
      await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
      expect(onResult).toHaveBeenCalledWith({
        direction: 'undo',
        outcome,
        label: step.label,
      });
      expect(announce).not.toHaveBeenCalled();
    });
  }

  it('a lost pen posts nothing — the pen banner is its one announcer', async () => {
    const onResult = vi.fn();
    const { result, onLockLost } = setup(
      fakeHistory({ undo: vi.fn().mockRejectedValue(err(423)) }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onLockLost).toHaveBeenCalledTimes(1));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('nothing to undo posts nothing', async () => {
    const onResult = vi.fn();
    const history = fakeHistory({ undo: vi.fn().mockResolvedValue(null) });
    const { result } = setup(history, onResult);
    act(() => result.current.undo());
    await waitFor(() => expect(history.undo).toHaveBeenCalled());
    expect(onResult).not.toHaveBeenCalled();
  });
});
