import { describe, expect, it } from 'vitest';

import {
  arrowhead,
  bundleCorridors,
  BUNDLE_TOLERANCE_PX,
  ARROWHEAD_HALF_W_PX,
  ARROWHEAD_PX,
  ARROWHEAD_ROUTED_PX,
  FAN_OUT_STEP_PX,
  isLaneFreeAt,
  laneIntervalIndex,
  MAX_CORRIDOR_CANDIDATES,
  routeOrthogonal,
  type LaneIntervalIndex,
  type RenderActivity,
  type Viewport,
} from './render-model';

/**
 * **Obstacle-aware link routing** (ADR-0064 M2). A link that runs straight through an unrelated
 * bar is the single most common complaint about a dense TSLD — the diagram is meant to show which
 * work drives which, and a line crossing a bar it has nothing to do with reads as logic that isn't
 * there.
 *
 * The parity assertion below is the load-bearing one: with no obstacle index, `routeOrthogonal`
 * must return **exactly** what it always returned, point for point. That is what lets this land
 * without a flag inside the geometry itself.
 */
const VIEW: Viewport = { pxPerDay: 20, originX: 0, originY: 0 };

/** A drawn bar at `[start, finish]` inclusive ISO dates — the fields `activityRect` actually reads. */
function task(id: string, laneIndex: number, start: string, finish: string): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex,
    label: id,
    earlyStart: start,
    earlyFinish: finish,
    isCritical: false,
    isNearCritical: false,
  };
}

describe('laneIntervalIndex', () => {
  it('is empty for an empty scene, and reports every x free', () => {
    const index = laneIntervalIndex([], VIEW, '2026-01-01');
    expect(index.size).toBe(0);
    expect(isLaneFreeAt(index, 0, 100)).toBe(true);
  });

  it('reports a bar’s own span as occupied and its flanks as free', () => {
    const index = laneIntervalIndex([task('a', 0, '2026-01-03', '2026-01-05')], VIEW, '2026-01-01');
    const spans = index.get(0)?.spans ?? [];
    expect(spans).toHaveLength(1);
    const [x0, x1] = spans[0]!;
    expect(isLaneFreeAt(index, 0, (x0 + x1) / 2)).toBe(false);
    expect(isLaneFreeAt(index, 0, x0 - 5)).toBe(true);
    expect(isLaneFreeAt(index, 0, x1 + 5)).toBe(true);
  });

  it('merges overlapping bars in one lane into a single span', () => {
    // Two bars CAN overlap in a lane — `lane-overlap.ts` models that conflict — and an unmerged
    // index would make the free test a scan instead of a binary search.
    const index = laneIntervalIndex(
      [task('a', 0, '2026-01-01', '2026-01-05'), task('b', 0, '2026-01-03', '2026-01-07')],
      VIEW,
      '2026-01-01',
    );
    expect(index.get(0)?.spans).toHaveLength(1);
  });

  it('keeps disjoint bars in one lane separate, and the gap between them free', () => {
    const index = laneIntervalIndex(
      [task('a', 0, '2026-01-01', '2026-01-02'), task('b', 0, '2026-01-11', '2026-01-12')],
      VIEW,
      '2026-01-01',
    );
    const spans = index.get(0)?.spans ?? [];
    expect(spans).toHaveLength(2);
    expect(isLaneFreeAt(index, 0, (spans[0]![1] + spans[1]![0]) / 2)).toBe(true);
  });

  it('indexes lanes independently', () => {
    const index = laneIntervalIndex(
      [task('a', 0, '2026-01-01', '2026-01-05'), task('b', 3, '2026-01-01', '2026-01-05')],
      VIEW,
      '2026-01-01',
    );
    expect([...index.keys()].sort()).toEqual([0, 3]);
  });
});

describe('routeOrthogonal — parity with no obstacle index', () => {
  it.each(['FS', 'SS', 'FF', 'SF'] as const)('emits today’s shape for %s', (type) => {
    const from = { x: 100, y: 20 };
    const to = { x: 300, y: 76 };
    const route = routeOrthogonal(from, to, type, VIEW);
    // Four points, one vertical elbow — the shape every existing test and screenshot assumes.
    expect(route).toHaveLength(4);
    expect(route[0]).toEqual(from);
    expect(route[3]).toEqual(to);
    expect(route[1]!.x).toBe(route[2]!.x);
  });

  it('still collapses a same-lane link to a straight segment', () => {
    const route = routeOrthogonal({ x: 10, y: 20 }, { x: 90, y: 20 }, 'FS', VIEW);
    expect(route).toEqual([
      { x: 10, y: 20 },
      { x: 90, y: 20 },
    ]);
  });
});

