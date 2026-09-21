/**
 * **M0-T2 — does the VHV fallback fire, and by how much is its gutter leg wrong?** (FC-1)
 *
 * `docs/specs/diagram-legibility/m0-conditions.md` FC-1. Reads the polylines the **real painter**
 * actually draws, rather than reconstructing the routing pipeline — so nothing here can measure a
 * fiction assembled beside the product (ADR-0066's benchmark that measured the cull rather than the
 * painter; ADR-0106's harness that measured the bars instead of the pills).
 *
 * ## Why this is NOT a Chromium harness, against the plan
 *
 * The implementation plan specified a Chromium harness for M0-T2. Measured against the code rather
 * than assumed: `link-routing.ts` imports `@repo/types` (type-only), `./geometry` and
 * `./working-time` and nothing else — no canvas, no DOM — and `paintScene` draws through the
 * `Ctx2D` structural type, not `CanvasRenderingContext2D`. FC-1 is arithmetic over a pure function,
 * so a browser adds cost and an extra failure mode and answers nothing extra. Recorded as a
 * deviation rather than done quietly (ADR-0142 D4).
 *
 * ## What the stub buys, and the one thing it changes
 *
 * `drawRoundedPolyline` (`layers/shapes.ts:41-54`) degrades to the hard-cornered `drawPolyline`
 * when `arcTo` is absent, and this context deliberately has neither `arcTo` nor `roundRect`. So a
 * routed line arrives as exactly `moveTo` + one `lineTo` per point, and a 6-point VHV route is
 * unambiguous in the log.
 *
 * **What that does NOT establish:** a real browser HAS `arcTo`, so the shipped line carries small
 * rounded elbows. Rounding moves the corner arcs, never the horizontal leg's y — which is the
 * quantity FC-1 is about — so the measurement stands. Stated rather than left implicit.
 *
 * ## The incidental finding
 *
 * `link-routing-bench.ts:141` paints every frame at `originY: 0`, and `link-routing.test.ts:31`
 * asserts at `originY: 0`. Those are the repository's only two exercises of this path, and zero is
 * the single value at which the defect below is invisible.
 */
import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';
import { BAR_HEIGHT, LANE_HEIGHT } from '../src/features/tsld/render/geometry';
import { paintScene, type TsldPalette, type TsldScene } from '../src/features/tsld/render/paint';
import type {
  RenderActivity,
  RenderEdge,
  Viewport,
} from '../src/features/tsld/render/render-model';

/** Values are irrelevant to geometry; a legible set so a dumped log is readable. */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#e5e7eb',
  gridLineDay: '#eef0f3',
  gridLineMonth: '#d7dbe0',
  gridLineYear: '#b9bfc7',
  laneRule: '#ececee',
  edge: '#64748b',
  bar: '#3b82f6',
  critical: '#dc2626',
  nearCritical: '#f59e0b',
  outline: '#ffffff',
  selection: '#0ea5e9',
  nonWorking: '#f3f4f6',
  today: '#dc2626',
  todayInk: '#ffffff',
  dataDate: '#111827',
  dataDateInk: '#ffffff',
  conflict: '#f59e0b',
  laneOverlap: '#f59e0b',
  labelInside: '#ffffff',
  labelInsideCritical: '#ffffff',
  labelInsideNearCritical: '#111827',
  labelBeside: '#374151',
  barStroke: '#94a3b8',
  hoverRing: '#94a3b8',
  handleHalo: '#0f172a',
  monthBand: '#f8fafc',
};

interface Pt {
  x: number;
  y: number;
}

/**
 * A context that records path vertices and nothing else.
 *
 * Deliberately **not** `test-support/recording-ctx.ts`: that helper logs every call and every
 * property assignment as JSON strings, because it is a byte-for-byte paint-identity oracle. This
 * asks a different question — where did each polyline's vertices land — so it is a different
 * instrument rather than a duplicate of that one. It also cannot import `vitest`, which that helper
 * does.
 *
 * **No `arcTo` and no `roundRect`**, on purpose: see the module docblock.
 */
