import { describe, expect, it, vi } from 'vitest';

import { resolvePrintPalette, resolveTsldPalette } from '../render/palette';
import { screenXOfDay, type RenderActivity, type Viewport } from '../render/render-model';

import {
  buildExportViewport,
  EXPORT_DPR_CAP,
  EXPORT_MAX_PX,
  type LiveViewport,
} from './export-image';

const DATA_DATE = '2026-01-01';

function activity(over: Partial<RenderActivity> & Pick<RenderActivity, 'id'>): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: over.id,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-01',
    isCritical: false,
    isNearCritical: false,
    ...over,
  };
}

function live(view: Partial<Viewport>, width = 300, height = 200): LiveViewport {
  return {
    view: { pxPerDay: 10, originX: 0, originY: 0, ...view },
    size: { width, height },
  };
}

describe('buildExportViewport — whole extent', () => {
  it('frames the full activity extent at the live zoom (inclusive-finish right edge)', () => {
    const activities = [
      // day 0 → 4 (inclusive finish 2026-01-05), lane 0
      activity({ id: 'a', earlyStart: '2026-01-01', earlyFinish: '2026-01-05', laneIndex: 0 }),
      // day 2 → 3, lane 2 (deepest lane)
      activity({ id: 'b', earlyStart: '2026-01-03', earlyFinish: '2026-01-04', laneIndex: 2 }),
    ];
    const result = buildExportViewport(activities, DATA_DATE, {
      extent: 'whole',
      liveViewport: live({ pxPerDay: 10 }),
      padding: 0,
      topBand: 0,
      dpr: 1,
    });
    // Span is day 0 … day 5 (finish+1) = 5 days at 10px → 50px wide; 3 lanes (0..2) × 28px tall.
    expect(result.size).toEqual({ width: 50, height: 84 });
    // The earliest day sits at the left edge and the latest finish+1 at the right edge — the bounds
    // cover the whole extent (reusing the shipped inclusive-finish convention).
    expect(screenXOfDay(0, result.viewport)).toBe(0);
    expect(screenXOfDay(5, result.viewport)).toBe(result.size.width);
    expect(result.dpr).toBe(1);
    expect(result.scaledToFit).toBe(false);
  });

  it('reserves the top band above the diagram (originY offset by the band)', () => {
    const result = buildExportViewport([activity({ id: 'a' })], DATA_DATE, {
      extent: 'whole',
      liveViewport: live({ pxPerDay: 10 }),
      padding: 8,
      topBand: 40,
      dpr: 1,
    });
    expect(result.viewport.originY).toBe(48); // topBand + padding
    expect(result.size.height).toBe(40 + 28 + 16); // band + one lane + 2× padding
  });

  it('caps the device-pixel-ratio to EXPORT_DPR_CAP', () => {
    const result = buildExportViewport([activity({ id: 'a' })], DATA_DATE, {
      extent: 'whole',
      liveViewport: live({ pxPerDay: 10 }),
      padding: 0,
      topBand: 0,
      dpr: 5,
      maxPx: 100_000,
    });
    expect(result.dpr).toBe(EXPORT_DPR_CAP);
    expect(result.scaledToFit).toBe(false);
  });

  it('clamps BOTH axes to maxPx and flags scaledToFit (a uniform down-scale)', () => {
    // 10 days × 20px = 200px wide, 1 lane = 28px tall; at dpr 2 → 400×56 raster.
    const activities = [
      activity({ id: 'a', earlyStart: '2026-01-01', earlyFinish: '2026-01-10', laneIndex: 0 }),
    ];
    const result = buildExportViewport(activities, DATA_DATE, {
      extent: 'whole',
      liveViewport: live({ pxPerDay: 20 }),
      padding: 0,
      topBand: 0,
      dpr: 2,
      maxPx: 100,
    });
    expect(result.scaledToFit).toBe(true);
    // The larger axis (width 200 × 2 = 400) is scaled to exactly maxPx; both axes end up ≤ maxPx.
    expect(result.size.width * result.dpr).toBeCloseTo(100, 6);
    expect(result.size.width * result.dpr).toBeLessThanOrEqual(100);
    expect(result.size.height * result.dpr).toBeLessThanOrEqual(100);
  });

  it('flips scaledToFit exactly at the cap boundary', () => {
    // width = 10 days × 10px = 100px; raster at dpr 1 = 100px.
    const activities = [
      activity({ id: 'a', earlyStart: '2026-01-01', earlyFinish: '2026-01-10', laneIndex: 0 }),
    ];
    const opts = {
      extent: 'whole' as const,
      liveViewport: live({ pxPerDay: 10 }),
      padding: 0,
      topBand: 0,
      dpr: 1,
    };
    // Exactly at the cap → not scaled.
    expect(buildExportViewport(activities, DATA_DATE, { ...opts, maxPx: 100 }).scaledToFit).toBe(
      false,
    );
    // One px over → scaled.
    expect(buildExportViewport(activities, DATA_DATE, { ...opts, maxPx: 99 }).scaledToFit).toBe(
      true,
    );
  });

  it('defaults maxPx/dpr to the module constants', () => {
    const result = buildExportViewport([activity({ id: 'a' })], DATA_DATE, {
      extent: 'whole',
      liveViewport: live({ pxPerDay: 10 }),
    });
    // Small diagram, default dpr 1 → nothing to clamp, well under EXPORT_MAX_PX.
    expect(result.dpr).toBe(1);
    expect(result.size.width).toBeLessThan(EXPORT_MAX_PX);
  });
});

