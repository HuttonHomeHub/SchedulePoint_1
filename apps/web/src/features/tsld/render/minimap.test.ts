import { describe, expect, it } from 'vitest';

import type { Ctx2D } from './ctx-2d';
import { screenXOfDay, worldExtent, type RenderActivity } from './geometry';
import {
  buildMinimapBitmap,
  minimapRects,
  minimapTiers,
  minimapViewport,
  type MinimapPalette,
} from './minimap';

const DATA_DATE = '2026-01-01';
const BOX = { width: 200, height: 120 };
const PALETTE: MinimapPalette = {
  ground: '#0f1218',
  outline: '#f2f4f8', // distinct from dataDate so the fringe assertions can tell them apart
  bar: '#3b6fbf',
  critical: '#e05d44',
  nearCritical: '#d29628',
  gridMinor: '#72777e',
  gridYear: '#4a4f57',
  dataDate: '#e6e8ee',
};

function activity(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'a1',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

/** A recording ctx that keeps every fillRect with the fillStyle it was painted in. */
function recordingCtx() {
  const fills: Array<{ style: string; x: number; y: number; w: number; h: number }> = [];
  let fillStyle = '';
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => {
      fills.push({ style: fillStyle, x, y, w, h });
    },
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }) as TextMetrics,
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string | CanvasGradient | CanvasPattern) {
      fillStyle = typeof v === 'string' ? v : '[object]';
    },
  };
  return { ctx, fills };
}

describe('minimapViewport', () => {
  it('maps the extent onto the box: minDay at x=0, maxDay at x=width, lane rows share the height', () => {
    const mapping = minimapViewport({ minDay: 10, maxDay: 110, maxLane: 9 }, BOX);
    expect(screenXOfDay(10, mapping.view)).toBe(0);
    expect(screenXOfDay(110, mapping.view)).toBe(BOX.width);
    expect(mapping.pxPerLane).toBe(12); // 120 / 10 lanes
    expect(mapping.spanDays).toBe(100);
    expect(mapping.laneCount).toBe(10);
  });

  it('floors degenerate spans at one day / one lane rather than dividing by zero', () => {
    const mapping = minimapViewport({ minDay: 5, maxDay: 5, maxLane: 0 }, BOX);
    expect(mapping.spanDays).toBe(1);
    expect(mapping.view.pxPerDay).toBe(BOX.width);
    expect(mapping.pxPerLane).toBe(BOX.height);
  });
});

describe('minimapRects', () => {
  it('floors bar width and height at 1px so no placed activity vanishes', () => {
    // 4,000-day extent in a 200px box: one day is 0.05px wide; 200 lanes: a lane is 0.6px.
    const mapping = minimapViewport({ minDay: 0, maxDay: 4000, maxLane: 199 }, BOX);
    const rects = minimapRects(
      [activity({ earlyStart: '2026-01-02', earlyFinish: '2026-01-02', laneIndex: 150 })],
      DATA_DATE,
      mapping,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]!.w).toBe(1);
    expect(rects[0]!.h).toBe(1);
  });

  it('skips unplaced activities and treats a null finish as a zero-span day', () => {
    const mapping = minimapViewport({ minDay: 0, maxDay: 100, maxLane: 1 }, BOX);
    const rects = minimapRects(
      [
        activity({ id: 'placed', earlyStart: '2026-01-11', earlyFinish: null, laneIndex: 1 }),
        activity({ id: 'unplaced', earlyStart: null, earlyFinish: null }),
      ],
      DATA_DATE,
      mapping,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]!.x).toBe(20); // day 10 of 100 in a 200px box
    expect(rects[0]!.y).toBe(60); // lane 1 of 2 in a 120px box
  });
});

