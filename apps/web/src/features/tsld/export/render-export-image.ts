import { paintScene, type TsldScene } from '../render/paint';
import type { PrintPalette } from '../render/palette';
import type { Size, Viewport } from '../render/render-model';

/**
 * The thin, off-screen **Diagram-PNG renderer** for the TSLD export deliverables (spec
 * `docs/specs/export-print/` §Milestone 2, behind `VITE_EXPORT_PRINT`). It creates its **own** canvas
 * (`document.createElement('canvas')`, matching how the live `TsldCanvas` allocates its surface), runs
 * the shipped `paintScene` against it with the light print palette + the pure {@link buildExportViewport}
 * geometry, composites a white paper ground behind the diagram, draws the title band + legend into the
 * reserved top band, and returns a PNG `Blob`. It is the ONLY export module that touches a canvas
 * element — and it never touches the LIVE canvas, so the ADR-0026 live-draw budget is untouched.
 *
 * Testability: `paint` and `createCanvas` are injectable so the off-screen render can be asserted
 * without a real 2D context (jsdom has none) — a test mocks `paint` and a fake canvas and checks
 * `paint` ran against the OFF-SCREEN context with the print palette + export viewport, and that the
 * `toBlob` → `toDataURL` fallback path is exercised.
 */

/** Title-band typography (fixed, no domain string logic). */
const TITLE_FONT = "600 16px system-ui, -apple-system, 'Segoe UI', sans-serif";
const SUBTITLE_FONT = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";
const LEGEND_FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Left inset (CSS px) of the band content. */
const BAND_PAD = 16;
/** Legend swatch box size (CSS px). */
const SWATCH_W = 18;
const SWATCH_H = 11;
/** Gap between a legend swatch and its label, and between one legend entry and the next. */
const LEGEND_LABEL_GAP = 6;
const LEGEND_ENTRY_GAP = 18;

/** The self-describing metadata drawn into the title band. */
export interface ExportImageMeta {
  /** The plan's name (title line). */
  planName: string;
  /** The plan's data date (`YYYY-MM-DD`), shown as the "as of" reference. */
  dataDate: string;
  /** The generated-at day (`YYYY-MM-DD`), shown in the subtitle. */
  generatedAtIso: string;
}

export interface RenderExportImageInput {
  scene: TsldScene;
  viewport: Viewport;
  /** The off-screen surface size in CSS px (from {@link buildExportViewport}). */
  size: Size;
  /** The backing-store scale the canvas is allocated at (may be < 1 when scaled to fit). */
  dpr: number;
  /** The reserved title/legend band height (CSS px), matching the export viewport's band offset. */
  topBand: number;
  palette: PrintPalette;
  /** Whether the raster was scaled to fit the cap — the band notes it. */
  scaledToFit: boolean;
  meta: ExportImageMeta;
}

/** Injectable seams so the off-screen render is testable without a real 2D context. */
export interface RenderExportImageDeps {
  createCanvas?: () => HTMLCanvasElement;
  paint?: typeof paintScene;
}

/** One legend entry, matching the canvas cues (palette-derived, so colours track the drawn bars). */
type LegendEntry = {
  label: string;
  kind: 'fill' | 'outlineSolid' | 'outlineDashed' | 'lineSolid' | 'lineDashed' | 'today';
  colour: (palette: PrintPalette) => string;
};

/** The compact export legend — the criticality key + the link/today cues, mirroring `TsldLegend`. */
const EXPORT_LEGEND: readonly LegendEntry[] = [
  { label: 'Critical', kind: 'outlineSolid', colour: (p) => p.critical },
  { label: 'Near-critical', kind: 'outlineDashed', colour: (p) => p.nearCritical },
  { label: 'On schedule', kind: 'fill', colour: (p) => p.bar },
  { label: 'Driving link', kind: 'lineSolid', colour: (p) => p.edge },
  { label: 'Non-driving link', kind: 'lineDashed', colour: (p) => p.edge },
  { label: 'Today', kind: 'today', colour: (p) => p.today },
];

/**
 * Render the diagram to an off-screen PNG and resolve its {@link Blob}. Paints OFF-SCREEN ONLY.
 * @throws if a 2D context cannot be obtained (surfaced as a user-safe error by the caller).
 */