describe('routeOrthogonal — obstacle awareness', () => {
  const empty: LaneIntervalIndex = new Map();
  const obstaclesWith = (index: LaneIntervalIndex, fromLane: number, toLane: number) => ({
    index,
    fromLane,
    toLane,
    laneHeight: 28,
    barHeight: 18,
  });

  it('is byte-identical to the parity shape when no lane is crossed', () => {
    // Adjacent lanes cross nothing, so there is nothing to avoid and no reason to move the line.
    const from = { x: 100, y: 20 };
    const to = { x: 300, y: 48 };
    const plain = routeOrthogonal(from, to, 'FS', VIEW);
    const routed = routeOrthogonal(from, to, 'FS', VIEW, 0, obstaclesWith(empty, 0, 1));
    expect(routed).toEqual(plain);
  });

  it('keeps the preferred elbow when the crossed lane is clear there', () => {
    const from = { x: 100, y: 20 };
    const to = { x: 300, y: 104 };
    const index = laneIntervalIndex(
      [task('mid', 1, '2026-01-31', '2026-02-01')],
      VIEW,
      '2026-01-01',
    );
    const plain = routeOrthogonal(from, to, 'FS', VIEW);
    expect(routeOrthogonal(from, to, 'FS', VIEW, 0, obstaclesWith(index, 0, 2))).toEqual(plain);
  });

  it('moves the elbow off a bar in the crossed lane', () => {
    const from = { x: 100, y: 20 };
    const to = { x: 400, y: 104 };
    // A bar sitting exactly where the FS elbow would fall.
    const plain = routeOrthogonal(from, to, 'FS', VIEW);
    const elbowX = plain[1]!.x;
    const index: LaneIntervalIndex = new Map([[1, { spans: [[elbowX - 6, elbowX + 6]] }]]);
    const routed = routeOrthogonal(from, to, 'FS', VIEW, 0, obstaclesWith(index, 0, 2));
    expect(routed[1]!.x).not.toBe(elbowX);
    expect(isLaneFreeAt(index, 1, routed[1]!.x)).toBe(true);
  });

  it('is deterministic — the same input routes the same way twice', () => {
    const from = { x: 100, y: 20 };
    const to = { x: 400, y: 104 };
    const index: LaneIntervalIndex = new Map([[1, { spans: [[90, 130]] }]]);
    const a = routeOrthogonal(from, to, 'FS', VIEW, 0, obstaclesWith(index, 0, 2));
    const b = routeOrthogonal(from, to, 'FS', VIEW, 0, obstaclesWith(index, 0, 2));
    // A route that varies between frames reads as the diagram twitching.
    expect(a).toEqual(b);
  });

  it('falls back to a 5-point gutter route when every corridor is blocked', () => {
    const from = { x: 100, y: 20 };
    const to = { x: 400, y: 104 };
    // A lane blocked across the whole span: no single vertical corridor can cross it.
    const index: LaneIntervalIndex = new Map([[1, { spans: [[-10_000, 10_000]] }]]);
    const routed = routeOrthogonal(from, to, 'FS', VIEW, 0, obstaclesWith(index, 0, 2));
    expect(routed).toHaveLength(6);
    // Two verticals joined by a horizontal leg — the VHV shape.
    expect(routed[1]!.x).toBe(routed[2]!.x);
    expect(routed[2]!.y).toBe(routed[3]!.y);
    expect(routed[3]!.x).toBe(routed[4]!.x);
  });

  it('tries no more than the documented number of corridors', () => {
    // The bound is the contract: an unbounded search on the per-frame paint path is how a draw
    // budget dies, and it would fail on a dense plan rather than on the toy that reviewed it.
    expect(MAX_CORRIDOR_CANDIDATES).toBe(4);
  });
});

/**
 * **The routed arrowhead** (T17). The head is the only thing on a link that says which way the
 * dependency runs, and at Month zoom the 5 px equilateral head is close to invisible.
 */
