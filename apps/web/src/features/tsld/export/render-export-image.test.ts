import { describe, expect, it, vi } from 'vitest';

import type { TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';

import { renderExportImage, type RenderExportImageInput } from './render-export-image';

/**
 * jsdom has no real 2D canvas context, so the off-screen render is exercised by INJECTING a fake
 * canvas + a mocked `paint`. The assertions are the ones that matter: the shipped painter runs against
 * the OFF-SCREEN context (never the live one) with the print palette + export viewport, the raster is
 * sized `size × dpr`, and the `toBlob → toDataURL` fallback yields a non-empty PNG blob.
 */

/** A no-op 2D context proxy: any method call is a no-op, `measureText` returns a width, any property
 * assignment (fillStyle, font, globalCompositeOperation, …) succeeds. */
function fakeCtx(): CanvasRenderingContext2D {
  const proxy = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === 'measureText') return () => ({ width: 20 });
        return () => undefined;
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    },
  );
  return proxy as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(toBlobResult: Blob | null) {
  const ctx = fakeCtx();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(toBlobResult)),
    toDataURL: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, raw: canvas };
}

function input(over: Partial<RenderExportImageInput> = {}): RenderExportImageInput {
  const viewport: Viewport = { pxPerDay: 10, originX: 0, originY: 96 };
  const scene: TsldScene = { activities: [], edges: [], dataDate: '2026-01-01' };
  return {
    scene,
    viewport,
    size: { width: 200, height: 140 },
    dpr: 2,
    topBand: 96,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-07-20' },
    ...over,
  };
}

describe('renderExportImage', () => {
  it('paints the OFF-SCREEN context with the print palette + export viewport, sized size×dpr', async () => {
    const { canvas, ctx, raw } = fakeCanvas(new Blob(['png'], { type: 'image/png' }));
    const paint = vi.fn();
    const spec = input();

    const blob = await renderExportImage(spec, { createCanvas: () => canvas, paint });

    expect(paint).toHaveBeenCalledTimes(1);
    const [calledCtx, , calledView, calledSize, calledPalette, calledDpr, calledOpts] =
      paint.mock.calls[0]!;
    expect(calledCtx).toBe(ctx); // the OFF-SCREEN context, never the live canvas
    expect(calledView).toBe(spec.viewport);
    expect(calledSize).toBe(spec.size);
    expect(calledPalette).toBe(spec.palette);
    expect(calledDpr).toBe(2);
    // The wash cull floor drops to zero for the deliverable (#166): a whole-plan export frames
    // any span at any scale and paper has no zoom, so the screen's 3 px/day legibility cull was
    // deleting weekends from long programmes entirely. Verified red against the pre-#166 call.
    expect(calledOpts).toEqual({ minNonWorkingPx: 0 });
    // The backing store is allocated at size × dpr.
    expect(raw.width).toBe(400);
    expect(raw.height).toBe(280);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('falls back to toDataURL when toBlob yields null, still returning a non-empty PNG blob', async () => {
    const { canvas, raw } = fakeCanvas(null);

    const blob = await renderExportImage(input(), { createCanvas: () => canvas, paint: vi.fn() });

    expect(raw.toDataURL).toHaveBeenCalledWith('image/png');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('rejects when no 2D context is available', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    await expect(
      renderExportImage(input(), { createCanvas: () => canvas, paint: vi.fn() }),
    ).rejects.toThrow(/2D context/);
  });

  /**
   * **The printed diagram's band drops the two lines its document already carries**
   * (`docs/TECH_DEBT.md` #217).
   *
   * Asserted on the TEXT the band writes rather than on pixels, because the `fakeCtx` proxy records
   * calls and has no raster — which is the same reason the export unit suites cannot see a face or
   * a colour. What they CAN see is whether the plan's name was written into the picture at all,
   * and that is exactly the fact this decision turns on.
   *
   * **Verified red before the branch existed**: `'legend-only'` wrote `North Tower` like `'full'`.
   */
  it('writes the plan name into the band for a standalone export and not for a printed one', async () => {
    // **Awaited, not fire-and-forget.** The first version called `void renderExportImage(…)` and
    // read the recorded text immediately; that passes only because jsdom has no `document.fonts`,
    // so the `await document.fonts.ready` inside the renderer resolves in the same tick. On a real
    // browser it would read an empty list and assert nothing. Caught by `require-await`.
    const texts = async (mode: 'full' | 'legend-only'): Promise<string[]> => {
      const written: string[] = [];
      const ctx = fakeCtx();
      // `fillText` is the only method we need to observe; the proxy returns a no-op for the rest.
      Object.defineProperty(ctx, 'fillText', {
        value: (text: string) => written.push(text),
        writable: true,
      });
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
      } as unknown as HTMLCanvasElement;
      await renderExportImage(input({ bandContent: mode }), {
        createCanvas: () => canvas,
        paint: vi.fn(),
      });
      return written;
    };

    expect((await texts('full')).join(' '), 'a standalone PNG must name itself').toContain(
      'North Tower',
    );
    expect(
      (await texts('legend-only')).join(' '),
      'the printed diagram sits inside a document that already names the plan',
    ).not.toContain('North Tower');
  });
});
