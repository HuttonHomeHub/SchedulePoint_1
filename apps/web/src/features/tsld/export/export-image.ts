import { dayExtent } from '../render/paint';
import { LANE_HEIGHT, type RenderActivity, type Size, type Viewport } from '../render/render-model';

/**
 * The pure, DOM-free **export-viewport geometry** for the TSLD Diagram-PNG deliverable (spec
 * `docs/specs/export-print/` §Milestone 2, behind `VITE_EXPORT_PRINT`). Like `render/render-model.ts`
 * it owns only geometry — no canvas, React or data-fetching — so it is exhaustively unit-tested. It
 * frames an **off-screen** canvas the shipped `paintScene` then draws into (`render-export-image.ts`),
 * so the live-draw budget (ADR-0026) is untouched.
 *
 * Two extents (CQ-1, product sign-off 2026-07-20): **`whole`** re-frames the FULL activity extent at
 * the live zoom's `pxPerDay` (reusing the `dayExtent` / lane math the painter uses, so the
 * inclusive-finish edge convention can't drift, ADR-0023); **`view`** crops to the live viewport's
 * current bounds. Both reserve a fixed top band for the title + legend, and both clamp the raster to a
 * hard `EXPORT_MAX_PX` per side and a `EXPORT_DPR_CAP` device-pixel-ratio, scaling the backing-store
 * resolution **down to fit** (a uniform down-scale) and reporting `scaledToFit` so the title band can
 * note it — a browser silently yields a blank image past its canvas cap, so the cap prevents it.
 */

/** Which region of the diagram the image covers (CQ-1). */
export type ExportExtent = 'whole' | 'view';

/** Hard maximum raster dimension (px per side). Browsers cap total canvas area; past the per-side
 * limit `toBlob` yields a blank image, so we never allocate an over-cap canvas — we scale to fit. */
export const EXPORT_MAX_PX = 8192;

/** Device-pixel-ratio ceiling for the export raster — 2× for crispness, matching the live-canvas DPR
 * convention (`TsldCanvas` `getDpr`), without exploding the raster on a 3×+ display. */
export const EXPORT_DPR_CAP = 2;

/** Padding (CSS px) left around the diagram content in the `whole` extent, so bars aren't flush to the
 * raster edge (mirrors the live `fitToContent` padding). */
export const EXPORT_PADDING = 32;

/** Reserved top band (CSS px) for the title + generated-at line + legend, so they never overlap the
 * diagram. `render-export-image.ts` draws into it and the export viewport offsets the diagram below it. */
export const EXPORT_TOP_BAND = 96;

/** The live canvas viewport transform + measured surface size, read (never mutated) from the canvas
 * control handle. The `whole` extent reuses only its `pxPerDay`; the `view` extent reuses all of it. */
export interface LiveViewport {
  view: Viewport;
  size: Size;
}

export interface BuildExportViewportOptions {
  extent: ExportExtent;
  /** The live viewport + size, read from the canvas handle. Required for `view`; `whole` uses its zoom. */
  liveViewport: LiveViewport;
  /** Hard per-side raster cap (defaults to {@link EXPORT_MAX_PX}). */
  maxPx?: number;
  /** Requested device-pixel-ratio (capped to {@link EXPORT_DPR_CAP}; defaults to 1). */
  dpr?: number;
  /** Content padding for the `whole` extent (defaults to {@link EXPORT_PADDING}). */
  padding?: number;
  /** Reserved title/legend band height (defaults to {@link EXPORT_TOP_BAND}). */
  topBand?: number;
}

export interface ExportViewport {
  /** The world→screen transform `paintScene` draws the diagram with (already offset below the band). */
  viewport: Viewport;
  /** The off-screen surface size in **CSS px** (logical drawing coordinates), including the band. */
  size: Size;
  /** The backing-store scale the canvas is allocated at (`canvas.width = round(size.width * dpr)`).
   * ≤ {@link EXPORT_DPR_CAP}; **< 1** when the raster was scaled to fit the cap. */
  dpr: number;
  /** True when the natural raster exceeded the cap and the resolution was scaled down to fit. */
  scaledToFit: boolean;
}

/**
 * Compute the off-screen export viewport + size for the requested {@link ExportExtent}.
 *
 * - `whole`: bounds cover the full computed activity extent at the live `pxPerDay` (via the shipped
 *   {@link dayExtent}, so the inclusive-finish right edge matches the live canvas), padded, with the
 *   title band reserved above. Falls back to the `view` framing when nothing is placeable yet.
 * - `view`: the live viewport + size, shifted down by the reserved band so the crop is preserved.
 *
 * The raster (`size * dpr`) is then clamped to `maxPx` per side and `dpr` to {@link EXPORT_DPR_CAP};
 * exceeding the cap scales the backing-store resolution down uniformly (`scaledToFit`).
 */
export function buildExportViewport(
  activities: readonly RenderActivity[],
  dataDate: string,
  options: BuildExportViewportOptions,
): ExportViewport {
  const maxPx = options.maxPx ?? EXPORT_MAX_PX;
  const padding = options.padding ?? EXPORT_PADDING;
  const topBand = options.topBand ?? EXPORT_TOP_BAND;
  const { view: liveView, size: liveSize } = options.liveViewport;

  let viewport: Viewport;
  let size: Size;

  const extent = options.extent === 'whole' ? dayExtent(activities, dataDate) : null;
  if (extent) {
    // WHOLE: frame the full day span (inclusive finish already +1 in `dayExtent`) at the live zoom,
    // and the full lane stack, padded, with the diagram pushed below the reserved band.
    const pxPerDay = liveView.pxPerDay;
    let maxLane = 0;
    for (const a of activities) {
      if (a.earlyStart === null) continue;
      if (a.laneIndex > maxLane) maxLane = a.laneIndex;
    }
    const contentW = (extent.maxDay - extent.minDay) * pxPerDay;
    const contentH = (maxLane + 1) * LANE_HEIGHT;
    size = { width: contentW + padding * 2, height: topBand + contentH + padding * 2 };
    viewport = {
      pxPerDay,
      originX: padding - extent.minDay * pxPerDay,
      originY: topBand + padding,
    };
  } else {
    // VIEW (and the degenerate WHOLE-with-nothing-placeable case): crop to the live viewport, with the
    // band reserved above it (the diagram shifts down by `topBand`, preserving the live framing).
    size = {
      width: Math.max(1, liveSize.width),
      height: topBand + Math.max(1, liveSize.height),
    };
    viewport = {
      pxPerDay: liveView.pxPerDay,
      originX: liveView.originX,
      originY: liveView.originY + topBand,
    };
  }

  // Clamp: cap the device-pixel-ratio, then scale the raster down to fit `maxPx` on the larger axis.
  // Reducing `dpr` (never the CSS `size`/`viewport`) shrinks the backing store uniformly, so the whole
  // diagram still fits — just at a lower resolution — which is exactly "scaled to fit".
  let dpr = Math.min(options.dpr ?? 1, EXPORT_DPR_CAP);
  const over = Math.max(size.width * dpr, size.height * dpr) / maxPx;
  let scaledToFit = false;
  if (over > 1) {
    dpr = dpr / over;
    scaledToFit = true;
  }

  return { viewport, size, dpr, scaledToFit };
}
