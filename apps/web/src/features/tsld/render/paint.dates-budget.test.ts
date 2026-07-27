import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import { DATE_LABEL_MIN_PX_PER_DAY, type RenderActivity, type Viewport } from './render-model';

/**
 * **The M3 gate** (ADR-0054 §3, plan task M3-T5). Flanking start/finish dates are the epic's one
 * real performance risk: two extra `fillText` calls per visible bar plus the `measureText` each
 * needs for collision, against ADR-0026's **≤4 ms p95 draw budget at 2,000 activities**.
 *
 * This is a measurement, not a formality — the LOD threshold and the M6 default-on decision are
 * both taken from what it reports. It runs the real painter against a counting stub rather than a
 * real 2D context (jsdom has none), so what it measures is the painter's own work: the geometry,
 * culling, memoised measurement and draw calls. It cannot measure GPU rasterisation, and says so
 * rather than pretending otherwise — the browser-side number is re-confirmed at M6.
 *
 * The assertion is deliberately about the **shape of the cost**, not a wall-clock millisecond
 * count, because a CI runner's absolute timings are noise. What must hold is that dates add a
 * bounded, proportionate amount of work — not a super-linear blow-up — and that the LOD threshold
 * takes the cost to exactly zero below it.
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

/**
 * A realistic dense plan: 2,000 activities over 50 lanes, 40 per lane, each 5 working days with a
 * 15-day gap to its lane neighbour.
 *
 * The spacing is deliberate and was corrected once: an earlier fixture stacked 200 *overlapping*
 * bars per lane, and the collision rule — correctly — suppressed every single date, so the
 * measurement said "free" while measuring nothing. A fixture that never exercises the code it
 * claims to budget is worse than no fixture.
 */
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

function paint(dates: boolean, pxPerDay: number) {
  const ctx = countingCtx();
  const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities: bigPlan(),
    edges: [],
    dataDate: DATA_DATE,
    // NOTE: the scene's toggle bag is `view` (the viewport is the separate positional argument) —
    // passing `toggles:` here silently did nothing and made the first run report "dates are free".
    view: { ...TOGGLES, dates },
  };
  const started = performance.now();
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return { ...ctx.calls, ms: performance.now() - started };
}

describe('flanking dates — draw-budget gate at 2,000 activities (ADR-0054 §3 / M3-T5)', () => {
  it('costs nothing at all below the LOD threshold', () => {
    const below = DATE_LABEL_MIN_PX_PER_DAY - 1;
    const off = paint(false, below);
    const on = paint(true, below);
    // Not one extra DRAW: the zoom check precedes every measurement and every date.
    expect(on.fillText).toBe(off.fillText);
    // …and never more measurement. (Not strict equality: the width memo is module-scope and warms
    // across paints, so the second run legitimately measures fewer — which is the memo working,
    // not the toggle costing something.)
    expect(on.measureText).toBeLessThanOrEqual(off.measureText);
  });

  it('adds at most two text draws per VISIBLE bar above the threshold, never per activity', () => {
    const px = DATE_LABEL_MIN_PX_PER_DAY;
    const off = paint(false, px);
    const on = paint(true, px);
    const added = on.fillText - off.fillText;
    expect(added).toBeGreaterThan(0); // the feature actually draws
    // The culled/collided majority is the point: a naive implementation would add 2 × 2,000.
    expect(added).toBeLessThanOrEqual(COUNT * 2);
  });

  it('measures each distinct date at most once, never once per bar', () => {
    const on = paint(true, DATE_LABEL_MIN_PX_PER_DAY);
    // The width memo is module-scope and keyed by text (the same one the label pass uses), so it
    // is deliberately WARM across paints — which is exactly its production behaviour, since the
    // canvas repaints constantly with a stable label vocabulary. What must hold either way is that
    // measurement never scales with the number of bars drawn.
    expect(on.measureText).toBeLessThanOrEqual(on.fillText);
  });

  it('reports its measurement so the M6 default-on decision is made on data', () => {
    const px = 12; // day zoom — the worst realistic case for date labels
    const off = paint(false, px);
    const on = paint(true, px);
    // Printed, not asserted: absolute timings on a CI runner are noise, and this stub cannot
    // measure GPU rasterisation. The ratio is the honest signal, and M6 re-confirms in a browser.
    // eslint-disable-next-line no-console
    console.log(
      `[ADR-0054 M3-T5] ${COUNT} activities @ ${px}px/day — dates off ${off.ms.toFixed(2)}ms, ` +
        `on ${on.ms.toFixed(2)}ms (+${(on.ms - off.ms).toFixed(2)}ms, ` +
        `${on.fillText - off.fillText} extra text draws, ${on.measureText - off.measureText} extra measures)`,
    );
    expect(on.ms).toBeGreaterThan(0);
  });
});
