import { describe, expect, it } from 'vitest';

import { LANE_HEIGHT } from './geometry';
import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

/**
 * **The lane-hairline gate** (workspace redesign M4-T2), in the counting-stub tradition of
 * `paint.band-budget.test.ts` and `paint.dates-budget.test.ts`: it asserts the **shape** of the
 * per-frame cost, never a millisecond count, because a CI runner's absolute timings are noise.
 *
 * There is one property worth protecting here and it is not the line count — it is that the cost is
 * a function of the **viewport** and not of the plan. The layer draws one rule per visible lane
 * boundary, derived by arithmetic on `view.originY`; the obvious alternative is to ask
 * `PaintFrame.laneRows()` which lanes have content, and that getter buckets and sorts the visible
 * activity set. It is lazy on purpose (`paint-frame.ts`), and a paint with the labels and dates
 * layers off never builds it — so reaching for it here would make every frame pay for a build this
 * layer has no use for. The painter's cost is measured rather than assumed (`docs/TECH_DEBT.md` #75; the
 * "4–6× over ADR-0026 §16" this line used to claim was a headless software-rasterised
 * figure against a budget that never existed)
 * (`docs/TECH_DEBT.md` #75); a new layer that scales with plan size is exactly what must not ship.
 *
 * The discriminating case is therefore the **1,000-activity** one: the same viewport, two hundred
 * times the plan, and identical counts.
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
  edge: '#333',
  bar: '#44f',
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
  monthBand: '#f4f1ea',
};

const SIZE = { width: 800, height: 400 };
const VIEW: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };

/** Toggles that silence every layer with one, so the counts below are the hairlines' own. */
const QUIET = {
  dayGrid: false,
  monthGrid: false,
  yearGrid: false,
  today: false,
  nonWorking: false,
  labels: false,
  lateOverlay: false,
} as const;

function countingCtx() {
  const calls = { beginPath: 0, stroke: 0, moveTo: 0, lineTo: 0, strokeStyleSets: 0 };
  const styles: string[] = [];
  let strokeStyleValue = '';
  const ctx = {
    calls,
    styles,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {
      calls.beginPath += 1;
    },
    moveTo: () => {
      calls.moveTo += 1;
    },
    lineTo: () => {
      calls.lineTo += 1;
    },
    stroke: () => {
      calls.stroke += 1;
    },
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    get strokeStyle(): string {
      return strokeStyleValue;
    },
    set strokeStyle(v: string) {
      strokeStyleValue = v;
      styles.push(v);
      calls.strokeStyleSets += 1;
    },
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    globalAlpha: 1,
    save: () => {},
    restore: () => {},
    createPattern: () => null,
  };
  return ctx;
}

function plan(count: number): RenderActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    name: `Activity ${i}`,
    laneIndex: i,
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-06',
    isCritical: false,
    isMilestone: false,
    activityType: 'TASK' as const,
    percentComplete: 0,
    totalFloatDays: 0,
    constraintType: null,
    constraintDate: null,
    visualConflict: false,
  })) as unknown as RenderActivity[];
}

function paint(activities: RenderActivity[], view: Viewport) {
  const ctx = countingCtx();
  const scene: TsldScene = {
    activities,
    edges: [],
    dataDate: '2026-03-02',
    view: QUIET,
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return ctx;
}

describe('lane hairlines — draw-budget gate (workspace redesign M4-T2)', () => {
  it('is one batched pass, whatever it draws', () => {
    const ctx = paint(plan(5), VIEW);
    // **Asserted by stroke style, not by a total.** The flag-off grid layer strokes its own (here
    // empty) path unconditionally, so a scene-wide `beginPath === 1` would be measuring that as
    // well — and would go red for a change to a layer this gate is not about. What has to be true
    // is that the hairlines are ONE batch: one style set, one path, one stroke.
    expect(ctx.styles.filter((style) => style === PALETTE.laneRule)).toHaveLength(1);
    expect(ctx.calls.beginPath).toBe(2);
    expect(ctx.calls.stroke).toBe(2);
  });

  it('draws one rule per VISIBLE lane boundary — not one per lane in the plan', () => {
    // The load-bearing case. Two hundred times the plan, the same viewport, identical counts: this
    // layer is O(visible lanes) and cannot become O(plan) without failing here.
    const small = paint(plan(5), VIEW);
    const large = paint(plan(1000), VIEW);
    expect(large.calls.moveTo).toBe(small.calls.moveTo);
    expect(large.calls.lineTo).toBe(small.calls.lineTo);

    // And the count is the viewport's own arithmetic, stated rather than snapshotted: the
    // boundaries from the one above the top edge to the one below the bottom, inclusive.
    const expected = Math.ceil(SIZE.height / LANE_HEIGHT) + 1;
    expect(small.calls.moveTo).toBe(expected);
    expect(small.calls.lineTo).toBe(expected);
  });

  it('draws the same number of rules on an EMPTY plan', () => {
    // Structure is not content. A plan with no activities still has lanes to draw into, and a
    // reader dragging the first bar onto a blank canvas needs somewhere to put it.
    const empty = paint([], VIEW);
    const populated = paint(plan(5), VIEW);
    expect(empty.calls.moveTo).toBe(populated.calls.moveTo);
  });

  it('scales with the LANE height, not with the zoom', () => {
    // Zooming changes `pxPerDay` and nothing about the lane axis, so a ten-year viewport costs the
    // same as a one-week one. The vertical gridline tiers are where zoom matters, and they have
    // their own gate.
    const dayZoom = paint(plan(5), { pxPerDay: 40, originX: 0, originY: 0 });
    const yearZoom = paint(plan(5), { pxPerDay: 0.5, originX: 0, originY: 0 });
    expect(yearZoom.calls.moveTo).toBe(dayZoom.calls.moveTo);
  });
});
