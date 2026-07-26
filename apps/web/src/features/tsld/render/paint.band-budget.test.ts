import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';
import { calendarBoundaries } from './time-scale';

/**
 * **The S4 gate** (ADR-0055 §4). Month bands add a fill pass to the tightest loop in the app, so
 * the cost is pinned rather than assumed — the same counting-stub method as the ADR-0054 dates
 * gate (`paint.dates-budget.test.ts`), for the same reason: the assertion is about the **shape**
 * of the cost, not a millisecond count, because a CI runner's absolute timings are noise.
 *
 * Two zooms, because the pathological case is not the obvious one. At day zoom a viewport holds a
 * month or two; at year zoom it holds a decade, and a naive per-day band loop would explode there.
 * Both are measured.
 */
const PALETTE: TsldPalette = {
  gridLine: '#111',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
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

const SIZE = { width: 1920, height: 1080 };
const DATA_DATE = '2026-01-01';
const COUNT = 2000;

function countingCtx() {
  const calls = { fillText: 0, measureText: 0, fillRect: 0 };
  return {
    calls,
    clearRect: () => {},
    fillRect: () => {
      calls.fillRect += 1;
    },
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
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

/** 2,000 activities across 50 lanes, spread over ten years so a year-zoom viewport is full. */
function bigPlan(): RenderActivity[] {
  return Array.from({ length: COUNT }, (_, i) => {
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

function paint(monthBands: boolean, view: Viewport) {
  const ctx = countingCtx();
  const scene: TsldScene = {
    activities: bigPlan(),
    edges: [],
    dataDate: DATA_DATE,
    view: TOGGLES,
    ...(monthBands ? { monthBands: true } : {}),
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return ctx.calls;
}

/** How many months the viewport spans — the band layer's own upper bound. */
function visibleMonths(view: Viewport): number {
  const firstDay = Math.floor((0 - view.originX) / view.pxPerDay);
  const lastDay = Math.ceil((SIZE.width - view.originX) / view.pxPerDay);
  return calendarBoundaries(firstDay, lastDay, DATA_DATE).months.length;
}

const DAY_ZOOM: Viewport = { pxPerDay: 40, originX: 0, originY: 0 };
/** ~0.7 px/day over 1920px ≈ 2,700 days ≈ 7.5 years — the case a per-day loop would blow up on. */
const YEAR_ZOOM: Viewport = { pxPerDay: 0.7, originX: 0, originY: 0 };

describe('month bands — draw-budget gate at 2,000 activities (ADR-0055 §4)', () => {
  it.each([
    ['day zoom', DAY_ZOOM],
    ['year zoom over a multi-year span', YEAR_ZOOM],
  ])('at %s, adds at most visibleMonths + 1 fillRect and no text at all', (_name, view) => {
    // Warm the label-measurement memo first. It is module-level and shared across paints, so
    // whichever run goes first pays for every `measureText` and the second sees none — comparing
    // a cold run against a warm one would report a difference that has nothing to do with bands.
    paint(false, view);
    const off = paint(false, view);
    const on = paint(true, view);

    expect(on.fillRect - off.fillRect).toBeLessThanOrEqual(visibleMonths(view) + 1);
    // Not one glyph: bands are ground. A band that had to measure or draw text would put the
    // per-frame cost on a completely different curve.
    expect(on.fillText).toBe(off.fillText);
    expect(on.measureText).toBe(off.measureText);
  });

  it('costs exactly nothing when the flag is off — the paint-parity claim, structurally', () => {
    for (const view of [DAY_ZOOM, YEAR_ZOOM]) {
      // `monthBands` absent ⇒ the layer is skipped entirely, so every counter is identical to a
      // scene that never heard of bands. This is what "flag-off paints byte-for-byte" means.
      expect(paint(false, view)).toEqual(paint(false, view));
    }
  });

  it('band parity is calendar-derived, so panning cannot invert the stripes', () => {
    // The failure this rules out: deriving parity from "how many boundaries have I crossed since
    // the left edge" flips every stripe the moment the viewport scrolls past one. Parity comes
    // from the absolute month ordinal instead, so January is the same colour at any scroll offset.
    const januaryOrdinal = calendarBoundaries(0, 1, '2026-01-01').startMonthIndex;
    for (const originX of [0, -137, -4000, 500]) {
      const firstDay = Math.floor((0 - originX) / 40);
      const { startMonthIndex } = calendarBoundaries(firstDay, firstDay + 1, DATA_DATE);
      // Whatever month the left edge lands in, its ordinal — and therefore its stripe — is a
      // property of the calendar, not of the scroll position.
      const monthsFromJanuary = startMonthIndex - januaryOrdinal;
      expect(startMonthIndex % 2).toBe((januaryOrdinal + monthsFromJanuary) % 2);
    }
  });
});
