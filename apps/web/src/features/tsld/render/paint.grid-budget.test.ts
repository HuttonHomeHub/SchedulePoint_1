import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

/**
 * **The F5 gate** (tsld-toolbar-canvas-refinements, `VITE_CANVAS_TIME_AXIS`). Splitting the single
 * batched grid stroke into three tiered passes must not change the total line count — only how many
 * `beginPath`/`stroke`/`strokeStyle` sets it takes to draw them. The counting-stub method mirrors
 * `paint.band-budget.test.ts` / `paint.dates-budget.test.ts`: the assertion is about the **shape**
 * of the cost, not a millisecond count (a CI runner's absolute timings are noise).
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
  linkMinor: '#80848b',
  linkDriving: '#3b6fbf',
  linkMark: '#3d2070',
  edge: '#333',
  bar: '#44f',
  nodeRim: '#44f',
  nodeRimNear: '#fa0',
  nodeRimCritical: '#f00',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
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

const SIZE = { width: 1600, height: 800 };
const DATA_DATE = '2026-01-01';

interface PassSnapshot {
  lineWidth: number;
  strokeStyle: string;
  /** The dash in force when the pass was stroked (NetPoint grammar M1). */
  dash: readonly number[];
  xs: number[];
}

function countingCtx() {
  const calls = {
    beginPath: 0,
    stroke: 0,
    moveTo: 0,
    lineTo: 0,
    strokeStyleSets: 0,
    setLineDash: 0,
  };
  let dash: readonly number[] = [];
  const passes: PassSnapshot[] = [];
  let strokeStyleValue = '';
  let currentXs: number[] = [];
  const ctx = {
    calls,
    passes,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {
      calls.beginPath += 1;
      currentXs = [];
    },
    moveTo: (x: number) => {
      calls.moveTo += 1;
      currentXs.push(x);
    },
    lineTo: () => {
      calls.lineTo += 1;
    },
    stroke: () => {
      calls.stroke += 1;
      passes.push({ lineWidth: ctx.lineWidth, strokeStyle: strokeStyleValue, dash, xs: currentXs });
    },
    fill: () => {},
    setTransform: () => {},
    setLineDash: (d: readonly number[]) => {
      calls.setLineDash += 1;
      dash = d;
    },
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    get strokeStyle(): string {
      return strokeStyleValue;
    },
    set strokeStyle(v: string) {
      strokeStyleValue = v;
      calls.strokeStyleSets += 1;
    },
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
  return ctx;
}

/** A handful of activities so the scene has content (the grid cost is viewport-driven, not plan-driven). */
function smallPlan(): RenderActivity[] {
  return [
    {
      id: 'a1',
      type: 'TASK' as const,
      laneIndex: 0,
      label: 'A1',
      earlyStart: '2026-01-05',
      earlyFinish: '2026-01-10',
      isCritical: false,
      isNearCritical: false,
    },
  ];
}

const TOGGLES = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: false,
  labels: false,
  lateOverlay: false,
} as const;

function paint(gridTiers: boolean, view: Viewport) {
  const ctx = countingCtx();
  const scene: TsldScene = {
    activities: smallPlan(),
    edges: [],
    dataDate: DATA_DATE,
    view: TOGGLES,
    ...(gridTiers ? { gridTiers: true } : {}),
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return { ...ctx.calls, passes: gridPasses(ctx.passes) };
}

/**
 * The grid's own passes, told apart from every other stroked layer by **stroke style**.
 *
 * Added with the lane hairlines (workspace redesign M4-T2), which stroke one batched pass of their
 * own immediately after this layer. Filtering is better than re-baselining a count: a count says
 * "there are now four passes" and stops distinguishing which four, so the next layer to arrive
 * would be absorbed silently — and noticing is this gate's entire job.
 */
function gridPasses(passes: readonly PassSnapshot[]): PassSnapshot[] {
  const grid = new Set<string>([
    PALETTE.gridLine,
    PALETTE.gridLineDay,
    PALETTE.gridLineMonth,
    PALETTE.gridLineYear,
  ]);
  return passes.filter((pass) => grid.has(pass.strokeStyle));
}

// A viewport above DAY_GRID_MIN_PX (6), so day/month/year boundaries all fall within the visible span.
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };

