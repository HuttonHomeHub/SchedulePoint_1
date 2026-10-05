import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  bulkDeleteCommand,
  bulkPlacementCommand,
  createActivityCommand,
  createLoeSpanCommand,
  deleteActivityCommand,
  linkChainCommand,
  pasteActivitiesCommand,
} from './commands';
import { notApplicable } from './replay';

import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { aDependency, fakePlanServer } from '@/test/fake-plan-server';

/**
 * **A step that deletes must not delete what somebody else changed** (ADR-0176, review B1/B2).
 *
 * "The row still exists" is not a safe test for a delete: it cascades, so a colleague's later edit,
 * link or child filed under the row would be destroyed with it, and the version a delete sends is the
 * one it has just read — so the optimistic lock cannot object. Every step that deletes therefore
 * compares the definition it left, and refuses a link (or a child) it did not put there.
 */

const A = (id: string, name: string, overrides: Partial<ActivitySummary> = {}) =>
  anActivity({ id, name, ...overrides });
const APPLIED = { kind: 'applied' } as const;

/** A colleague links `from → to` through the API: nothing on this client recorded it. */
async function colleagueLinks(server: ReturnType<typeof fakePlanServer>, from: string, to: string) {
  await server.mutations.createDependency({
    planId: 'p1',
    predecessorId: from,
    successorId: to,
    type: 'FS',
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
  });
}

