import { describe, expect, it } from 'vitest';

import { bulkDeleteCommand, bulkPlacementCommand } from './commands';
import { notApplicable } from './replay';

import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

/**
 * The two bulk commands (`docs/specs/canvas-multi-select/` M4-T3 / M4-T4), under ADR-0176.
 *
 * What both are really about is **the row's current version**. A command's inverse runs minutes after
 * the write it inverts, against rows whose `version` that write — or somebody else's — bumped, so a
 * command that remembers the versions it was built with is a guaranteed 409 the second time it is
 * used. A replay now reads each row first and writes at the version it holds, and the fake server
 * refuses any other.
 */
const A = (id: string, name: string) => anActivity({ id, name });
const APPLIED = { kind: 'applied' } as const;

describe('bulkPlacementCommand — what the batch carries', () => {
  const placement = (id: string, laneIndex: number | null) => ({
    id,
    constraintType: null,
    constraintDate: null,
    visualStart: '2026-03-02',
    laneIndex,
  });

  it('sends every field of every row — a complete-row batch, never a partial', async () => {
    const server = fakePlanServer({
      activities: [anActivity({ id: 'a', name: 'One', visualStart: '2026-03-02' })],
    });
    await bulkPlacementCommand({
      batchPlacements: server.mutations.batchPlacements,
      before: [{ ...placement('a', null), visualStart: null }],
      after: [placement('a', null)],
      saved: [server.row('a')],
    }).undo(server.ctx);
    // Nulls are sent, not omitted: the DTO refuses an absent field rather than defaulting it, so a
    // command that dropped its nulls would fail validation rather than silently unpin a constraint.
    expect(server.mutations.batchPlacements.mock.calls[0]?.[0].placements[0]).toEqual({
      id: 'a',
      version: 1,
      constraintType: null,
      constraintDate: null,
      visualStart: null,
      laneIndex: null,
    });
  });

  it('carries no coalescing descriptor', () => {
    const command = bulkPlacementCommand({
      batchPlacements: () => Promise.resolve([]),
      before: [],
      after: [],
      saved: [],
    });
    // Stated as a test rather than left to the absence of a field: merging two bulk moves would
    // produce an undo that restores the union of two different selections — a state nobody was
    // ever in, reached by pressing undo once.
    expect(command).not.toHaveProperty('coalescing');
  });
});

describe('bulkDeleteCommand', () => {
  async function swept() {
    const server = fakePlanServer({ activities: [A('a', 'One'), A('b', 'Two')] });
    const result = await server.mutations.bulkDelete({
      activities: [
        { id: 'a', version: 1 },
        { id: 'b', version: 1 },
      ],
    });
    server.mutations.bulkDelete.mockClear();
    const command = bulkDeleteCommand({
      bulkDelete: server.mutations.bulkDelete,
      restoreBatch: server.mutations.restoreBatch,
      activities: [
        { id: 'a', name: 'One' },
        { id: 'b', name: 'Two' },
      ],
      deleteBatchId: result.deleteBatchId,
    });
    return { server, command };
  }

  it('names every deleted activity as a subject', async () => {
    const { command } = await swept();
    expect(command.subjects).toEqual(['a', 'b']);
  });

  it('undo restores the BATCH — one call, not one per activity', async () => {
    const { server, command } = await swept();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.restoreBatch).toHaveBeenCalledExactlyOnceWith({
      deleteBatchId: 'batch-1',
    });
    expect(server.activities.size).toBe(2);
  });

  it('redo deletes at the versions the restore left, and re-threads the batch id', async () => {
    const { server, command } = await swept();
    await command.undo(server.ctx);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    // The restore bumped both rows to version 2; sending the first delete's version 1 would 409.
    expect(server.mutations.bulkDelete).toHaveBeenCalledExactlyOnceWith({
      activities: [
        { id: 'a', version: 2 },
        { id: 'b', version: 2 },
      ],
    });
    // The redo deleted again, which produced a NEW batch. Reusing `batch-1` here would restore
    // nothing at all and report success, which is the worst available failure.
    await command.undo(server.ctx);
    expect(server.mutations.restoreBatch).toHaveBeenLastCalledWith({ deleteBatchId: 'batch-2' });
  });

  it('a redo with one row deleted by somebody else is set aside whole, deleting nothing', async () => {
    const { server, command } = await swept();
    await command.undo(server.ctx);
    server.remove('b');
    expect(await command.redo(server.ctx)).toEqual(notApplicable('gone', 'Two'));
    expect(server.mutations.bulkDelete).not.toHaveBeenCalled();
    expect(server.activities.has('a')).toBe(true);
  });

  it('a non-API failure is thrown, so the step stays on top for a retry', async () => {
    const { server, command } = await swept();
    server.mutations.restoreBatch.mockImplementationOnce(() => {
      throw new (class extends Error {})('not an API error');
    });
    await expect(command.undo(server.ctx)).rejects.toThrow('not an API error');
  });

  it('names the count, so the undo entry says what it will bring back', async () => {
    const { command } = await swept();
    expect(command.label).toBe('Delete 2 activities');
  });
});