describe('buildMinimapBitmap', () => {
  it('paints ground only and returns null when nothing is placeable', () => {
    const { ctx, fills } = recordingCtx();
    const mapping = buildMinimapBitmap(
      ctx,
      [activity({ earlyStart: null })],
      DATA_DATE,
      BOX,
      PALETTE,
    );
    expect(mapping).toBeNull();
    expect(fills).toEqual([{ style: PALETTE.ground, x: 0, y: 0, w: BOX.width, h: BOX.height }]);
  });

  it('draws ground → non-critical → critical → data-date, so the critical path survives the merge', () => {
    const { ctx, fills } = recordingCtx();
    // Two bars collapsing onto the same pixel column and lane: the critical one must paint LAST.
    const shared = { earlyStart: '2026-06-01', earlyFinish: '2031-06-01', laneIndex: 0 } as const;
    const acts = [
      activity({ id: 'crit', ...shared, isCritical: true }),
      activity({ id: 'norm', ...shared }),
      // Anchors the extent at the data date so the data-date vertical is in span.
      activity({ id: 'anchor', earlyStart: '2026-01-01', earlyFinish: '2026-01-02', laneIndex: 1 }),
    ];
    const mapping = buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    expect(mapping).not.toBeNull();
    const styles = fills.map((f) => f.style);

    // ── The M3 tiers draw BENEATH everything, and that is asserted as a relationship rather
    // than folded into the sequence below. This span is ~5.5 years, so the ladder admits
    // quarter + year; a count would make this case about the calendar instead of about paint
    // order, and would move every time the fixture's dates did.
    const tierInks = new Set<string>([PALETTE.gridMinor, PALETTE.gridYear]);
    const firstBar = styles.findIndex((v) => !tierInks.has(v) && v !== PALETTE.ground);
    expect(firstBar, 'something is painted after the ground').toBeGreaterThan(0);
    expect(
      styles.slice(firstBar).some((v) => tierInks.has(v)),
      'no tier rule is painted after a bar',
    ).toBe(false);
    expect(styles.filter((v) => tierInks.has(v)).length, 'the tiers drew').toBeGreaterThan(0);

    // ── And the original contract, unchanged: with the tiers removed the sequence is exactly
    // what it was before M3, which is the parity this milestone rests on.
    expect(styles.filter((v) => !tierInks.has(v))).toEqual([
      PALETTE.ground,
      // The data date sits between the tiers and the bars (M7): above texture, beneath plan
      // data, so a milestone standing on it is not painted out.
      PALETTE.dataDate,
      PALETTE.bar, // anchor + norm share the non-critical pass
      PALETTE.bar,
      // Rows are 60px tall here, so the critical bar carries its WCAG 1.4.1 lightness
      // fringe (M4 a11y gate): a foreground rect under an inset critical fill — hue is
      // never the only channel where the row can carry more.
      PALETTE.outline,
      PALETTE.critical,
    ]);
    // The decimation assertion: at identical geometry, the critical fill is a LATER draw call.
    expect(styles.indexOf(PALETTE.critical)).toBeGreaterThan(styles.indexOf(PALETTE.bar));
  });

  it('single activity: the bar spans the whole box (its own extent) and the data-date line lands at day 0 when in span', () => {
    const { ctx, fills } = recordingCtx();
    const acts = [activity({ earlyStart: '2026-01-01', earlyFinish: '2026-01-10', laneIndex: 0 })];
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    const bar = fills.find((f) => f.style === PALETTE.bar)!;
    expect(bar.x).toBe(0);
    expect(bar.w).toBe(BOX.width);
    expect(bar.h).toBe(BOX.height); // one lane fills the box
    const dd = fills.find((f) => f.style === PALETTE.dataDate)!;
    expect(dd).toEqual({ style: PALETTE.dataDate, x: 0, y: 0, w: 1, h: BOX.height });
  });

  it('drops the critical fringe below CRITICAL_FRINGE_MIN_H — a 1px fringe on a 1px bar IS the bar', () => {
    const { ctx, fills } = recordingCtx();
    // 200 lanes in a 120px box: rows are 0.6px, floored to 1px — far below the fringe floor.
    const acts = [
      activity({ id: 'c', isCritical: true, laneIndex: 150 }),
      activity({ id: 'n', laneIndex: 199 }),
    ];
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    expect(fills.some((f) => f.style === PALETTE.outline)).toBe(false);
    // The degradation to hue-plus-the-scene's-own-cues below the floor is REPORTED in
    // token-contrast.test.ts (the DAY-tier precedent), not silently accepted.
  });

  it('draws the data-date vertical BENEATH the bars, so a milestone on the data date survives', () => {
    const { ctx, fills } = recordingCtx();
    // A milestone AT the data date: zero span, so its bar is the 1px floor at exactly the x the
    // data-date vertical occupies. M0 §10 measured 76 of these on the flagship plan, every one of
    // them painted out — a whole activity class missing from the picture, and unreportable,
    // because a bar that is never drawn looks exactly like a bar that does not exist.
    const acts = [
      activity({ id: 'm', earlyStart: DATA_DATE, earlyFinish: DATA_DATE, laneIndex: 0 }),
      activity({ id: 'far', earlyStart: '2026-06-01', earlyFinish: '2026-06-30', laneIndex: 1 }),
    ];
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);

    const ddIndex = fills.findIndex((f) => f.style === PALETTE.dataDate);
    expect(ddIndex, 'the data-date vertical drew').toBeGreaterThanOrEqual(0);
    const dd = fills[ddIndex]!;
    // The milestone's bar and the vertical genuinely collide, or this case proves nothing.
    const milestone = fills.find((f) => f.style === PALETTE.bar && f.y === 0)!;
    expect(milestone, 'the milestone drew a bar').toBeDefined();
    expect(milestone.x).toBeLessThanOrEqual(dd.x);
    expect(milestone.x + milestone.w).toBeGreaterThan(dd.x);

    expect(
      fills.indexOf(milestone),
      'the bar is painted after the vertical, so it is not overwritten',
    ).toBeGreaterThan(ddIndex);
  });

  it('omits the data-date vertical when the data date falls outside the drawn extent', () => {
    const { ctx, fills } = recordingCtx();
    // Every bar starts a year after the data date, and worldExtent starts at the first bar.
    const acts = [activity({ earlyStart: '2027-05-01', earlyFinish: '2027-08-01' })];
    const mapping = buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    expect(mapping).not.toBeNull();
    expect(worldExtent(acts, DATA_DATE)!.minDay).toBeGreaterThan(0);
    expect(fills.some((f) => f.style === PALETTE.dataDate)).toBe(false);
  });
});

