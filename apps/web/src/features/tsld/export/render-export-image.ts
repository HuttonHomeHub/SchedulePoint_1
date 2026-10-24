import { axisMarkers } from '../render/axis-markers';
import {
  DEFAULT_VIEW_TOGGLES,
  formatStripUnits,
  paintResourceStrip,
  paintScene,
  paintWbsBand,
  type ResourceStripPalette,
  type TsldScene,
  type WbsBandPalette,
} from '../render/paint';
import type { PrintPalette } from '../render/palette';
// Through the barrel this file already imports from, never `./geometry` directly (M1-T3 step 3):
// `render-model` re-exports the whole leaf, so the direct import bought nothing and added a second
// edge into it. Shipped as a direct import and reconciled at the gate pass, where the component
// review noticed the code did not follow its own stated rationale.
import { FONT_STACK, type Size, type Viewport } from '../render/render-model';
import type { ResourceStripSnapshot } from '../render/resource-strip';
import type { GutterSwimlane } from '../render/swimlane-gutter';
import type { WbsBandBar } from '../render/wbs-band';

import { EXPORT_MARKER_ROW, EXPORT_STRIP_CAPTION_ROW } from './export-image';
import {
  EXPORT_GUTTER_FONT,
  EXPORT_GUTTER_WIDTH,
  layoutExportGutter,
  paintExportGutter,
  type ExportGutterFrame,
} from './export-swimlane-gutter';

import { CANVAS_DATA_DATE_ENABLED, CANVAS_RESOURCE_VIEW_ENABLED } from '@/config/env';

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
/** The legend's text baseline in the FULL band, under the title and subtitle. */
const LEGEND_BASELINE = 68;
/**
 * The legend's baseline in the **legend-only** band the printed diagram uses.
 *
 * Paired with {@link EXPORT_PRINT_TOP_BAND}: the band loses the two lines the surrounding document
 * already carries, so the legend moves up and the reserved strip shrinks by the same 48 px, which
 * the printed diagram gets back as chart.
 */
const PRINT_LEGEND_BASELINE = 20;
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
  /**
   * **The OTHER plan, when the picture carries a CROSS-PLAN comparison overlay.**
   *
   * The exported diagram composes the comparison lens (ADR-0103's rule: it is the one lens whose
   * whole purpose is to be handed to somebody who was not in the room). Across two plans that makes
   * the title line a **false statement** unless both are named — a reader sees one plan's name and
   * ghosts drawn from a plan nobody mentioned, and has no way to know. Absent on a same-plan
   * comparison, where the title already names the only plan involved.
   */
  comparedWithPlanName?: string | undefined;
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
   * What the title band draws.
   *
   * `'full'` (the default, and the standalone PNG/PDF) is the self-describing band: plan name,
   * "as of / generated" line, legend. **`'legend-only'` is for the PRINTED diagram**, where the
   * document around the picture already carries the name and the dates as real, selectable text —
   * so a full band made paper state the plan's identity twice, six lines apart, in two different
   * date formats (`docs/TECH_DEBT.md` #217).
   *
   * The duplication was deliberate when it shipped: `PrintSurface.tsx`'s docblock says the image
   * "is already self-describing… this surface adds the plan-name · date heading the plan calls
   * for". Both halves are right on their own; what nobody had done was look at the two together on
   * a page, because nothing photographed the printed diagram until 2026-08-29.
   *
   * The DOCUMENT keeps the identity rather than the picture, because it is the accessible and
   * selectable carrier — a heading a reader can copy, and one the browser's own print outline can
   * see. The picture keeps the legend, which is meaningless outside it.
   */
  bandContent?: 'full' | 'legend-only';
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
  /**
   * The **resource strip** (ADR-0049), when it is open on screen (ADR-0200 D1). Painted at the
   * bottom of the picture, in the `height` of band `buildExportViewport` reserved below the
   * diagram, with its caption row directly above it. `snapshot` is the one the live band paints
   * from — same stack, same scale — and `palette` is the paper's. Absent (the default) is the
   * byte-for-byte prior export.
   */
  resourceStrip?: {
    snapshot: ResourceStripSnapshot;
    palette: ResourceStripPalette;
    height: number;
  };
  /**
   * The **swimlane gutter's mirror** (swimlanes M2-T7), when swimlanes are drawn. The swimlanes in
   * display order, as the screen's gutter is handed them; the painter reserves
   * {@link EXPORT_GUTTER_WIDTH} at the left, which `buildExportViewport` already moved the diagram
   * clear of. Absent (the default) is the byte-for-byte prior export.
   */
  swimlaneGutter?: { swimlanes: readonly GutterSwimlane[] };
}