describe('createActivityCommand — undo deletes only what the planner made', () => {
  function drawn() {
    const server = fakePlanServer({ activities: [A('a1', 'Foundations'), A('other', 'Other')] });
    const command = createActivityCommand({
      created: server.row('a1'),
      deleteActivity: server.mutations.deleteActivity,
      restoreBatch: server.mutations.restoreBatch,
    });
    return { server, command };
  }

  it('a colleague’s edit to the new activity sets the step aside; nothing is deleted', async () => {
    const { server, command } = drawn();
    server.edit('a1', { name: 'Footings' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Foundations'));
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
    expect(server.activities.has('a1')).toBe(true);
  });

  it('a link a colleague added to it sets the step aside — the cascade would take their logic', async () => {
    const { server, command } = drawn();
    await colleagueLinks(server, 'other', 'a1');
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
    expect(server.dependencies.size).toBe(1);
  });

  it('a field no step wrote does not stop it', async () => {
    const { server, command } = drawn();
    server.edit('a1', { percentComplete: 20 });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('after a redo restores it, the next undo expects the restored definition', async () => {
    const { server, command } = drawn();
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    server.edit('a1', { description: 'Their note' });
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteActivity).toHaveBeenCalledOnce();
  });
});

describe('deleteActivityCommand — redo deletes only what the restore brought back', () => {
  /** A bar with one link, deleted (taking the link), then restored by the undo. */
  async function restored() {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate'), A('a2', 'Pour'), A('other', 'Other')],
      dependencies: [aDependency()],
    });
    const activity = server.row('a1');
    const { deleteBatchId } = await server.mutations.deleteActivity('a1');
    server.mutations.deleteActivity.mockClear();
    const command = deleteActivityCommand({
      activity,
      deleteBatchId,
      restoreBatch: server.mutations.restoreBatch,
      deleteActivity: server.mutations.deleteActivity,
    });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    return { server, command };
  }

  it('its own restored link does not stop it', async () => {
    const { server, command } = await restored();
    expect(server.dependencies.size).toBe(1);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.deleteActivity).toHaveBeenCalledOnce();
  });

  it('a colleague’s edit after the restore sets the step aside', async () => {
    const { server, command } = await restored();
    server.edit('a1', { name: 'Dig' });
    expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Excavate'));
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
  });

  it('a colleague’s new link sets the step aside', async () => {
    const { server, command } = await restored();
    await colleagueLinks(server, 'other', 'a1');
    expect((await command.redo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
  });

  it('a child a colleague filed under a restored summary sets the step aside', async () => {
    const server = fakePlanServer({
      activities: [
        A('s', 'Phase', { type: 'WBS_SUMMARY', durationMinutes: 0 }),
        A('c', 'Work', { parentId: 's' }),
      ],
    });
    const summary = server.row('s');
    const { deleteBatchId } = await server.mutations.deleteActivity('s');
    const command = deleteActivityCommand({
      activity: summary,
      deleteBatchId,
      restoreBatch: server.mutations.restoreBatch,
      deleteActivity: server.mutations.deleteActivity,
    });
    await command.undo(server.ctx);
    server.activities.set('new', A('new', 'Their work', { parentId: 's' }));
    expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Their work'));
  });

  it('a restored subtree redoes as a whole when nothing changed', async () => {
    const server = fakePlanServer({
      activities: [
        A('s', 'Phase', { type: 'WBS_SUMMARY', durationMinutes: 0 }),
        A('c', 'Work', { parentId: 's' }),
      ],
    });
    const summary = server.row('s');
    const { deleteBatchId } = await server.mutations.deleteActivity('s');
    const command = deleteActivityCommand({
      activity: summary,
      deleteBatchId,
      restoreBatch: server.mutations.restoreBatch,
      deleteActivity: server.mutations.deleteActivity,
    });
    await command.undo(server.ctx);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.activities.size).toBe(0);
  });
});

describe('bulkDeleteCommand — redo no longer goes straight through an edit', () => {
  async function restored() {
    const server = fakePlanServer({
      activities: [A('a', 'One'), A('b', 'Two'), A('other', 'Other')],
    });
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
    await command.undo(server.ctx);
    return { server, command };
  }

  it('a colleague’s edit to one restored row sets the whole step aside', async () => {
    const { server, command } = await restored();
    server.edit('b', { name: 'Deuce' });
    expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Two'));
    expect(server.mutations.bulkDelete).not.toHaveBeenCalled();
    expect(server.activities.has('a')).toBe(true);
  });

  it('a colleague’s link to one restored row sets the whole step aside', async () => {
    const { server, command } = await restored();
    await colleagueLinks(server, 'other', 'a');
    expect((await command.redo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.bulkDelete).not.toHaveBeenCalled();
  });

  it('an untouched set redoes, at the versions it now holds', async () => {
    const { server, command } = await restored();
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.bulkDelete).toHaveBeenCalledExactlyOnceWith({
      activities: [
        { id: 'a', version: 2 },
        { id: 'b', version: 2 },
      ],
    });
  });
});

describe('pasteActivitiesCommand — undo deletes only the copy', () => {
  function pasted() {
    const created = [A('c1', 'Excavate'), A('c2', 'Pour')];
    const server = fakePlanServer({
      activities: [...created, A('other', 'Other')],
      dependencies: [
        aDependency({
          id: 'inside',
          predecessor: { id: 'c1', code: null, name: 'Excavate' },
          successor: { id: 'c2', code: null, name: 'Pour' },
        }),
      ],
    });
    const command = pasteActivitiesCommand({
      created,
      roots: created,
      deleteActivity: server.mutations.deleteActivity,
      bulkDelete: server.mutations.bulkDelete,
      restoreBatch: server.mutations.restoreBatch,
      label: 'Copy 2 activities',
    });
    return { server, command };
  }

  it('the links between the clones are the copy’s own and do not stop it', async () => {
    const { server, command } = pasted();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('a colleague’s edit to a clone sets the whole step aside', async () => {
    const { server, command } = pasted();
    server.edit('c2', { name: 'Pour slab' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Pour'));
    expect(server.mutations.bulkDelete).not.toHaveBeenCalled();
  });

  it('a link from a clone to anything outside the copy sets the step aside', async () => {
    const { server, command } = pasted();
    await colleagueLinks(server, 'c1', 'other');
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.bulkDelete).not.toHaveBeenCalled();
  });

  it('a clone’s duration is not compared — carrying its resources recomputes it after the save', async () => {
    const { server, command } = pasted();
    server.edit('c1', { durationMinutes: 960 });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });
});

describe('createLoeSpanCommand', () => {
  function composed(failOn?: 'ss' | 'ff') {
    const server = fakePlanServer({
      activities: [A('a1', 'Start'), A('a2', 'Finish'), A('loe', 'Level of effort')],
      dependencies: [
        aDependency({
          id: 'ss',
          type: 'SS',
          predecessor: { id: 'a1', code: null, name: 'Start' },
          successor: { id: 'loe', code: null, name: 'Level of effort' },
        }),
        aDependency({
          id: 'ff',
          type: 'FF',
          predecessor: { id: 'loe', code: null, name: 'Level of effort' },
          successor: { id: 'a2', code: null, name: 'Finish' },
        }),
      ],
    });
    let made = 0;
    const createPlaced = vi.fn(() => {
      made += 1;
      const id = `loe${made}`;
      server.activities.set(id, A(id, 'Level of effort'));
      return Promise.resolve(server.row(id));
    });
    const createDependency = vi.fn(
      (input: Parameters<typeof server.mutations.createDependency>[0]) => {
        if ((failOn === 'ss' && input.type === 'SS') || (failOn === 'ff' && input.type === 'FF')) {
          return Promise.reject(new Error('network'));
        }
        return server.mutations.createDependency(input);
      },
    );
    const command = createLoeSpanCommand({
      loe: server.row('loe'),
      placedInput: {
        name: 'Level of effort',
        type: 'LEVEL_OF_EFFORT',
        durationDays: 0,
        laneIndex: 0,
      },
      planId: 'p1',
      startDriverId: 'a1',
      finishDriverId: 'a2',
      createPlaced,
      createDependency,
      deleteActivity: server.mutations.deleteActivity,
    });
    return { server, command, createPlaced, createDependency };
  }

  it('undo with only the span’s own two edges on the LOE applies', async () => {
    const { server, command } = composed();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('a colleague’s edit to the LOE sets the step aside; nothing is deleted', async () => {
    const { server, command } = composed();
    server.edit('loe', { name: 'Supervision' });
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
  });

  it('a link a colleague added to the LOE sets the step aside', async () => {
    const { server, command } = composed();
    await colleagueLinks(server, 'a1', 'loe');
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
  });

  it('B2: a redo whose edge create fails removes the new LOE, and a retry composes the whole span', async () => {
    const { server, command, createPlaced } = composed('ff');
    await command.undo(server.ctx);
    await expect(command.redo(server.ctx)).rejects.toThrow('network');
    // The half-built LOE is gone — no orphan with one edge.
    expect(server.activities.has('loe1')).toBe(false);
    expect(server.dependencies.size).toBe(0);
    // And the step is still undone, so the retry is not reported as done with the logic missing.
    const retry = composed();
    await retry.command.undo(retry.server.ctx);
    expect(await retry.command.redo(retry.server.ctx)).toEqual(APPLIED);
    expect(retry.server.dependencies.size).toBe(2);
    expect(createPlaced).toHaveBeenCalledOnce();
  });

  it('B2: after a failed redo, a second redo runs again instead of returning applied', async () => {
    const { server, command, createPlaced, createDependency } = composed('ss');
    await command.undo(server.ctx);
    await expect(command.redo(server.ctx)).rejects.toThrow('network');
    createDependency.mockImplementation(server.mutations.createDependency);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(createPlaced).toHaveBeenCalledTimes(2);
    expect(server.dependencies.size).toBe(2);
  });
});

describe('bulkPlacementCommand — a written lane is always compared', () => {
  it('a step that wrote a lane sets aside when the lane has moved since', async () => {
    const server = fakePlanServer({ activities: [A('a1', 'One', { laneIndex: 0 })] });
    const placement = (laneIndex: number) => ({
      id: 'a1',
      constraintType: null,
      constraintDate: null,
      visualStart: null,
      laneIndex,
    });
    const saved = await server.mutations.batchPlacements({
      placements: [{ ...placement(3), version: 1 }],
    });
    const command = bulkPlacementCommand({
      batchPlacements: server.mutations.batchPlacements,
      before: [placement(0)],
      after: [placement(3)],
      saved,
    });
    server.edit('a1', { laneIndex: 7 });
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
  });
});

describe('linkChainCommand — an undo that failed part-way can be retried', () => {
  it('skips the links the first attempt removed, and tolerates one already gone', async () => {
    const server = fakePlanServer({
      activities: [A('a1', 'One'), A('a2', 'Two'), A('a3', 'Three')],
    });
    const created = [];
    for (const [from, to] of [
      ['a1', 'a2'],
      ['a2', 'a3'],
    ] as const) {
      created.push(
        await server.mutations.createDependency({
          planId: 'p1',
          predecessorId: from,
          successorId: to,
          type: 'FS',
          lagMinutes: 0,
          lagCalendar: 'PROJECT_DEFAULT',
        }),
      );
    }
    // A plain wrapper: `vi.fn(anotherMock)` shares the implementation slot, so overriding it would
    // rewrite the fake server's own delete.
    const deleteDependency = vi.fn((id: string) => server.mutations.deleteDependency(id));
    const command = linkChainCommand({
      created,
      createDependency: server.mutations.createDependency,
      deleteDependency,
    });
    // The chain is undone last link first; the second delete fails, once.
    let calls = 0;
    deleteDependency.mockImplementation((id: string) => {
      calls += 1;
      return calls === 2
        ? Promise.reject(new Error('network'))
        : server.mutations.deleteDependency(id);
    });
    await expect(command.undo(server.ctx)).rejects.toThrow('network');
    expect(server.dependencies.size).toBe(1);
    // Retry: the first-removed link is neither re-checked ("gone") nor deleted again; a 404 on the
    // remaining one (a colleague got there first) is what undo wanted anyway.
    deleteDependency.mockImplementation(() =>
      Promise.reject(new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' })),
    );
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });
});
