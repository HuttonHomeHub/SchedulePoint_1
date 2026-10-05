import { describe, expect, it, vi } from 'vitest';

import { pasteActivitiesCommand } from './commands';
import { notApplicable } from './replay';

import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

/**
 * **The paste inverse** (`docs/specs/activity-copy-paste/` M1-T1), under ADR-0176.
 *
 * The assertion that carries the design is `redo restores the batch rather than re-creating` — the
 * plan specified the opposite, and re-creating would bring the clone bars back without the links
 * *between* them, which is the ADR-0063/W4 CQ-4 failure one gesture along. It looks correct on
 * screen: the right number of bars, in the right lanes, with the logic quietly gone.
 *
 * The idempotence pair matters because a retried replay (a transport failure leaves the step on top)
 * can call an inverse twice, and a double-delete would 409 on rows that are already gone.
 */
const CLONES = [
  { id: 'c1', name: 'Excavate' },
  { id: 'c2', name: 'Pour' },
];

function harness(created = CLONES) {
  const server = fakePlanServer({
    activities: created.map((c) => anActivity({ id: c.id, name: c.name })),
  });
  const command = pasteActivitiesCommand({
    created,
    roots: created,
    deleteActivity: server.mutations.deleteActivity,
    bulkDelete: server.mutations.bulkDelete,
    restoreBatch: server.mutations.restoreBatch,
    label: 'Duplicate “Excavate”',
  });
  return { server, command };
}

describe('pasteActivitiesCommand', () => {
  it('undo deletes every clone as ONE batch, at the rows’ current versions', async () => {
    const { server, command } = harness();
    server.edit('c1', { description: 'edited elsewhere' });
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.bulkDelete).toHaveBeenCalledExactlyOnceWith({
      activities: [
        { id: 'c1', version: 2 },
        { id: 'c2', version: 1 },
      ],
    });
  });

  it('undo twice is a no-op — it cannot double-delete', async () => {
    const { server, command } = harness();
    await command.undo(server.ctx);
    await command.undo(server.ctx);
    expect(server.mutations.bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('redo restores the batch rather than re-creating — so the links between clones survive', async () => {
    const { server, command } = harness();
    await command.undo(server.ctx);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    // The whole point: re-creating would restore the activities and NOT the internal edges.
    expect(server.mutations.restoreBatch).toHaveBeenCalledWith({ deleteBatchId: 'batch-1' });
    expect(server.activities.size).toBe(2);
  });

  it('redo twice is a no-op — it cannot double-restore', async () => {
    const { server, command } = harness();
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    await command.redo(server.ctx);
    expect(server.mutations.restoreBatch).toHaveBeenCalledTimes(1);
  });

  it('a second undo deletes at the versions the restore left, so it does not 409', async () => {
    const { server, command } = harness();
    await command.undo(server.ctx);
    await command.redo(server.ctx); // the restore bumps every row's version to 2
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.bulkDelete).toHaveBeenLastCalledWith({
      activities: [
        { id: 'c1', version: 2 },
        { id: 'c2', version: 2 },
      ],
    });
  });

  it('one clone deleted by somebody else sets the whole step aside — nothing is half-undone', async () => {
    const { server, command } = harness();
    server.remove('c2');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Pour'));
    expect(server.mutations.bulkDelete).not.toHaveBeenCalled();
    expect(server.activities.has('c1')).toBe(true);
  });

  it('a redo before any undo does nothing, and needs no compose-from-inputs path', async () => {
    // The history only ever feeds the redo stack from an undo, so this state is not reachable
    // through the product. A compose-from-inputs fallback was written for it and removed: it could
    // not be exercised by any test, which is the definition of the branch that rots.
    const { server, command } = harness();
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.restoreBatch).not.toHaveBeenCalled();
    // …and the command is still usable afterwards: the no-op did not corrupt the state.
    await command.undo(server.ctx);
    expect(server.mutations.bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('leaves the state untouched when the delete rejects, so the stacks stay honest', async () => {
    const { server, command } = harness();
    server.mutations.bulkDelete.mockRejectedValueOnce(new Error('network'));
    await expect(command.undo(server.ctx)).rejects.toThrow('network');
    // Still present: a retry must run the delete, not skip it as though it had happened.
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.bulkDelete).toHaveBeenCalledTimes(2);
  });

  it('carries a concrete label rather than a generic one', () => {
    expect(harness().command.label).toBe('Duplicate “Excavate”');
  });
});

describe('pasteActivitiesCommand — a band, where the set is not flat', () => {
  function band() {
    const created = [{ id: 'summary', name: 'Level 2' }, { id: 'child-1' }, { id: 'child-2' }];
    const server = fakePlanServer({
      activities: created.map((c) => anActivity({ id: c.id, name: c.name ?? c.id })),
    });
    // `bulkDelete` refuses any batch containing a WBS_SUMMARY (422 SUMMARY_NOT_BULK_ELIGIBLE,
    // `activities.service.ts:1277-1281`) — deliberately, because deleting one cascades. A mocked
    // delete accepts any batch, which is why the failing case is made explicit here.
    const bulkDelete = vi.fn(() => Promise.reject(new Error('SUMMARY_NOT_BULK_ELIGIBLE')));
    const command = pasteActivitiesCommand({
      created,
      roots: [{ id: 'summary', name: 'Level 2' }],
      deleteActivity: server.mutations.deleteActivity,
      bulkDelete,
      restoreBatch: server.mutations.restoreBatch,
      label: 'Duplicate band “Level 2”',
    });
    return { server, command, bulkDelete };
  }

  it('deletes the ROOT and lets the cascade take the subtree, never a batch', async () => {
    const { server, command, bulkDelete } = band();
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.deleteActivity).toHaveBeenCalledExactlyOnceWith('summary');
    expect(bulkDelete).not.toHaveBeenCalled();
  });

  it('redoes through the batch id the cascade delete returns (TECH_DEBT #113)', async () => {
    const { server, command } = band();
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    // The id the DELETE returned, not a bulk one — the band path never touches `bulkDelete`.
    expect(server.mutations.restoreBatch).toHaveBeenCalledExactlyOnceWith({
      deleteBatchId: 'batch-1',
    });
  });

  it('a child deleted since sets the step aside, deleting nothing', async () => {
    const { server, command } = band();
    server.remove('child-2');
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
  });
});
