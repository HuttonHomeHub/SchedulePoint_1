import type { PlanSummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import type { ReplayContext } from './replay';
import {
  swimlaneAddCommand,
  swimlaneDeleteCommand,
  swimlaneRenameCommand,
  swimlaneReorderCommand,
  swimlaneSourceCommand,
} from './swimlane-commands';

import { ApiFetchError } from '@/lib/api/client';

const row = (id: string, name: string, version = 1): SwimlaneSummary => ({
  id,
  planId: 'p1',
  name,
  position: 0,
  version,
  createdAt: '',
  updatedAt: '',
});

/**
 * A server in one array: active swimlanes in order. Only `readSwimlanes` is real; the commands read
 * nothing else, so the rest of the replay context is absent on purpose.
 */
function server(initial: SwimlaneSummary[]) {
  const state = { active: initial.map((s) => ({ ...s })), deleted: [] as SwimlaneSummary[] };
  const ctx = {
    readSwimlanes: () => Promise.resolve(state.active.map((s) => ({ ...s }))),
  } as unknown as ReplayContext;
  const stale = () => new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' });
  const find = (id: string): SwimlaneSummary => {
    const found = state.active.find((s) => s.id === id);
    if (!found) throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'gone' });
    return found;
  };
  const writes = {
    remove: vi.fn(({ swimlaneId, version }: { swimlaneId: string; version?: number }) => {
      const s = find(swimlaneId);
      if (version !== undefined && version !== s.version) throw stale();
      state.active = state.active.filter((x) => x.id !== swimlaneId);
      state.deleted.push(s);
      return Promise.resolve();
    }),
    restore: vi.fn(({ swimlaneId }: { swimlaneId: string }) => {
      const s = state.deleted.find((x) => x.id === swimlaneId);
      if (!s) throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'gone' });
      state.deleted = state.deleted.filter((x) => x.id !== swimlaneId);
      state.active.push(s);
      return Promise.resolve(s);
    }),
    rename: vi.fn(
      ({ swimlaneId, name, version }: { swimlaneId: string; name: string; version: number }) => {
        const s = find(swimlaneId);
        if (version !== s.version) throw stale();
        s.name = name;
        s.version += 1;
        return Promise.resolve({ ...s });
      },
    ),
    reorder: vi.fn(({ order }: { order: { id: string; version: number }[] }) => {
      for (const o of order) if (find(o.id).version !== o.version) throw stale();
      state.active = order.map((o) => find(o.id));
      return Promise.resolve(state.active.map((s) => ({ ...s })));
    }),
  };
  return { state, ctx, writes };
}

describe('swimlaneAddCommand', () => {
  it('undo deletes what was created at its current version; redo restores the same ids', async () => {
    const created = [row('a', 'Civil'), row('b', 'Mechanical')];
    const s = server(created);
    const command = swimlaneAddCommand({
      created,
      remove: s.writes.remove,
      restore: s.writes.restore,
    });
    expect(command.label).toBe('Add 2 swimlanes');

    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.state.active).toEqual([]);
    // Last first, so a failure part-way would leave the earlier ones in place.
    expect(s.writes.remove.mock.calls.map(([i]) => i.swimlaneId)).toEqual(['b', 'a']);

    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.state.active.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('names a single swimlane in its label', () => {
    const s = server([]);
    expect(
      swimlaneAddCommand({
        created: [row('a', 'Civil')],
        remove: s.writes.remove,
        restore: s.writes.restore,
      }).label,
    ).toBe('Add swimlane “Civil”');
  });

  it('sets the step aside, writing nothing, when a colleague renamed one of them', async () => {
    const created = [row('a', 'Civil')];
    const s = server([row('a', 'Civils', 2)]);
    const command = swimlaneAddCommand({
      created,
      remove: s.writes.remove,
      restore: s.writes.restore,
    });
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(s.writes.remove).not.toHaveBeenCalled();
  });

  it('sets the step aside when one is already gone', async () => {
    const created = [row('a', 'Civil')];
    const s = server([]);
    const command = swimlaneAddCommand({
      created,
      remove: s.writes.remove,
      restore: s.writes.restore,
    });
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'gone' });
  });
});

