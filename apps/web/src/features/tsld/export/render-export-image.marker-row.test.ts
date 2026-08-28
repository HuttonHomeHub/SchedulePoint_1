import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, type TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';

import { EXPORT_MARKER_ROW } from './export-image';
import { renderExportImage, type RenderExportImageInput } from './render-export-image';

/**
 * The export **axis-marker row** (fix-slice M-F, `#175`): the exported picture names its data-date
 * and Today rules in the reserved strip under the title band, from THE SAME `axisMarkers` model
 * the screen's ruler renders from — so culling, coincidence, clamping and the collision rule
 * cannot drift between the screen and the deliverable (the ADR-0065 one-implementation argument).
 *
 * The oracle for "this text is a marker chip and not a legend entry" is its y: the legend draws
 * inside the title band (y < topBand) and a chip inside the marker row (y > topBand) — asserted
 * that way because the legend ALSO says `Data date` and `Today` (deliberately: the product owner
 * kept both), so label text alone cannot tell the two rows apart.
 */

const TOP_BAND = 96;

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

function input(scene: Partial<TsldScene>): RenderExportImageInput {
  // originX 100 puts day 0 (the data date) at screen x 100 — comfortably on the 1200px surface.
  const viewport: Viewport = { pxPerDay: 10, originX: 100, originY: TOP_BAND + EXPORT_MARKER_ROW };
  return {
    scene: { activities: [], edges: [], dataDate: '2026-01-01', ...scene },
    viewport,
    size: { width: 1200, height: 400 },
    dpr: 1,
    topBand: TOP_BAND,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-08-28' },
  };
}

/** The fillText calls that landed INSIDE the marker row (below the title band). */
function rowTexts(calls: Array<[string, unknown[]]>): Array<{ label: string; x: number }> {
  return calls
    .filter(([name, args]) => name === 'fillText' && (args[2] as number) > TOP_BAND)
    .map(([, args]) => ({ label: args[0] as string, x: args[1] as number }));
}

async function render(scene: Partial<TsldScene>) {
  const { canvas, calls } = fakeCanvas();
  await renderExportImage(input(scene), { createCanvas: () => canvas, paint: vi.fn() });
  return calls;
}

describe('renderExportImage — the axis-marker row', () => {
  it('places both chips at the model positions (labels at the rules they name)', async () => {
    const calls = await render({
      dataDateLine: true,
      todayOffset: 30, // 300px right of the data date — far past any collision
      view: { ...DEFAULT_VIEW_TOGGLES, today: true },
    });
    const texts = rowTexts(calls);
    expect(texts.map((t) => t.label)).toEqual(['Data date', 'Today']);
    // Chip width = measured 20 + 2×4 padding = 28; centred on the rule (x=100.5 → left 86.5),
    // text inset by the 4px padding.
    expect(texts[0]?.x).toBeCloseTo(100.5 - 14 + 4, 5);
    expect(texts[1]?.x).toBeCloseTo(400.5 - 14 + 4, 5);
    // The chips themselves: two 28×14 fills inside the row (the row's own ground fill is
    // full-width and excluded by the width test).
    const chips = calls.filter(
      ([name, args]) =>
        name === 'fillRect' && (args[1] as number) > TOP_BAND && (args[2] as number) === 28,
    );
    expect(chips).toHaveLength(2);
  });

  it('merges the coincident case into ONE chip reading the merged label', async () => {
    const calls = await render({
      dataDateLine: true,
      todayOffset: 0,
      todayFraction: 0,
      view: { ...DEFAULT_VIEW_TOGGLES, today: true },
    });
    expect(rowTexts(calls).map((t) => t.label)).toEqual(['Data date · today']);
  });

  it('keeps Data date and withholds Today when the two chips would collide', async () => {
    const calls = await render({
      dataDateLine: true,
      todayOffset: 2, // 20px apart; 28px chips overlap → Data date wins, never the reverse
      view: { ...DEFAULT_VIEW_TOGGLES, today: true },
    });
    expect(rowTexts(calls).map((t) => t.label)).toEqual(['Data date']);
  });

  it('draws nothing in the row when both marks are off (the parity case)', async () => {
    const calls = await render({
      dataDateLine: false,
      todayOffset: 30,
      view: { ...DEFAULT_VIEW_TOGGLES, today: false },
    });
    expect(rowTexts(calls)).toEqual([]);
    // No chip-sized fill either — the strip stays paper.
    const chips = calls.filter(
      ([name, args]) =>
        name === 'fillRect' && (args[1] as number) > TOP_BAND && (args[2] as number) === 28,
    );
    expect(chips).toEqual([]);
  });
});
