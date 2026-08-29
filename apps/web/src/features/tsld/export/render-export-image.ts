import { axisMarkers } from '../render/axis-markers';
import {
  DEFAULT_VIEW_TOGGLES,
  paintScene,
  paintWbsBand,
  type TsldScene,
  type WbsBandPalette,
} from '../render/paint';
import type { PrintPalette } from '../render/palette';
// Through the barrel this file already imports from, never `./geometry` directly (M1-T3 step 3):
// `render-model` re-exports the whole leaf, so the direct import bought nothing and added a second
// edge into it. Shipped as a direct import and reconciled at the gate pass, where the component
// review noticed the code did not follow its own stated rationale.
import { FONT_STACK, type Size, type Viewport } from '../render/render-model';
import type { WbsBandBar } from '../render/wbs-band';

import { EXPORT_MARKER_ROW } from './export-image';

import { CANVAS_DATA_DATE_ENABLED } from '@/config/env';

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
/**
 * **The band's four fonts compose `FONT_STACK`** — the product's face, the same one the diagram
 * inside this picture is drawn in.
 *
 * They were `system-ui, -apple-system, 'Segoe UI', sans-serif` and received none of the 2026-08-24
 * typeface decision, so an exported PNG had its diagram in IBM Plex Sans and the band around it in
 * whatever the reader's machine resolved. Measured: at 16 px the two faces differ by **66 px** on
 * this fixture's plan name, so the band was also laying out ~19 % wider than it should.
 *
 * `document.fonts.ready` is already awaited before any of these draw (`:136`), so there is no load
 * race to solve here — that was checked rather than assumed.
 */
const TITLE_FONT = `600 16px ${FONT_STACK}`;
const SUBTITLE_FONT = `12px ${FONT_STACK}`;
const LEGEND_FONT = `11px ${FONT_STACK}`;

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
  /** The reserved axis-marker row height (CSS px) under the title band, matching what
   * `buildExportViewport` reserved. Defaults to {@link EXPORT_MARKER_ROW} — one constant, imported
   * at both seams, so the geometry and the drawing cannot disagree about the row's height. */
  markerRow?: number;
  palette: PrintPalette;
  /** Whether the raster was scaled to fit the cap — the band notes it. */
  scaledToFit: boolean;
  meta: ExportImageMeta;
  /**
   * The **WBS band** (ADR-0063), when it is on. Placed directly under the title strip and above the
   * diagram, in the height `buildExportViewport` reserved for it — so a planner who turned the band
   * on gets the picture they were looking at, phases and all. Absent (the default) is the byte-for-
   * byte prior export.
   *
   * `bars` are already placed against the export viewport by `wbsBandBars`, which is the same
   * function the live canvas calls with the live one. Nothing about *where* a phase sits is
   * re-derived here.
   */
  wbsBand?: { height: number; bars: readonly WbsBandBar[]; palette: WbsBandPalette };
}

/** Injectable seams so the off-screen render is testable without a real 2D context. */
export interface RenderExportImageDeps {
  createCanvas?: () => HTMLCanvasElement;
  paint?: typeof paintScene;
}

/** One legend entry, matching the canvas cues (palette-derived, so colours track the drawn bars). */
type LegendEntry = {
  label: string;
  kind:
    'fill' | 'outlineSolid' | 'outlineDashed' | 'lineSolid' | 'lineDashed' | 'today' | 'dataDate';
  colour: (palette: PrintPalette) => string;
};

/** The compact export legend — the criticality key + the link/status cues, mirroring `TsldLegend`.
 * This list is a HAND-AUTHORED mirror of the DOM legend (TECH_DEBT #48(e)): a mark added to the
 * canvas must gain its entry here in the SAME change, or the exported picture silently drifts from
 * the screen's key — which is why the data-date entry landed with its painter layer. */
