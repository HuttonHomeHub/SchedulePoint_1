import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  TsldBulkOperations,
  TsldEditOutcome,
  TsldRepositionInput,
} from '../components/TsldPanel';
import { deriveDiagramSource } from '../model/derive-diagram-source';
import { NO_FREE_LANE_PLURAL } from '../model/swimlane-lanes';
import type { SwimlaneInput } from '../render/project-swimlanes';

import { useSwimlaneEditing } from './use-swimlane-editing';

import { anActivity } from '@/test/activity-fixture';

/**
 * The panel's swimlane translation, on its own (swimlanes M2-T4, C6). The panel suite drives it
 * through a canvas; this reaches the cases a canvas makes hard to arrange — a selection where only
 * some bars can move, a boundary reported by name — and the parity case: with no swimlane input the
 * hook hands back exactly what it was given.
 */
const DATA_DATE = '2026-01-01';
const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;

function bar(id: string, start: number, end: number): ActivitySummary {
  return anActivity({
    id,
    name: id,
    laneIndex: 0,
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
  });
}

const INPUT = (
  membership: [string, string | null][],
  lanes: [string, number][],
): SwimlaneInput => ({
  swimlanes: [
    { id: 'S1', name: 'Mechanical' },
    { id: 'S2', name: 'Electrical' },
  ],
  membership: new Map(membership),
  storedLanes: new Map(lanes.map(([id, lane]) => [id, { lane, updatedAt: 1 }])),
});

const OK: TsldEditOutcome = { applied: true, conflict: null };

function mount(
  activities: ActivitySummary[],
  swimlanes: SwimlaneInput | null,
  over: {
    reposition?: (input: TsldRepositionInput) => Promise<TsldEditOutcome>;
    bulkMoveMany?: TsldBulkOperations['moveMany'];
  } = {},
) {
  const reposition = over.reposition ?? vi.fn((_: TsldRepositionInput) => Promise.resolve(OK));
  const bulkMoveMany =
    over.bulkMoveMany ??
    vi.fn<TsldBulkOperations['moveMany']>(() => Promise.resolve({ applied: true, conflict: null }));
  const diagramSource = deriveDiagramSource(activities, {
    wbsBand: { enabled: false, toggleOn: false },
    swimlanes,
    source: 'visual',
    dataDate: DATA_DATE,
  });
  const { result } = renderHook(() =>
    useSwimlaneEditing({
      activities,
      diagramSource,
      swimlanes,
      barDateSource: 'visual',
      dataDate: DATA_DATE,
      reposition,
      bulkMoveMany,
    }),
  );
  return { editing: result.current, reposition, bulkMoveMany };
}

// Mechanical: p (lane 0) and q (lane 1, later). Electrical: t (lane 0).
const ACTIVITIES = [bar('p', 0, 3), bar('q', 6, 9), bar('t', 0, 3)];
const WITH = INPUT(
  [
    ['p', 'S1'],
    ['q', 'S1'],
    ['t', 'S2'],
  ],
  [
    ['p', 0],
    ['q', 1],
    ['t', 0],
  ],
);

describe('useSwimlaneEditing off the swimlane layout (SC-3)', () => {
  it('hands back exactly what it was given', () => {
    const { editing, reposition, bulkMoveMany } = mount(ACTIVITIES, null);
    expect(editing.active).toBe(false);
    expect(editing.laneActivities).toBe(ACTIVITIES);
    expect(editing.repositionByPointer).toBe(reposition);
    expect(editing.repositionByKeyboard).toBe(reposition);
    expect(editing.moveMany).toBe(bulkMoveMany);
    expect(editing.laneRange).toBeUndefined();
    expect(editing.topLane).toBeUndefined();
    expect(editing.laneFloor).toBeUndefined();
    expect(editing.topLaneReason).toBeUndefined();
    expect(editing.placeCreate(0, { startDay: 0, endDay: 1 })).toBeNull();
  });
});