describe('the near-critical bar state (M2)', () => {
  /**
   * The scene paints three bar states and the minimap painted two. This asserts the third reaches
   * the canvas at all — the ADR-0081 shape applied to a colour rather than to a control: the pass
   * exists, its budget is gated, and without this nothing says a near-critical bar is drawn in the
   * near-critical ink rather than falling through to `bar`.
   */
  it('draws a near-critical bar in its own ink, not the ordinary one', () => {
    const fills: { style: string; y: number }[] = [];
    let current = '';
    const ctx = {
      setTransform: () => {},
      clearRect: () => {},
      fillRect: (_x: number, y: number) => {
        fills.push({ style: current, y });
      },
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      setLineDash: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }) as TextMetrics,
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textBaseline: 'middle' as CanvasTextBaseline,
      textAlign: 'left' as CanvasTextAlign,
      get fillStyle() {
        return current;
      },
      set fillStyle(v: string | CanvasGradient | CanvasPattern) {
        current = typeof v === 'string' ? v : '[object]';
      },
    };
    const acts = [
      activity({ id: 'ordinary', laneIndex: 0 }),
      activity({ id: 'near', laneIndex: 1, isNearCritical: true }),
      activity({ id: 'crit', laneIndex: 2, isCritical: true }),
    ];
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    const inks = new Set(fills.map((f) => f.style));
    expect(inks.has(PALETTE.nearCritical), 'the near-critical ink reached the canvas').toBe(true);
    expect(inks.has(PALETTE.bar), 'the ordinary ink is still used').toBe(true);
    expect(inks.has(PALETTE.critical), 'the critical ink is still used').toBe(true);
    // And the near-critical bar is NOT also painted as an ordinary one — the defect was that it
    // fell through, so a test that only checks the new ink would pass against a double-paint.
    const barPassRects = fills.filter((f) => f.style === PALETTE.bar).length;
    expect(barPassRects, 'exactly one ordinary bar is drawn in the ordinary ink').toBe(1);
  });

  /**
   * **The ladder's ORDER, which the case above does not assert** (M5 component review).
   *
   * ADR-0100 D5 makes draw order the decimation policy, so on a 1px merge the most urgent state
   * must be the later draw. The pre-existing critical-vs-ordinary case proves that by colliding
   * two bars on one pixel; near-critical shipped at M2 with no equivalent, so inverting its pass
   * to run before the ordinary one would have been caught by nothing.
   */
  it('paints ordinary → near-critical → critical, so the more urgent survives a merge', () => {
    const fills: string[] = [];
    let current = '';
    const ctx = {
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {
        fills.push(current);
      },
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      setLineDash: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }) as TextMetrics,
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textBaseline: 'middle' as CanvasTextBaseline,
      textAlign: 'left' as CanvasTextAlign,
      get fillStyle() {
        return current;
      },
      set fillStyle(v: string | CanvasGradient | CanvasPattern) {
        current = typeof v === 'string' ? v : '[object]';
      },
    };
    // All three on the SAME pixel and lane, so the merge is real rather than incidental.
    const shared = { earlyStart: '2026-06-01', earlyFinish: '2031-06-01', laneIndex: 0 } as const;
    buildMinimapBitmap(
      ctx,
      [
        activity({ id: 'crit', ...shared, isCritical: true }),
        activity({ id: 'near', ...shared, isNearCritical: true }),
        activity({ id: 'norm', ...shared }),
        activity({
          id: 'anchor',
          earlyStart: '2026-01-01',
          earlyFinish: '2026-01-02',
          laneIndex: 1,
        }),
      ],
      DATA_DATE,
      BOX,
      PALETTE,
    );
    expect(fills.lastIndexOf(PALETTE.bar)).toBeLessThan(fills.indexOf(PALETTE.nearCritical));
    expect(fills.lastIndexOf(PALETTE.nearCritical)).toBeLessThan(fills.indexOf(PALETTE.critical));
  });

  /**
   * The tie-break for an activity flagged BOTH, pinned rather than left implicit. The engine
   * cannot produce one (`isNearCritical` is computed as `!isCritical && …`), and the types here
   * are two independent booleans that permit it — so the resolution is a property of draw order
   * rather than of the data, and it matches the scene's own precedence (`paint.ts`: critical is
   * tested first). Asserted so a later reordering cannot silently invert it.
   */
  it('critical wins over near-critical when an activity carries both flags', () => {
    const fills: string[] = [];
    let current = '';
    const ctx = {
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {
        fills.push(current);
      },
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      setLineDash: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }) as TextMetrics,
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textBaseline: 'middle' as CanvasTextBaseline,
      textAlign: 'left' as CanvasTextAlign,
      get fillStyle() {
        return current;
      },
      set fillStyle(v: string | CanvasGradient | CanvasPattern) {
        current = typeof v === 'string' ? v : '[object]';
      },
    };
    buildMinimapBitmap(
      ctx,
      [activity({ id: 'both', isCritical: true, isNearCritical: true, laneIndex: 0 })],
      DATA_DATE,
      BOX,
      PALETTE,
    );
    expect(fills, 'painted critical').toContain(PALETTE.critical);
    expect(fills, 'never painted near-critical').not.toContain(PALETTE.nearCritical);
    expect(fills, 'never painted ordinary').not.toContain(PALETTE.bar);
  });
});

