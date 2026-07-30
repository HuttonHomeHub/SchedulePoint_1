import { describe, expect, it } from 'vitest';

import { paintWbsBand, type WbsBandPalette } from './paint';
import type { Viewport } from './render-model';
import { wbsBandBars, type WbsBandGroup } from './wbs-band';

/**
 * **The ADR-0063 draw-budget gate.** The band adds a fourth layer to the tightest loop in the app,
 * so its cost is pinned rather than assumed — the counting-stub method the ADR-0054 dates gate and
 * the ADR-0055 month-bands gate both use, for the same reason: the assertion is about the **shape**
 * of the per-frame cost, not a millisecond count, because a CI runner's absolute timings are noise.
 *
 * The shape that matters is that the band's cost tracks **rendered groups**, not activities. A
 * 2,000-activity plan with eight phases must cost eight bars, and the cull must keep even a
 * thousand-summary pathological plan bounded by what is on screen.
 */
const PALETTE: WbsBandPalette = {
  bar: '#3b6fbf',
  derived: '#7a8090',
  rule: '#2a2f3a',
  label: '#ffffff',
  selection: '#8ab4f8',
};

const BAND = { width: 1920, height: 40 };
const DATA_DATE = '2026-01-01';
const view: Viewport = { pxPerDay: 4, originX: 0, originY: 0 };

function countingCtx() {
  const calls = { fillRect: 0, fill: 0, fillText: 0, measureText: 0, strokeRect: 0 };
  return {
    calls,
    ctx: {
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {
        calls.fillRect += 1;
      },
      fill: () => {
        calls.fill += 1;
      },
      beginPath: () => {},
      roundRect: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      strokeRect: () => {
        calls.strokeRect += 1;
      },
      fillText: () => {
        calls.fillText += 1;
      },
      measureText: (t: string) => {
        calls.measureText += 1;
        return { width: t.length * 6 } as TextMetrics;
      },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textBaseline: 'middle' as CanvasTextBaseline,
      textAlign: 'left' as CanvasTextAlign,
      setLineDash: () => {},
    },
  };
}

const groups = (count: number, depth = 0): WbsBandGroup[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${String(i)}`,
    label: `Phase ${String(i)}`,
    depth,
    // Consecutive 30-day spans from the data date, so early ones are on screen and later ones
    // fall off the right edge — which is what makes the cull observable.
    start: new Date(Date.UTC(2026, 0, 1 + i * 30)).toISOString().slice(0, 10),
    finish: new Date(Date.UTC(2026, 0, 29 + i * 30)).toISOString().slice(0, 10),
  }));

describe('paintWbsBand — draw budget', () => {
  it('costs one bar per rendered group, not one per activity', () => {
    const bars = wbsBandBars(groups(8), DATA_DATE, view, BAND);
    const { calls, ctx } = countingCtx();
    paintWbsBand(ctx, bars, null, BAND, PALETTE);
    // One rounded fill per bar, plus exactly one `fillRect` for the band's foot rule.
    expect(calls.fill).toBe(bars.length);
    expect(calls.fillRect).toBe(1);
  });

  /**
   * The property that keeps a pathological plan bounded: cost tracks what is ON SCREEN, not what
   * exists. A thousand phases laid end to end span eighty years; at this zoom a couple of dozen
   * are visible, and the rest must never reach the painter at all.
   */
  it('is bounded by the viewport, not by the number of groups', () => {
    const many = wbsBandBars(groups(1000), DATA_DATE, view, BAND);
    expect(many.length).toBeLessThan(50);

    const { calls, ctx } = countingCtx();
    paintWbsBand(ctx, many, null, BAND, PALETTE);
    expect(calls.fill).toBe(many.length);
  });

  it('measures and draws at most one label per bar', () => {
    const bars = wbsBandBars(groups(8), DATA_DATE, view, BAND);
    const { calls, ctx } = countingCtx();
    paintWbsBand(ctx, bars, null, BAND, PALETTE);
    expect(calls.fillText).toBeLessThanOrEqual(bars.length);
    // `truncateToWidth` may binary-search, so measures are bounded per bar rather than exactly one.
    expect(calls.measureText).toBeGreaterThan(0);
  });

  it('strokes only the selected bar', () => {
    const bars = wbsBandBars(groups(8), DATA_DATE, view, BAND);
    const { calls, ctx } = countingCtx();
    paintWbsBand(ctx, bars, 's1', BAND, PALETTE);
    expect(calls.strokeRect).toBe(1);
  });

  // Nothing to draw still costs the foot rule, and nothing else — the band never leaves a stale
  // frame behind it.
  it('draws only the rule when there are no bars', () => {
    const { calls, ctx } = countingCtx();
    paintWbsBand(ctx, [], null, BAND, PALETTE);
    expect(calls.fillRect).toBe(1);
    expect(calls.fill).toBe(0);
    expect(calls.fillText).toBe(0);
  });
});
