import { describe, expect, it } from 'vitest';

// The geometry core, imported directly: these three are the DEFINITION of screen space, and the
// assertion below is about agreeing with them rather than about where they are re-exported from.
import { BAR_HEIGHT, LANE_HEIGHT, rowSlots } from './geometry';
import {
  arrowhead,
  ARROWHEAD_HALF_W_PX,
  ARROWHEAD_PX,
  ARROWHEAD_ROUTED_PX,
  isLaneFreeBetween,
  laneIntervalIndex,
  laneOverlapBetween,
  GUTTER_CHANNEL_PITCH_PX,
  gutterChannels,
  packGutterChannels,
  routeOrthogonal,
} from './link-routing';
// The two render types stay on the barrel: they are geometry, re-exported, and importing them
// from `./geometry` here would say the test knows where they live rather than that it uses them.
import type { Point, RenderActivity, Viewport } from './render-model';

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
    expect(isLaneFreeBetween(index, 0, 100, 100)).toBe(true);
  });

  it('reports a bar’s own span as occupied and its flanks as free', () => {
    const index = laneIntervalIndex([task('a', 0, '2026-01-03', '2026-01-05')], VIEW, '2026-01-01');
    const spans = index.get(0)?.spans ?? [];
    expect(spans).toHaveLength(1);
    const [x0, x1] = spans[0]!;
    expect(isLaneFreeBetween(index, 0, (x0 + x1) / 2, (x0 + x1) / 2)).toBe(false);
    expect(isLaneFreeBetween(index, 0, x0 - 5, x0 - 5)).toBe(true);
    expect(isLaneFreeBetween(index, 0, x1 + 5, x1 + 5)).toBe(true);
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
   * `isLaneFreeBetween(i, l, x, x) === isLaneFreeBetween(i, l, x, x)` — which is VACUOUS, because
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
    }

    // The exact edges, which the sweep steps over: containment is CLOSED at both ends.
    for (const [start, end] of spans) {
      expect(isLaneFreeBetween(index, 0, start, start)).toBe(false);
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
    const gap = (spans[0]![1] + spans[1]![0]) / 2;
    expect(isLaneFreeBetween(index, 0, gap, gap)).toBe(true);
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

  it('grows in LENGTH only — the barbs stay at their own half-width', () => {
    const head = arrowhead(LINE, ARROWHEAD_ROUTED_PX, ARROWHEAD_HALF_W_PX)!;
    expect(head[1].x).toBeCloseTo(100 - ARROWHEAD_ROUTED_PX);
    expect(ARROWHEAD_ROUTED_PX).toBeGreaterThan(ARROWHEAD_PX);
    // It is not `size / 2`, and the reason **changed at M3-T3**: ADR-0052 M5's argument was that a
    // wider barb crosses the neighbouring line of a **fanned bundle**, and fan-out is retired, so
    // the constraint has no subject. The half-width is kept because it is the head the product
    // draws, not because anything still derives it — which is why this asserts the value rather
    // than a relationship that no longer exists.
    expect(Math.abs(head[1].y)).toBeCloseTo(ARROWHEAD_HALF_W_PX);
  });
});