export async function renderExportImage(
  input: RenderExportImageInput,
  deps: RenderExportImageDeps = {},
): Promise<Blob> {
  const { scene, viewport, size, dpr, topBand, palette, scaledToFit, meta } = input;
  const createCanvas = deps.createCanvas ?? (() => document.createElement('canvas'));
  const paint = deps.paint ?? paintScene;

  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.round(size.width * dpr));
  canvas.height = Math.max(1, Math.round(size.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context for the diagram export.');

  // Paint the diagram with the light print palette. `paintScene` sets the dpr transform and authors in
  // CSS px, so every draw below stays in CSS px too. It clears to transparent, so the white ground is
  // laid BEHIND everything afterwards (`destination-over`).
  paint(ctx, scene, viewport, size, palette, dpr);

  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.globalCompositeOperation = 'source-over';

  drawTitleBand(ctx, size, topBand, palette, scaledToFit, meta);

  return canvasToPngBlob(canvas);
}

/** Draw the reserved title band: an opaque paper strip (covering any grid/bars painted under it), a
 * separator, the plan name, an "as of / generated" subtitle (noting "scaled to fit" when clamped), and
 * the legend. Pure canvas drawing in CSS px; the caller has set the dpr transform. */
function drawTitleBand(
  ctx: CanvasRenderingContext2D,
  size: Size,
  topBand: number,
  palette: PrintPalette,
  scaledToFit: boolean,
  meta: ExportImageMeta,
): void {
  // Opaque band ground over the reserved region (covers any diagram drawn beneath it).
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, size.width, topBand);
  // Separator under the band.
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, topBand + 0.5);
  ctx.lineTo(size.width, topBand + 0.5);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Title.
  ctx.fillStyle = palette.ink;
  ctx.font = TITLE_FONT;
  ctx.fillText(meta.planName, BAND_PAD, 28);
  // Subtitle (data date · generated · scaled-to-fit note).
  ctx.fillStyle = palette.mutedInk;
  ctx.font = SUBTITLE_FONT;
  const subtitle =
    `As of ${meta.dataDate} · Generated ${meta.generatedAtIso}` +
    (scaledToFit ? ' · scaled to fit' : '');
  ctx.fillText(subtitle, BAND_PAD, 48);

  drawLegend(ctx, palette, size.width);
}

/** Draw the compact legend row inside the band. Uses `measureText` when available, falling back to a
 * character estimate so it stays robust in a context that doesn't measure (the test's fake ctx). */
function drawLegend(ctx: CanvasRenderingContext2D, palette: PrintPalette, maxWidth: number): void {
  const y = 68;
  const swatchTop = y + 3;
  ctx.font = LEGEND_FONT;
  ctx.textBaseline = 'alphabetic';
  let x = BAND_PAD;
  for (const entry of EXPORT_LEGEND) {
    const colour = entry.colour(palette);
    if (entry.kind === 'fill') {
      ctx.fillStyle = colour;
      ctx.fillRect(x, swatchTop, SWATCH_W, SWATCH_H);
    } else if (entry.kind === 'outlineSolid' || entry.kind === 'outlineDashed') {
      ctx.fillStyle = colour;
      ctx.fillRect(x, swatchTop, SWATCH_W, SWATCH_H);
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(entry.kind === 'outlineDashed' ? [3, 2] : []);
      ctx.strokeRect(x + 0.75, swatchTop + 0.75, SWATCH_W - 1.5, SWATCH_H - 1.5);
      ctx.setLineDash([]);
    } else if (entry.kind === 'lineSolid' || entry.kind === 'lineDashed') {
      ctx.strokeStyle = colour;
      ctx.lineWidth = entry.kind === 'lineSolid' ? 2 : 1.5;
      ctx.setLineDash(entry.kind === 'lineDashed' ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x, swatchTop + SWATCH_H / 2);
      ctx.lineTo(x + SWATCH_W, swatchTop + SWATCH_H / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // today: a dashed vertical, matching the canvas today marker.
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(x + SWATCH_W / 2, swatchTop);
      ctx.lineTo(x + SWATCH_W / 2, swatchTop + SWATCH_H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const labelX = x + SWATCH_W + LEGEND_LABEL_GAP;
    ctx.fillStyle = palette.mutedInk;
    ctx.fillText(entry.label, labelX, y + SWATCH_H);
    const measured = ctx.measureText(entry.label) as TextMetrics | undefined;
    const labelWidth = (measured && measured.width) || entry.label.length * 6.5;
    const nextX = labelX + labelWidth + LEGEND_ENTRY_GAP;
    // Stop cleanly if the row would overflow the raster (rare — a very narrow view crop).
    if (nextX > maxWidth) break;
    x = nextX;
  }
}

/** Resolve a canvas to a PNG {@link Blob}: prefer `toBlob`, fall back to `toDataURL` when it yields
 * null (or is unsupported), and reject only when neither can produce an image. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const fromDataUrl = (): void => {
      try {
        resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not encode the diagram image.'));
      }
    };
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else fromDataUrl();
      }, 'image/png');
    } catch {
      // `toBlob` unsupported / threw — try the data-URL path.
      fromDataUrl();
    }
  });
}

/** Decode a `data:` URL to a {@link Blob} without `fetch` (works in jsdom), for the `toBlob` fallback. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
