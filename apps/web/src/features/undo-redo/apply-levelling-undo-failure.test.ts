import type { LevellingApplication } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bulkPlacementCommand } from './commands';
import { REDO_FAILED_MESSAGE, UNDO_FAILED_MESSAGE } from './history-result';
import { usePlanEditHistory } from './use-plan-edit-history';
import { usePlanUndoRedo } from './use-plan-undo-redo';

import { levellingApplicationSnapshots } from '@/features/schedule';
import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer, pagedReader } from '@/test/fake-plan-server';

// The replay reads the plan through `fetchQuery`; answer those lists from the fake server.
const reader = vi.hoisted(() => ({
  current: (_path: string): Promise<unknown[]> => Promise.resolve([]),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: (path: string) => reader.current(path),
}));

/**
 * **A failed undo or redo of "Apply levelled dates", through the real history and the real replay
 * contract** (`docs/specs/apply-levelled-dates/` T2.3; ADR-0048 M3.1, ADR-0176).
 *
 * The command is the one the workspace model records, built from the same snapshots; only the batch
 * write is stubbed. What this pins, each against the defect it names:
 *
 * - a refusal reaches the planner as a sentence — a failed inverse that said nothing would leave
 *   the bars where they are and the Undo button apparently working;
 * - a transport failure leaves the step on the undo stack, so the planner can retry — popping it
 *   before the write resolved would lose the only way back;
 * - a step that cannot apply is SET ASIDE, not left on top to block everything beneath it, and takes
 *   the redo branch with it, which described a plan that is no longer the one on screen.
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
const announce = vi.fn();

function setup() {
  // The row as the forward write left it: the levelled date applied.
  const server = fakePlanServer({
    activities: [anActivity({ id: 'a', name: 'Lift A', visualStart: '2026-03-09' })],
  });
  reader.current = pagedReader(server);
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
  const { before, after } = levellingApplicationSnapshots(application);
  act(() =>
    result.current.history.record(
      bulkPlacementCommand({
        batchPlacements: server.mutations.batchPlacements,
        before,
        after,
        saved: [server.row('a')],
        label: 'Apply levelled dates (1 activity)',
      }),
    ),
  );
  return { result, server };
}

beforeEach(() => vi.clearAllMocks());

describe('Apply levelled dates — a failed undo', () => {
  it('a 409 on the write sets the step aside in words, and the history is no longer blocked by it', async () => {
    const { result, server } = setup();
    server.mutations.batchPlacements.mockRejectedValueOnce(conflict());
    act(() => result.current.undoRedo.undo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('was changed since')),
    );
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
  });

  it('a placement changed behind the planner’s back is refused BEFORE any write', async () => {
    const { result, server } = setup();
    server.edit('a', { visualStart: '2026-05-04' });
    server.mutations.batchPlacements.mockClear();
    act(() => result.current.undoRedo.undo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('was changed since')),
    );
    expect(server.mutations.batchPlacements).not.toHaveBeenCalled();
    expect(server.row('a').visualStart).toBe('2026-05-04');
  });

  it('says it failed on a network error, and leaves the step on the undo stack', async () => {
    const { result, server } = setup();
    server.mutations.batchPlacements.mockRejectedValueOnce(new Error('network down'));
    act(() => result.current.undoRedo.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_FAILED_MESSAGE));
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.history.canRedo).toBe(false);
    act(() => result.current.undoRedo.undo());
    await waitFor(() => expect(result.current.history.canUndo).toBe(false));
    expect(result.current.history.canRedo).toBe(true);
  });
});

describe('Apply levelled dates — a failed redo', () => {
  async function undone() {
    const harness = setup();
    act(() => harness.result.current.undoRedo.undo());
    await waitFor(() => expect(harness.result.current.history.canRedo).toBe(true));
    return harness;
  }

  it('a 409 sets the redo aside and drops the stale branch', async () => {
    const { result, server } = await undone();
    server.mutations.batchPlacements.mockRejectedValueOnce(conflict());
    act(() => result.current.undoRedo.redo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('Couldn’t redo')),
    );
    expect(result.current.history.canRedo).toBe(false);
    expect(result.current.history.canUndo).toBe(false);
  });

  it('says it failed on a network error, and keeps the step on the redo stack', async () => {
    const { result, server } = await undone();
    server.mutations.batchPlacements.mockRejectedValueOnce(new Error('network down'));
    act(() => result.current.undoRedo.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_FAILED_MESSAGE));
    expect(result.current.history.canRedo).toBe(true);
    expect(result.current.history.canUndo).toBe(false);
  });
});