describe('packGutterChannels', () => {
  /** A VHV route in gutter `y`, spanning `[x0, x1]`. Its two verticals are what the pass ignores. */
  const vhv = (
    y: number,
    x0: number,
    x1: number,
  ): { line: Point[]; fromLane: number; toLane: number } => ({
    line: [
      { x: x0, y: y - 30 },
      { x: x0, y },
      { x: x1, y },
      { x: x1, y: y + 30 },
    ],
    fromLane: 0,
    toLane: 3,
  });
  const legYs = (cs: { line: Point[] }[]): number[] => cs.map((c) => c.line[1]!.y);
  /** The two gutters these cases use; any other y is a lane centre or a stub. */
  const GUTTER = (y: number): boolean => y === 100 || y === 200;

  /**
   * The clear half-band the shipped row leaves at a lane boundary — what the painter passes
   * (`paint.ts`, M3-T3). Read from `rowSlots` rather than restated, so a pitch change moves this
   * suite's expectations with the product rather than leaving them asserting a dead geometry.
   */
  const CLEAR_HALF_BAND = rowSlots(0).clearHalfBandPx;

  /**
   * **Capacity is DERIVED, and M3-T3 corrected what it is derived FROM.**
   *
   * M1 took `(laneHeight, barHeight)` and this case asserted that a NetPoint-thin 5 px bar in a
   * 28 px pitch would give seven channels — _"with nothing here changed"_, as the function's own
   * docblock put it. **M3-T3 falsified that.** The band a thin bar hands back is exactly where the
   * row's name and date rows now live, so the raw pad stopped being clear space the moment the row
   * carried text: the old derivation would have claimed seven channels straight through a label.
   *
   * It takes the **clear** half-band now, which the caller gets from `rowSlots`. The prediction is
   * recorded here rather than deleted, because an epic that measures its own claims should keep
   * the one it got wrong.
   */
  it('derives its channel count from the clear band it is given', () => {
    // A band of 4 (the shipped 28/18 pad, less one) -> floor(3/3) = 1 step either side -> 3.
    expect(gutterChannels(4)).toEqual([0, -3, 3]);
    // The M3-T3 row at pitch 52: 7.5 clear -> usable 6.5 -> 2 steps either side -> 5 channels.
    expect(gutterChannels(7.5)).toEqual([0, -3, 3, -6, 6]);
    // Centre-out, so a gutter carrying one run draws it on the boundary.
    expect(gutterChannels(7.5)[0]).toBe(0);
    // A row with no clear band at all yields one channel and the pass becomes a no-op — which is
    // what a pitch too small for the treatment honestly looks like, not a failure to hide.
    expect(gutterChannels(0)).toEqual([0]);
    expect(gutterChannels(1)).toEqual([0]);
  });

  /**
   * **The geometry inequality, at every pitch and every bar height** — the property M1-T1's datum
   * and this pass's capacity have to satisfy TOGETHER, because a channel is only safe if the datum
   * is the boundary AND the offset stays inside the band.
   */
  it('never places a channel outside the band it was given, at any band', () => {
    for (const band of [0, 0.5, 1, 2, 4, 7.5, 10.5, 16, 24]) {
      for (const k of gutterChannels(band)) {
        // The boundary is 0 in this frame; the band runs to +/-`band` either side of it.
        expect(Math.abs(k)).toBeLessThanOrEqual(Math.max(0, band - 1));
        expect(Math.abs(k)).toBeLessThan(Math.max(1, band));
      }
    }
  });

  it('leaves one run on the boundary and moves nothing', () => {
    const cs = [vhv(100, 0, 50)];
    expect(packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER)).toBe(0);
    expect(legYs(cs)).toEqual([100]);
  });

  it('leaves runs in the SAME gutter that do not overlap in x on the boundary', () => {
    const cs = [vhv(100, 0, 40), vhv(100, 60, 90), vhv(100, 200, 260)];
    expect(packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER)).toBe(0);
    expect(legYs(cs)).toEqual([100, 100, 100]);
  });

  /**
   * **Touching is not overlapping, and this pins which.** Two runs meeting at a single x share a
   * channel — they draw as one continuous line, which is what they are. Separating them would put a
   * 3 px step in the middle of a straight run for no reason a reader could use.
   *
   * It earns its place because `packLanes` packs activities EDGE TO EDGE in a lane, so a run ending
   * exactly where the next begins is a common shape here rather than a contrived one; and because a
   * mutation sweep found the `<` / `>` comparison undiscriminated without it, which is an untested
   * boundary rather than a genuine no-op (ADR-0110 D5).
   */
  it('treats runs that merely touch at one x as sharing a channel', () => {
    const cs = [vhv(100, 0, 50), vhv(100, 50, 120)];
    expect(packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER)).toBe(0);
    expect(legYs(cs)).toEqual([100, 100]);
  });

  it('separates runs that overlap in x, and leaves different gutters independent', () => {
    const cs = [vhv(100, 0, 100), vhv(100, 50, 150), vhv(200, 0, 100), vhv(200, 50, 150)];
    expect(packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER)).toBe(2);
    expect(legYs(cs)).toEqual([
      100,
      100 - GUTTER_CHANNEL_PITCH_PX,
      200,
      200 - GUTTER_CHANNEL_PITCH_PX,
    ]);
  });

  /**
   * **Permutation independence, and the named mutation it guards.** The pass sorts by a total order
   * over the geometry — never the order `scene.edges` happened to arrive in, which is a server
   * response. Sorting by candidate index instead would make the picture a function of the API's
   * row order, and a line would move while the viewport stood still (FC-L9).
   */
  it('produces the same picture whatever order the runs arrive in', () => {
    const spans: [number, number][] = [
      [0, 100],
      [50, 150],
      [120, 200],
      [10, 30],
      [140, 260],
      [0, 400],
    ];
    const run = (order: number[]): Map<string, number> => {
      const cs = order.map((i) => vhv(100, spans[i]![0], spans[i]![1]));
      packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER);
      return new Map(
        cs.map((c, j) => [
          `${String(spans[order[j]!]![0])}-${String(spans[order[j]!]![1])}`,
          c.line[1]!.y,
        ]),
      );
    };
    const forward = run([0, 1, 2, 3, 4, 5]);
    for (const order of [
      [5, 4, 3, 2, 1, 0],
      [2, 0, 5, 1, 4, 3],
      [3, 1, 4, 0, 2, 5],
    ]) {
      expect(run(order)).toEqual(forward);
    }
  });

  /**
   * **Two runs with the same geometry take channels by their link's key, not by arrival order**
   * (node-to-node links M3). The sort's last term was list position, which is the order
   * `scene.edges` arrived in; a 200-order shuffle of Unit 300 found 39 orders that moved a link.
   */
  it('gives identical runs the same channels whatever order they arrive in', () => {
    const keyed = (key: string) => ({ ...vhv(100, 0, 100), key });
    const channelOf = (order: string[]): Record<string, number> => {
      const cs = order.map(keyed);
      packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER);
      return Object.fromEntries(cs.map((c) => [c.key, c.line[1]!.y]));
    };
    const forward = channelOf(['a', 'b']);
    expect(forward.a).not.toBe(forward.b);
    expect(channelOf(['b', 'a'])).toEqual(forward);
  });

  /**
   * **Surplus SPREADS, and never into a bar.** Seven mutually overlapping runs in a three-channel
   * gutter cannot be separated; what the pass controls is whether the excess piles onto one line or
   * is shared. FC-L3's second limb asks for `max legs on one y <= ceil(peak overlap / channels)`,
   * and the first version of this pass sent every surplus run to the outermost offset — missing
   * that bound by the whole surplus, which the M1 re-measurement caught.
   *
   * The inequality is asserted rather than the arrangement, so the case survives a change of
   * geometry: with 7 runs over 3 channels no channel may carry more than `ceil(7 / 3) = 3`.
   */
  it('spreads surplus runs across channels rather than piling them on one', () => {
    const cs = Array.from({ length: 7 }, (_, i) => vhv(100, i * 5, 200 + i * 5));
    packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER);
    const channels = gutterChannels(CLEAR_HALF_BAND).length;
    const perY = new Map<number, number>();
    for (const y of legYs(cs)) perY.set(y, (perY.get(y) ?? 0) + 1);
    expect(Math.max(...perY.values())).toBeLessThanOrEqual(Math.ceil(cs.length / channels));
    expect(perY.size).toBe(channels);
    // And every one of them is still inside the clear band — the property never traded.
    const pad = (LANE_HEIGHT - BAR_HEIGHT) / 2;
    for (const y of legYs(cs)) expect(Math.abs(y - 100)).toBeLessThan(pad);
  });

  /**
   * A run is found by GEOMETRY (node-to-node links M2): an interior horizontal on a lane boundary.
   * A horizontal anywhere else — a lane centre, or the first or last segment — is not a gutter run,
   * however many there are on one y.
   */
  it('moves only interior horizontals that lie on a gutter', () => {
    const centre = (x0: number, x1: number) => ({
      line: [
        { x: x0, y: 70 },
        { x: x0, y: 130 },
        { x: x1, y: 130 },
        { x: x1, y: 190 },
      ] as Point[],
      fromLane: 0,
      toLane: 2,
    });
    const ends = (x0: number, x1: number) => ({
      line: [
        { x: x0, y: 100 },
        { x: x1, y: 100 },
      ] as Point[],
      fromLane: 1,
      toLane: 1,
    });
    const cs = [centre(0, 100), centre(50, 150), ends(0, 100), ends(50, 150)];
    const before = JSON.stringify(cs.map((c) => c.line));
    expect(packGutterChannels(cs, CLEAR_HALF_BAND, GUTTER)).toBe(0);
    expect(JSON.stringify(cs.map((c) => c.line))).toBe(before);
  });

  /** FC-L10: a scene with no gutter run is byte-identical. */
  it('is a no-op on a scene with no gutter run', () => {
    const elbow = {
      line: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 60 },
        { x: 80, y: 60 },
      ] as Point[],
      fromLane: 0,
      toLane: 2,
    };
    const before = JSON.stringify(elbow.line);
    expect(packGutterChannels([elbow], CLEAR_HALF_BAND, GUTTER)).toBe(0);
    expect(JSON.stringify(elbow.line)).toBe(before);
  });
});
