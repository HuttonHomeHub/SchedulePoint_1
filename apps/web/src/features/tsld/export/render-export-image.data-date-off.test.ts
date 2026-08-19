import { describe, expect, it, vi } from 'vitest';

/**
 * The **rollback contract** for the export legend's data-date entry (canvas status & feedback
 * M1): with `VITE_CANVAS_DATA_DATE` off, `EXPORT_LEGEND` is byte-for-byte the prior six-entry
 * row. Forced OFF explicitly so the pin survives the epic's M6 default flip (the ADR-0053 M6
 * rule).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DATA_DATE_ENABLED: false,
}));

import type { TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';

import { renderExportImage, type RenderExportImageInput } from './render-export-image';

function recordingCtx(): { ctx: CanvasRenderingContext2D; labels: unknown[] } {
  const labels: unknown[] = [];
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      if (prop === 'measureText') return () => ({ width: 20 });
      if (prop === 'fillText')
        return (...args: unknown[]) => {
          labels.push(args[0]);
        };
      return () => undefined;
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, labels };
}

describe('renderExportImage — VITE_CANVAS_DATA_DATE off (parity)', () => {
  it('draws no Data date legend entry', async () => {
    const { ctx, labels } = recordingCtx();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' }))),
      toDataURL: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
    } as unknown as HTMLCanvasElement;

    const viewport: Viewport = { pxPerDay: 10, originX: 0, originY: 96 };
    const scene: TsldScene = { activities: [], edges: [], dataDate: '2026-01-01' };
    const spec: RenderExportImageInput = {
      scene,
      viewport,
      size: { width: 1200, height: 400 },
      dpr: 1,
      topBand: 96,
      palette: resolvePrintPalette(document.documentElement),
      scaledToFit: false,
      meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-08-07' },
    };
    await renderExportImage(spec, { createCanvas: () => canvas, paint: vi.fn() });

    expect(labels).not.toContain('Data date');
    expect(labels).toContain('Today');
  });
});
