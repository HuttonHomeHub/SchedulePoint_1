import { describe, expect, it, vi } from 'vitest';

/**
 * Canvas status & feedback M1: `EXPORT_LEGEND` is a HAND-AUTHORED mirror of the DOM legend
 * (TECH_DEBT #48(e)), so the data-date entry must land in the same change as the canvas mark or
 * the exported picture silently drifts from the screen's key. With `VITE_CANVAS_DATA_DATE` forced
 * ON, the export's title band draws a `Data date` legend entry as a SOLID vertical (lineWidth 2,
 * no dash) — the same channel the canvas uses. The flag-off absence is pinned by
 * `render-export-image.data-date-off.test.ts` (the rollback contract).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DATA_DATE_ENABLED: true,
}));

import type { TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';

import { renderExportImage, type RenderExportImageInput } from './render-export-image';

/** A recording 2D-context proxy: method calls are logged (name + args), properties assign. */
function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      if (prop === 'measureText') return () => ({ width: 20 });
      return (...args: unknown[]) => {
        calls.push([String(prop), args]);
        return undefined;
      };
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

function fakeCanvas() {
  const { ctx, calls } = recordingCtx();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' }))),
    toDataURL: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

function input(): RenderExportImageInput {
  const viewport: Viewport = { pxPerDay: 10, originX: 0, originY: 96 };
  const scene: TsldScene = { activities: [], edges: [], dataDate: '2026-01-01' };
  return {
    scene,
    viewport,
    size: { width: 1200, height: 400 },
    dpr: 1,
    topBand: 96,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-08-07' },
  };
}

describe('renderExportImage — the data-date legend entry (flag on)', () => {
  it('draws the Data date entry, before Today, as a solid vertical', async () => {
    const { canvas, calls } = fakeCanvas();
    await renderExportImage(input(), { createCanvas: () => canvas, paint: vi.fn() });

    const labels = calls.filter(([name]) => name === 'fillText').map(([, args]) => args[0]);
    expect(labels).toContain('Data date');
    expect(labels.indexOf('Data date')).toBeLessThan(labels.indexOf('Today'));

    // The swatch strokes solid at lineWidth 2: between the Data date swatch's beginPath and its
    // stroke there is no setLineDash([3,2]) — that dash belongs to the Today entry alone.
    const dashCalls = calls.filter(([name]) => name === 'setLineDash').map(([, args]) => args[0]);
    expect(dashCalls).toContainEqual([3, 2]); // Today still dashes…
    // …and the entry count grew by exactly the one new label.
    expect(labels).toEqual([
      'North Tower',
      expect.stringContaining('As of'),
      'Critical',
      'Near-critical',
      'On schedule',
      'Driving link',
      'Non-driving link',
      'Data date',
      'Today',
    ]);
  });
});
