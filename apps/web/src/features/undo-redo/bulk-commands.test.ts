import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  bulkDeleteCommand,
  bulkPlacementCommand,
  type ActivityPlacement,
  type BatchPlacementsFn,
} from './commands';

/**
 * The two bulk commands (`docs/specs/canvas-multi-select/` M4-T3 / M4-T4).
 *
 * What both are really about is **version threading**. A command's inverse runs minutes after the
 * write it inverts, against rows whose `version` the write itself bumped — so a command that
 * remembers the versions it was built with produces an undo that is a guaranteed 409 the second
 * time it is used. That is not a rare edge: it is what happens to anyone who presses undo, redo,
 * undo.
 */
const row = (id: string, version: number): ActivitySummary =>
  ({ id, version }) as unknown as ActivitySummary;

const placement = (id: string, lane: number): ActivityPlacement => ({
  id,
  constraintType: 'SNET',
  constraintDate: '2026-01-05',
  visualStart: null,
  laneIndex: lane,
});

describe('bulkPlacementCommand', () => {
  it('undo writes the BEFORE snapshot and redo the AFTER, in one batch each', async () => {
    const batchPlacements = vi.fn<BatchPlacementsFn>(() =>
      Promise.resolve([row('a', 3), row('b', 3)]),
    );
    const command = bulkPlacementCommand({
      batchPlacements,
      before: [placement('a', 0), placement('b', 1)],
      after: [placement('a', 4), placement('b', 5)],
      versions: new Map([
        ['a', 2],
        ['b', 2],
      ]),
    });

    await command.undo();
    expect(batchPlacements).toHaveBeenCalledOnce();
    expect(batchPlacements.mock.calls[0]?.[0]).toEqual({
      placements: [
        { ...placement('a', 0), version: 2 },
        { ...placement('b', 1), version: 2 },
      ],
    });

    await command.redo();
    // …and the SECOND call carries the versions the first response returned, not the ones the
    // command was built with. Without this the redo is a 409 for anybody who undoes twice.
    expect(batchPlacements.mock.calls[1]?.[0]).toEqual({
      placements: [
        { ...placement('a', 4), version: 3 },
        { ...placement('b', 5), version: 3 },
      ],
    });
  });

  it('sends every field of every row — a complete-row batch, never a partial', async () => {
    const batchPlacements = vi.fn<BatchPlacementsFn>(() => Promise.resolve([]));
    await bulkPlacementCommand({
      batchPlacements,
      before: [
        { id: 'a', constraintType: null, constraintDate: null, visualStart: null, laneIndex: null },
      ],
      after: [placement('a', 1)],
      versions: new Map([['a', 1]]),
    }).undo();
    // Nulls are sent, not omitted: the DTO refuses an absent field rather than defaulting it, so a
    // command that dropped its nulls would fail validation rather than silently unpin a constraint.
    expect(batchPlacements.mock.calls[0]?.[0].placements[0]).toEqual({
      id: 'a',
      version: 1,
      constraintType: null,
      constraintDate: null,
      visualStart: null,
      laneIndex: null,
    });
  });

  it('writes nothing when no row still has a known version', async () => {
    const batchPlacements = vi.fn<BatchPlacementsFn>(() => Promise.resolve([]));
    await bulkPlacementCommand({
      batchPlacements,
      before: [placement('gone', 0)],
      after: [placement('gone', 1)],
      versions: new Map(),
    }).undo();
    expect(batchPlacements).not.toHaveBeenCalled();
  });

  it('carries no coalescing descriptor', () => {
    const command = bulkPlacementCommand({
      batchPlacements: () => Promise.resolve([]),
      before: [],
      after: [],
      versions: new Map(),
    });
    // Stated as a test rather than left to the absence of a field: merging two bulk moves would
    // produce an undo that restores the union of two different selections — a state nobody was
    // ever in, reached by pressing undo once.
    expect(command).not.toHaveProperty('coalescing');
  });
});

describe('bulkDeleteCommand', () => {
  it('undo restores the BATCH — one call, not one per activity', async () => {
    const restoreBatch = vi.fn(() => Promise.resolve([row('a', 4), row('b', 4)]));
    const bulkDelete = vi.fn(() =>
      Promise.resolve({ deleteBatchId: 'batch-2', activityCount: 2, dependencyCount: 1 }),
    );
    const command = bulkDeleteCommand({
      bulkDelete,
      restoreBatch,
      activities: [
        { id: 'a', version: 3 },
        { id: 'b', version: 3 },
      ],
      deleteBatchId: 'batch-1',
    });

    await command.undo();
    expect(restoreBatch).toHaveBeenCalledExactlyOnceWith({ deleteBatchId: 'batch-1' });
  });

  it('re-threads the batch id on redo, so a second undo restores the SECOND delete', async () => {
    const restoreBatch = vi.fn(() => Promise.resolve([row('a', 4)]));
    const bulkDelete = vi.fn(() =>
      Promise.resolve({ deleteBatchId: 'batch-2', activityCount: 1, dependencyCount: 0 }),
    );
    const command = bulkDeleteCommand({
      bulkDelete,
      restoreBatch,
      activities: [{ id: 'a', version: 3 }],
      deleteBatchId: 'batch-1',
    });

    await command.undo();
    await command.redo();
    // The redo deleted again, which produced a NEW batch. Reusing `batch-1` here would restore
    // nothing at all and report success, which is the worst available failure.
    expect(bulkDelete).toHaveBeenCalledExactlyOnceWith({ activities: [{ id: 'a', version: 4 }] });
    await command.undo();
    expect(restoreBatch).toHaveBeenLastCalledWith({ deleteBatchId: 'batch-2' });
  });

  it('names the count, so the undo entry says what it will bring back', () => {
    const command = bulkDeleteCommand({
      bulkDelete: () =>
        Promise.resolve({ deleteBatchId: 'b', activityCount: 0, dependencyCount: 0 }),
      restoreBatch: () => Promise.resolve([]),
      activities: [
        { id: 'a', version: 1 },
        { id: 'b', version: 1 },
        { id: 'c', version: 1 },
      ],
      deleteBatchId: 'b',
    });
    expect(command.label).toBe('Delete 3 activities');
  });
});
