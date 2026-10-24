import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { swimlaneLanesCommand, type SwimlaneLaneState } from './commands';
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
        const swimlaneId = p.swimlane.swimlaneId ?? row.swimlaneId;
        row.swimlaneId = swimlaneId;
        row.version += 1;
        row.swimlaneLanes = [
          ...row.swimlaneLanes.filter(
            (l) => !(l.basis === 'SWIMLANE' && l.swimlaneId === swimlaneId),
          ),
          {
            basis: 'SWIMLANE',
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

const state = (id: string, swimlaneId: string, lane: number): SwimlaneLaneState => ({
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
      swimlane: {
        ...(t.swimlaneId !== null ? { swimlaneId: t.swimlaneId } : {}),
        laneIndex: t.lane,
      },
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

  it('refuses an inverse it cannot write rather than half-applying it', async () => {
    const s = server([placed('a', 'S1', 0)]);
    const command = swimlaneLanesCommand({
      writeLanes: s.writeLanes,
      before: [{ id: 'a', swimlaneId: null, lane: 0 }],
      after: [state('a', 'S1', 0)],
      saved: [s.store.get('a')!],
    });
    expect(await command.undo(s.ctx)).toMatchObject({ kind: 'not-applicable', reason: 'changed' });
    expect(s.writeLanes).not.toHaveBeenCalled();
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
