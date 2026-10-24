import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  composeSteps,
  swimlaneLanesCommand,
  visualStartCommand,
  type Command,
  type SwimlaneLaneState,
} from './commands';
import type { ReplayContext } from './replay';

import type { SwimlaneLaneRow } from '@/features/swimlanes';
import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';

/**
 * The undo step for a lane move on the swimlane layout (swimlanes M2-T4, ADR-0176). A small local
 * server rather than the shared fake: the positions batch it speaks is the only write it needs, and
 * a swimlane-lane row (`swimlaneLanes`) is the state it checks.
 */
function server(rows: ActivitySummary[]) {
  const store = new Map(rows.map((r) => [r.id, structuredClone(r)]));
  const writeLanes = vi.fn(
    (input: { positions: SwimlaneLaneRow[] }): Promise<ActivitySummary[]> => {
      // All-or-nothing, like the endpoint: one stale row refuses the lot and writes none.
      for (const p of input.positions) {
        if (store.get(p.id)?.version !== p.version) {
          return Promise.reject(
            new ApiFetchError(409, { code: 'STALE_VERSION', message: 'Stale.' }),
          );
        }
      }
      const written = input.positions.map((p) => {
        const row = store.get(p.id)!;
        // Omitted keeps the membership; `null` files the bar in none.
        const swimlaneId =
          p.swimlane.swimlaneId === undefined ? row.swimlaneId : p.swimlane.swimlaneId;
        row.swimlaneId = swimlaneId;
        row.version += 1;
        const basis = swimlaneId === null ? 'NO_SWIMLANE' : 'SWIMLANE';
        row.swimlaneLanes = [
          ...row.swimlaneLanes.filter((l) => !(l.basis === basis && l.swimlaneId === swimlaneId)),
          {
            basis,
            swimlaneId,
            summaryActivityId: null,
            wbsLevel: null,
            laneIndex: p.swimlane.laneIndex,
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ];
        return structuredClone(row);
      });
      return Promise.resolve(written);
    },
  );
  const ctx = {
    readActivities: (ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => (store.has(id) ? [[id, structuredClone(store.get(id)!)]] : [])),
        ),
      ),
  } as unknown as ReplayContext;
  return { store, writeLanes, ctx };
}