/**
 * **Which renderer input composes each diagram layer** (ADR-0198). A layer is a `<canvas>` the
 * diagram renders, named by its `data-layer`; `scene-parity.structural.test.ts` takes the roster
 * from the canvases and demands that every one is a key here (and named in the composer) or is
 * listed there as screen-only with a reason. `satisfies` makes the compiler refuse a mapping to an
 * input this renderer does not have, so the table cannot name a field that was renamed away.
 */
export const EXPORT_LAYER_INPUTS = {
  scene: 'scene',
  'wbs-band': 'wbsBand',
  'resource-strip': 'resourceStrip',
} as const satisfies Record<string, keyof RenderExportImageInput>;

/**
 * **Which renderer input composes each piece of DOM chrome** (ADR-0200 D2, swimlanes M2-T7). A
 * layer is a `<canvas>` and the roster above finds them; chrome is the text and rules the screen
 * draws in the DOM beside the canvases, which the layer gate structurally cannot see. Each is named
 * on the screen by a literal `data-chrome="…"` and `scene-parity.structural.test.ts` demands that
 * every one is a key here and that the composer names its input.
 *
 * The ruler's labels are painted by {@link drawAxisMarkerRow} into the row `markerRow` reserves;
 * the gutter's by {@link paintExportGutter}.
 */
export const EXPORT_CHROME_INPUTS = {
  ruler: 'markerRow',
  'swimlane-gutter': 'swimlaneGutter',
} as const satisfies Record<string, keyof RenderExportImageInput>;

/** Injectable seams so the off-screen render is testable without a real 2D context. */
export interface RenderExportImageDeps {
  createCanvas?: () => HTMLCanvasElement;
  paint?: typeof paintScene;
}

/** One legend entry, matching the canvas cues (palette-derived, so colours track the drawn bars). */
type LegendEntry = {
  label: string;
  kind:
    | 'fill'
    | 'outlineSolid'
    | 'outlineDashed'
    | 'lineSolid'
    | 'lineDashed'
    | 'today'
    | 'dataDate'
    | 'overAllocation'
    // Words only: a count of what the picture did not draw in full, with no mark to key.
    | 'note';
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
  // **The two date markers, then the two link cues** — the DOM legend's grouping
  // (`TsldLegend.tsx`'s `SHARED_CUES`), which this list did not follow (`docs/TECH_DEBT.md`
  // #211c). The docblock below the markers used to claim it matched "the DOM legend's order",
  // and that was true only of Data-date-before-Today, never of markers-before-links. A key whose
  // groups run in a different order from the one on screen is a small tax on every reader who
  // holds both.
  //
  // The data-date status line (canvas status & feedback M1) is drawn SOLID, before Today, per the
  // marker-channel table. Flag-off it is absent, so the export legend is byte-for-byte the prior
  // row (the parity gate).
  ...(CANVAS_DATA_DATE_ENABLED
    ? [{ label: 'Data date', kind: 'dataDate', colour: (p: PrintPalette) => p.dataDate } as const]
    : []),
  { label: 'Today', kind: 'today', colour: (p) => p.today },
  { label: 'Driving link', kind: 'lineSolid', colour: (p) => p.edge },
  { label: 'Non-driving link', kind: 'lineDashed', colour: (p) => p.edge },
];

