import { describe, expect, it } from 'vitest';

import { screenXOfDay, worldExtent, type RenderActivity } from './geometry';
import { buildMinimapBitmap, minimapRects, minimapViewport, type MinimapPalette } from './minimap';

const DATA_DATE = '2026-01-01';
const BOX = { width: 200, height: 120 };
const PALETTE: MinimapPalette = {
  ground: '#0f1218',
  bar: '#3b6fbf',
  critical: '#e05d44',
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
    expect(styles).toEqual([
      PALETTE.ground,
      PALETTE.bar, // anchor + norm share the non-critical pass
      PALETTE.bar,
      PALETTE.critical,
      PALETTE.dataDate,
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
