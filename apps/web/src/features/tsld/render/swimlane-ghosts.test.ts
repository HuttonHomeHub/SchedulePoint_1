import type { SwimlaneLaneBasis } from '@repo/types';
import { describe, expect, it } from 'vitest';

import type { CompareGhost } from './paint';
import { ghostLaneOf, placeCompareGhosts, type GhostLaneScene } from './swimlane-ghosts';

// Mechanical takes display lanes 0-1, Electrical 2, and "No swimlane" 3.
const SCENE: GhostLaneScene = {
  source: 'MANUAL',
  displayLanes: new Map([
    ['live', 2],
    ['other', 0],
  ]),
  extents: [
    { id: 's1', firstLane: 0, laneCount: 2 },
    { id: 's2', firstLane: 2, laneCount: 1 },
    { id: null, firstLane: 3, laneCount: 1 },
  ],
};

function ghost(over: Partial<CompareGhost> = {}): CompareGhost {
  return {
    activityId: 'live',
    name: 'Live',
    fromStart: '2026-01-01',
    fromFinish: '2026-01-05',
    laneIndex: 0,
    type: 'TASK',
    removed: false,
    ...over,
  };
}
const frozen = (basis: SwimlaneLaneBasis, swimlaneId: string | null, laneIndex: number) => ({
  basis,
  swimlaneId,
  laneIndex,
});

describe('ghostLaneOf', () => {
  it('is the stored lane with no scene', () => {
    expect(ghostLaneOf(null, 'live', 7)).toBe(7);
  });
  it('is the bar’s display lane, and null for an activity with no bar', () => {
    expect(ghostLaneOf(SCENE, 'live', 0)).toBe(2);
    expect(ghostLaneOf(SCENE, 'nobar', 0)).toBeNull();
  });
});

describe('placeCompareGhosts', () => {
  it('returns the same array, and counts nothing, with no scene', () => {
    const ghosts = [ghost()];
    const out = placeCompareGhosts(ghosts, null);
    expect(out.ghosts).toBe(ghosts);
    expect(out.counted).toBe(0);
  });

  it('draws a live activity’s ghost on its display lane, not its frozen lane', () => {
    const out = placeCompareGhosts([ghost({ laneIndex: 5 })], SCENE);
    expect(out.ghosts.map((g) => g.laneIndex)).toEqual([2]);
  });

  it('counts a live activity’s ghost when it has no bar', () => {
    const out = placeCompareGhosts([ghost({ activityId: 'nobar' })], SCENE);
    expect(out).toEqual({ ghosts: [], counted: 1 });
  });

  it('places removed work from its frozen swimlane and lane (SQ-7 yes)', () => {
    const out = placeCompareGhosts(
      [
        ghost({
          activityId: 'gone',
          removed: true,
          frozenSwimlaneId: 's1',
          frozenLanes: [frozen('SWIMLANE', 's1', 1), frozen('WBS_SUMMARY', null, 0)],
        }),
      ],
      SCENE,
    );
    expect(out.ghosts.map((g) => g.laneIndex)).toEqual([1]);
  });

  it('files removed work whose swimlane no longer exists under "No swimlane"', () => {
    const out = placeCompareGhosts(
      [
        ghost({
          activityId: 'gone',
          removed: true,
          frozenSwimlaneId: 'deleted',
          frozenLanes: [frozen('NO_SWIMLANE', null, 0)],
        }),
      ],
      SCENE,
    );
    expect(out.ghosts.map((g) => g.laneIndex)).toEqual([3]);
  });

  it.each([
    ['a NONE baseline froze nothing (frozenLanes undefined)', {}],
    ['frozenLanes is empty', { frozenSwimlaneId: 's2', frozenLanes: [] }],
    [
      'no frozen row exists for the basis',
      { frozenSwimlaneId: 's2', frozenLanes: [frozen('SWIMLANE', 's1', 0)] },
    ],
    [
      'the NO_SWIMLANE row is missing for a deleted swimlane',
      { frozenSwimlaneId: 'deleted', frozenLanes: [frozen('SWIMLANE', 'deleted', 0)] },
    ],
    [
      'the frozen lane equals the swimlane’s lane count',
      { frozenSwimlaneId: 's1', frozenLanes: [frozen('SWIMLANE', 's1', 2)] },
    ],
    [
      'the frozen lane lies outside the swimlane today',
      { frozenSwimlaneId: 's2', frozenLanes: [frozen('SWIMLANE', 's2', 1)] },
    ],
  ])('counts removed work and never guesses a lane when %s', (_why, frozenFacts) => {
    const out = placeCompareGhosts(
      [ghost({ activityId: 'gone', removed: true, ...frozenFacts })],
      SCENE,
    );
    expect(out).toEqual({ ghosts: [], counted: 1 });
  });
});

