import { describe, expect, it, vi } from 'vitest';

import {
  createActivityCommand,
  deleteActivityCommand,
  dependencyAddCommand,
  dissolveCommand,
  type DeleteActivityFn,
  type DeleteDependencyFn,
  type DissolveSummaryFn,
} from './commands';
import { assignmentRemoveCommand } from './record-commands';
import { notApplicable } from './replay';

import { anActivity } from '@/test/activity-fixture';
import { aDependency, anAssignment, fakePlanServer } from '@/test/fake-plan-server';

/**
 * **A replay's delete names the version its check read** (`docs/TECH_DEBT.md` #450, ADR-0176).
 *
 * The check and the delete are two round trips, and a colleague's write can land between them: the
 * delete would then destroy that write, and everything cascaded from it, unseen. Every case here
 * injects exactly that write into the window (a wrapper that edits the row, then calls the server's
 * delete) and expects the server's `STALE_VERSION` 409 to read as "changed" with the row still there.
 * The fake server enforces the guard only when a version arrives, as the API does, so a delete that
 * dropped the version would delete the row and fail these.
 */
const A = (id: string, name: string, overrides = {}) => anActivity({ id, name, ...overrides });

describe('a replay deletes at the version it read', () => {
  it('activity: a write in the window sets the redo of a delete aside and deletes nothing', async () => {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const { deleteBatchId } = await server.mutations.deleteActivity('a1');
    const raced = vi.fn<DeleteActivityFn>((input) => {
      server.edit('a1', { name: 'Excavate (colleague)' });
      return server.mutations.deleteActivity(input);
    });
    const command = deleteActivityCommand({
      activity: A('a1', 'Excavate'),
      deleteBatchId,
      restoreBatch: server.mutations.restoreBatch,
      deleteActivity: raced,
    });
    await command.undo(server.ctx);
    const versionAtCheck = server.row('a1').version;

    // The check passes on the state it expects; the colleague's rename then lands before the delete.
    const result = await command.redo(server.ctx);

    expect(raced).toHaveBeenCalledExactlyOnceWith({
      activityId: 'a1',
      version: versionAtCheck,
    });
    expect(result).toEqual(notApplicable('changed', 'Excavate'));
    expect(server.activities.has('a1')).toBe(true);
  });

  it('activity create: undo is refused the same way', async () => {
    const server = fakePlanServer({ activities: [A('a1', 'Foundations')] });
    const raced = vi.fn<DeleteActivityFn>((input) => {
      server.edit('a1', { percentComplete: 5 });
      return server.mutations.deleteActivity(input);
    });
    const command = createActivityCommand({
      created: server.row('a1'),
      deleteActivity: raced,
      restoreBatch: server.mutations.restoreBatch,
    });

    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Foundations'));
    expect(raced.mock.calls[0]?.[0]).toMatchObject({ activityId: 'a1', version: 1 });
    expect(server.activities.has('a1')).toBe(true);
  });

  it('dependency: a write in the window sets the undo of an add aside and keeps the link', async () => {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate'), A('a2', 'Pour')],
      dependencies: [aDependency({ id: 'd1' })],
    });
    const raced = vi.fn<DeleteDependencyFn>((input) => {
      server.editDependency('d1', { lagMinutes: 120 });
      return server.mutations.deleteDependency(input);
    });
    const command = dependencyAddCommand({
      dependency: server.link('d1')!,
      createDependency: server.mutations.createDependency,
      deleteDependency: raced,
    });

    const result = await command.undo(server.ctx);

    expect(raced).toHaveBeenCalledExactlyOnceWith({ dependencyId: 'd1', version: 1 });
    expect(result).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(server.dependencies.has('d1')).toBe(true);
  });

  it('assignment: a write in the window sets the redo of an unassign aside and keeps the row', async () => {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate')],
      assignments: [anAssignment({ id: 'as1', resourceId: 'r1' })],
    });
    const gone = anAssignment({ id: 'as1', resourceId: 'r1' });
    await server.mutations.deleteAssignment({ assignmentId: 'as1', activityId: 'a1' });
    server.mutations.deleteAssignment.mockClear();
    const raced = vi.fn((input: Parameters<typeof server.mutations.deleteAssignment>[0]) => {
      const live = [...server.assignments.values()].find((a) => a.resourceId === 'r1')!;
      server.editAssignment(live.id, { actualCost: 7 });
      return server.mutations.deleteAssignment(input);
    });
    const command = assignmentRemoveCommand({
      assignment: gone,
      resourceName: 'Digger',
      activityName: 'Excavate',
      writes: {
        createAssignment: server.mutations.createAssignment,
        updateAssignment: server.mutations.updateAssignment,
        deleteAssignment: raced,
      },
    });
    await command.undo(server.ctx);

    const result = await command.redo(server.ctx);

    expect(raced.mock.calls[0]?.[0]).toMatchObject({ activityId: 'a1', version: 1 });
    expect(result).toEqual(notApplicable('changed', 'Digger'));
    expect([...server.assignments.values()].some((a) => a.resourceId === 'r1')).toBe(true);
  });

  it('dissolve: a write to the restored summary in the window sets the redo aside', async () => {
    const summary = A('s1', 'Substructure', { type: 'WBS_SUMMARY' });
    const kids = [A('c1', 'Excavate', { parentId: 's1' })];
    const server = fakePlanServer({ activities: [summary, ...kids] });
    const result = await server.mutations.dissolve('s1');
    const raced = vi.fn<DissolveSummaryFn>((input) => {
      server.edit('s1', { percentComplete: 5 });
      return server.mutations.dissolve(input);
    });
    const command = dissolveCommand({
      summary,
      result,
      childNames: new Map([['c1', 'Excavate']]),
      restoreBatch: server.mutations.restoreBatch,
      dissolve: raced,
      updateParents: server.mutations.updateParents,
    });
    await command.undo(server.ctx);

    const redo = await command.redo(server.ctx);

    expect(raced.mock.calls[0]?.[0]).toMatchObject({ activityId: 's1' });
    expect(redo).toEqual(notApplicable('changed', 'Substructure'));
    expect(server.activities.has('s1')).toBe(true);
    expect(server.row('c1').parentId).toBe('s1');
  });
});