const EXPORT_LEGEND: readonly LegendEntry[] = [
  { label: 'Critical', kind: 'outlineSolid', colour: (p) => p.critical },
  { label: 'Near-critical', kind: 'outlineDashed', colour: (p) => p.nearCritical },
  { label: 'On schedule', kind: 'fill', colour: (p) => p.bar },
  { label: 'Driving link', kind: 'lineSolid', colour: (p) => p.edge },
  { label: 'Non-driving link', kind: 'lineDashed', colour: (p) => p.edge },
  // The data-date status line (canvas status & feedback M1) — drawn SOLID, before Today, matching
  // the DOM legend's order and the marker-channel table. Flag-off it is absent, so the export
  // legend is byte-for-byte the prior row (the parity gate).
  ...(CANVAS_DATA_DATE_ENABLED
    ? [{ label: 'Data date', kind: 'dataDate', colour: (p: PrintPalette) => p.dataDate } as const]
    : []),
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
  const { scene, viewport, size, dpr, topBand, palette, scaledToFit, meta, wbsBand } = input;
  const markerRow = input.markerRow ?? EXPORT_MARKER_ROW;
  const createCanvas = deps.createCanvas ?? (() => document.createElement('canvas'));
  const paint = deps.paint ?? paintScene;

  // A one-shot render must not race the product's self-hosted face (#173): the live canvas
  // repaints every frame so a late-arriving woff2 corrects itself, but this paint happens once
  // and the file it produces is the deliverable. Settled by the time any user can reach Export in
  // practice; awaited anyway because "in practice" is not a guarantee. No-op under jsdom.
  if (typeof document !== 'undefined' && 'fonts' in document) await document.fonts.ready;

  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.round(size.width * dpr));
  canvas.height = Math.max(1, Math.round(size.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context for the diagram export.');

  // Paint the diagram with the light print palette. `paintScene` sets the dpr transform and authors in
  // CSS px, so every draw below stays in CSS px too. It clears to transparent, so the white ground is
  // laid BEHIND everything afterwards (`destination-over`).
  //
  // `minNonWorkingPx: 0` (#166): the screen culls the non-working wash below 3 px/day because a
  // planner can zoom; a whole-plan export frames any span at any scale and paper cannot — so
  // without the override a long programme's deliverable lost its weekends entirely, not
  // degraded them. Below the screen floor the painter merges consecutive non-working days into
  // runs, so a weekend is one crisp band rather than two sub-pixel blends.
  paint(ctx, scene, viewport, size, palette, dpr, { minNonWorkingPx: 0 });

  // The band goes in BEFORE the paper ground: `paintWbsBand` clears its own strip (it owns a canvas
  // on the live path), and clearing after the ground was laid would punch a transparent hole
  // through the paper. Clearing here removes only diagram pixels — gridlines that ran up into the
  // reserved strip — which is exactly what the live band canvas hides behind itself.
  if (wbsBand && wbsBand.height > 0) {
    paintWbsBand(
      ctx,
      wbsBand.bars,
      null,
      { width: size.width, height: wbsBand.height },
      wbsBand.palette,
      dpr,
      // Below the title band AND the marker row — the screen's vertical order (labels in the
      // ruler above, band under it, scene below), which is also what `buildExportViewport`
      // reserved.
      topBand + markerRow,
    );
    // `paintWbsBand` left the transform offset at the band; restore the surface's own frame so the
    // ground fill and the title band author in page coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.globalCompositeOperation = 'source-over';

  drawTitleBand(ctx, size, topBand, palette, scaledToFit, meta);
  drawAxisMarkerRow(ctx, viewport, size, topBand, markerRow, palette, scene);

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

/** Marker-chip typography + geometry, matching the ruler's marker rows (`h-3.5` = 14 px, `px-1`). */
const MARKER_FONT = `11px ${FONT_STACK}`;
const MARKER_CHIP_H = 14;
const MARKER_CHIP_PAD_X = 4;

/**
 * Draw the reserved **axis-marker row** under the title band (`#175`, ADR-0106 one surface along):
 * the exported picture's two persistent rules — the data date and Today — get the labels the
 * screen's ruler gives them, from **the same `axisMarkers` model**, so the export and the screen
 * cannot disagree about culling, coincidence (`Data date · today`), clamping or which label
 * survives a collision (the ADR-0065 one-implementation argument, which is that module's whole
 * reason to exist — see its docblock).
 *
 * The row is filled opaque first (the scene's rules were painted full-height under it, exactly as
 * they are under the title band), then one chip per mark: the data-date chip in the
 * `dataDate`/`dataDateInk` pair and the Today chip in `today`/`todayInk` — both pairs gated by
 * `print-palette.structural.test.ts`. With both marks off (or both rules off-screen in a `view`
 * crop) nothing is drawn and the strip stays paper — the parity case.
 */
function drawAxisMarkerRow(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  size: Size,
  topBand: number,
  markerRow: number,
  palette: PrintPalette,
  scene: TsldScene,
): void {
  if (markerRow <= 0) return;
  // Opaque row ground (the title band's own treatment, one strip down).
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, topBand, size.width, markerRow);

  ctx.font = MARKER_FONT;
  // The mark's box is the CHIP, not the bare text — clamping and the collision test must run on
  // what is actually painted, or two chips could kiss while their texts were judged apart.
  const measure = (label: string): number => {
    const measured = ctx.measureText(label) as TextMetrics | undefined;
    const textWidth = (measured && measured.width) || label.length * 6.5;
    return textWidth + MARKER_CHIP_PAD_X * 2;
  };

  // The same facts the painter derived its lines from (`paint.ts` layer 3.5) — the model is the
  // single answer to "where are the rules and which labels survive".
  const model = axisMarkers(
    viewport,
    size,
    {
      dataDateLine: scene.dataDateLine,
      todayOffset: scene.todayOffset,
      todayFraction: scene.todayFraction,
      todayToggle: scene.view?.today ?? DEFAULT_VIEW_TOGGLES.today,
    },
    measure,
  );

  const chipTop = topBand + (markerRow - MARKER_CHIP_H) / 2;
  for (const mark of model.marks) {
    const width = mark.width ?? measure(mark.label);
    const left = mark.left ?? Math.max(0, Math.min(mark.x - width / 2, size.width - width));
    const fill = mark.kind === 'dataDate' ? palette.dataDate : palette.today;
    const ink = mark.kind === 'dataDate' ? palette.dataDateInk : palette.todayInk;
    // A plain rect rather than `roundRect` — the 2 px radius the screen's chips wear is not worth
    // an API the test's fake context (and older canvas impls) may not have.
    ctx.fillStyle = fill;
    ctx.fillRect(left, chipTop, width, MARKER_CHIP_H);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(mark.label, left + MARKER_CHIP_PAD_X, chipTop + MARKER_CHIP_H - 3.5);
  }
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
    } else if (entry.kind === 'dataDate') {
      // dataDate: a SOLID 2px vertical, matching the canvas data-date rule — shape and weight
      // distinguish it from Today's dashed 1.5px, never hue alone (WCAG 1.4.1).
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x + SWATCH_W / 2, swatchTop);
      ctx.lineTo(x + SWATCH_W / 2, swatchTop + SWATCH_H);
      ctx.stroke();
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
