import { describe, expect, it } from 'vitest';

import {
  ARROWHEAD_HALF_W_PX,
  ARROWHEAD_ROUTED_PX,
  arrowhead,
  NEAR_CRITICAL_DOT_R,
  NODE_RADIUS,
  NODE_REACH_PX,
  NODE_RIM_MAX_W,
  NODE_RIM_W,
  nodeMarks,
  sharesNode,
  trimPolylineEnd,
  type Rect,
} from './render-model';

/**
 * NetPoint grammar M2-T3 (spec §4.2 G4, §4.13 A1): which nodes a frame paints, and where a link's
 * head stops. Pure, so each rule is asserted on its own geometry rather than through a call log.
 */
const bar = (x: number, w: number): Rect => ({ x, y: 30, w, h: 6 });
const act = (
  id: string,
  over: {
    type?: 'TASK' | 'LEVEL_OF_EFFORT' | 'WBS_SUMMARY' | 'START_MILESTONE';
    isCritical?: boolean;
    isNearCritical?: boolean;
  } = {},
) => ({
  id,
  type: over.type ?? ('TASK' as const),
  isCritical: over.isCritical ?? false,
  isNearCritical: over.isNearCritical ?? false,
});

describe('nodeMarks — one node per end, one where two bars meet', () => {
  it('draws two nodes on a lone task, on its centre-line at each end', () => {
    const marks = nodeMarks([[{ activity: act('a'), rect: bar(10, 50) }]]);
    expect(marks.map(({ x, y }) => [x, y])).toEqual([
      [10, 33],
      [60, 33],
    ]);
  });

  it('shares ONE node where the next task starts at this one’s end, and two where it does not', () => {
    const meeting = nodeMarks([
      [
        { activity: act('a'), rect: bar(10, 50) },
        { activity: act('b'), rect: bar(60, 50) },
      ],
    ]);
    expect(meeting).toHaveLength(3);
    const apart = nodeMarks([
      [
        { activity: act('a'), rect: bar(10, 50) },
        { activity: act('b'), rect: bar(70, 50) },
      ],
    ]);
    expect(apart).toHaveLength(4);
  });

  it('gives a shared node the HEAVIER rung, and that activity’s ink (US-3)', () => {
    const [, shared] = nodeMarks([
      [
        { activity: act('a', { isCritical: true }), rect: bar(10, 50) },
        { activity: act('b'), rect: bar(60, 50) },
      ],
    ]);
    expect(shared).toMatchObject({ x: 60, rung: 'critical', ownerId: 'a' });
    const [, equal] = nodeMarks([
      [
        { activity: act('a', { isNearCritical: true }), rect: bar(10, 50) },
        { activity: act('b', { isNearCritical: true }), rect: bar(60, 50) },
      ],
    ]);
    // Equal rungs: the later activity owns the node (the one whose start it is).
    expect(equal).toMatchObject({ rung: 'near', ownerId: 'b' });
  });

  it('draws no node on a milestone, an LOE or a WBS summary, and a task never shares with one', () => {
    for (const type of ['START_MILESTONE', 'LEVEL_OF_EFFORT', 'WBS_SUMMARY'] as const) {
      expect(nodeMarks([[{ activity: act('x', { type }), rect: bar(10, 50) }]])).toEqual([]);
      const beside = nodeMarks([
        [
          { activity: act('a'), rect: bar(10, 50) },
          { activity: act('x', { type }), rect: bar(60, 50) },
        ],
      ]);
      expect(beside, type).toHaveLength(2);
    }
  });

  it('does not share across an overlap: the later start sits inside the earlier bar', () => {
    expect(sharesNode(bar(10, 50), bar(40, 50))).toBe(false);
    expect(sharesNode(bar(10, 50), bar(60, 50))).toBe(true);
    expect(sharesNode(bar(10, 50), bar(63, 50))).toBe(true);
    expect(sharesNode(bar(10, 50), bar(64, 50))).toBe(false);
  });
});

describe('the near-critical dot (product owner, 2026-09-24)', () => {
  it('reads as a dot, and leaves a ring of ground between itself and the near rim', () => {
    // 4 px across is the smallest mark that reads as a dot rather than a speck.
    expect(NEAR_CRITICAL_DOT_R * 2).toBeGreaterThanOrEqual(4);
    // The rim is stroked on the radius, so its inner edge is half its weight inside. At least 2 px
    // of ground must separate the two, or the dot merges into the rim and reads as a heavier rim —
    // the very weight comparison the dot exists to avoid.
    const rimInner = NODE_RADIUS - NODE_RIM_W.near / 2;
    expect(rimInner - NEAR_CRITICAL_DOT_R).toBeGreaterThanOrEqual(2);
  });
});

describe('the node rim and the arrowhead (spec §4.13 A1)', () => {
  it('weights the rim one step per rung, heaviest at NODE_RIM_MAX_W', () => {
    expect([NODE_RIM_W.none, NODE_RIM_W.near, NODE_RIM_W.critical]).toEqual([1, 2, NODE_RIM_MAX_W]);
    expect(NODE_REACH_PX).toBe(NODE_RADIUS + NODE_RIM_MAX_W / 2);
  });

  it('keeps at least 6 px of a head outside the disc it points at', () => {
    // A horizontal final leg ending on a node centre at (200, 50), and the same with an elbow a few
    // pixels before the node, where the pull-back crosses the corner.
    for (const line of [
      [
        { x: 0, y: 50 },
        { x: 200, y: 50 },
      ],
      [
        { x: 150, y: 0 },
        { x: 150, y: 50 },
        { x: 200, y: 50 },
      ],
    ]) {
      const head = arrowhead(
        trimPolylineEnd(line, NODE_REACH_PX),
        ARROWHEAD_ROUTED_PX,
        ARROWHEAD_HALF_W_PX,
      )!;
      const [tip] = head;
      const tipDistance = Math.hypot(tip.x - 200, tip.y - 50);
      // The tip lands on the rim's outer edge, so the whole head lies outside the disc.
      expect(tipDistance).toBeCloseTo(NODE_REACH_PX, 6);
      const outside = ARROWHEAD_ROUTED_PX - Math.max(0, NODE_REACH_PX - tipDistance);
      expect(outside).toBeGreaterThanOrEqual(6);
    }
  });

  it('trims across a corner and gives up on a line shorter than the trim', () => {
    const cornered = trimPolylineEnd(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 4, y: 10 },
      ],
      9,
    );
    expect(cornered).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
    ]);
    expect(
      trimPolylineEnd(
        [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
        ],
        9,
      ),
    ).toHaveLength(1);
  });
});