const placed = (id: string, swimlaneId: string, lane: number, name = id): ActivitySummary =>
  anActivity({
    id,
    name,
    swimlaneId,
    swimlaneLanes: [
      {
        basis: 'SWIMLANE',
        swimlaneId,
        summaryActivityId: null,
        wbsLevel: null,
        laneIndex: lane,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  });

const state = (id: string, swimlaneId: string | null, lane: number): SwimlaneLaneState => ({
  id,
  swimlaneId,
  lane,
});

/** The forward move, applied to the fake the way the host's write would have. */
async function moved(
  s: ReturnType<typeof server>,
  before: SwimlaneLaneState[],
  after: SwimlaneLaneState[],
) {
  const saved = await s.writeLanes({
    positions: after.map((t) => ({
      id: t.id,
      version: s.store.get(t.id)!.version,
      swimlane: { swimlaneId: t.swimlaneId, laneIndex: t.lane },
    })),
  });
  s.writeLanes.mockClear();
  return swimlaneLanesCommand({ writeLanes: s.writeLanes, before, after, saved });
}

describe('swimlaneLanesCommand', () => {
  it('undo puts a bar back in its lane, and redo moves it again', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(2);

    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(0);
    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(2);
  });

  it('undoes a move across swimlanes by filing the bar back in the one it came from', async () => {
    const s = server([placed('a', 'S1', 1)]);
    const command = await moved(s, [state('a', 'S1', 1)], [state('a', 'S2', 0)]);
    expect(s.store.get('a')?.swimlaneId).toBe('S2');

    await command.undo(s.ctx);
    const row = s.writeLanes.mock.calls[0]?.[0].positions[0];
    expect(row).toMatchObject({ id: 'a', swimlane: { swimlaneId: 'S1', laneIndex: 1 } });
    expect(s.store.get('a')?.swimlaneId).toBe('S1');
  });

  it('names no swimlane when the bar is already in the swimlane it goes back to', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    await command.undo(s.ctx);
    // A lane inside the swimlane the bar is already in is not a membership change, and on a WBS
    // plan naming one at all is a 422.
    expect(s.writeLanes.mock.calls[0]?.[0].positions[0]?.swimlane).toEqual({ laneIndex: 0 });
  });

  it('never carries a swimlane-free laneIndex (SC-1)', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    await command.undo(s.ctx);
    await command.redo(s.ctx);
    for (const [input] of s.writeLanes.mock.calls) {
      for (const row of input.positions) expect(row).not.toHaveProperty('laneIndex');
    }
  });

  it('writes at the version the row holds now, not the one it was built with', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    s.store.get('a')!.version += 5;
    s.store.get('a')!.swimlaneLanes[0]!.laneIndex = 2;
    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writeLanes.mock.calls[0]?.[0].positions[0]?.version).toBe(
      s.store.get('a')!.version - 1,
    );
  });

  it('is set aside, writing nothing, when somebody has moved the bar since', async () => {
    const s = server([placed('a', 'S1', 0, 'Pour')]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    s.store.get('a')!.swimlaneLanes[0]!.laneIndex = 4;
    expect(await command.undo(s.ctx)).toEqual({
      kind: 'not-applicable',
      reason: 'changed',
      subjectName: 'Pour',
    });
    expect(s.writeLanes).not.toHaveBeenCalled();
  });

  it('is set aside when the bar has been filed in another swimlane since', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    s.store.get('a')!.swimlaneId = 'S9';
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(s.writeLanes).not.toHaveBeenCalled();
  });

  it('sets the whole step aside when one of several bars has changed', async () => {
    const s = server([placed('a', 'S1', 0), placed('b', 'S1', 1)]);
    const command = await moved(
      s,
      [state('a', 'S1', 0), state('b', 'S1', 1)],
      [state('a', 'S1', 1), state('b', 'S1', 2)],
    );
    s.store.get('b')!.swimlaneLanes[0]!.laneIndex = 5;
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable' });
    expect(s.writeLanes).not.toHaveBeenCalled();
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(1);
  });

  it('is set aside when a bar is gone', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    s.store.delete('a');
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'gone' });
  });

  it('undoes a move into "No swimlane" by filing the bar back in the swimlane it came from', async () => {
    const s = server([placed('a', 'S1', 1)]);
    const command = await moved(s, [state('a', 'S1', 1)], [state('a', null, 0)]);
    expect(s.store.get('a')?.swimlaneId).toBeNull();

    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writeLanes.mock.calls[0]?.[0].positions[0]?.swimlane).toEqual({
      swimlaneId: 'S1',
      laneIndex: 1,
    });
    expect(s.store.get('a')?.swimlaneId).toBe('S1');
    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.store.get('a')?.swimlaneId).toBeNull();
  });

  it('undoes a move out of "No swimlane" by filing the bar in none again (swimlaneId: null)', async () => {
    const s = server([anActivity({ id: 'a', name: 'a', swimlaneId: null, swimlaneLanes: [] })]);
    const command = await moved(s, [state('a', null, 0)], [state('a', 'S1', 2)]);
    expect(s.store.get('a')?.swimlaneId).toBe('S1');

    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writeLanes.mock.calls[0]?.[0].positions[0]?.swimlane).toEqual({
      swimlaneId: null,
      laneIndex: 0,
    });
    expect(s.store.get('a')?.swimlaneId).toBeNull();
  });

  it('undoes a move of a bar kept on a deleted swimlane without naming one, leaving its kept id', async () => {
    const kept = anActivity({
      id: 'a',
      name: 'a',
      swimlaneId: 'gone',
      swimlaneLanes: [
        {
          basis: 'NO_SWIMLANE',
          swimlaneId: null,
          summaryActivityId: null,
          wbsLevel: null,
          laneIndex: 3,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    const s = server([kept]);
    // Drawn under none, so both ends of the step say none; the column still holds the deleted id.
    const command = swimlaneLanesCommand({
      writeLanes: s.writeLanes,
      before: [state('a', null, 0)],
      after: [state('a', null, 3)],
      saved: [kept],
    });
    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(s.writeLanes.mock.calls[0]?.[0].positions[0]?.swimlane).toEqual({ laneIndex: 0 });
    expect(s.store.get('a')?.swimlaneId).toBe('gone');
  });

  it('does not ask for a recalculation, which a lane move cannot change', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 2)]);
    expect(command.affectsSchedule).toBe(false);
  });

  it('folds a burst on one set of bars into one step, from the first lane to the last', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const first = await moved(s, [state('a', 'S1', 0)], [state('a', 'S1', 1)]);
    const second = await moved(s, [state('a', 'S1', 1)], [state('a', 'S1', 2)]);
    expect(second.coalescing?.key).toBe(first.coalescing?.key);
    const merged = second.coalescing!.merge(first);

    await merged.undo(s.ctx);
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(0);
  });
});