/** The entry for the over-allocation badge, last as on the screen's key (`TsldLegend.tsx`). It is
 * appended only when the picture draws a badge, so a key never names a mark the page lacks
 * (TECH_DEBT #524) — the same both-ways rule the DOM legend's census holds. */
const OVER_ALLOCATION_ENTRY: LegendEntry = {
  label: 'Over-allocated',
  kind: 'overAllocation',
  colour: (p) => p.conflict,
};

/** The three ascending mini-bars' heights, as the DOM legend draws them. */
const OVER_ALLOCATION_SWATCH_HEIGHTS = [3, 6, 9] as const;
/** Where the first mini-bar starts inside the swatch, each bar's width and the step between bars. */
const OVER_ALLOCATION_BAR_INSET = 3;
const OVER_ALLOCATION_BAR_W = 4;
const OVER_ALLOCATION_BAR_PITCH = 5;

/** A text's width on this context, with a per-character estimate where the context cannot measure
 * (a stubbed 2D context returns no metrics). */
function measuredWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const measured = ctx.measureText(text) as TextMetrics | undefined;
  return (measured && measured.width) || text.length * 6.5;
}

/**
 * The swimlane names the gutter had to shorten, said in the legend (ADR-0127 D3: what the picture
 * does not draw in full is counted, not silently clipped). Last, after the marks it explains nothing
 * about, so a narrow crop's "+N more" drops this before it drops a key.
 */
function cutNamesEntry(count: number): LegendEntry {
  return {
    label: `${String(count)} swimlane ${count === 1 ? 'name' : 'names'} shortened`,
    kind: 'note',
    colour: (p) => p.mutedInk,
  };
}

/** The legend rows this picture's scene calls for. */
function legendFor(scene: TsldScene, cutNames: number): readonly LegendEntry[] {
  const drawsBadge = CANVAS_RESOURCE_VIEW_ENABLED && (scene.flaggedIds?.size ?? 0) > 0;
  const rows = drawsBadge ? [...EXPORT_LEGEND, OVER_ALLOCATION_ENTRY] : EXPORT_LEGEND;
  return cutNames > 0 ? [...rows, cutNamesEntry(cutNames)] : rows;
}

/**
 * Render the diagram to an off-screen PNG and resolve its {@link Blob}. Paints OFF-SCREEN ONLY.
 * @throws if a 2D context cannot be obtained (surfaced as a user-safe error by the caller).
 */
