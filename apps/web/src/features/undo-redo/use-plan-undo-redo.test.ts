import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanEditHistory } from './use-plan-edit-history';
import {
  REDO_CONFLICT_MESSAGE,
  REDO_FAILED_MESSAGE,
  REDO_PARENT_DELETED_MESSAGE,
  UNDO_CONFLICT_MESSAGE,
  UNDO_FAILED_MESSAGE,
  UNDO_PARENT_DELETED_MESSAGE,
  usePlanUndoRedo,
} from './use-plan-undo-redo';

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
    undo: vi.fn().mockResolvedValue('Move activity'),
    redo: vi.fn().mockResolvedValue('Add link'),
    clear: vi.fn(),
    clearRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
    undoLabel: 'Move activity',
    redoLabel: 'Add link',
    ...over,
  };
}

function setup(history: PlanEditHistory) {
  const announce = vi.fn();
  const onLockLost = vi.fn();
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(
    () => usePlanUndoRedo({ history, orgSlug: 'acme', planId: 'p1', announce, onLockLost }),
    { wrapper },
  );
  return { result, announce, onLockLost, invalidateSpy };
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