describe('swimlaneRenameCommand', () => {
  const after = row('a', 'Civil works', 2);

  it('undo restores the old name and redo the new one, each checking the name it expects', async () => {
    const s = server([after]);
    const command = swimlaneRenameCommand({
      swimlaneId: 'a',
      before: 'Civil',
      after,
      rename: s.writes.rename,
    });
    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.state.active[0]?.name).toBe('Civil');
    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.state.active[0]?.name).toBe('Civil works');
  });

  it('writes with the CURRENT version, so a colleague’s reorder is not in its way', async () => {
    const s = server([row('a', 'Civil works', 9)]);
    const command = swimlaneRenameCommand({
      swimlaneId: 'a',
      before: 'Civil',
      after,
      rename: s.writes.rename,
    });
    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writes.rename).toHaveBeenCalledWith({ swimlaneId: 'a', name: 'Civil', version: 9 });
  });

  it('is set aside when the name is no longer the one the step left', async () => {
    const s = server([row('a', 'Groundworks', 3)]);
    const command = swimlaneRenameCommand({
      swimlaneId: 'a',
      before: 'Civil',
      after,
      rename: s.writes.rename,
    });
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(s.writes.rename).not.toHaveBeenCalled();
  });
});

describe('swimlaneReorderCommand', () => {
  const before = [row('a', 'A'), row('b', 'B'), row('c', 'C')];
  const after = [row('b', 'B'), row('a', 'A'), row('c', 'C')];

  it('undo writes the old order and redo the new, checking the whole order first', async () => {
    const s = server(after);
    const command = swimlaneReorderCommand({
      before,
      after,
      movedName: 'B',
      reorder: s.writes.reorder,
    });
    expect(command.label).toBe('Move swimlane “B”');
    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.state.active.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.state.active.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('is set aside when a colleague added a swimlane, rather than undoing their change too', async () => {
    const s = server([...after, row('d', 'D')]);
    const command = swimlaneReorderCommand({
      before,
      after,
      movedName: 'B',
      reorder: s.writes.reorder,
    });
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(s.writes.reorder).not.toHaveBeenCalled();
  });
});

describe('swimlaneDeleteCommand', () => {
  const deleted = row('a', 'Civil', 4);

  it('undo is one id-stable restore, and redo deletes it again at its current version', async () => {
    const s = server([]);
    s.state.deleted.push(deleted);
    const command = swimlaneDeleteCommand({
      deleted,
      remove: s.writes.remove,
      restore: s.writes.restore,
    });
    expect(command.label).toBe('Delete swimlane “Civil”');

    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writes.restore).toHaveBeenCalledWith({ swimlaneId: 'a' });
    expect(s.state.active.map((x) => x.id)).toEqual(['a']);

    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writes.remove).toHaveBeenCalledWith({ swimlaneId: 'a', version: 4 });
  });

  it('turns the server’s refusal of a restore into a set-aside, not an error', async () => {
    const s = server([]);
    const restore = vi.fn(() =>
      Promise.reject(new ApiFetchError(409, { code: 'CONFLICT', message: 'name taken' })),
    );
    const command = swimlaneDeleteCommand({ deleted, remove: s.writes.remove, restore });
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
  });

  it('does not delete again a swimlane that was renamed after the restore', async () => {
    const s = server([row('a', 'Groundworks', 5)]);
    const command = swimlaneDeleteCommand({
      deleted,
      remove: s.writes.remove,
      restore: s.writes.restore,
    });
    expect(await command.redo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(s.writes.remove).not.toHaveBeenCalled();
  });
});

describe('every swimlane step', () => {
  it('names no activity and does not touch the schedule', () => {
    const s = server([]);
    const commands = [
      swimlaneAddCommand({
        created: [row('a', 'A')],
        remove: s.writes.remove,
        restore: s.writes.restore,
      }),
      swimlaneDeleteCommand({
        deleted: row('a', 'A'),
        remove: s.writes.remove,
        restore: s.writes.restore,
      }),
    ];
    for (const c of commands) {
      expect(c.subjects).toEqual([]);
      expect(c.affectsSchedule).toBe(false);
    }
  });
});

describe('swimlaneSourceCommand', () => {
  /** A plan record in one object: the pair the step reads, and a version the write must use. */
  function plan(
    initial: {
      swimlaneSource: SwimlaneSource;
      swimlaneWbsLevel: number | null;
      swimlaneCodeTypeId?: string | null;
    },
    liveTypes: readonly string[] = [],
  ) {
    const state = { swimlaneCodeTypeId: null, ...initial, version: 4 };
    const ctx = {
      readPlan: () => Promise.resolve({ id: 'p1', ...state } as unknown as PlanSummary),
      readCodeTypes: () => Promise.resolve(liveTypes.map((id) => ({ id }))),
    } as unknown as ReplayContext;
    const setSource = vi.fn(
      (input: {
        version: number;
        source: SwimlaneSource;
        level: number | null;
        codeTypeId: string | null;
      }) => {
        if (input.version !== state.version) {
          return Promise.reject(new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }));
        }
        state.swimlaneSource = input.source;
        state.swimlaneWbsLevel = input.level;
        state.swimlaneCodeTypeId = input.codeTypeId;
        state.version += 1;
        return Promise.resolve({});
      },
    );
    return { state, ctx, setSource };
  }
  const MANUAL = { source: 'MANUAL', level: null, codeTypeId: null } as const;
  const WBS2 = { source: 'WBS', level: 2, codeTypeId: null } as const;

  it('undo puts the previous choice back, redo the new one, each at the plan’s current version', async () => {
    const p = plan({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });
    const command = swimlaneSourceCommand({
      planId: 'p1',
      before: MANUAL,
      after: WBS2,
      setSource: p.setSource,
    });
    expect(command.label).toBe('Make swimlanes one per WBS group at level 2');
    expect(await command.undo(p.ctx)).toEqual({ kind: 'applied' });
    expect(p.setSource).toHaveBeenLastCalledWith({
      planId: 'p1',
      version: 4,
      source: 'MANUAL',
      level: null,
      codeTypeId: null,
    });
    expect(await command.redo(p.ctx)).toEqual({ kind: 'applied' });
    expect(p.setSource).toHaveBeenLastCalledWith({
      planId: 'p1',
      version: 5,
      source: 'WBS',
      level: 2,
      codeTypeId: null,
    });
  });

  it('writes the plan record and nothing else, so no lane is written in either direction', async () => {
    const p = plan({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });
    const command = swimlaneSourceCommand({
      planId: 'p1',
      before: MANUAL,
      after: WBS2,
      setSource: p.setSource,
    });
    await command.undo(p.ctx);
    await command.redo(p.ctx);
    // The command is handed one write and no other seam: a lane write could not be made from it.
    expect(p.setSource).toHaveBeenCalledTimes(2);
    expect(command.subjects).toEqual([]);
    expect(command.affectsSchedule).toBe(false);
  });

  it('sets the step aside, writing nothing, when somebody chose another level since', async () => {
    const p = plan({ swimlaneSource: 'WBS', swimlaneWbsLevel: 3 });
    const command = swimlaneSourceCommand({
      planId: 'p1',
      before: MANUAL,
      after: WBS2,
      setSource: p.setSource,
    });
    expect(await command.undo(p.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(p.setSource).not.toHaveBeenCalled();
  });

  it('sets the step aside when the plan is gone', async () => {
    const command = swimlaneSourceCommand({
      planId: 'p1',
      before: MANUAL,
      after: WBS2,
      setSource: vi.fn(),
    });
    const ctx = { readPlan: () => Promise.resolve(undefined) } as unknown as ReplayContext;
    expect(await command.undo(ctx)).toMatchObject({ kind: 'not-applicable', reason: 'gone' });
  });

  describe('a switch to a code', () => {
    const AREA = {
      source: 'ACTIVITY_CODE',
      level: null,
      codeTypeId: 'area',
      codeTypeName: 'Area',
    } as const;
    const TRADE = { source: 'ACTIVITY_CODE', level: null, codeTypeId: 'trade' } as const;

    it('is worded for the code as it was named when recorded, and carries the type both ways', async () => {
      const p = plan(
        { swimlaneSource: 'ACTIVITY_CODE', swimlaneWbsLevel: null, swimlaneCodeTypeId: 'area' },
        ['area', 'trade'],
      );
      const command = swimlaneSourceCommand({
        planId: 'p1',
        before: TRADE,
        after: AREA,
        setSource: p.setSource,
      });
      expect(command.label).toBe('Make swimlanes one per value of Area');
      expect(await command.undo(p.ctx)).toEqual({ kind: 'applied' });
      expect(p.setSource).toHaveBeenLastCalledWith({
        planId: 'p1',
        version: 4,
        source: 'ACTIVITY_CODE',
        level: null,
        codeTypeId: 'trade',
      });
      expect(await command.redo(p.ctx)).toEqual({ kind: 'applied' });
      expect(p.setSource).toHaveBeenLastCalledWith({
        planId: 'p1',
        version: 5,
        source: 'ACTIVITY_CODE',
        level: null,
        codeTypeId: 'area',
      });
    });

    it('sets the step aside when somebody chose another code since', async () => {
      const p = plan(
        { swimlaneSource: 'ACTIVITY_CODE', swimlaneWbsLevel: null, swimlaneCodeTypeId: 'phase' },
        ['area', 'trade', 'phase'],
      );
      const command = swimlaneSourceCommand({
        planId: 'p1',
        before: TRADE,
        after: AREA,
        setSource: p.setSource,
      });
      expect(await command.undo(p.ctx)).toMatchObject({
        kind: 'not-applicable',
        reason: 'changed',
      });
      expect(p.setSource).not.toHaveBeenCalled();
    });

    it('sets undo aside, writing nothing, when the code it would return to has been deleted', async () => {
      // Area → Trade, then Area is deleted from Codes…: undoing the switch would name a deleted type.
      const p = plan(
        { swimlaneSource: 'ACTIVITY_CODE', swimlaneWbsLevel: null, swimlaneCodeTypeId: 'trade' },
        ['trade'],
      );
      const command = swimlaneSourceCommand({
        planId: 'p1',
        before: { ...AREA },
        after: { ...TRADE, codeTypeName: 'Trade' },
        setSource: p.setSource,
      });
      expect(await command.undo(p.ctx)).toEqual({
        kind: 'not-applicable',
        reason: 'gone',
        subjectName: 'Area',
      });
      expect(p.setSource).not.toHaveBeenCalled();
    });

    it('sets the step aside, with its own reason, when the server refuses the code at replay (values in use left 1 to 100)', async () => {
      const p = plan({ swimlaneSource: 'NONE', swimlaneWbsLevel: null }, ['area']);
      p.setSource.mockRejectedValueOnce(
        new ApiFetchError(422, {
          code: 'VALIDATION_ERROR',
          message: 'Area has no values in use.',
          details: { reason: 'SWIMLANE_CODE_TYPE_INELIGIBLE' },
        }),
      );
      const command = swimlaneSourceCommand({
        planId: 'p1',
        before: { source: 'NONE', level: null, codeTypeId: null },
        after: AREA,
        setSource: p.setSource,
      });
      expect(await command.redo(p.ctx)).toMatchObject({
        kind: 'not-applicable',
        reason: 'code-not-choosable',
        subjectName: 'Area',
      });
    });
  });
});