describe('useSwimlaneEditing on the swimlane layout', () => {
  it('reasons in display lanes and leaves the stored ones alone', () => {
    const { editing } = mount(ACTIVITIES, WITH);
    expect(editing.laneActivities.map((a) => [a.id, a.laneIndex])).toEqual([
      ['p', 0],
      ['q', 1],
      ['t', 2],
    ]);
    expect(ACTIVITIES.every((a) => a.laneIndex === 0)).toBe(true);
  });

  it('turns a pointer drop into a lane inside the swimlane, with no laneIndex', async () => {
    const { editing, reposition } = mount(ACTIVITIES, WITH);
    const outcome = await editing.repositionByPointer!({ activityId: 'p', laneIndex: 1 });
    expect(reposition).toHaveBeenCalledWith({
      activityId: 'p',
      swimlaneLanes: [{ id: 'p', lane: 1, from: { swimlaneId: 'S1', lane: 0 } }],
    });
    expect(outcome.swimlane).toMatchObject({ swimlane: 'Mechanical', lane: 1, how: 'asked' });
  });

  it('reads a key press past the bottom as the swimlane growing, not as the next swimlane', async () => {
    const { editing, reposition } = mount(ACTIVITIES, WITH);
    // q is on Mechanical's bottom lane (display 1); display lane 2 is Electrical's first.
    await editing.repositionByKeyboard!({ activityId: 'q', laneIndex: 2 });
    expect(reposition).toHaveBeenCalledWith({
      activityId: 'q',
      swimlaneLanes: [{ id: 'q', lane: 2, from: { swimlaneId: 'S1', lane: 1 } }],
    });
    // The same display lane from a pointer is a drop into Electrical.
    const pointer = mount(ACTIVITIES, WITH);
    await pointer.editing.repositionByPointer!({ activityId: 'q', laneIndex: 2 });
    expect(pointer.reposition).toHaveBeenCalledWith({
      activityId: 'q',
      swimlaneLanes: [
        expect.objectContaining({ id: 'q', swimlaneId: 'S2', from: { swimlaneId: 'S1', lane: 1 } }),
      ],
    });
  });

  it('tells the key-press hook where the bar landed when that was not where it aimed', async () => {
    const { editing } = mount(ACTIVITIES, WITH);
    // Aimed five lanes down; a swimlane grows by one.
    const outcome = await editing.repositionByKeyboard!({ activityId: 'q', laneIndex: 6 });
    expect(outcome.laneIndex).toBe(2);
  });

  it('writes nothing for a refused move and says so without a Refresh', async () => {
    const { editing, reposition } = mount(ACTIVITIES, WITH);
    const outcome = await editing.repositionByKeyboard!({ activityId: 'p', laneIndex: -1 });
    expect(outcome).toEqual({
      applied: false,
      conflict: 'Already in the top lane of Mechanical.',
      refreshable: false,
    });
    expect(reposition).not.toHaveBeenCalled();
  });

  it('with a day and no free lane, writes the day and leaves the lane', async () => {
    const crowded = [bar('p', 0, 3), bar('q', 0, 3), bar('t', 0, 3)];
    const { editing, reposition } = mount(crowded, WITH);
    const outcome = await editing.repositionByPointer!({
      activityId: 'q',
      startDay: 4,
      laneIndex: 0,
    });
    expect(reposition).toHaveBeenCalledWith({ activityId: 'q', startDay: 4 });
    expect(outcome.swimlane?.how).toBe('stays');
  });

  it('passes a move in time through untouched', async () => {
    const { editing, reposition } = mount(ACTIVITIES, WITH);
    await editing.repositionByPointer!({ activityId: 'p', startDay: 3 });
    expect(reposition).toHaveBeenCalledWith({ activityId: 'p', startDay: 3 });
  });

  it('names the top of each bar’s own swimlane, in display lanes', () => {
    const { editing } = mount(ACTIVITIES, WITH);
    expect(editing.topLane!('t')).toEqual({ min: 2, swimlane: 'Electrical' });
    expect(editing.laneFloor!('q')).toBe(0);
    expect(editing.laneFloor!('t')).toBe(2);
    expect(editing.topLaneReason!(1, 3)).toMatch(/top lane of its swimlane/);
  });

  it('puts no edge in the way of a drag over hand-made swimlanes', () => {
    const { editing } = mount(ACTIVITIES, WITH);
    expect(editing.laneRange!('p')).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
  });

  it('places a new bar in the swimlane under the click', () => {
    const { editing } = mount(ACTIVITIES, WITH);
    expect(editing.placeCreate(2, { startDay: 20, endDay: 21 })).toMatchObject({
      swimlaneId: 'S2',
      lane: 0,
      laneIndex: 0,
    });
  });
});