describe('gridline tiers — draw-budget gate (tsld-toolbar-canvas-refinements F5)', () => {
  it('flag-off strokes the grid in exactly one batched pass', () => {
    // **Two passes, not one, and the second is not the grid's** (workspace redesign M4-T2). The lane
    // hairlines are a layer of their own, drawn in one batch immediately after this one, and these
    // counters are scene-wide rather than layer-scoped. The figure is re-baselined UPWARD here with
    // the reason recorded rather than the assertion loosened to `toBeLessThanOrEqual`, which would
    // stop this gate noticing the next layer that arrives — and noticing is its whole job.
    //
    // What it still pins exactly is the grid's own shape: ONE batch for the flag-off single tier,
    // and the +2 the three tiers cost, both asserted as differences below.
    const off = paint(false, VIEW);
    expect(off.beginPath).toBe(2);
    expect(off.stroke).toBe(2);
    expect(off.strokeStyleSets).toBe(2);
  });

  it('flag-on adds exactly two extra beginPath/stroke/strokeStyle sets (three tiers, not one)', () => {
    const off = paint(false, VIEW);
    const on = paint(true, VIEW);
    expect(on.beginPath - off.beginPath).toBe(2);
    expect(on.stroke - off.stroke).toBe(2);
    expect(on.strokeStyleSets - off.strokeStyleSets).toBe(2);
  });

  it('keeps the same total moveTo/lineTo count — the same lines, just batched differently', () => {
    const off = paint(false, VIEW);
    const on = paint(true, VIEW);
    expect(on.moveTo).toBe(off.moveTo);
    expect(on.lineTo).toBe(off.lineTo);
    // Sanity: every line is one moveTo + one lineTo. Since M4-T2 this total includes the lane
    // hairlines, which is why the assertion is a DIFFERENCE between two paints of the same scene:
    // both carry the same lane count, so it cancels and the tiers are still what is measured.
    expect(off.moveTo).toBe(off.lineTo);
    expect(off.moveTo).toBeGreaterThan(0);
  });

  it('draws no tier when its own toggle is off, flag-on', () => {
    const ctx = countingCtx();
    const scene: TsldScene = {
      activities: smallPlan(),
      edges: [],
      dataDate: DATA_DATE,
      view: { ...TOGGLES, dayGrid: false, monthGrid: false, yearGrid: false },
      gridTiers: true,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE, 1);
    // **Asserted by stroke style, not by a count** (M4-T2). Every gridline toggle is off, so the
    // tier layer must draw nothing — but the lane hairlines have no toggle (they are the surface's
    // structure, not one of its lenses), so a raw `beginPath === 0` would now be measuring the wrong
    // thing. `gridPasses` answers the question this case actually asks: did any TIER draw?
    expect(gridPasses(ctx.passes)).toHaveLength(0);
  });

  it('draws day → month → year in that order, every tier 1 px on a HALF-pixel x', () => {
    const { passes } = paint(true, VIEW);
    expect(passes).toHaveLength(3);
    const [day, month, year] = passes;

    // Order matters: a heavier tier must overwrite a coincident lighter one (day → month → year).
    expect(day!.strokeStyle).toBe(PALETTE.gridLineDay);
    expect(month!.strokeStyle).toBe(PALETTE.gridLineMonth);
    expect(year!.strokeStyle).toBe(PALETTE.gridLineYear);

    // NetPoint grammar G1 (M1): every tier is 1 px, so the grid is the quietest mark. Odd lineWidth
    // crisps on a HALF-pixel x.
    for (const pass of [day, month, year]) expect(pass!.lineWidth).toBe(1);
    for (const x of [...day!.xs, ...month!.xs, ...year!.xs]) expect(x % 1).toBeCloseTo(0.5);
  });

  it('dashes the day and month tiers 3 on / 3 off and leaves the year tier solid (G1)', () => {
    const { passes } = paint(true, VIEW);
    const [day, month, year] = passes;
    expect(day!.dash).toEqual([3, 3]);
    expect(month!.dash).toEqual([3, 3]);
    // Solid, so a year boundary still wins where it meets a month at the same x (ADR-0056 §2).
    expect(year!.dash).toEqual([]);
  });

  it('sets the dash once per tier and clears it after, so nothing painted later inherits it (FC-G7)', () => {
    // Scene-wide, like the other counters here, so the figure is compared across two zooms rather
    // than pinned: at 10 px/day the viewport holds ~160 days and at 40 px/day ~40. A per-line
    // `setLineDash` would scale with the visible days; the tier batches do not.
    const near = paint(true, VIEW).setLineDash;
    const far = paint(true, { ...VIEW, pxPerDay: 40 }).setLineDash;
    expect(near).toBe(far);
    // Three tiers plus the reset, and no layer of a line-free scene adds one.
    expect(near).toBeLessThanOrEqual(4);
  });
});
