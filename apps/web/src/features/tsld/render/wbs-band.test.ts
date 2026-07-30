import { describe, expect, it } from 'vitest';

import { daysBetween, screenXOfDay, type Size, type Viewport } from './render-model';
import {
  WBS_BAND_MAX_DEPTH,
  WBS_BAND_PAD_Y,
  WBS_BAND_ROW_GAP,
  WBS_BAND_ROW_HEIGHT,
  wbsBandBars,
  wbsBandDepths,
  wbsBandHeight,
  wbsBandHitTest,
  type WbsBandGroup,
} from './wbs-band';

const DATA_DATE = '2026-03-02';
const view: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const size: Size = { width: 800, height: 400 };

const group = (over: Partial<WbsBandGroup> & { label: string }): WbsBandGroup => ({
  id: over.label,
  depth: 0,
  start: '2026-03-02',
  finish: '2026-03-06',
  ...over,
});

describe('wbsBandHeight', () => {
  it('is zero for no rendered depths — the canvas reserves nothing', () => {
    expect(wbsBandHeight(0)).toBe(0);
  });

  it('grows one sub-row at a time', () => {
    expect(wbsBandHeight(1)).toBe(WBS_BAND_PAD_Y * 2 + WBS_BAND_ROW_HEIGHT);
    expect(wbsBandHeight(2)).toBe(wbsBandHeight(1) + WBS_BAND_ROW_HEIGHT + WBS_BAND_ROW_GAP);
  });

  // The cap is the whole point: the band must not take the canvas away a row at a time as a
  // planner nests deeper.
  it('is bounded by the depth cap however deep the plan goes', () => {
    const capped = wbsBandHeight(WBS_BAND_MAX_DEPTH + 1);
    expect(wbsBandHeight(50)).toBe(capped);
  });

  it('treats a negative count as none', () => {
    expect(wbsBandHeight(-3)).toBe(0);
  });
});

describe('wbsBandDepths', () => {
  it('counts DISTINCT depths present, not the deepest plus one', () => {
    // Only depth 2 present: one sub-row, not three with two empty above it.
    expect(wbsBandDepths([group({ label: 'deep', depth: 2 })])).toBe(1);
  });

  it('excludes depths beyond the cap, agreeing with wbsBandBars', () => {
    const groups = [
      group({ label: 'a', depth: 0 }),
      group({ label: 'b', depth: 1 }),
      group({ label: 'c', depth: 5 }),
    ];
    expect(wbsBandDepths(groups)).toBe(2);
    expect(wbsBandBars(groups, DATA_DATE, view, size).map((b) => b.label)).toEqual(['a', 'b']);
  });
});