describe('useSwimlaneEditing — the plural move', () => {
  it('refuses a set that names a bar the plan no longer has, rather than moving a smaller one', async () => {
    const { editing, bulkMoveMany } = mount(ACTIVITIES, WITH);
    const ghost = bar('ghost', 0, 3);
    const outcome = await editing.moveMany!([ACTIVITIES[0]!, ghost], { dayDelta: 0, laneDelta: 1 });
    expect(outcome.applied).toBe(false);
    expect(outcome.conflict).toMatch(/no longer in the plan/);
    expect(bulkMoveMany).not.toHaveBeenCalled();
  });

  const rows = (ids: string[]) => ACTIVITIES.filter((a) => ids.includes(a.id));

  it('passes a move in time alone straight to the host', async () => {
    const { editing, bulkMoveMany } = mount(ACTIVITIES, WITH);
    await editing.moveMany!(rows(['p', 'q']), { dayDelta: 2, laneDelta: 0 });
    expect(bulkMoveMany).toHaveBeenCalledWith(
      rows(['p', 'q']),
      { dayDelta: 2, laneDelta: 0 },
      undefined,
    );
  });

  it('hands the host each bar’s lane in its own swimlane and no lane delta, STORED rows', async () => {
    const { editing, bulkMoveMany } = mount(ACTIVITIES, WITH);
    const outcome = await editing.moveMany!(rows(['p', 'q']), { dayDelta: 0, laneDelta: 1 });
    const [written, delta, options] = vi.mocked(bulkMoveMany).mock.calls[0]!;
    expect(delta).toEqual({ dayDelta: 0, laneDelta: 0 });
    expect(options?.swimlaneLanes).toEqual([
      { id: 'p', lane: 1, from: { swimlaneId: 'S1', lane: 0 } },
      { id: 'q', lane: 2, from: { swimlaneId: 'S1', lane: 1 } },
    ]);
    expect(written.every((r) => r.laneIndex === 0)).toBe(true);
    expect(outcome.swimlaneMoved).toEqual({ moved: 2, total: 2, direction: 'down' });
  });

  it('says so, and writes nothing, when none of the set has a free lane going up', async () => {
    // s sits on Mechanical lane 2 with p and q holding lanes 0 and 1 over its days: no way up.
    const crowded = [
      bar('p', 0, 3),
      bar('q', 0, 3),
      bar('s', 0, 3),
      bar('t', 0, 3),
      bar('u', 0, 3),
    ];
    const input = INPUT(
      [
        ['p', 'S1'],
        ['q', 'S1'],
        ['s', 'S1'],
        ['t', 'S2'],
        ['u', 'S2'],
      ],
      [
        ['p', 0],
        ['q', 1],
        ['s', 2],
        ['t', 0],
        ['u', 1],
      ],
    );
    const { editing, bulkMoveMany } = mount(crowded, input);
    // s and u are the two that could not have gone up: nothing is free above either.
    const outcome = await editing.moveMany!(
      crowded.filter((a) => a.id === 's' || a.id === 'u'),
      { dayDelta: 0, laneDelta: -1 },
    );
    // s → lane 1 is held by q (not moving) and lane 0 by p: no free lane above, so it stays;
    // u → lane 0 is held by t, and there is nothing above that: it stays too. Nothing moved.
    expect(outcome).toEqual({ applied: false, conflict: NO_FREE_LANE_PLURAL, refreshable: false });
    expect(bulkMoveMany).not.toHaveBeenCalled();
  });

  it('counts the bars that moved when only some can', async () => {
    // r (days 6-9) can go up into lane 0, which is free over its days; s (days 0-3) cannot, since
    // q, a bystander, holds the lane above it.
    const acts = [bar('p', 0, 3), bar('q', 0, 3), bar('r', 6, 9), bar('s', 0, 3)];
    const input = INPUT(
      [
        ['p', 'S1'],
        ['q', 'S1'],
        ['r', 'S1'],
        ['s', 'S1'],
      ],
      [
        ['p', 0],
        ['q', 1],
        ['r', 1],
        ['s', 2],
      ],
    );
    const { editing, bulkMoveMany } = mount(acts, input);
    const outcome = await editing.moveMany!(
      acts.filter((a) => a.id === 'r' || a.id === 's'),
      { dayDelta: 0, laneDelta: -1 },
    );
    const options = vi.mocked(bulkMoveMany).mock.calls[0]![2];
    expect(options?.swimlaneLanes?.filter((p) => !p.materialised).map((p) => p.id)).toEqual(['r']);
    expect(outcome.swimlaneMoved).toEqual({ moved: 1, total: 2, direction: 'up' });
  });

  it('refuses a set held at the top of its swimlanes in the swimlane wording', async () => {
    const { editing, bulkMoveMany } = mount(ACTIVITIES, WITH);
    const outcome = await editing.moveMany!(rows(['p', 't']), { dayDelta: 0, laneDelta: -1 });
    expect(outcome.applied).toBe(false);
    expect(outcome.conflict).toMatch(/top lane of their swimlanes/);
    expect(outcome.refreshable).toBe(false);
    expect(bulkMoveMany).not.toHaveBeenCalled();
  });
});