function recordingCtx(): { ctx: unknown; polylines: Pt[][] } {
  const polylines: Pt[][] = [];
  let current: Pt[] | null = null;
  const ctx = {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: (x: number, y: number) => {
      current = [{ x, y }];
      polylines.push(current);
    },
    lineTo: (x: number, y: number) => {
      if (current) current.push({ x, y });
    },
    stroke: () => {
      current = null;
    },
    fill: () => {
      current = null;
    },
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
  return { ctx, polylines };
}

/**
 * The VHV signature: six points, three horizontal runs joined by two verticals.
 *
 * Shape-tested rather than filtered by stroke colour, because the painter batches every line of a
 * layer into one path and sets the colour once — so colour cannot attribute an individual polyline.
 * A four-point elbow has five vertices fewer and no other layer draws this shape: bars are rects,
 * gridlines are two points, the feasible window is two horizontal runs with separate caps.
 */
function isVhv(p: Pt[]): boolean {
  if (p.length !== 6) return false;
  const eq = (a: number, b: number): boolean => Math.abs(a - b) < 0.001;
  return (
    eq(p[0]!.y, p[1]!.y) &&
    eq(p[1]!.x, p[2]!.x) &&
    eq(p[2]!.y, p[3]!.y) &&
    eq(p[3]!.x, p[4]!.x) &&
    eq(p[4]!.y, p[5]!.y)
  );
}

/** The lane a bar-centre y sits in. Fan-out shifts an anchor by at most `FAN_OUT_MAX_PX` (6). */
function laneOf(y: number, originY: number): number {
  return Math.round((y - originY - LANE_HEIGHT / 2) / LANE_HEIGHT);
}

export interface Framing {
  scene: string;
  activities: number;
  edges: number;
  viewport: string;
  pxPerDay: number;
  originY: number;
  polylines: number;
  vhv: number;
  /** Observed minus the `screenYOfLane`-consistent value, over every VHV leg found. */
  deltas: number[];
  offCanvas: number;
}

export interface ProbeResult {
  framings: Framing[];
  /** Total VHV routes across every framing — FC-1's non-vacuity control. */
  totalVhv: number;
}

const ZOOMS: Record<string, number> = { whole: 2, week: 12 };

/**
 * Canvas sizes, derived rather than guessed: 1646 is the product owner's Surface Pro in CSS px
 * (2880x1920 at 175 %), and `aboveCanvas` has been measured at 228-250 px across ADR-0112/0113, so
 * the height below takes 240. The result is insensitive to height except through the cull, which
 * the framing count reports.
 */
const VIEWPORTS = [
  { label: '1646x857', width: 1646, height: 857 },
  { label: '1920x840', width: 1920, height: 840 },
];

const ORIGIN_YS = [32, -500, -1500];

export function probe(counts: number[]): ProbeResult {
  const framings: Framing[] = [];
  let totalVhv = 0;

  for (const count of counts) {
    const source: { activities: RenderActivity[]; edges: RenderEdge[]; summary: string } =
      scaleScene(count);
    const scene: TsldScene = {
      activities: source.activities,
      edges: source.edges,
      dataDate: '2026-01-01',
      visualRefresh: true,
      timeTrueLinks: true,
      linkRouting: true,
    };

    for (const vp of VIEWPORTS) {
      for (const [, pxPerDay] of Object.entries(ZOOMS)) {
        for (const originY of ORIGIN_YS) {
          const { ctx, polylines } = recordingCtx();
          const view: Viewport = { pxPerDay, originX: 40, originY };
          paintScene(
            ctx as Parameters<typeof paintScene>[0],
            scene,
            view,
            { width: vp.width, height: vp.height },
            PALETTE,
            1,
          );
          const vhv = polylines.filter(isVhv);
          const deltas: number[] = [];
          let offCanvas = 0;
          for (const p of vhv) {
            const minLane = Math.min(laneOf(p[0]!.y, originY), laneOf(p[5]!.y, originY));
            // The `screenYOfLane`-consistent value: `screenYOfLane(minLane + 1, view)` minus half
            // the lane's spare height, which is where the inter-lane gutter's centre is.
            const expected = originY + (minLane + 1) * LANE_HEIGHT - (LANE_HEIGHT - BAR_HEIGHT) / 2;
            deltas.push(p[2]!.y - expected);
            if (p[2]!.y < 0 || p[2]!.y > vp.height) offCanvas += 1;
          }
          totalVhv += vhv.length;
          framings.push({
            scene: source.summary,
            activities: source.activities.length,
            edges: source.edges.length,
            viewport: vp.label,
            pxPerDay,
            originY,
            polylines: polylines.length,
            vhv: vhv.length,
            deltas,
            offCanvas,
          });
        }
      }
    }
  }

  return { framings, totalVhv };
}