describe('wbsBandBars', () => {
  /**
   * The module's central promise (ADR-0063 §1, the ADR-0049 co-alignment property restated): a
   * band bar's left edge is the *same expression* the scene uses for the same date and viewport.
   * If this ever fails, the band and the diagram beneath it disagree about where a day is — a
   * drift visible to nobody until a planner reads a date off the band.
   */
  it('places a bar’s left edge exactly where the scene would', () => {
    const [bar] = wbsBandBars([group({ label: 'Substructure' })], DATA_DATE, view, size);
    expect(bar?.x).toBe(screenXOfDay(daysBetween(DATA_DATE, '2026-03-02'), view));
  });

  it('holds co-alignment under a panned, zoomed viewport', () => {
    // Panned far enough to be a real test of the affine, but not so far the bar is culled —
    // the cull is a separate property with its own tests below.
    const panned: Viewport = { pxPerDay: 3.7, originX: -100.5, originY: 0 };
    const [bar] = wbsBandBars(
      [group({ label: 'x', start: '2026-04-13', finish: '2026-04-17' })],
      DATA_DATE,
      panned,
      size,
    );
    expect(bar?.x).toBe(screenXOfDay(daysBetween(DATA_DATE, '2026-04-13'), panned));
  });

  // Inclusive finish (ADR-0023) — the same convention the scene's bars use, so a five-day group
  // covers five day-columns rather than four.
  it('spans the finish day inclusively', () => {
    const [bar] = wbsBandBars(
      [group({ label: 'x', start: '2026-03-02', finish: '2026-03-06' })],
      DATA_DATE,
      view,
      size,
    );
    expect(bar?.w).toBe(5 * view.pxPerDay);
  });

  it('gives a one-day group a visible width at a coarse zoom', () => {
    const coarse: Viewport = { pxPerDay: 0.4, originX: 0, originY: 0 };
    const [bar] = wbsBandBars(
      [group({ label: 'x', start: '2026-03-02', finish: '2026-03-02' })],
      DATA_DATE,
      coarse,
      size,
    );
    expect(bar?.w).toBeGreaterThanOrEqual(2);
  });

  it('stacks depths into sub-rows, deepest lowest', () => {
    const bars = wbsBandBars(
      [group({ label: 'outer', depth: 0 }), group({ label: 'inner', depth: 1 })],
      DATA_DATE,
      view,
      size,
    );
    const byLabel = new Map(bars.map((b) => [b.label, b.y]));
    expect(byLabel.get('outer')).toBe(WBS_BAND_PAD_Y);
    expect(byLabel.get('inner')).toBe(WBS_BAND_PAD_Y + WBS_BAND_ROW_HEIGHT + WBS_BAND_ROW_GAP);
  });

  // The sub-row is the depth's POSITION among those present, not the depth number — so a band
  // showing only depth-2 groups does not leave two empty rows above them.
  it('packs the rendered depths from the top, whatever their numbers', () => {
    const bars = wbsBandBars([group({ label: 'deep', depth: 2 })], DATA_DATE, view, size);
    expect(bars[0]?.y).toBe(WBS_BAND_PAD_Y);
  });

  it('draws nothing for a group with no computed span', () => {
    const bars = wbsBandBars(
      [group({ label: 'x', start: null, finish: null })],
      DATA_DATE,
      view,
      size,
    );
    expect(bars).toEqual([]);
  });

  it('culls a group entirely off the surface, either side', () => {
    const far = group({ label: 'far', start: '2029-01-01', finish: '2029-01-05' });
    const behind = group({ label: 'behind', start: '2020-01-01', finish: '2020-01-05' });
    expect(wbsBandBars([far, behind], DATA_DATE, view, size)).toEqual([]);
  });

  it('keeps a group that straddles the left edge', () => {
    const straddling = group({ label: 'x', start: '2026-02-01', finish: '2026-03-10' });
    const bars = wbsBandBars([straddling], DATA_DATE, view, size);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.x).toBeLessThan(0);
  });

  it('carries a null id through for the derived bucket', () => {
    const bars = wbsBandBars([group({ label: 'Unassigned', id: null })], DATA_DATE, view, size);
    expect(bars[0]?.id).toBeNull();
  });
});

describe('wbsBandHitTest', () => {
  const bars = wbsBandBars(
    [group({ label: 'outer', depth: 0 }), group({ label: 'inner', depth: 1 })],
    DATA_DATE,
    view,
    size,
  );

  it('finds the bar under a point', () => {
    expect(wbsBandHitTest(bars, 5, WBS_BAND_PAD_Y + 2)?.label).toBe('outer');
  });

  it('returns null in the gap between sub-rows', () => {
    expect(wbsBandHitTest(bars, 5, WBS_BAND_PAD_Y + WBS_BAND_ROW_HEIGHT + 1)).toBeNull();
  });

  it('returns null past a bar’s right edge', () => {
    const right = bars[0]!.x + bars[0]!.w;
    expect(wbsBandHitTest(bars, right + 1, WBS_BAND_PAD_Y + 2)).toBeNull();
  });

  // The hit-test stays a purely geometric question; refusing to SELECT a bucket is the caller's
  // job, because the caller is the one that knows selection means handing over an activity id.
  it('still returns the derived bucket — refusing it is the caller’s job', () => {
    const bucket = wbsBandBars([group({ label: 'Unassigned', id: null })], DATA_DATE, view, size);
    expect(wbsBandHitTest(bucket, 5, WBS_BAND_PAD_Y + 2)?.id).toBeNull();
  });
});