describe('arrowhead — routed size (T17)', () => {
  const LINE = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('is unchanged when no size is passed', () => {
    // The default path is every existing caller, including flag-off. Its shape is the parity claim.
    const head = arrowhead(LINE)!;
    expect(head[0]).toEqual({ x: 100, y: 0 });
    expect(head[1].x).toBeCloseTo(100 - ARROWHEAD_PX);
    expect(Math.abs(head[1].y)).toBeCloseTo(ARROWHEAD_PX / 2);
  });

  it('grows in LENGTH only — the barbs stay at the fan-out step', () => {
    const head = arrowhead(LINE, ARROWHEAD_ROUTED_PX, ARROWHEAD_HALF_W_PX)!;
    expect(head[1].x).toBeCloseTo(100 - ARROWHEAD_ROUTED_PX);
    expect(ARROWHEAD_ROUTED_PX).toBeGreaterThan(ARROWHEAD_PX);
    // The reason it is not `size / 2`: a wider barb would cross the neighbouring line of a fanned
    // bundle (ADR-0052 M5), trading one legibility defect for another.
    expect(Math.abs(head[1].y)).toBeCloseTo(FAN_OUT_STEP_PX);
    expect(ARROWHEAD_HALF_W_PX).toBeLessThanOrEqual(FAN_OUT_STEP_PX);
  });
});

/**
 * **Trunk/branch bundling** (ADR-0065 M3). A hub with a dozen successors draws a dozen verticals
 * two or three pixels apart — a comb, which reads as noise rather than as "these all follow that".
 */
describe('bundleCorridors — co-linear runs become one trunk (M3)', () => {
  /** A four-point elbow from lane 0 to lane 2 with its corridor at `x`. */
  function elbow(x: number): {
    line: { x: number; y: number }[];
    fromLane: number;
    toLane: number;
  } {
    return {
      line: [
        { x: 0, y: 14 },
        { x, y: 14 },
        { x, y: 70 },
        { x: 200, y: 70 },
      ],
      fromLane: 0,
      toLane: 2,
    };
  }

  const CLEAR: LaneIntervalIndex = new Map();

  it('snaps a spread of near-identical corridors onto one x', () => {
    const candidates = [elbow(100), elbow(102), elbow(104)];
    expect(bundleCorridors(candidates, CLEAR)).toBe(2);
    const xs = candidates.map((c) => c.line[1]!.x);
    expect(new Set(xs).size).toBe(1);
    // The median, not the first — so adding a candidate at either end moves the trunk by at most
    // one position rather than dragging every line to whichever happened to sort first.
    expect(xs[0]).toBe(102);
  });

  it('leaves corridors further apart than the tolerance alone', () => {
    const far = BUNDLE_TOLERANCE_PX + 1;
    const candidates = [elbow(100), elbow(100 + far)];
    expect(bundleCorridors(candidates, CLEAR)).toBe(0);
    expect(candidates[1]!.line[1]!.x).toBe(100 + far);
  });

  it('never snaps a corridor back through the bar M2 moved it off', () => {
    // THE test. Without the free-check, bundling silently reverts obstacle avoidance — the new
    // feature undoing the old one, on exactly the dense plans where both matter.
    //
    // The fixture is built so the trunk lands inside the obstacle: three corridors within the
    // tolerance at 96 / 99 / 102, a bar spanning 98–106, so the median (99) is blocked. Every move
    // must be refused, and each line must stay exactly where routing put it.
    const blocked: LaneIntervalIndex = new Map([[1, { spans: [[98, 106]] }]]);
    const candidates = [elbow(96), elbow(99), elbow(102)];
    expect(bundleCorridors(candidates, blocked)).toBe(0);
    expect(candidates.map((c) => c.line[1]!.x)).toEqual([96, 99, 102]);
  });

  it('is deterministic — the same input bundles the same way every time', () => {
    const once = [elbow(100), elbow(103), elbow(105)];
    const twice = [elbow(100), elbow(103), elbow(105)];
    bundleCorridors(once, CLEAR);
    bundleCorridors(twice, CLEAR);
    expect(once.map((c) => c.line[1]!.x)).toEqual(twice.map((c) => c.line[1]!.x));
  });

  it('ignores adjacent-lane links, which cross nothing', () => {
    const adjacent = { ...elbow(100), toLane: 1 };
    const also = { ...elbow(103), toLane: 1 };
    expect(bundleCorridors([adjacent, also], CLEAR)).toBe(0);
  });

  it('does nothing at all with fewer than two corridors', () => {
    const one = [elbow(100)];
    expect(bundleCorridors(one, CLEAR)).toBe(0);
    expect(one[0]!.line[1]!.x).toBe(100);
  });
});
