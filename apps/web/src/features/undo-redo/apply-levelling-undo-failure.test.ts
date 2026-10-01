import type { LevellingApplication } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bulkPlacementCommand } from './commands';
import { usePlanEditHistory } from './use-plan-edit-history';
import {
  REDO_CONFLICT_MESSAGE,
  REDO_FAILED_MESSAGE,
  UNDO_CONFLICT_MESSAGE,
  UNDO_FAILED_MESSAGE,
  usePlanUndoRedo,
} from './use-plan-undo-redo';

import { levellingApplicationSnapshots } from '@/features/schedule';
import { ApiFetchError } from '@/lib/api/client';

/**
 * **A failed undo or redo of "Apply levelled dates", through the real history and the real
 * conflict contract** (`docs/specs/apply-levelled-dates/` T2.3; ADR-0048 M3.1).
 *
 * The command is the one the workspace model records, built from the same snapshots; only the batch
 * write is stubbed. What this pins, each against the defect it names:
 *
 * - the rejection reaches the planner as a sentence — a failed inverse that said nothing would leave
 *   the bars where they are and the Undo button apparently working;
 * - a failed undo leaves the step on the undo stack, so the planner can retry — popping it before the
 *   write resolved would lose the only way back;
 * - a 409 drops the redo branch, which described a plan that is no longer the one on screen.
 *
 * The command takes no recalculation hold of its own (only the forward write does), so there is
 * none to release here; `use-plan-workspace-model.apply-levelling.test.ts` asserts that.
 */

const application: LevellingApplication = {
  computedFrom: { scheduleComputedAt: '2026-03-01T00:00:00.000Z' },
  rows: [
    {
      id: 'a',
      version: 4,
      constraintType: null,
      constraintDate: null,
      visualStart: '2026-03-09',
      laneIndex: null,
    },
  ],
  items: [
    {
      id: 'a',
      name: 'Lift A',
      code: null,
      beforeVisualStart: null,
      beforeDrawnStart: '2026-03-02',
      targetStart: '2026-03-09',
      wasPlaced: false,
      roundedToNextDay: false,
      reason: 'RESOURCE',
    },
  ],
  leftToLogic: [],
  followingLinks: [],
  conflictingPlaced: [],
  laterThanBoundIntroduced: 0,
  projectFinishBefore: '2026-04-01',
  projectFinishAfter: '2026-04-08',
  remainingAfterApply: 0,
};

const conflict = () => new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' });

const batch = vi.fn();
const announce = vi.fn();

function setup() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(
    () => {
      const history = usePlanEditHistory('p1');
      const undoRedo = usePlanUndoRedo({
        history,
        orgSlug: 'acme',
        planId: 'p1',
        announce,
        onLockLost: vi.fn(),
      });
      return { history, undoRedo };
    },
    { wrapper },
  );
  const { before, after, versions } = levellingApplicationSnapshots(application);
  act(() =>
    result.current.history.record(
      bulkPlacementCommand({
        batchPlacements: batch,
        before,
        after,
        versions,
        label: 'Apply levelled dates (1 activity)',
      }),
    ),
  );
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  batch.mockResolvedValue([{ id: 'a', version: 5 }]);
});

describe('Apply levelled dates — a failed undo', () => {
  it('says the plan changed on a 409, and keeps the step so Undo can be retried', async () => {
    const result = setup();
    batch.mockRejectedValueOnce(conflict());
    act(() => result.current.undoRedo.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_CONFLICT_MESSAGE));
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.history.canRedo).toBe(false);
    act(() => result.current.undoRedo.undo());
    await waitFor(() => expect(result.current.history.canUndo).toBe(false));
    expect(result.current.history.canRedo).toBe(true);
  });

  it('says it failed on a network error, and leaves the step on the undo stack', async () => {
    const result = setup();
    batch.mockRejectedValueOnce(new Error('network down'));
    act(() => result.current.undoRedo.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_FAILED_MESSAGE));
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.history.canRedo).toBe(false);
  });
});

describe('Apply levelled dates — a failed redo', () => {
  async function undone() {
    const result = setup();
    act(() => result.current.undoRedo.undo());
    await waitFor(() => expect(result.current.history.canRedo).toBe(true));
    return result;
  }

  it('says the plan changed on a 409, and drops the stale redo', async () => {
    const result = await undone();
    batch.mockRejectedValueOnce(conflict());
    act(() => result.current.undoRedo.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_CONFLICT_MESSAGE));
    expect(result.current.history.canRedo).toBe(false);
    expect(result.current.history.canUndo).toBe(false);
  });

  it('says it failed on a network error, and keeps the step on the redo stack', async () => {
    const result = await undone();
    batch.mockRejectedValueOnce(new Error('network down'));
    act(() => result.current.undoRedo.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_FAILED_MESSAGE));
    expect(result.current.history.canRedo).toBe(true);
    expect(result.current.history.canUndo).toBe(false);
  });
});