describe('buildExportViewport — view extent', () => {
  it('uses the passed live viewport, shifted below the reserved band', () => {
    const result = buildExportViewport([activity({ id: 'a' })], DATA_DATE, {
      extent: 'view',
      liveViewport: live({ pxPerDay: 12, originX: 5, originY: 7 }, 300, 200),
      topBand: 40,
      dpr: 1,
    });
    expect(result.size).toEqual({ width: 300, height: 240 }); // band added on top
    expect(result.viewport).toEqual({ pxPerDay: 12, originX: 5, originY: 47 });
    expect(result.scaledToFit).toBe(false);
  });

  it('falls back to the live viewport for whole when nothing is placeable', () => {
    const undated = [activity({ id: 'a', earlyStart: null, earlyFinish: null })];
    const result = buildExportViewport(undated, DATA_DATE, {
      extent: 'whole',
      liveViewport: live({ pxPerDay: 9, originX: 3, originY: 4 }, 320, 180),
      topBand: 20,
      dpr: 1,
    });
    expect(result.size).toEqual({ width: 320, height: 200 });
    expect(result.viewport).toEqual({ pxPerDay: 9, originX: 3, originY: 24 });
  });
});

describe('resolvePrintPalette', () => {
  it('is a LIGHT-forced palette (dark ink on white paper), distinct from the theme palette', () => {
    const print = resolvePrintPalette();
    const themed = resolveTsldPalette();
    // Light fallbacks: white paper, near-black ink/labels (not the dark palette's near-white ink).
    expect(print.ground).toBe('#ffffff');
    expect(print.ink).toBe('#1a1a1a');
    expect(print.labelBeside).toBe('#1a1a1a');
    expect(print.outline).toBe('#1a1a1a');
    // The theme palette's fallbacks are DARK (near-white beside-label ink) — the two must differ.
    expect(print.labelBeside).not.toBe(themed.labelBeside);
  });

  it('reads the design tokens when present (token-derived) and forces light regardless of theme', () => {
    const root = document.createElement('div');
    root.classList.add('dark');
    // Stub the token layer: `--color-background` resolves (token-derived), everything else is blank
    // (so the LIGHT fallbacks apply). Proves the palette reads the design tokens, not hard-coded hex.
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => (name === '--color-background' ? 'oklch(1 0 0)' : ''),
    } as unknown as CSSStyleDeclaration);
    try {
      const print = resolvePrintPalette(root);
      expect(print.ground).toBe('oklch(1 0 0)'); // token-derived where the token is set…
      expect(print.ink).toBe('#1a1a1a'); // …light fallback where it isn't.
      // It momentarily clears the theme class to read the light values, then restores it.
      expect(root.classList.contains('dark')).toBe(true);
    } finally {
      spy.mockRestore();
      root.remove();
    }
  });
});
