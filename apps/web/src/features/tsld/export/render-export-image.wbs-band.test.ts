import { describe, expect, it, vi } from 'vitest';

import type { TsldScene, WbsBandPalette } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';
import type { WbsBandBar } from '../render/wbs-band';

import { EXPORT_MARKER_ROW } from './export-image';
import { renderExportImage, type RenderExportImageInput } from './render-export-image';

/**
 * The **WBS band in the exported picture** (ADR-0063 §M5).
 *
 * The band is the one part of the diagram that does not live on the diagram's own canvas, so it is
 * the one part an export can silently omit — and the omission looks like a working export: a
 * complete-looking programme with its phases missing, printed and handed to a client.
 *
 * jsdom has no 2D context, so the surface is a **recording** proxy. The assertions are about the
 * two things that can only go wrong here: the band is drawn at the reserved offset (not at the top,
 * over the title), and the path with no band touches the surface exactly as it did before.
 */
type Call = { method: string; args: unknown[] };

function recordingCanvas() {
  const calls: Call[] = [];
  const ctx = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === 'measureText') {
          return (t: string) => {
            calls.push({ method: 'measureText', args: [t] });
            return { width: t.length * 6 };
          };
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return undefined;
        };
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

const BAND_PALETTE: WbsBandPalette = {
  bar: '#3b6fbf',
  derived: '#7a8090',
  rule: '#2a2f3a',
  label: '#111111',
  derivedLabel: '#ffffff',
  selection: '#8ab4f8',
};

const BARS: WbsBandBar[] = [
  { id: 's1', label: 'Substructure', depth: 0, x: 10, w: 120, y: 4, h: 16 },
  { id: null, label: 'Unassigned', depth: 0, x: 140, w: 60, y: 4, h: 16 },
];

const TOP_BAND = 96;
const BAND_HEIGHT = 24;
const DPR = 2;

function input(over: Partial<RenderExportImageInput> = {}): RenderExportImageInput {
  const viewport: Viewport = { pxPerDay: 10, originX: 0, originY: TOP_BAND + BAND_HEIGHT };
  const scene: TsldScene = { activities: [], edges: [], dataDate: '2026-01-01' };
  return {
    scene,
    viewport,
    size: { width: 400, height: 300 },
    dpr: DPR,
    topBand: TOP_BAND,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-07-30' },
    ...over,
  };
}

/** The vertical translate of each `setTransform`, in CSS px (the `f` component ÷ dpr). */
const translatesY = (calls: Call[]): number[] =>
  calls.filter((c) => c.method === 'setTransform').map((c) => Number(c.args[5] ?? 0) / DPR);

describe('renderExportImage — the WBS band', () => {
  it('draws the band at the reserved offset, below the title strip', async () => {
    const { canvas, calls } = recordingCanvas();
    await renderExportImage(
      input({ wbsBand: { height: BAND_HEIGHT, bars: BARS, palette: BAND_PALETTE } }),
      { createCanvas: () => canvas, paint: vi.fn() },
    );

    // Drawn below the title strip AND the axis-marker row (fix-slice M-F) — not at 0, which
    // would put the phases over the plan's name, and not at the bare `topBand`, which would put
    // them over the date marks the row exists to carry.
    expect(translatesY(calls)).toContain(TOP_BAND + EXPORT_MARKER_ROW);
    // …and its strip is the band's height, not the whole surface.
    expect(calls).toContainEqual({ method: 'clearRect', args: [0, 0, 400, BAND_HEIGHT] });
  });

  /**
   * The ordering constraint that is invisible until it is wrong: `paintWbsBand` clears its own
   * strip (on the live path it owns a canvas), so it has to run BEFORE the paper ground is
   * composited under everything. Run after, it would punch a transparent hole through the paper —
   * a PNG with a band-shaped window onto whatever is behind it.
   */
  it('clears its strip before the paper ground is laid, not after', async () => {
    const { canvas, calls } = recordingCanvas();
    await renderExportImage(
      input({ wbsBand: { height: BAND_HEIGHT, bars: BARS, palette: BAND_PALETTE } }),
      { createCanvas: () => canvas, paint: vi.fn() },
    );

    const clearedAt = calls.findIndex((c) => c.method === 'clearRect' && c.args[3] === BAND_HEIGHT);
    const groundAt = calls.findIndex(
      (c) => c.method === 'fillRect' && c.args[2] === 400 && c.args[3] === 300,
    );
    expect(clearedAt).toBeGreaterThanOrEqual(0);
    expect(groundAt).toBeGreaterThanOrEqual(0);
    expect(clearedAt).toBeLessThan(groundAt);
  });

  it('restores the page frame afterwards, so the title band is not drawn inside the WBS strip', async () => {
    const { canvas, calls } = recordingCanvas();
    await renderExportImage(
      input({ wbsBand: { height: BAND_HEIGHT, bars: BARS, palette: BAND_PALETTE } }),
      { createCanvas: () => canvas, paint: vi.fn() },
    );
    // The LAST transform set is the page's own — everything drawn after the band authors in page
    // coordinates.
    expect(translatesY(calls).at(-1)).toBe(0);
  });

  // The parity path. No band declared ⇒ the surface is touched exactly as it was before M5: no
  // offset transform anywhere, so a rollback of the band cannot shift the exported diagram.
  it('touches nothing extra when there is no band', async () => {
    const { canvas, calls } = recordingCanvas();
    await renderExportImage(input(), { createCanvas: () => canvas, paint: vi.fn() });
    expect(translatesY(calls).every((y) => y === 0)).toBe(true);
    expect(calls.some((c) => c.method === 'clearRect')).toBe(false);
  });

  // A band that is on but empty (every group uncalculated) reserves nothing, so there is nothing to
  // draw and nothing to offset — the same path as no band at all.
  it('skips a zero-height band', async () => {
    const { canvas, calls } = recordingCanvas();
    await renderExportImage(input({ wbsBand: { height: 0, bars: [], palette: BAND_PALETTE } }), {
      createCanvas: () => canvas,
      paint: vi.fn(),
    });
    expect(translatesY(calls).every((y) => y === 0)).toBe(true);
  });
});
