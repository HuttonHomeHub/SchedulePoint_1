import { describe, expect, it } from 'vitest';

import { dissolveCommand } from './commands';
import { historyResultMessage } from './history-result';
import { notApplicable, ReplayFailure } from './replay';

import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

/**
 * **Undoing a dissolve** (undo-redo M6), under ADR-0176.
 *
 * A dissolve promotes every child and deletes the summary; `restore-batch` brings back only the
 * summary, so the inverse is a restore followed by one `parentId`-only re-file. The fake server
 * enforces the optimistic lock and stamps a NEW batch on every dissolve, which is what the
 * rethread assertion needs: a redo that reused the first batch id would restore nothing.
 */
const SUMMARY = anActivity({ id: 's1', name: 'Substructure', type: 'WBS_SUMMARY' });
const KIDS = [
  anActivity({ id: 'c1', name: 'Excavate', parentId: 's1' }),
  anActivity({ id: 'c2', name: 'Pour slab', parentId: 's1' }),
];

/** Dissolve on the fake server first, as the dialog does, then record what it answered. */
async function dissolved(kids = KIDS) {
  const server = fakePlanServer({ activities: [SUMMARY, ...kids] });
  const result = await server.mutations.dissolve('s1');
  const command = dissolveCommand({
    summary: SUMMARY,
    result,
    childNames: new Map(kids.map((k) => [k.id, k.name])),
    restoreBatch: server.mutations.restoreBatch,
    dissolve: server.mutations.dissolve,
    updateParents: server.mutations.updateParents,
  });
  return { server, command };
}

describe('dissolveCommand', () => {
  it('undo brings the same summary back and files every child under it again', async () => {
    const { server, command } = await dissolved();
    expect(server.activities.has('s1')).toBe(false);
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.restoreBatch).toHaveBeenCalledExactlyOnceWith({
      deleteBatchId: 'batch-1',
    });
    expect(server.row('s1').name).toBe('Substructure');
    expect(server.row('c1').parentId).toBe('s1');
    expect(server.row('c2').parentId).toBe('s1');
  });

  it('writes only parentId, at the versions the children hold now', async () => {
    const { server, command } = await dissolved();
    // A colleague's edit to a field the step never wrote: the undo still applies, at the newer version.
    server.edit('c1', { percentComplete: 10 });
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.updateParents).toHaveBeenCalledExactlyOnceWith({
      parents: [
        { id: 'c1', parentId: 's1', version: 3 },
        { id: 'c2', parentId: 's1', version: 2 },
      ],
    });
    expect(server.row('c1').percentComplete).toBe(10);
  });

  it('redo dissolves again, and the undo after it restores the NEW batch', async () => {
    const { server, command } = await dissolved();
    await command.undo(server.ctx);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.activities.has('s1')).toBe(false);
    expect(server.row('c1').parentId).toBeNull();
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.restoreBatch).toHaveBeenLastCalledWith({ deleteBatchId: 'batch-2' });
    expect(server.row('c2').parentId).toBe('s1');
  });

  it('a child a colleague moved sets the step aside BEFORE anything is written', async () => {
    const { server, command } = await dissolved();
    server.edit('c2', { parentId: 'elsewhere' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Pour slab'));
    // Restoring the summary and then refusing to file its work would leave a half-undone grouping.
    expect(server.mutations.restoreBatch).not.toHaveBeenCalled();
    expect(server.mutations.updateParents).not.toHaveBeenCalled();
    expect(server.activities.has('s1')).toBe(false);
  });

  it('a child deleted since sets the step aside as gone', async () => {
    const { server, command } = await dissolved();
    server.remove('c1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
    expect(server.mutations.restoreBatch).not.toHaveBeenCalled();
  });

  it('restore succeeds but the re-file is refused: the summary is left and the words say so', async () => {
    const { server, command } = await dissolved();
    server.mutations.updateParents.mockRejectedValueOnce(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'The record changed.' }),
    );
    expect(await command.undo(server.ctx)).toEqual(notApplicable('unfiled', 'Substructure'));
    // Visible and harmless: the summary is back, empty.
    expect(server.activities.has('s1')).toBe(true);
    expect(server.row('c1').parentId).toBeNull();
    expect(
      historyResultMessage({
        direction: 'undo',
        outcome: 'set-aside',
        label: command.label,
        setAside: { reason: 'unfiled', subjectName: 'Substructure', nextLabel: null },
      }),
    ).toContain('“Substructure” is back, but its activities could not be moved back under it');
  });

  it('a transport failure on the re-file says the children were not moved, and a retry only re-files', async () => {
    const { server, command } = await dissolved();
    server.mutations.updateParents.mockRejectedValueOnce(new Error('network'));
    const failure = await command.undo(server.ctx).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ReplayFailure);
    expect((failure as ReplayFailure).detail).toContain('not moved back under it');
    expect(server.activities.has('s1')).toBe(true);

    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.restoreBatch).toHaveBeenCalledTimes(1);
    expect(server.row('c1').parentId).toBe('s1');
  });

  it('a restore the server refuses because the phase above is deleted writes nothing', async () => {
    const { server, command } = await dissolved();
    server.mutations.restoreBatch.mockRejectedValueOnce(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'The record changed.',
        details: { reason: 'PARENT_DELETED' },
      }),
    );
    expect(await command.undo(server.ctx)).toEqual(notApplicable('parent-deleted', 'Substructure'));
    expect(server.mutations.updateParents).not.toHaveBeenCalled();
  });

  it('a summary that held nothing is restored and nothing is re-filed', async () => {
    const { server, command } = await dissolved([]);
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.activities.has('s1')).toBe(true);
    expect(server.mutations.updateParents).not.toHaveBeenCalled();
  });

  it('redo is refused when somebody filed work under the restored summary', async () => {
    const { server, command } = await dissolved();
    await command.undo(server.ctx);
    server.activities.set('c9', anActivity({ id: 'c9', name: 'Backfill', parentId: 's1' }));
    expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Backfill'));
    // A dissolve would have promoted a colleague's activity out of the phase with the planner's.
    expect(server.mutations.dissolve).toHaveBeenCalledTimes(1);
  });

  it('redo is refused when the summary itself was edited', async () => {
    const { server, command } = await dissolved();
    await command.undo(server.ctx);
    server.edit('s1', { name: 'Foundations' });
    expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Substructure'));
    expect(server.mutations.dissolve).toHaveBeenCalledTimes(1);
  });

  it('is named for what it removed', async () => {
    expect((await dissolved()).command.label).toBe('Dissolve “Substructure”');
  });
});
