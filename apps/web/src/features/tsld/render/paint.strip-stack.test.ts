import { describe, expect, it } from 'vitest';

import { paintResourceStrip, type Ctx2D, type ResourceStripPalette } from './paint';
import { SEGMENT_RULE_MIN_PX, type ResourceStripSnapshot } from './resource-strip';

/**
 * **The multi-segment paint path, which the epic's own plan required tests for and did not get.**
 *
 * Every other test that calls `paintResourceStrip` hands it a ONE-segment snapshot, so the two
 * things this epic actually added to the painter — bands stacking from the baseline in draw order,
 * and the ground-coloured boundary suppressed where either neighbour is too thin to separate — had
 * no coverage at all. Three reviews found that independently.
 *
 * The recording context captures `fillRect` with the fill in force, which is what lets a test ask
 * the two questions that matter: *did band n land on top of band n-1*, and *was a boundary drawn*.
 * Absolute geometry is asserted against the painter's own arithmetic rather than restated, so this
 * pins the ORDER and the SUPPRESSION RULE and not the constants around them.
 */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

function recordingCtx(): { ctx: Ctx2D; rects: Rect[] } {
  const rects: Rect[] = [];
  const ctx = {
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => {
      rects.push({ x, y, w, h, fill: ctx.fillStyle });
    },
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
  } as unknown as Ctx2D & { fillStyle: string };
  return { ctx, rects };
}

const PALETTE: ResourceStripPalette = {
  bar: '#3b6fbf',
  axis: '#2a2f3a',
  tick: '#7a8090',
  ground: '#f4f6f8',
};

const BAND = { width: 400, height: 72 };
const VIEW = { originX: 0, originY: 0, pxPerDay: 20 };
/** `STRIP_BAR_TOP_PAD` is 6; the painter scales bars against `height - pad`. */
const BAR_AREA = BAND.height - 6;

/** One bucket, `values[0]` per segment, so every rect in the result belongs to one column. */
function snapshot(values: readonly number[], fills: readonly string[]): ResourceStripSnapshot {
  const segments = values.map((v, i) => ({ values: [v], fill: fills[i] ?? '#000000' }));
  const total = values.reduce((a, b) => a + b, 0);
  return {
    segments,
    bucketTotals: [total],
    dayOffsets: [{ start: 0, end: 7 }],
    dataDate: '2026-01-01',
    max: total,
  };
}

function paint(snap: ResourceStripSnapshot): Rect[] {
  const { ctx, rects } = recordingCtx();
  paintResourceStrip(ctx, snap, VIEW, BAND, PALETTE, 1);
  // Drop the axis rule (the full-width 1px bar the painter always draws first).
  return rects.filter((r) => !(r.w === BAND.width && r.h === 1 && r.fill === PALETTE.axis));
}

describe('the strip stacks its segments', () => {
  it('draws bands from the baseline upward in draw order', () => {
    const rects = paint(snapshot([50, 30, 20], ['#aa0000', '#00aa00', '#0000aa']));
    const bands = rects.filter((r) => r.fill !== PALETTE.ground);
    expect(bands.map((r) => r.fill)).toEqual(['#aa0000', '#00aa00', '#0000aa']);

    // Each band's top is the next band's bottom: they stack, with no gap and no overlap.
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]!.y + bands[i]!.h).toBeCloseTo(bands[i - 1]!.y, 6);
    }
    // The first band sits on the band's baseline, and the stack fills the whole bar area.
    expect(bands[0]!.y + bands[0]!.h).toBeCloseTo(BAND.height, 6);
    expect(bands.reduce((a, r) => a + r.h, 0)).toBeCloseTo(BAR_AREA, 6);
  });

  it('skips a segment with no value in this bucket rather than drawing a zero-height band', () => {
    const rects = paint(snapshot([50, 0, 50], ['#aa0000', '#00aa00', '#0000aa']));
    const bands = rects.filter((r) => r.fill !== PALETTE.ground);
    expect(bands.map((r) => r.fill)).toEqual(['#aa0000', '#0000aa']);
  });

  it('draws one boundary between each adjacent pair, never below the lowest band', () => {
    const rects = paint(snapshot([40, 30, 30], ['#aa0000', '#00aa00', '#0000aa']));
    const rules = rects.filter((r) => r.fill === PALETTE.ground);
    expect(rules).toHaveLength(2);
    for (const rule of rules) expect(rule.h).toBe(1);
    // No rule sits on the baseline — there is nothing below the first band to separate it from.
    for (const rule of rules) expect(rule.y).toBeLessThan(BAND.height - 1);
  });
});

describe('the boundary rule is suppressed where a band is too thin to separate', () => {
  /**
   * Heights are chosen against the painter's own scale (`value / max * BAR_AREA`) so the top band
   * lands just under, exactly on, and just over `SEGMENT_RULE_MIN_PX`. Verified red by removing the
   * threshold: all three then draw a rule.
   */
  const thin = (px: number): ResourceStripSnapshot => {
    const rest = BAR_AREA - px;
    return snapshot([rest, px], ['#aa0000', '#00aa00']);
  };
  const ruleCount = (snap: ResourceStripSnapshot): number =>
    paint(snap).filter((r) => r.fill === PALETTE.ground).length;

  it('draws no rule when the upper band is thinner than the threshold', () => {
    expect(ruleCount(thin(SEGMENT_RULE_MIN_PX - 1))).toBe(0);
  });

  it('draws a rule exactly at the threshold', () => {
    expect(ruleCount(thin(SEGMENT_RULE_MIN_PX))).toBe(1);
  });

  it('draws a rule above the threshold', () => {
    expect(ruleCount(thin(SEGMENT_RULE_MIN_PX + 1))).toBe(1);
  });

  it('draws no rule when the LOWER band is the thin one', () => {
    // The rule is skipped if EITHER neighbour is too thin, not only the one above it.
    const rest = BAR_AREA - (SEGMENT_RULE_MIN_PX - 1);
    expect(ruleCount(snapshot([SEGMENT_RULE_MIN_PX - 1, rest], ['#aa0000', '#00aa00']))).toBe(0);
  });
});
