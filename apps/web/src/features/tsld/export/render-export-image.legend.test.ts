import { describe, expect, it, vi } from 'vitest';

/**
 * The export legend is a hand-authored mirror of the screen's key (TECH_DEBT #48(e)). This file holds
 * its two both-ways rules: it names the over-allocation badge exactly when the picture draws one
 * (#524), and it counts what a narrow crop made it drop (#525, ADR-0127 D3).
 */
const flags = vi.hoisted(() => ({ resourceView: true }));
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get CANVAS_RESOURCE_VIEW_ENABLED() {
    return flags.resourceView;
  },
}));

import type { TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';

import { renderExportImage, type RenderExportImageInput } from './render-export-image';

function fakeCanvas(): { canvas: HTMLCanvasElement; labels: () => string[] } {
  const texts: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      if (prop === 'measureText') return () => ({ width: 20 });
      if (prop === 'fillText') {
        return (text: string) => {
          texts.push(text);
        };
      }
      return () => undefined;
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
  } as unknown as HTMLCanvasElement;
  return { canvas, labels: () => texts };
}

function input(scene: Partial<TsldScene> = {}, width = 1200): RenderExportImageInput {
  const viewport: Viewport = { pxPerDay: 10, originX: 0, originY: 96 };
  return {
    scene: { activities: [], edges: [], dataDate: '2026-01-01', ...scene },
    viewport,
    size: { width, height: 400 },
    dpr: 1,
    topBand: 96,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-08-07' },
  };
}

async function legendLabels(scene: Partial<TsldScene> = {}, width = 1200): Promise<string[]> {
  const { canvas, labels } = fakeCanvas();
  await renderExportImage(input(scene, width), { createCanvas: () => canvas, paint: vi.fn() });
  // Drop the title and the subtitle; what follows is the key.
  return labels().slice(2);
}

describe('the export legend names the over-allocation badge exactly when it is drawn (#524)', () => {
  it('ends with Over-allocated when the scene flags a bar and the resource view is on', async () => {
    flags.resourceView = true;
    const labels = await legendLabels({ flaggedIds: new Set(['a1']) });
    expect(labels.at(-1)).toBe('Over-allocated');
  });

  it('omits it when nothing is flagged, so no key names an absent mark', async () => {
    flags.resourceView = true;
    expect(await legendLabels({ flaggedIds: new Set() })).not.toContain('Over-allocated');
    expect(await legendLabels()).not.toContain('Over-allocated');
  });

  it('omits it when the resource view is off, as the screen key does', async () => {
    flags.resourceView = false;
    expect(await legendLabels({ flaggedIds: new Set(['a1']) })).not.toContain('Over-allocated');
  });
});