export async function renderExportImage(
  input: RenderExportImageInput,
  deps: RenderExportImageDeps = {},
): Promise<Blob> {
  const {
    scene,
    viewport,
    size,
    dpr,
    topBand,
    palette,
    scaledToFit,
    meta,
    wbsBand,
    resourceStrip,
    swimlaneGutter,
  } = input;
  const markerRow = input.markerRow ?? EXPORT_MARKER_ROW;
  const bandContent = input.bandContent ?? 'full';
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

  // The strip goes in before the ground for the band's reason: `paintResourceStrip` clears its own
  // rectangle, which here removes the scene's full-height gridlines and rules that ran down into
  // the reserved band — exactly what the live strip canvas hides them behind.
  if (resourceStrip && resourceStrip.height > 0) {
    paintResourceStrip(
      ctx,
      resourceStrip.snapshot,
      viewport,
      { width: size.width, height: resourceStrip.height },
      resourceStrip.palette,
      dpr,
      size.height - resourceStrip.height,
    );
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.globalCompositeOperation = 'source-over';

  // The gutter's names are fitted BEFORE the title band is drawn, because how many were cut is a
  // line of the legend. The frame is the screen's: the column under the title band, the labels
  // from under the marker row and the WBS band down to where the strip's caption begins.
  let gutter: { frame: ExportGutterFrame; layout: ReturnType<typeof layoutExportGutter> } | null =
    null;
  if (swimlaneGutter) {
    const frame: ExportGutterFrame = {
      columnTop: topBand,
      labelsTop: topBand + markerRow + (wbsBand?.height ?? 0),
      labelsBottom:
        size.height -
        (resourceStrip && resourceStrip.height > 0
          ? resourceStrip.height + EXPORT_STRIP_CAPTION_ROW
          : 0),
    };
    ctx.font = EXPORT_GUTTER_FONT;
    gutter = {
      frame,
      layout: layoutExportGutter(swimlaneGutter.swimlanes, viewport, size, frame, (text) =>
        measuredWidth(ctx, text),
      ),
    };
  }

  drawTitleBand(
    ctx,
    size,
    topBand,
    palette,
    scaledToFit,
    meta,
    bandContent,
    legendFor(scene, gutter?.layout.cutCount ?? 0),
  );
  drawAxisMarkerRow(
    ctx,
    viewport,
    size,
    topBand,
    markerRow,
    palette,
    scene,
    gutter ? EXPORT_GUTTER_WIDTH : 0,
  );
  if (gutter) paintExportGutter(ctx, gutter.layout, gutter.frame, size, palette);
  if (resourceStrip && resourceStrip.height > 0) {
    drawStripCaption(ctx, resourceStrip.snapshot, size, resourceStrip.height, palette);
  }

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
  bandContent: 'full' | 'legend-only',
  legend: readonly LegendEntry[],
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
  if (bandContent === 'full') {
    // Title.
    ctx.fillStyle = palette.ink;
    ctx.font = TITLE_FONT;
    ctx.fillText(
      meta.comparedWithPlanName === undefined
        ? meta.planName
        : `${meta.planName} vs ${meta.comparedWithPlanName}`,
      BAND_PAD,
      28,
    );
    // Subtitle (data date · generated · scaled-to-fit note).
    ctx.fillStyle = palette.mutedInk;
    ctx.font = SUBTITLE_FONT;
    const subtitle =
      `As of ${meta.dataDate} · Generated ${meta.generatedAtIso}` +
      (scaledToFit ? ' · scaled to fit' : '');
    ctx.fillText(subtitle, BAND_PAD, 48);
  } else if (scaledToFit) {
    // **The one line paper still needs from the band.** The document heading carries the name and
    // both dates; "scaled to fit" is a fact about THIS RASTER and nothing outside the picture
    // knows it, so dropping it would lose the only warning that the diagram is not at true scale.
    ctx.fillStyle = palette.mutedInk;
    ctx.font = SUBTITLE_FONT;
    ctx.fillText('Scaled to fit', BAND_PAD, LEGEND_BASELINE - 22);
  }

  drawLegend(
    ctx,
    palette,
    size.width,
    bandContent === 'full' ? LEGEND_BASELINE : PRINT_LEGEND_BASELINE,
    legend,
  );
}

/** The bucket sizes as the caption words them: an adjective, because the line goes on to say "buckets". */
const STRIP_BUCKET_WORD = { DAY: 'Daily', WEEK: 'Weekly', MONTH: 'Monthly' } as const;
/** The strip's load-basis sentence — the screen's own (`RESOURCE_LOAD_BASIS_NOTE`), restated here
 * because this module must not import a feature component; `render-export-image.resource-strip.test`
 * asserts the two are equal. */
const STRIP_LOAD_BASIS = 'Load is counted where each bar is drawn.';
/** Legend swatch geometry for the caption row — smaller than the title band's, so three lines fit. */
const STRIP_SWATCH = 9;
const STRIP_LINE_PITCH = 18;
const STRIP_LINE_FIRST = 16;

/** A line of text that fits `maxWidth`, ending in an ellipsis where it had to be cut. Marking the cut
 * is the point: a line that silently loses its tail reads as complete. */
function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** What the caption's first line says, from the snapshot's {@link StripCaption}. Exported for tests. */
export function stripCaptionHeadline(snapshot: ResourceStripSnapshot): string {
  const caption = snapshot.caption;
  if (!caption) return 'Resource load';
  if (caption.status === 'loading') return 'Resource load: not shown, still loading when exported';
  if (caption.status === 'error') return 'Resource load: not shown, could not be loaded';
  if (caption.status === 'empty') {
    return `Resource load: ${caption.emptyMessage ?? 'nothing to show'}`;
  }
  const how =
    caption.mode === 'isolated'
      ? `${caption.resourceName ?? 'one resource'} only`
      : `stacked by ${caption.mode}`;
  // **The peak leads**: a narrow crop cuts the tail of this line (marked with an ellipsis), and the
  // figure a reader came for must not be the first thing to go. "Load", not "loading": on paper
  // "Resource loading" reads as a status ("still loading"), not as the name of a section.
  return (
    `Resource load · peak ${formatStripUnits(snapshot.max)} units · ${how} · ` +
    `${STRIP_BUCKET_WORD[caption.granularity]} buckets`
  );
}

/**
 * Draw the **resource strip's caption row** (ADR-0200 D3) directly above the band: what the strip
 * is (mode, bucket size, peak), what it counts, whether the histogram was truncated, and the legend
 * that names each colour. ADR-0106 again: a band's label is chrome, and on screen this is the DOM
 * panel the canvas cannot reach, so the export paints the facts into a reserved row.
 *
 * Opaque first — the scene's full-height rules were painted under this row, exactly as under the
 * marker row — then three lines. **Nothing is dropped silently** (ADR-0127 D3): a legend entry that
 * does not fit the crop is counted (`+N more`), and a headline that does not fit ends in an
 * ellipsis. The legend is text beside a swatch, so colour is never the only channel (WCAG 1.4.1).
 */
function drawStripCaption(
  ctx: CanvasRenderingContext2D,
  snapshot: ResourceStripSnapshot,
  size: Size,
  stripHeight: number,
  palette: PrintPalette,
): void {
  const top = size.height - stripHeight - EXPORT_STRIP_CAPTION_ROW;
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, top, size.width, EXPORT_STRIP_CAPTION_ROW);
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(size.width, top + 0.5);
  ctx.stroke();

  const maxWidth = Math.max(0, size.width - BAND_PAD * 2);
  const caption = snapshot.caption;
  ctx.font = LEGEND_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = palette.ink;
  ctx.fillText(
    fitLine(ctx, stripCaptionHeadline(snapshot), maxWidth),
    BAND_PAD,
    top + STRIP_LINE_FIRST,
  );

  const notes = [
    caption?.status === 'ready' ? STRIP_LOAD_BASIS : null,
    caption?.shown !== undefined && caption.total !== undefined
      ? `Showing ${String(caption.shown)} of ${String(caption.total)} resources`
      : null,
  ].filter((note): note is string => note !== null);
  if (notes.length > 0) {
    ctx.fillStyle = palette.mutedInk;
    ctx.fillText(
      fitLine(ctx, notes.join(' · '), maxWidth),
      BAND_PAD,
      top + STRIP_LINE_FIRST + STRIP_LINE_PITCH,
    );
  }

  const legend = caption?.status === 'ready' ? caption.legend : [];
  if (legend.length === 0) return;
  const baseline = top + STRIP_LINE_FIRST + STRIP_LINE_PITCH * 2;
  const limit = size.width - BAND_PAD;
  const moreWidth = (n: number): number => ctx.measureText(`+${String(n)} more`).width;
  let x = BAND_PAD;
  for (let i = 0; i < legend.length; i += 1) {
    const entry = legend[i]!;
    const entryWidth = STRIP_SWATCH + LEGEND_LABEL_GAP + ctx.measureText(entry.label).width;
    const left = legend.length - i - 1;
    // Reserve room for the "+N more" the NEXT entry would need if this one is the last that fits, so
    // the count itself can never be the thing that overflows.
    const reserve = left > 0 ? LEGEND_ENTRY_GAP + moreWidth(left) : 0;
    if (x + entryWidth + reserve > limit) {
      ctx.fillStyle = palette.mutedInk;
      ctx.fillText(`+${String(legend.length - i)} more`, x, baseline);
      return;
    }
    ctx.fillStyle = entry.fill;
    ctx.fillRect(x, baseline - STRIP_SWATCH, STRIP_SWATCH, STRIP_SWATCH);
    ctx.fillStyle = palette.ink;
    ctx.fillText(entry.label, x + STRIP_SWATCH + LEGEND_LABEL_GAP, baseline);
    x += entryWidth + LEGEND_ENTRY_GAP;
  }
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
  gutterWidth: number,
): void {
  if (markerRow <= 0) return;
  // Opaque row ground (the title band's own treatment, one strip down).
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, topBand, size.width, markerRow);

  ctx.font = MARKER_FONT;
  // The mark's box is the CHIP, not the bare text — clamping and the collision test must run on
  // what is actually painted, or two chips could kiss while their texts were judged apart.
  const measure = (label: string): number => measuredWidth(ctx, label) + MARKER_CHIP_PAD_X * 2;

  // The same facts the painter derived its lines from (`paint.ts` layer 3.5) — the model is the
  // single answer to "where are the rules and which labels survive".
  // With a gutter the ruler is the STAGE's, as on screen: it starts at the gutter's right edge, so
  // its marks are placed and clamped against the stage's own frame and then shifted into the picture.
  // Zero is the identity, which is what keeps the gutter-free row byte-for-byte what it was.
  const model = axisMarkers(
    { ...viewport, originX: viewport.originX - gutterWidth },
    { ...size, width: size.width - gutterWidth },
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
    const left =
      gutterWidth +
      (mark.left ?? Math.max(0, Math.min(mark.x - width / 2, size.width - gutterWidth - width)));
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
function drawLegend(
  ctx: CanvasRenderingContext2D,
  palette: PrintPalette,
  maxWidth: number,
  y: number,
  legend: readonly LegendEntry[],
): void {
  const swatchTop = y + 3;
  ctx.font = LEGEND_FONT;
  ctx.textBaseline = 'alphabetic';
  const measure = (text: string): number => measuredWidth(ctx, text);
  const limit = maxWidth - BAND_PAD;
  let x = BAND_PAD;
  for (let i = 0; i < legend.length; i += 1) {
    const entry = legend[i]!;
    const entryWidth =
      entry.kind === 'note'
        ? measure(entry.label)
        : SWATCH_W + LEGEND_LABEL_GAP + measure(entry.label);
    const left = legend.length - i - 1;
    // Reserve room for the "+N more" the NEXT entry would need if this one is the last that fits, so
    // the count itself can never be the thing that overflows. A narrow crop used to drop the
    // trailing entries without a word (TECH_DEBT #525); ADR-0127 D3 counts what it does not draw,
    // and the strip caption below already does (ADR-0200 D3).
    const reserve = left > 0 ? LEGEND_ENTRY_GAP + measure(`+${String(left)} more`) : 0;
    if (x + entryWidth + reserve > limit) {
      ctx.fillStyle = palette.mutedInk;
      ctx.fillText(`+${String(legend.length - i)} more`, x, y + SWATCH_H);
      return;
    }
    const colour = entry.colour(palette);
    if (entry.kind === 'note') {
      ctx.fillStyle = colour;
      ctx.fillText(entry.label, x, y + SWATCH_H);
      x += entryWidth + LEGEND_ENTRY_GAP;
      continue;
    }
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
    } else if (entry.kind === 'overAllocation') {
      // Rising bars on the swatch's baseline, each outlined — the painter's badge in miniature.
      ctx.fillStyle = colour;
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      OVER_ALLOCATION_SWATCH_HEIGHTS.forEach((barHeight, step) => {
        const barX = x + OVER_ALLOCATION_BAR_INSET + step * OVER_ALLOCATION_BAR_PITCH;
        const barY = swatchTop + SWATCH_H - barHeight;
        ctx.fillRect(barX, barY, OVER_ALLOCATION_BAR_W, barHeight);
        ctx.strokeRect(barX + 0.5, barY + 0.5, OVER_ALLOCATION_BAR_W - 1, barHeight - 1);
      });
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
    ctx.fillStyle = palette.mutedInk;
    ctx.fillText(entry.label, x + SWATCH_W + LEGEND_LABEL_GAP, y + SWATCH_H);
    x += entryWidth + LEGEND_ENTRY_GAP;
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
