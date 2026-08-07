import { describe, expect, it } from 'vitest';

import { paintScene, type Ctx2D, type TsldPalette, type TsldScene } from './paint';
import {
  ARROWHEAD_PX,
  ARROWHEAD_ROUTED_PX,
  LANE_HEIGHT,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';

/**
 * **The M2 routing gate** (ADR-0064 M2, plan tasks T15/T19).
 *
 * Two things have to hold about obstacle-aware link routing, and neither is provable from the pure
 * geometry alone — `link-routing.test.ts` proves what `routeOrthogonal` returns; this proves what
 * the **painter** does with it.
 *
 * 1. **Flag-off is the picture it has always been.** Not "we did not intend to change it" — the
 *    emitted path is transcribed and compared coordinate by coordinate. The parity is structural
 *    (one route function, whose obstacle parameter the painter simply does not pass), so this suite
 *    exists to keep that structure from being quietly refactored into two code paths. The flag
 *    carries two changes — the corridor and the T17 arrowhead — so the corridor assertions compare
 *    the **line**, and the head has its own test. Comparing the trace whole would fail for the one
 *    reason those tests are not about.
 * 2. **The cost is bounded and proportionate.** Routing adds a per-frame interval index over the
 *    culled set plus, per edge, a binary search per crossed lane. The failure mode this guards is
 *    the one every obstacle-avoidance implementation reaches for first: an unbounded search that
 *    looks free on a ten-bar fixture and blows the ADR-0026 ≤4 ms budget at two thousand.
 *
 * The assertions are about the **shape** of the cost, not a millisecond count — a CI runner's
 * absolute timings are noise, which is the same reasoning `paint.dates-budget.test.ts` records.
 * The browser-measured number is reported at T21 beside its pre-change baseline.
 */
const PALETTE: TsldPalette = {
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  nonWorkingHatch: '#444',
  today: '#f00',
  todayInk: '#fff',
  // The data-date pair (VITE_CANVAS_DATA_DATE) — distinct fixture values so assertions can pin them.
  dataDate: '#dd1',
  dataDateInk: '#dd2',
  conflict: '#fa0',
  laneOverlap: '#fa0',
  labelInside: '#fff',
  labelInsideCritical: '#fff',
  labelInsideNearCritical: '#000',
  labelBeside: '#eee',
  barStroke: '#5a5a5a',
  hoverRing: '#9a9a9a',
  handleHalo: '#0b0b0b',
  monthBand: '#111111',
};

const SIZE = { width: 1920, height: 1080 };
const DATA_DATE = '2026-01-01';

/**
 * A recording context. `moveTo`/`lineTo` are tallied **and transcribed**, so parity is asserted on
 * the actual coordinates rather than on a count that two different pictures could share.
 *
 * `arcTo` is deliberately left undefined, exactly as the other painter suites leave it: the
 * rounded-elbow path falls back to hard `lineTo` corners, which is what makes the trace readable as
 * a polyline in the first place. Rounding is a corner treatment applied to whatever route is
 * chosen — it cannot make two different routes look the same, so nothing is hidden by its absence.
 */
function recordingCtx(): Ctx2D & { path: string[]; calls: { lineTo: number; moveTo: number } } {
  const path: string[] = [];
  const calls = { lineTo: 0, moveTo: 0 };
  return {
    path,
    calls,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: (x: number, y: number) => {
      calls.moveTo += 1;
      path.push(`M${x.toFixed(3)},${y.toFixed(3)}`);
    },
    lineTo: (x: number, y: number) => {
      calls.lineTo += 1;
      path.push(`L${x.toFixed(3)},${y.toFixed(3)}`);
    },
    stroke: () => {},
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
  };
}

function task(id: string, laneIndex: number, startDay: number, days: number): RenderActivity {
  const iso = (d: number): string => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  return {
    id,
    type: 'TASK',
    laneIndex,
    label: id,
    earlyStart: iso(startDay),
    earlyFinish: iso(startDay + days - 1),
    isCritical: false,
    isNearCritical: false,
  };
}

function edge(predecessorId: string, successorId: string): RenderEdge {
  return { predecessorId, successorId, type: 'FS', isDriving: true };
}

function paint(
  activities: RenderActivity[],
  edges: RenderEdge[],
  linkRouting: boolean,
  pxPerDay = 12,
): { path: string[]; lineTo: number; ms: number } {
  const ctx = recordingCtx();
  const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities,
    edges,
    dataDate: DATA_DATE,
    // Every gridline layer OFF. The recorder cannot tell one caller's `lineTo` from another's, and a
    // full-height gridline crosses the same lane band a link corridor does — so with the grid on,
    // "does anything vertical pass through the obstacle" would be answered by the grid on every run,
    // whatever the routing did. The bars themselves draw with `fillRect`/`roundRect`, so what is
    // left in the trace is the edge layer alone.
    view: {
      dayGrid: false,
      monthGrid: false,
      yearGrid: false,
      today: false,
      nonWorking: false,
      labels: false,
      lateOverlay: false,
      monthBands: false,
    },
    // The routing is reached only through the refreshed link path, which is the shipping default.
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting,
  };
  const started = performance.now();
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return { path: ctx.path, lineTo: ctx.calls.lineTo, ms: performance.now() - started };
}

