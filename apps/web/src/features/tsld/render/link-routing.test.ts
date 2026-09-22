import { describe, expect, it } from 'vitest';

// The geometry core, imported directly: these three are the DEFINITION of screen space, and the
// assertion below is about agreeing with them rather than about where they are re-exported from.
import { BAR_HEIGHT, LANE_HEIGHT, screenYOfLane } from './geometry';
import {
  arrowhead,
  bundleCorridors,
  chooseCorridorsByCrossing,
  corridorGap,
  BUNDLE_TOLERANCE_PX,
  ARROWHEAD_HALF_W_PX,
  ARROWHEAD_PX,
  ARROWHEAD_ROUTED_PX,
  FAN_OUT_STEP_PX,
  isLaneFreeAt,
  isLaneFreeBetween,
  laneIntervalIndex,
  laneOverlapBetween,
  MAX_CORRIDOR_CANDIDATES,
  routeOrthogonal,
  type LaneIntervalIndex,
} from './link-routing';
// The two render types stay on the barrel: they are geometry, re-exported, and importing them
// from `./geometry` here would say the test knows where they live rather than that it uses them.
import type { RenderActivity, Viewport } from './render-model';

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

  /**
   * **The point case is a true degenerate, and this asserts it rather than assuming it**
   * (logic-legibility M0-T1 step 4). The router asks about a corridor's x and a leg asks about a
   * span; the whole reason one predicate answers both is that the second reduces to the first, and
   * the measurement harness imports the same symbol so an occlusion it counts is an occlusion the
   * router would refuse. Two opinions about where a bar is would disagree exactly when it mattered
   * — the ADR-0065 `routeOrthogonal` argument, one level down at the predicate.
   *
   * **The control re-states the point rule rather than calling `isLaneFreeAt`, and that is the
   * whole value of the case.** The first version of this test asserted
   * `isLaneFreeBetween(i, l, x, x) === isLaneFreeAt(i, l, x)` — which is VACUOUS, because
   * `isLaneFreeAt` delegates to `isLaneFreeBetween`, so it compared a function to itself and could
   * never fail. Proven rather than reasoned: mutating the containment boundary to `<=` left all 35
   * cases green. A generous reader owes a control that measures a DIFFERENT quantity (ADR-0124),
   * and here that means a literal, independent statement of "x lies inside some span".
   *
   * Swept at a sub-pixel step across the spans and both flanks, and then pinned at the EXACT
   * edges, because a containment boundary is right at every midpoint and wrong only where the
   * integer sweep never lands.
   */
  it('is the degenerate interval, against an independently stated point rule', () => {
    const index = laneIntervalIndex(
      [
        task('a', 0, '2026-01-03', '2026-01-05'),
        task('b', 0, '2026-01-20', '2026-01-24'),
        task('c', 0, '2026-02-10', '2026-02-11'),
      ],
      VIEW,
      '2026-01-01',
    );
    const spans = index.get(0)!.spans;
    const insideAnySpan = (x: number): boolean =>
      spans.some(([start, end]) => x >= start && x <= end);

    for (let x = -40; x <= 700; x += 0.25) {
      expect(isLaneFreeBetween(index, 0, x, x)).toBe(!insideAnySpan(x));
      expect(isLaneFreeAt(index, 0, x)).toBe(!insideAnySpan(x));
    }

    // The exact edges, which the sweep steps over: containment is CLOSED at both ends.
    for (const [start, end] of spans) {
      expect(isLaneFreeAt(index, 0, start)).toBe(false);
      expect(isLaneFreeAt(index, 0, end)).toBe(false);
      expect(isLaneFreeBetween(index, 0, end, end)).toBe(false);
      // An interval whose LOW end sits exactly on a bar's right edge is blocked by that bar —
      // the case a `<` / `<=` slip changes and nothing else does.
      expect(isLaneFreeBetween(index, 0, end, end + 50)).toBe(false);
    }
  });

  it('reports a span blocked when it touches or straddles ANY bar, and free between two', () => {
    // Closed containment at both ends, which is what makes the degeneracy above hold. A leg that
    // merely touches a bar's edge is blocked — deliberate, and the reason a caller measuring
    // OCCLUSION owes an endpoint rule of its own rather than buying one here with an epsilon.
    const index = laneIntervalIndex(
      [task('a', 0, '2026-01-03', '2026-01-05'), task('b', 0, '2026-01-20', '2026-01-24')],
      VIEW,
      '2026-01-01',
    );
    const [[a0, a1], [b0, b1]] = index.get(0)!.spans as [[number, number], [number, number]];
    expect(isLaneFreeBetween(index, 0, a1 + 1, b0 - 1)).toBe(true); // the clear water between
    expect(isLaneFreeBetween(index, 0, a1, b0)).toBe(false); // touching both edges
    expect(isLaneFreeBetween(index, 0, a0 - 50, a0 - 1)).toBe(true); // entirely left of the first
    expect(isLaneFreeBetween(index, 0, b1 + 1, b1 + 50)).toBe(true); // entirely right of the last
    expect(isLaneFreeBetween(index, 0, a0 - 50, b1 + 50)).toBe(false); // straddling both
    expect(isLaneFreeBetween(index, 0, (a0 + a1) / 2, (b0 + b1) / 2)).toBe(false); // bar to bar
    // Reversed arguments describe the same interval — a leg is drawn right-to-left as often as not.
    expect(isLaneFreeBetween(index, 0, b0 - 1, a1 + 1)).toBe(true);
  });

  /**
   * **The open predicate, against a brute-force control that shares no code with it.**
   *
   * `laneOverlapBetween` exists because the closed one answers the wrong question for occlusion:
   * every link's horizontal leg begins on its own bar's edge, so `isLaneFreeBetween` reports every
   * link in a plan as hidden by itself. Measured before this function was written — 100 % of Unit
   * 300's links, 391 of 395 incidents self-anchored — which is the artefact the epic's instrument
   * would otherwise have carried into its own baseline.
   *
   * The control integrates the union of the spans over a fine grid rather than re-deriving the
   * closed form, so it is a different quantity arrived at a different way (ADR-0124). It is
   * compared with a tolerance, because a Riemann sum of a step function is exact only up to its
   * step; the EXACT cases that decide the open/closed boundary are pinned separately below, where
   * no tolerance is involved.
   */
  it('measures overlap with OPEN containment, against an independent integration', () => {
    const index = laneIntervalIndex(
      [
        task('a', 0, '2026-01-03', '2026-01-05'),
        task('b', 0, '2026-01-20', '2026-01-24'),
        task('c', 0, '2026-02-10', '2026-02-11'),
      ],
      VIEW,
      '2026-01-01',
    );
    const spans = index.get(0)!.spans;
    const STEP = 0.05;
    const bruteForce = (from: number, to: number): number => {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      let total = 0;
      for (let x = lo + STEP / 2; x < hi; x += STEP) {
        if (spans.some(([s0, s1]) => x > s0 && x < s1)) total += STEP;
      }
      return total;
    };
    for (const [from, to] of [
      [-40, 700],
      [0, 100],
      [spans[0]![0] - 10, spans[0]![1] + 10],
      [spans[0]![1], spans[1]![0]],
      [spans[1]![0] + 3, spans[2]![1] - 3],
      [spans[2]![1] + 5, 900],
    ] as [number, number][]) {
      expect(laneOverlapBetween(index, 0, from, to)).toBeCloseTo(bruteForce(from, to), 0);
      // Reversed arguments describe the same interval — a leg is drawn right-to-left as often
      // as not, and the router's own predicate normalises the same way.
      expect(laneOverlapBetween(index, 0, to, from)).toBeCloseTo(bruteForce(from, to), 0);
    }

    // The open/closed boundary, exactly — an anchor's signature, and the only case that separates
    // this function from `isLaneFreeBetween`. No tolerance: these are exact zeroes.
    for (const [start, end] of spans) {
      expect(laneOverlapBetween(index, 0, end, end + 50)).toBe(0);
      expect(laneOverlapBetween(index, 0, start - 50, start)).toBe(0);
      expect(laneOverlapBetween(index, 0, start, start)).toBe(0);
      expect(isLaneFreeBetween(index, 0, end, end + 50)).toBe(false); // …and the router differs
      expect(laneOverlapBetween(index, 0, end - 1, end + 50)).toBeCloseTo(1, 6);
    }
    expect(laneOverlapBetween(index, 1, -1000, 1000)).toBe(0); // a lane holding nothing
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

  /**
   * **The gutter leg is in SCREEN space, and this asserts its VALUE rather than its shape**
   * (`docs/specs/diagram-legibility/`, FC-1).
   *
   * The case above is the only exercise this path had, and it could not see the defect for two
   * independent reasons, each sufficient on its own:
   *
   * 1. `VIEW` pins `originY: 0` — **the single value at which a sign error on `view.originY` is
   *    invisible**. `link-routing-bench.ts:141` pins it to 0 too, so the repository's only two
   *    exercises of this code shared one blind spot.
   * 2. It asserts the route's *shape* (`routed[2].y === routed[3].y`) and never where the leg
   *    landed, so even a non-zero origin would have passed.
   *
   * The expected value is **derived from `screenYOfLane`** rather than written as a literal,
   * because `screenYOfLane` is what defines screen space for every other consumer — a literal here
   * would be a second opinion about the same thing and could drift from it silently.
   *
   * Measured against the shipped painter before this landed: the fallback fires on 385 routes
   * across a sweep of two plans, two viewports and two zooms, and panned down on a
   * 2,160-activity plan **58 of 60 fired legs were drawn off-canvas**.
   */
  it.each([0, 32, -500, 1500])('puts the gutter leg in screen space at originY %i', (originY) => {
    const view: Viewport = { ...VIEW, originY };
    const fromLane = 0;
    const toLane = 2;
    // Bar centres, in screen space, for the two endpoint lanes.
    const centreOf = (lane: number): number => screenYOfLane(lane, view) + LANE_HEIGHT / 2;
    const from = { x: 100, y: centreOf(fromLane) };
    const to = { x: 400, y: centreOf(toLane) };
    const index: LaneIntervalIndex = new Map([[1, { spans: [[-10_000, 10_000]] }]]);

    const routed = routeOrthogonal(from, to, 'FS', view, 0, obstaclesWith(index, fromLane, toLane));

    expect(routed).toHaveLength(6);
    // The inter-lane gutter between lane 0 and lane 1: the band under one lane's bar bottom, which
    // is the next lane's top minus the lane's spare height.
    const gutterY =
      screenYOfLane(Math.min(fromLane, toLane) + 1, view) - (LANE_HEIGHT - BAR_HEIGHT) / 2;
    expect(routed[2]!.y).toBeCloseTo(gutterY, 6);
    expect(routed[3]!.y).toBeCloseTo(gutterY, 6);
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

describe('chooseCorridorsByCrossing', () => {
  /**
   * The crossing-aware corridor pass (diagram-legibility M-C3). It moves a four-point elbow to the
   * candidate x its WHOLE line crosses fewest others at, measured against a frozen snapshot.
   *
   * Every case asserts a property rather than a coordinate: the pass is a minimisation over a
   * bounded candidate list, so pinning "it lands on 12" would be pinning the list.
   */
  const GAP = corridorGap(VIEW);

  /** A four-point elbow line, as `routeOrthogonal` builds one. */
  const elbow = (fromX: number, fromY: number, x: number, toX: number, toY: number) => [
    { x: fromX, y: fromY },
    { x, y: fromY },
    { x, y: toY },
    { x: toX, y: toY },
  ];

  /** How many of `others`' horizontals the line's vertical crosses, strictly inside both. */
  function crossings(
    line: { x: number; y: number }[],
    others: { x: number; y: number }[][],
  ): number {
    const vx = line[1]!.x;
    const lo = Math.min(line[1]!.y, line[2]!.y);
    const hi = Math.max(line[1]!.y, line[2]!.y);
    let total = 0;
    for (const other of others) {
      for (let i = 0; i + 1 < other.length; i += 1) {
        const a = other[i]!;
        const b = other[i + 1]!;
        if (a.y !== b.y) continue;
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        if (a.y > lo && a.y < hi && vx > x0 && vx < x1) total += 1;
      }
    }
    return total;
  }

  /** A line whose long tail runs at y = 50 from x = 12 to x = 200. */
  const OBSTRUCTED = () => elbow(5, 10, 12, 200, 50);

  it('moves a corridor off the line it was crossing', () => {
    const crosser = elbow(0, 0, 20, 100, 100);
    const other = OBSTRUCTED();
    expect(crossings(crosser, [other])).toBe(1); // the pinned positive: there IS something to fix

    const moved = chooseCorridorsByCrossing(
      [
        { line: crosser, fromLane: 0, toLane: 3 },
        { line: other, fromLane: 0, toLane: 1 },
      ],
      laneIntervalIndex([], VIEW, '2026-01-01'),
      GAP,
    );

    expect(moved).toBeGreaterThan(0);
    expect(crossings(crosser, [other])).toBe(0);
  });

  it('never moves a corridor onto a bar, even when that is the only way to stop crossing', () => {
    /**
     * The hazard `bundleCorridors` records and checks the same way: a later pass quietly undoing
     * ADR-0065 M2's obstacle avoidance, on exactly the plans where both matter. Here every
     * candidate is blocked, so the correct answer is to leave a crossing in place.
     */
    const crosser = elbow(0, 0, 20, 100, 100);
    const other = OBSTRUCTED();
    const before = JSON.parse(JSON.stringify(crosser)) as typeof crosser;

    // One bar filling the whole of the one lane this corridor crosses.
    const index: LaneIntervalIndex = new Map([[1, { spans: [[-1000, 1000] as [number, number]] }]]);

    const moved = chooseCorridorsByCrossing(
      [
        { line: crosser, fromLane: 0, toLane: 2 },
        { line: other, fromLane: 0, toLane: 1 },
      ],
      index,
      GAP,
    );

    expect(moved).toBe(0);
    expect(crosser).toEqual(before);
  });

  it('is deterministic: the input array order cannot change the lines', () => {
    // ADR-0065's rule — a route that varies between frames reads as the diagram twitching. The
    // pass decides each corridor against a FROZEN snapshot, so the order it walks them in is not
    // an input to any decision.
    const build = () => [elbow(0, 0, 20, 100, 100), OBSTRUCTED(), elbow(3, 5, 18, 120, 95)];
    const forward = build();
    const backward = build();
    const lanes = [
      { fromLane: 0, toLane: 3 },
      { fromLane: 0, toLane: 1 },
      { fromLane: 0, toLane: 3 },
    ];
    const index = laneIntervalIndex([], VIEW, '2026-01-01');

    chooseCorridorsByCrossing(
      forward.map((line, i) => ({ line, ...lanes[i]! })),
      index,
      GAP,
    );
    chooseCorridorsByCrossing(
      [...backward.map((line, i) => ({ line, ...lanes[i]! }))].reverse(),
      index,
      GAP,
    );

    expect(forward).toEqual(backward);
  });

  it('leaves a six-point VHV route alone', () => {
    /**
     * A VHV route exists because NO single corridor was clear — `routeOrthogonal`'s last
     * structured attempt. Moving one of its two legs would be re-deciding that search from the
     * outside with less information than it had.
     */
    const vhv = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 100 },
      { x: 100, y: 100 },
    ];
    const before = JSON.parse(JSON.stringify(vhv)) as typeof vhv;

    chooseCorridorsByCrossing(
      [
        { line: vhv, fromLane: 0, toLane: 3 },
        { line: OBSTRUCTED(), fromLane: 0, toLane: 1 },
      ],
      laneIntervalIndex([], VIEW, '2026-01-01'),
      GAP,
    );

    expect(vhv).toEqual(before);
  });

  it('does nothing at all when nothing crosses', () => {
    // The `current === 0` early return: a corridor that crosses nothing has no reason to move, and
    // moving it could only make the picture worse.
    const a = elbow(0, 0, 20, 100, 100);
    const b = elbow(500, 0, 520, 600, 100);
    const before = JSON.parse(JSON.stringify([a, b])) as unknown[];

    expect(
      chooseCorridorsByCrossing(
        [
          { line: a, fromLane: 0, toLane: 3 },
          { line: b, fromLane: 0, toLane: 3 },
        ],
        laneIntervalIndex([], VIEW, '2026-01-01'),
        GAP,
      ),
    ).toBe(0);
    expect([a, b]).toEqual(before);
  });
});
