import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

/**
 * **The data-date draw-budget gate** (canvas status & feedback M1, spec S6): the layer's whole
 * cost is one solid rule and one pill — a `moveTo`/`lineTo`/`stroke` plus at most one
 * `measureText`/`fillRect`/`fillText` per frame — so the per-frame call-count delta between
 * layer-on and layer-off must be a **constant, independent of the activity count**.
 *
 * The assertion is deliberately about the SHAPE of the cost, never a wall-clock millisecond
 * count, because a CI runner's absolute timings are noise (the `paint.dates-budget.test.ts`
 * convention this file copies). TECH_DEBT #75 — the painter already runs over ADR-0026 §16's
 * stated budget — is the standing context: this epic must not make that worse, and a constant
 * delta at 2,000 activities is the proof that it does not.
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
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
const COUNT = 2000;

/** A counting stub: every draw call is tallied so the cost can be compared, not guessed. */
function countingCtx() {
  const calls = {
    fillText: 0,
    measureText: 0,
    fillRect: 0,
    stroke: 0,
    moveTo: 0,
    lineTo: 0,
    beginPath: 0,
    setLineDash: 0,
  };
  return {
    calls,
    total: () => Object.values(calls).reduce((a, b) => a + b, 0),
    clearRect: () => {},
    fillRect: () => {
      calls.fillRect += 1;
    },
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
    setLineDash: () => {
      calls.setLineDash += 1;
    },
    fillText: () => {
      calls.fillText += 1;
    },
    measureText: (s: string) => {
      calls.measureText += 1;
      return { width: s.length * 6 } as TextMetrics;
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
}

/** The `paint.dates-budget.test.ts` dense-plan fixture: N activities over 50 lanes, spaced so the
 * bars actually draw (an all-overlapping fixture would cull the very work being budgeted). */
function bigPlan(count: number): RenderActivity[] {
  return Array.from({ length: count }, (_, i) => {
    const startDay = Math.floor(i / 50) * 20;
    const start = new Date(Date.UTC(2026, 0, 1 + startDay)).toISOString().slice(0, 10);
    const finish = new Date(Date.UTC(2026, 0, 1 + startDay + 4)).toISOString().slice(0, 10);
    return {
      id: `a${i}`,
      type: 'TASK' as const,
      laneIndex: i % 50,
      label: `A${i} Activity ${i} · 5d`,
      earlyStart: start,
      earlyFinish: finish,
      isCritical: i % 7 === 0,
      isNearCritical: false,
    };
  });
}

const TOGGLES = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: true,
  labels: true,
  lateOverlay: false,
} as const;

function paint(dataDateLine: boolean, count: number) {
  const ctx = countingCtx();
  const view: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities: bigPlan(count),
    edges: [],
    dataDate: DATA_DATE,
    view: TOGGLES,
    todayOffset: 5,
    ...(dataDateLine ? { dataDateLine: true } : {}),
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return { calls: ctx.calls, total: ctx.total() };
}

describe('data-date line — draw-budget gate at 2,000 activities (spec S6)', () => {
  // The label-width memo is module-scope and keyed by text (see `paint.dates-budget.test.ts`):
  // warm it once up front so every delta below compares the LAYER's per-frame cost, not the
  // memo's first fill — which would otherwise scale with the activity count and drown the signal.
  paint(true, COUNT);

  it('adds a CONSTANT number of calls per frame, independent of the activity count', () => {
    const deltaAt2000 = paint(true, COUNT).total - paint(false, COUNT).total;
    const deltaAt200 = paint(true, 200).total - paint(false, 200).total;
    const deltaAt1 = paint(true, 1).total - paint(false, 1).total;
    // The feature actually draws (line + pill), and its cost never scales with the plan.
    expect(deltaAt2000).toBeGreaterThan(0);
    expect(deltaAt2000).toBe(deltaAt200);
    expect(deltaAt2000).toBe(deltaAt1);
    // …and the constant is small: one rule (setLineDash + beginPath + moveTo + lineTo + stroke)
    // plus one pill (measureText + fillRect + fillText) — single digits, not "small-ish".
    expect(deltaAt2000).toBeLessThanOrEqual(10);
  });

  it('costs at most ONE measureText per frame (the pill), never one per bar', () => {
    const off = paint(false, COUNT).calls;
    const on = paint(true, COUNT).calls;
    expect(on.measureText - off.measureText).toBeLessThanOrEqual(1);
    expect(on.fillText - off.fillText).toBe(1);
  });
});