/**
 * The screen-x of every **vertical run that crosses the middle lane's band** — which is precisely
 * the thing an obstacle-aware corridor is supposed to move. Asserting on the corridor rather than on
 * the whole trace keeps the test about the decision under test: the arrowhead barbs and the two
 * horizontal legs are unchanged either way, and comparing them would only make the assertion noisy.
 */
function corridorCrossings(path: readonly string[]): number[] {
  const middleLaneY = LANE_HEIGHT + LANE_HEIGHT / 2;
  const parsed = path.map((cmd) => {
    const m = /^([ML])(-?[\d.]+),(-?[\d.]+)$/.exec(cmd);
    return m ? { move: m[1] === 'M', x: Number(m[2]), y: Number(m[3]) } : null;
  });
  const xs: number[] = [];
  for (let i = 1; i < parsed.length; i += 1) {
    const a = parsed[i - 1];
    const b = parsed[i];
    if (!a || !b || b.move) continue; // `M` starts a new subpath — there is no segment across it
    if (a.x !== b.x) continue;
    if (Math.min(a.y, b.y) <= middleLaneY && middleLaneY <= Math.max(a.y, b.y)) xs.push(a.x);
  }
  return xs;
}

/**
 * The link's own polyline: everything before the **second** `moveTo`. With the gridlines off and a
 * single edge in the scene, the trace is exactly the link line followed by its arrowhead — and the
 * head starts a new subpath, so the boundary is unambiguous rather than a count of points.
 */
function linkPolyline(path: readonly string[]): string[] {
  const second = path.findIndex((cmd, i) => i > 0 && cmd.startsWith('M'));
  return second === -1 ? [...path] : path.slice(0, second);
}

/** The blocking bar's screen span: day 4 → day 8 exclusive-right at 12 px/day from origin 0. */
const OBSTACLE_X0 = 4 * 12;
const OBSTACLE_X1 = 8 * 12;

/** Two lanes apart with the middle lane **empty** — the corridor is already clear. */
const CLEAR: RenderActivity[] = [task('a', 0, 0, 5), task('b', 2, 10, 5)];
/** The same pair with a bar standing in the middle lane, straddling the corridor. */
const BLOCKED: RenderActivity[] = [task('a', 0, 0, 5), task('b', 2, 10, 5), task('x', 1, 4, 4)];

describe('link routing — the painter-level flag-off parity gate', () => {
  it('still draws straight through the obstacle when the flag is off', () => {
    // The positive form of the parity claim. "Flag-off equals flag-off" would be a tautology; what
    // has to be true is that flag-off is the OLD picture — the corridor sitting inside the blocking
    // bar's span, exactly where it has always been drawn.
    const crossings = corridorCrossings(paint(BLOCKED, [edge('a', 'b')], false).path);
    expect(crossings.length).toBeGreaterThan(0);
    expect(crossings.some((x) => x >= OBSTACLE_X0 && x <= OBSTACLE_X1)).toBe(true);
  });

  it('leaves a clear corridor alone even with the flag ON', () => {
    // The candidate search runs only when the preferred elbow is actually blocked. A route that
    // moved for no reason would be the diagram twitching between frames — and it is why the
    // obstacle branch returns early on an empty crossed-lane set rather than "optimising" anyway.
    //
    // The comparison is the LINE, not the whole trace: the arrowhead legitimately differs, because
    // the routed head (T17) rides the same flag and is longer. Comparing the trace whole would make
    // this test fail for the one reason it is not about.
    expect(linkPolyline(paint(CLEAR, [edge('a', 'b')], true).path)).toEqual(
      linkPolyline(paint(CLEAR, [edge('a', 'b')], false).path),
    );
  });

  it('is wired — a blocked corridor draws a different LINE with the flag on', () => {
    // The one test that would catch the flag being declared and never read. Compared on the line
    // alone, so it cannot be satisfied by the arrowhead change (which happens on every edge).
    expect(linkPolyline(paint(BLOCKED, [edge('a', 'b')], true).path)).not.toEqual(
      linkPolyline(paint(BLOCKED, [edge('a', 'b')], false).path),
    );
  });

  it('draws the longer routed arrowhead with the flag on, and the legacy one without', () => {
    // The T17 half of the flag, asserted where it is actually emitted rather than only in the pure
    // vertex math: the head is the last subpath, and its tip-to-barb run is the head's length.
    const headOf = (path: readonly string[]): number => {
      const pts = path.slice(path.length - 4).map((cmd) => {
        const m = /^[ML](-?[\d.]+),(-?[\d.]+)$/.exec(cmd)!;
        return { x: Number(m[1]), y: Number(m[2]) };
      });
      return Math.abs(pts[0]!.x - pts[1]!.x);
    };
    expect(headOf(paint(CLEAR, [edge('a', 'b')], false).path)).toBeCloseTo(ARROWHEAD_PX);
    expect(headOf(paint(CLEAR, [edge('a', 'b')], true).path)).toBeCloseTo(ARROWHEAD_ROUTED_PX);
  });

  it('never draws through the bar it stepped around', () => {
    const crossings = corridorCrossings(paint(BLOCKED, [edge('a', 'b')], true).path);
    // It must still get there — a route that vanished would also satisfy "not through the bar".
    expect(crossings.length).toBeGreaterThan(0);
    for (const x of crossings) {
      expect(x < OBSTACLE_X0 || x > OBSTACLE_X1).toBe(true);
    }
  });
});

