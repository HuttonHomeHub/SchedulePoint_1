import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { pasteActivitiesCommand } from './commands';

/**
 * **The paste inverse** (`docs/specs/activity-copy-paste/` M1-T1).
 *
 * The assertion that carries the design is `redo restores the batch rather than re-creating` — the
 * plan specified the opposite, and re-creating would bring the clone bars back without the links
 * *between* them, which is the ADR-0063/W4 CQ-4 failure one gesture along. It looks correct on
 * screen: the right number of bars, in the right lanes, with the logic quietly gone.
 *
 * The idempotence pair matters because `usePlanEditHistory` can call an inverse twice when a
 * conflict is being resolved, and a double-delete would 409 on rows that are already gone.
 */

function restored(id: string, version: number): ActivitySummary {
  // Only the two fields the command reads; the rest of ActivitySummary is irrelevant here and
  // spelling it out would make this file about the type rather than about the inverse.
  return { id, version } as unknown as ActivitySummary;
}

function harness(
  created = [
    { id: 'c1', version: 1 },
    { id: 'c2', version: 1 },
  ],
) {
  const bulkDelete = vi.fn(() =>
    Promise.resolve({
      deleteBatchId: 'batch-1',
      activityCount: created.length,
      dependencyCount: 1,
    }),
  );
  const restoreBatch = vi.fn(() =>
    Promise.resolve(created.map((c) => restored(c.id, c.version + 1))),
  );
  const command = pasteActivitiesCommand({
    created,
    bulkDelete,
    restoreBatch,
    label: 'Duplicate “Excavate”',
  });
  return { command, bulkDelete, restoreBatch };
}

describe('pasteActivitiesCommand', () => {
  it('undo deletes every clone as ONE batch', async () => {
    const { command, bulkDelete } = harness();
    await command.undo();
    expect(bulkDelete).toHaveBeenCalledTimes(1);
    expect(bulkDelete).toHaveBeenCalledWith({
      activities: [
        { id: 'c1', version: 1 },
        { id: 'c2', version: 1 },
      ],
    });
  });

  it('undo twice is a no-op — it cannot double-delete', async () => {
    const { command, bulkDelete } = harness();
    await command.undo();
    await command.undo();
    expect(bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('redo restores the batch rather than re-creating — so the links between clones survive', async () => {
    const { command, restoreBatch } = harness();
    await command.undo();
    await command.redo();
    // The whole point: re-creating would restore the activities and NOT the internal edges.
    expect(restoreBatch).toHaveBeenCalledWith({ deleteBatchId: 'batch-1' });
  });

  it('redo twice is a no-op — it cannot double-create', async () => {
    const { command, restoreBatch } = harness();
    await command.undo();
    await command.redo();
    await command.redo();
    expect(restoreBatch).toHaveBeenCalledTimes(1);
  });

  it('threads the restored versions forward, so a second undo does not 409', async () => {
    const { command, bulkDelete } = harness();
    await command.undo();
    await command.redo(); // the restore bumps every row's version to 2
    await command.undo();
    expect(bulkDelete).toHaveBeenLastCalledWith({
      activities: [
        { id: 'c1', version: 2 },
        { id: 'c2', version: 2 },
      ],
    });
  });

  it('a redo before any undo does nothing, and needs no compose-from-inputs path', async () => {
    // `usePlanEditHistory` only ever feeds the redo stack from an undo, so this state is not
    // reachable through the product. A compose-from-inputs fallback was written for it and removed:
    // it could not be exercised by any test, which is the definition of the branch that rots.
    // Pinned rather than deleted, so re-adding one is a visible decision.
    const { command, restoreBatch, bulkDelete } = harness();
    await command.redo();
    expect(restoreBatch).not.toHaveBeenCalled();
    expect(bulkDelete).not.toHaveBeenCalled();
    // …and the command is still usable afterwards: the no-op did not corrupt the state.
    await command.undo();
    expect(bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('leaves the state untouched when the delete rejects, so the stacks stay honest', async () => {
    const bulkDelete = vi.fn(() => Promise.reject(new Error('423')));
    const command = pasteActivitiesCommand({
      created: [{ id: 'c1', version: 1 }],
      bulkDelete,
      restoreBatch: vi.fn(() => Promise.resolve([])),
      label: 'Duplicate “Excavate”',
    });
    await expect(command.undo()).rejects.toThrow('423');
    // Still present: a second undo must retry the delete, not skip it as though it had happened.
    await expect(command.undo()).rejects.toThrow('423');
    expect(bulkDelete).toHaveBeenCalledTimes(2);
  });

  it('carries a concrete label rather than a generic one', () => {
    const { command } = harness();
    expect(command.label).toBe('Duplicate “Excavate”');
  });
});