describe('the temporal tier ladder (M3)', () => {
  /**
   * The two plans M0 measured, by their real spans — so this case fails if the ladder ever stops
   * agreeing with the pictures the floor was set from (`m0-measurement.md` §7.2, §9.2).
   */
  it('admits quarter + year on a 1,059-day plan and year alone on a 4,385-day one', () => {
    expect(minimapTiers(1059, 200)).toEqual({ minor: 'quarter', year: true });
    expect(minimapTiers(4385, 200)).toEqual({ minor: null, year: true });
  });

  it('prefers month when month clears the floor — the finest that fits, never both', () => {
    // 60 days at 200px: month pitch ~101px. Quarter is a SUBSET of the month boundaries, so
    // drawing both would paint the same rules twice in the same ink.
    expect(minimapTiers(60, 200)).toEqual({ minor: 'month', year: true });
  });

  it('refuses every tier on a span too long to carry one', () => {
    // 200px / 6px floor = at most ~33 rules, so a year pitch under 6px refuses even the coarsest.
    // 365.25 * 200 / span < 6  =>  span > 12,175 days.
    expect(minimapTiers(20_000, 200)).toEqual({ minor: null, year: false });
  });

  it('a span admitting no tier writes no tier — ground, bars and data date only', () => {
    const { calls, ctx } = countingStyleCtx();
    // ~55 years: every tier is below the floor.
    const acts = [
      activity({ id: 'a', earlyStart: '2026-01-01', earlyFinish: '2081-01-01', laneIndex: 0 }),
    ];
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    expect(calls.styles.includes(PALETTE.gridMinor), 'no minor tier').toBe(false);
    expect(calls.styles.includes(PALETTE.gridYear), 'no year tier').toBe(false);
  });
});

/** A minimal style recorder for the case above. */
function countingStyleCtx(): { calls: { styles: string[] }; ctx: Ctx2D } {
  const calls = { styles: [] as string[] };
  let current = '';
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }) as TextMetrics,
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    get fillStyle() {
      return current;
    },
    set fillStyle(v: string | CanvasGradient | CanvasPattern) {
      current = typeof v === 'string' ? v : '[object]';
      calls.styles.push(current);
    },
  };
  return { calls, ctx };
}
