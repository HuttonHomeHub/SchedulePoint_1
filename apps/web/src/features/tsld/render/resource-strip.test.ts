import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { daysBetween, screenXOfDay, type Size, type Viewport } from './render-model';
import {
  bucketRects,
  projectBucketDays,
  seriesMax,
  STRIP_BAR_TOP_PAD,
  type StripBandGeom,
} from './resource-strip';

const DATA_DATE = '2026-01-01';

/** Three consecutive WEEK buckets from the data date (`[start, end)`, `end` exclusive = next start). */
const WEEK_BUCKETS: ResourceHistogramBucket[] = [
  { start: '2026-01-01', end: '2026-01-08' },
  { start: '2026-01-08', end: '2026-01-15' },
  { start: '2026-01-15', end: '2026-01-22' },
];

const SERIES: ResourceHistogramSeries = {
  resourceId: 'r1',
  values: [4, 10, 2],
  total: 16,
};

const SIZE: Size = { width: 1000, height: 600 };
const BAND: StripBandGeom = { height: 72, max: seriesMax(SERIES) };

function view(pxPerDay: number, originX = 0): Viewport {
  return { pxPerDay, originX, originY: 0 };
}

describe('seriesMax', () => {
  it('is the whole-series peak (viewport-independent y-scale)', () => {
    expect(seriesMax(SERIES)).toBe(10);
  });

  it('is 0 for an empty series or absent input (no bars to scale)', () => {
    expect(seriesMax({ resourceId: 'x', values: [], total: 0 })).toBe(0);
    expect(seriesMax(null)).toBe(0);
    expect(seriesMax(undefined)).toBe(0);
  });

  it('never rescales with the viewport — the max is over ALL buckets, visible or not', () => {
    // A viewport that shows only the first (value 4) bucket must still scale against the whole-series
    // peak (10), so the visible bar keeps its height while panning (ADR-0049 §6).
    const v = view(40, /* originX */ -400); // day 10 sits at x=0, so buckets 0/1 are off-screen left
    const bars = bucketRects(SERIES, WEEK_BUCKETS, DATA_DATE, v, { width: 100, height: 72 }, BAND);
    // The one visible bar's height uses max=10 (BAND.max), not the visible max.
    for (const bar of bars) {
      expect(bar.h).toBeCloseTo((bar.value / 10) * (BAND.height - STRIP_BAR_TOP_PAD));
    }
  });
});

describe('projectBucketDays', () => {
  it('projects each bucket [start, end) to signed day offsets about the data date', () => {
    expect(projectBucketDays(WEEK_BUCKETS, DATA_DATE)).toEqual([
      { start: 0, end: 7 },
      { start: 7, end: 14 },
      { start: 14, end: 21 },
    ]);
  });
});

describe('bucketRects — bucket → rect on the shared time axis', () => {
  it("a bucket's left edge equals the scene's screenXOfDay(dayOffset(start)) for the same viewport", () => {
    // The co-alignment guarantee (ADR-0049): the strip and the scene/ruler compute x identically.
    const v = view(40, 24);
    const bars = bucketRects(SERIES, WEEK_BUCKETS, DATA_DATE, v, SIZE, BAND);
    bars.forEach((bar, i) => {
      const startDay = daysBetween(DATA_DATE, WEEK_BUCKETS[i]!.start);
      expect(bar.x).toBe(screenXOfDay(startDay, v));
    });
  });

  it('spans exactly N·pxPerDay per bucket at Day / Week / Month zooms (a WEEK bucket = 7 columns)', () => {
    for (const pxPerDay of [40 /* day */, 14 /* week */, 5 /* month */]) {
      const v = view(pxPerDay);
      const bars = bucketRects(SERIES, WEEK_BUCKETS, DATA_DATE, v, SIZE, BAND);
      expect(bars).toHaveLength(3);
      for (const bar of bars) {
        // Each 7-day WEEK bucket is exactly 7 day-columns wide.
        expect(bar.w).toBeCloseTo(7 * pxPerDay);
      }
      // Consecutive buckets abut (no gap / overlap): bucket i's right edge = bucket i+1's left edge.
      expect(bars[0]!.x + bars[0]!.w).toBeCloseTo(bars[1]!.x);
      expect(bars[1]!.x + bars[1]!.w).toBeCloseTo(bars[2]!.x);
    }
  });

  it('scales bar height to the whole-series max, reserving the top pad for the axis/tick', () => {
    const bars = bucketRects(SERIES, WEEK_BUCKETS, DATA_DATE, view(40), SIZE, BAND);
    const barArea = BAND.height - STRIP_BAR_TOP_PAD;
    expect(bars[0]!.h).toBeCloseTo((4 / 10) * barArea);
    expect(bars[1]!.h).toBeCloseTo((10 / 10) * barArea); // the peak bar fills the bar area
    expect(bars[2]!.h).toBeCloseTo((2 / 10) * barArea);
  });

  it('culls buckets whose span falls entirely off the surface', () => {
    // Pan so only the middle (day 7–14) bucket is on a narrow 100px surface: originX = -7·40 puts
    // day 7 at x=0; the first bucket (x2 = 0) and the third (x1 = 280) are off-surface and dropped.
    const v = view(40, -280);
    const narrow: Size = { width: 100, height: 72 };
    const bars = bucketRects(SERIES, WEEK_BUCKETS, DATA_DATE, v, narrow, BAND);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.value).toBe(10); // the middle bucket survived
  });

  it('draws no bars for an empty series (nothing to project)', () => {
    const empty: ResourceHistogramSeries = { resourceId: 'r1', values: [], total: 0 };
    expect(
      bucketRects(empty, WEEK_BUCKETS, DATA_DATE, view(40), SIZE, { height: 72, max: 0 }),
    ).toEqual([]);
  });

  it('draws no bars when the max is 0 (an all-zero series avoids a divide-by-zero)', () => {
    const zeros: ResourceHistogramSeries = { resourceId: 'r1', values: [0, 0, 0], total: 0 };
    expect(
      bucketRects(zeros, WEEK_BUCKETS, DATA_DATE, view(40), SIZE, { height: 72, max: 0 }),
    ).toEqual([]);
  });

  it('gives a culled-in sliver bucket at least 1px of width (never invisible)', () => {
    // A month zoom (5 px/day) still leaves a 7-day bucket 35px wide, but assert the min-width floor
    // holds by shrinking pxPerDay hard.
    const bars = bucketRects(SERIES, WEEK_BUCKETS, DATA_DATE, view(0.05), SIZE, BAND);
    for (const bar of bars) expect(bar.w).toBeGreaterThanOrEqual(1);
  });
});