/**
 * A dense plan whose lanes are *full*, so the corridor search actually runs on most edges — the
 * fixture mistake `paint.dates-budget.test.ts` records (a fixture that never exercises the code it
 * claims to budget is worse than no fixture) applies here twice over, since an all-clear corridor
 * returns before any search at all.
 */
const DENSE_COUNT = 2000;
const DENSE_LANES = 50;

function densePlan(): RenderActivity[] {
  return Array.from({ length: DENSE_COUNT }, (_, i) =>
    task(`a${i}`, i % DENSE_LANES, Math.floor(i / DENSE_LANES) * 6, 5),
  );
}

/**
 * Long-range edges: each spans several lanes AND a long stretch of time, so every one crosses a
 * wall of occupied lanes.
 *
 * The `+ 7` is load-bearing and was added after the first run reported **zero** extra segments: an
 * offset that is an exact multiple of `DENSE_LANES` lands the successor in the predecessor's OWN
 * lane, and a same-lane edge crosses nothing, so the routing correctly did no work and the budget
 * measured a code path it never entered.
 */
const DENSE_EDGE_OFFSET = DENSE_LANES * 10 + 7;

function denseEdges(): RenderEdge[] {
  return Array.from({ length: DENSE_COUNT - DENSE_EDGE_OFFSET }, (_, i) =>
    edge(`a${i}`, `a${i + DENSE_EDGE_OFFSET}`),
  );
}

describe('link routing — draw-budget gate at 2,000 activities (T19)', () => {
  it('adds a bounded number of extra segments, never an unbounded search', () => {
    const activities = densePlan();
    const edges = denseEdges();
    const off = paint(activities, edges, false, 2);
    const on = paint(activities, edges, true, 2);
    // A four-point elbow becomes at most a six-point gutter route: two extra points per edge is the
    // ceiling the geometry can emit, and `MAX_CORRIDOR_CANDIDATES` bounds the search behind it.
    expect(on.lineTo - off.lineTo).toBeLessThanOrEqual(edges.length * 2);
    // …and the fixture actually exercises it. Without this the ceiling above is satisfied by a
    // routing pass that never ran, which is exactly what the first run of this suite measured.
    expect(on.lineTo).toBeGreaterThan(off.lineTo);
  });

  it('reports its measurement so the T21 default-on decision is made on data', () => {
    const activities = densePlan();
    const edges = denseEdges();
    const off = paint(activities, edges, false, 2);
    const on = paint(activities, edges, true, 2);
    // Printed, not asserted: absolute timings on a CI runner are noise, and this stub cannot
    // measure GPU rasterisation. T21 re-confirms in a real browser beside the pre-change baseline.
    // eslint-disable-next-line no-console
    console.log(
      `[ADR-0064 T19] ${DENSE_COUNT} activities / ${edges.length} edges — routing off ` +
        `${off.ms.toFixed(2)}ms, on ${on.ms.toFixed(2)}ms (+${(on.ms - off.ms).toFixed(2)}ms, ` +
        `${on.lineTo - off.lineTo} extra segments)`,
    );
    expect(on.ms).toBeGreaterThan(0);
  });
});
