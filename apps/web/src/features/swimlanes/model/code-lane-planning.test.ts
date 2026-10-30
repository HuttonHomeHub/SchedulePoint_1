import type { ActivitySummary, CodeValueSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { planCodeSwimlaneLanes, planCodeSwimlaneMove } from './code-lane-planning';
import { codeSwimlaneInput } from './code-membership';

import { SWIMLANE_GONE_REASON } from '@/features/tsld/model/swimlane-lanes';
import { anActivity } from '@/test/activity-fixture';

const TYPE = { id: 'area', name: 'Area' };
const value = (id: string, shortCode: string): CodeValueSummary => ({
  id,
  codeTypeId: 'area',
  shortCode,
  description: null,
  position: 0,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  deletedAt: null,
});
// `l2` is a live value nobody uses yet, so it is not a band.
const VALUES = [value('gf', 'GF'), value('l1', 'L1'), value('rf', 'RF'), value('l2', 'L2')];

const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;
const bar = (
  id: string,
  valueId: string | null,
  start: number,
  end: number,
  over: Partial<ActivitySummary> = {},
): ActivitySummary =>
  anActivity({
    id,
    name: `Task ${id}`,
    version: 3,
    codes: valueId === null ? [] : [{ codeTypeId: 'area', codeValueId: valueId }],
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
    ...over,
  });

// a is placed at lane 0 of Ground floor; b and c are unplaced in Level 1 and overlap in time; d is in
// Roof; e has no Area.
const ACTIVITIES: ActivitySummary[] = [
  bar('a', 'gf', 0, 3, {
    codeSwimlaneLanes: [
      {
        codeTypeId: 'area',
        codeValueId: 'gf',
        laneIndex: 0,
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
  }),
  bar('b', 'l1', 0, 3),
  bar('c', 'l1', 5, 8),
  bar('d', 'rf', 0, 3),
  bar('e', null, 0, 3),
];

const planning = (activities: ActivitySummary[] = ACTIVITIES, over = {}) => ({
  input: codeSwimlaneInput(activities, TYPE, VALUES),
  activities,
  barDateSource: 'visual' as const,
  dataDate: '2026-01-01',
  wbsBandOn: false,
  ...over,
});

const row = (id: string, valueId: string | null, version = 3) => ({
  id,
  version,
  codes: [{ codeTypeId: 'area', codeValueId: valueId }],
});

describe('planCodeSwimlaneLanes', () => {
  it('places the mover in the next free lane of its new band and pins the unplaced members it joins', () => {
    const plan = planCodeSwimlaneLanes(planning(), [row('a', 'l1')]);
    expect(plan?.lanesCodeTypeId).toBe('area');
    // a overlaps b in time, so it takes the lane below; b and c are written where they are drawn.
    expect(plan?.lanes).toEqual(
      expect.arrayContaining([
        { id: 'a', version: 3, laneIndex: 1 },
        { id: 'b', version: 3, laneIndex: 0 },
        { id: 'c', version: 3, laneIndex: 0 },
      ]),
    );
    expect(plan?.lanes).toHaveLength(3);
  });

  it('writes nothing for a band the write does not touch', () => {
    const ids = planCodeSwimlaneLanes(planning(), [row('a', 'l1')])?.lanes.map((l) => l.id);
    expect(ids).not.toContain('d');
    expect(ids).not.toContain('e');
  });

  it('plans a value nobody uses yet as an empty band the movers pack into', () => {
    const plan = planCodeSwimlaneLanes(planning(), [row('a', 'l2'), row('b', 'l2')]);
    // a and b overlap in time, so the second takes the next lane; neither is refused. c, left behind
    // in Level 1, is pinned where it is drawn.
    expect(plan?.lanes.map((l) => [l.id, l.laneIndex]).sort()).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ]);
  });

  it('sends a mover to "No Area" when the code is cleared, below the bands', () => {
    const plan = planCodeSwimlaneLanes(planning(), [row('d', null)]);
    // e is already in "No Area" at lane 0 and overlaps d in time, so d goes to lane 1; e is unplaced
    // and is written where it is drawn.
    expect(plan?.lanes.map((l) => [l.id, l.laneIndex]).sort()).toEqual([
      ['d', 1],
      ['e', 0],
    ]);
  });

  it('plans several destinations in one pass', () => {
    const plan = planCodeSwimlaneLanes(planning(), [row('a', 'rf'), row('e', 'l1')]);
    expect(plan?.lanes.find((l) => l.id === 'a')?.laneIndex).toBe(1);
    expect(plan?.lanes.find((l) => l.id === 'e')?.laneIndex).toBe(1);
  });

  it('is null for a write that touches no value of the source type', () => {
    const other = [{ id: 'a', version: 3, codes: [{ codeTypeId: 'trade', codeValueId: 'x' }] }];
    expect(planCodeSwimlaneLanes(planning(), other)).toBeNull();
  });

  it('leaves out a WBS summary, which is never a member of a code swimlane', () => {
    const withSummary = [...ACTIVITIES, bar('s', 'gf', 0, 3, { type: 'WBS_SUMMARY' })];
    expect(planCodeSwimlaneLanes(planning(withSummary), [row('s', 'l1')])).toBeNull();
  });

  it('leaves out a bar that is not drawn instead of refusing the write', () => {
    const undrawn = [
      ...ACTIVITIES,
      bar('u', 'gf', 0, 3, { visualEffectiveStart: null, visualEffectiveFinish: null }),
    ];
    const plan = planCodeSwimlaneLanes(planning(undrawn), [row('u', 'l1'), row('a', 'l1')]);
    expect(plan?.lanes.map((l) => l.id)).not.toContain('u');
    expect(plan?.lanes.map((l) => l.id)).toContain('a');
  });

  it('is null when the plan is not drawn from a code, or the picture is not there yet', () => {
    expect(
      planCodeSwimlaneLanes(planning(ACTIVITIES, { input: null }), [row('a', 'l1')]),
    ).toBeNull();
    expect(
      planCodeSwimlaneLanes(planning(ACTIVITIES, { dataDate: null }), [row('a', 'l1')]),
    ).toBeNull();
    expect(
      planCodeSwimlaneLanes(planning(ACTIVITIES, { activities: undefined }), [row('a', 'l1')]),
    ).toBeNull();
  });

  it('is null when every mover is already drawn in its target band', () => {
    expect(planCodeSwimlaneLanes(planning(), [row('b', 'l1')])).toBeNull();
  });

  it('states a mover at the version it sends, not the list’s', () => {
    const plan = planCodeSwimlaneLanes(planning(), [row('a', 'l1', 9)]);
    expect(plan?.lanes.find((l) => l.id === 'a')?.version).toBe(9);
    expect(plan?.lanes.find((l) => l.id === 'b')?.version).toBe(3);
  });
});

describe('planCodeSwimlaneMove', () => {
  it('is the strict move onto a band on screen', () => {
    const move = planCodeSwimlaneMove(planning(), ['a'], 'rf');
    expect(move?.kind).toBe('write');
    if (move?.kind !== 'write') return;
    expect(move.placements.find((p) => p.id === 'a')).toMatchObject({ swimlaneId: 'rf', lane: 1 });
  });

  it('refuses a value that is not a band, which Set code… is for', () => {
    expect(planCodeSwimlaneMove(planning(), ['a'], 'l2')).toEqual({
      kind: 'refuse',
      reason: SWIMLANE_GONE_REASON,
    });
  });

  it('stays when everything is in the band already, and is null while the picture is not there', () => {
    expect(planCodeSwimlaneMove(planning(), ['b', 'c'], 'l1')?.kind).toBe('stay');
    expect(planCodeSwimlaneMove(planning(ACTIVITIES, { input: null }), ['a'], 'rf')).toBeNull();
  });
});