describe('composeSteps — a diagonal drag is one undo step', () => {
  /** A bar that moved in time (visualStart) and in lane inside its swimlane, as two writes. */
  async function diagonal() {
    const s = server([{ ...placed('a', 'S1', 0, 'Pour'), visualStart: '2026-02-02' }]);
    const order: string[] = [];
    const setVisualStart = vi.fn(
      (input: { activityId: string; visualStart: string | null; version: number }) => {
        const row = s.store.get(input.activityId)!;
        if (row.version !== input.version) {
          return Promise.reject(
            new ApiFetchError(409, { code: 'STALE_VERSION', message: 'Stale.' }),
          );
        }
        order.push('time');
        row.visualStart = input.visualStart;
        row.version += 1;
        return Promise.resolve(structuredClone(row));
      },
    );
    const writeLanes = vi.fn((input: { positions: SwimlaneLaneRow[] }) => {
      order.push('lane');
      return s.writeLanes(input);
    });
    const before = structuredClone(s.store.get('a')!);
    const savedTime = await setVisualStart({
      activityId: 'a',
      visualStart: '2026-02-09',
      version: before.version,
    });
    const savedLane = await s.writeLanes({
      positions: [{ id: 'a', version: savedTime.version, swimlane: { laneIndex: 2 } }],
    });
    order.length = 0;
    s.writeLanes.mockClear();
    const time = visualStartCommand({
      setVisualStart,
      activityId: 'a',
      before: { visualStart: '2026-02-02', laneIndex: before.laneIndex },
      after: { visualStart: '2026-02-09', laneIndex: before.laneIndex },
      saved: savedTime,
      activityName: 'Pour',
    });
    const lane = swimlaneLanesCommand({
      writeLanes,
      before: [state('a', 'S1', 0)],
      after: [state('a', 'S1', 2)],
      saved: savedLane,
    });
    const command = composeSteps({ label: 'Move “Pour”', steps: [time, lane] });
    return { s, order, command, setVisualStart, writeLanes };
  }

  it('undoes the lane first and the time second, and redoes them the other way round', async () => {
    const { s, order, command } = await diagonal();
    expect(await command.undo(s.ctx)).toEqual({ kind: 'applied' });
    expect(order).toEqual(['lane', 'time']);
    expect(s.store.get('a')?.visualStart).toBe('2026-02-02');
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(0);

    order.length = 0;
    expect(await command.redo(s.ctx)).toEqual({ kind: 'applied' });
    expect(order).toEqual(['time', 'lane']);
    expect(s.store.get('a')?.visualStart).toBe('2026-02-09');
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(2);
  });

  it('reads each half at the version the other half left, so there is no stale-version 409', async () => {
    const { s, command } = await diagonal();
    await command.undo(s.ctx);
    await command.redo(s.ctx);
    // The fake refuses any other version; reaching here with `applied` twice is the assertion.
    expect(s.store.get('a')?.version).toBeGreaterThan(3);
  });

  it('checks both halves before writing either: a changed lane leaves the time untouched', async () => {
    const { s, order, command, setVisualStart } = await diagonal();
    s.store.get('a')!.swimlaneLanes[0]!.laneIndex = 5;
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(order).toEqual([]);
    expect(setVisualStart).toHaveBeenCalledTimes(1);
    expect(s.store.get('a')?.visualStart).toBe('2026-02-09');
  });

  it('checks both halves before writing either: a changed day leaves the lane untouched', async () => {
    const { s, order, command } = await diagonal();
    s.store.get('a')!.visualStart = '2026-03-01';
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(order).toEqual([]);
    expect(s.store.get('a')?.swimlaneLanes[0]?.laneIndex).toBe(2);
  });

  it('names its subjects once and keeps the label it was given', async () => {
    const { command } = await diagonal();
    expect(command.subjects).toEqual(['a']);
    expect(command.label).toBe('Move “Pour”');
    expect(command).not.toHaveProperty('coalescing');
  });

  it('recalculates when either half can change the schedule, and not otherwise', async () => {
    const { command } = await diagonal();
    expect(command.affectsSchedule).toBeUndefined();
    const layoutOnly = (): Command => ({
      label: 'x',
      subjects: [],
      undo: () => Promise.resolve({ kind: 'applied' }),
      redo: () => Promise.resolve({ kind: 'applied' }),
      affectsSchedule: false,
    });
    expect(composeSteps({ label: 'y', steps: [layoutOnly(), layoutOnly()] }).affectsSchedule).toBe(
      false,
    );
  });
});