describe('placeCompareGhosts on a WBS-grouped scene (M3 guard)', () => {
  it('counts removed work rather than guessing a basis, so it never lands in "No swimlane"', () => {
    const out = placeCompareGhosts(
      [
        ghost({
          activityId: 'gone',
          removed: true,
          frozenSwimlaneId: null,
          frozenLanes: [frozen('NO_SWIMLANE', null, 0)],
        }),
      ],
      { ...SCENE, source: 'WBS' },
    );
    expect(out).toEqual({ ghosts: [], counted: 1 });
  });
});

describe('placeCompareGhosts on a code-grouped scene (P6 M4-T6)', () => {
  // Level 1 is a band of two lanes at 0-1, Roof one lane at 2, and "No Area" (id null) lane 3.
  const CODE_SCENE: GhostLaneScene = {
    source: 'ACTIVITY_CODE',
    codeTypeId: 'area',
    displayLanes: new Map(),
    extents: [
      { id: 'l1', firstLane: 0, laneCount: 2 },
      { id: 'roof', firstLane: 2, laneCount: 1 },
      { id: null, firstLane: 3, laneCount: 1 },
    ],
  };
  const gone = (over: Partial<CompareGhost> = {}): CompareGhost =>
    ghost({
      activityId: 'gone',
      removed: true,
      frozenCodeTypeId: 'area',
      frozenCodeValueId: 'l1',
      frozenCodeLane: { laneIndex: 1 },
      ...over,
    });

  it('draws removed work in its frozen band at its frozen lane', () => {
    const out = placeCompareGhosts(
      [gone(), gone({ frozenCodeValueId: 'roof', frozenCodeLane: { laneIndex: 0 } })],
      CODE_SCENE,
    );
    expect(out.ghosts.map((g) => g.laneIndex)).toEqual([1, 2]);
    expect(out.counted).toBe(0);
  });

  it('draws removed work that held no value in the No <type> band', () => {
    const out = placeCompareGhosts(
      [gone({ frozenCodeValueId: null, frozenCodeLane: { laneIndex: 0 } })],
      CODE_SCENE,
    );
    expect(out.ghosts.map((g) => g.laneIndex)).toEqual([3]);
  });

  it.each([
    ['a baseline from before codes (no frozen type)', { frozenCodeTypeId: undefined }],
    ['a baseline frozen under another type', { frozenCodeTypeId: 'trade' }],
    ['a frozen value that is no longer a drawn band', { frozenCodeValueId: 'deleted' }],
    ['no frozen lane (never placed)', { frozenCodeLane: null }],
    ['a frozen lane past the band’s rows', { frozenCodeLane: { laneIndex: 2 } }],
    [
      'a baseline frozen by hand, which has swimlane facts and no code',
      {
        frozenCodeTypeId: undefined,
        frozenSwimlaneId: 'l1',
        frozenLanes: [frozen('SWIMLANE', 'l1', 0)],
      },
    ],
  ])('counts removed work and never derives a lane when %s', (_why, over) => {
    const out = placeCompareGhosts([gone(over as Partial<CompareGhost>)], CODE_SCENE);
    expect(out).toEqual({ ghosts: [], counted: 1 });
  });

  it('counts when today’s scene carries no type id', () => {
    const { codeTypeId: _drop, ...noType } = CODE_SCENE;
    expect(placeCompareGhosts([gone()], noType)).toEqual({ ghosts: [], counted: 1 });
  });

  it('still draws a live activity’s ghost on its display lane', () => {
    const scene = { ...CODE_SCENE, displayLanes: new Map([['live', 2]]) };
    expect(placeCompareGhosts([ghost()], scene).ghosts.map((g) => g.laneIndex)).toEqual([2]);
  });
});
