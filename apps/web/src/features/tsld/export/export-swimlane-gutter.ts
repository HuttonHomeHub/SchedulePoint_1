import type { PrintPalette } from '../render/palette';
import { FONT_STACK, type Size, type Viewport } from '../render/render-model';
import {
  GUTTER_LINE_PX,
  GUTTER_PAD_PX,
  SWIMLANE_GUTTER_WIDTH_PX,
  swimlaneGutterModel,
  type GutterLabel,
  type GutterSwimlane,
} from '../render/swimlane-gutter';

/**
 * **The swimlane gutter, painted into the exported picture** (swimlanes M2-T7,
 * `docs/specs/swimlanes/ui-architecture.md` C4).
 *
 * On screen the gutter is DOM text — chrome a reader reads (WCAG 1.4.5) — so the canvas cannot reach
 * it, and a picture of the diagram without it would show divided lanes nobody had named. This is the
 * hand mirror ADR-0106 describes for the ruler, with one difference that keeps it honest: **which
 * names appear, in what order, in which boxes, are not derived here.** {@link swimlaneGutterModel}
 * answers that for the DOM gutter and for this painter alike; the only freedom this file has is
 * where a long name breaks (`measureText` against CSS), and whether it was cut is counted so the
 * legend can say so (ADR-0127 D3: an overlay counts what it does not draw).
 *
 * Always the EXPANDED width. Paper has no container to run out of room in, and the collapsed strip
 * exists only because a screen can; a deliverable that showed numbers for names would be a worse
 * picture than the planner was looking at.
 */

/** The width the export reserves at the left; the screen's expanded gutter, named once. */
export const EXPORT_GUTTER_WIDTH = SWIMLANE_GUTTER_WIDTH_PX;

/**
 * The label's font: the DOM label is `text-xs leading-4`, 12 px on a 16 px line. Exported because
 * the caller sets it before it measures, and the measuring happens before the painting.
 */
export const EXPORT_GUTTER_FONT = `12px ${FONT_STACK}`;
/** The label's top padding in the DOM (`py-1`); half of {@link GUTTER_PAD_PX}. */
const LABEL_PAD_TOP = GUTTER_PAD_PX / 2;
/** Distance from a line box's top to its alphabetic baseline for 12 px type on a 16 px line. */
const BASELINE_IN_LINE = 12;

/** One swimlane's label as the painter will draw it. */
export interface ExportGutterLabel {
  /** The lines, already fitted to the gutter, the last ending in an ellipsis where it was cut. */
  lines: string[];
  /** Whether the name did not fit its swimlane's height and ended in an ellipsis. */
  cut: boolean;
  /** The label's box in picture coordinates: the swimlane's block clipped to the framed region. */
  top: number;
  height: number;
  /** Where the swimlane's block ends in picture coordinates, for the border; may lie outside. */
  blockBottom: number;
  visible: boolean;
}

/** The vertical extent of the gutter in the picture, all in CSS px. */
export interface ExportGutterFrame {
  /** Where the column starts: directly under the title band. */
  columnTop: number;
  /** Where the labels start: under the marker row and the WBS band (the screen's corner cell). */
  labelsTop: number;
  /** Where the labels stop: above the resource strip's caption row, or the picture's foot. */
  labelsBottom: number;
}

export interface ExportGutterLayout {
  labels: ExportGutterLabel[];
  /** How many drawn names ended in an ellipsis; the legend counts them. */
  cutCount: number;
}

/** Greedy word wrap to `maxWidth`, breaking a word only when it alone is wider than a line. */
function wrap(name: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  const flush = (): void => {
    if (line !== '') lines.push(line);
    line = '';
  };
  for (const word of name.split(/\s+/).filter((w) => w !== '')) {
    const joined = line === '' ? word : `${line} ${word}`;
    if (measure(joined) <= maxWidth) {
      line = joined;
      continue;
    }
    flush();
    let rest = word;
    while (measure(rest) > maxWidth && rest.length > 1) {
      let end = rest.length - 1;
      while (end > 1 && measure(rest.slice(0, end)) > maxWidth) end -= 1;
      lines.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
    line = rest;
  }
  flush();
  return lines.length > 0 ? lines : [''];
}

/** `text` shortened until it and an ellipsis fit `maxWidth`. */
function ellipsise(text: string, maxWidth: number, measure: (text: string) => number): string {
  let end = text.length;
  while (end > 0 && measure(`${text.slice(0, end).trimEnd()}…`) > maxWidth) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

/**
 * Fit every swimlane's name into its box. Pure given `measure`, so the legend can be told how many
 * were cut before anything is painted.
 *
 * The model is handed the frame the screen's gutter sees — the labels' region as its own canvas —
 * so a sticky label clips to the visible part of its swimlane exactly as the DOM one does.
 */
export function layoutExportGutter(
  swimlanes: readonly GutterSwimlane[],
  viewport: Viewport,
  size: Size,
  frame: ExportGutterFrame,
  measure: (text: string) => number,
): ExportGutterLayout {
  const widthPx = EXPORT_GUTTER_WIDTH;
  const model: GutterLabel[] = swimlaneGutterModel(
    { swimlanes, widthPx, collapsed: false },
    { ...viewport, originY: viewport.originY - frame.labelsTop },
    { width: size.width - widthPx, height: frame.labelsBottom - frame.labelsTop },
    measure,
  );
  const usable = Math.max(1, widthPx - 2 * GUTTER_PAD_PX);
  let cutCount = 0;
  const labels = model.map((m): ExportGutterLabel => {
    const base = {
      top: m.top + frame.labelsTop,
      height: m.height,
      blockBottom: m.blockTop + m.blockHeight + frame.labelsTop,
      visible: m.visible,
    };
    if (!m.visible) return { ...base, lines: [], cut: false };
    // A block clipped by the crop holds fewer lines than its swimlane does; ask what THIS box fits.
    const fits = Math.floor((m.height - GUTTER_PAD_PX) / GUTTER_LINE_PX);
    const allowed = Math.max(1, Math.min(m.maxLines, fits));
    const lines = wrap(m.name, usable, measure);
    if (lines.length <= allowed) return { ...base, lines, cut: false };
    const kept = lines.slice(0, allowed);
    // The tail of the cut line carries the rest of the name, so the ellipsis is judged on all of it.
    kept[allowed - 1] = ellipsise(lines.slice(allowed - 1).join(' '), usable, measure);
    cutCount += 1;
    return { ...base, lines: kept, cut: true };
  });
  return { labels, cutCount };
}

/**
 * Paint the gutter column: an opaque paper ground (it covers whatever the scene painted under the
 * reserved width, as the screen's stage never reaches there), the corner cell's and each swimlane's
 * border in the rule's own colour, and the names. Drawn after the marker row and before the strip's
 * caption, so the corner cell owns its corner and the caption keeps its full row.
 */
export function paintExportGutter(
  ctx: CanvasRenderingContext2D,
  layout: ExportGutterLayout,
  frame: ExportGutterFrame,
  size: Size,
  palette: PrintPalette,
): void {
  const widthPx = EXPORT_GUTTER_WIDTH;
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, frame.columnTop, widthPx, size.height - frame.columnTop);

  ctx.strokeStyle = palette.swimlaneRule;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  // The column's right edge, and the corner cell's foot where the labels begin.
  ctx.moveTo(widthPx - 0.5, frame.columnTop);
  ctx.lineTo(widthPx - 0.5, size.height);
  ctx.moveTo(0, frame.labelsTop + 0.5);
  ctx.lineTo(widthPx, frame.labelsTop + 0.5);
  for (const label of layout.labels) {
    if (!label.visible) continue;
    // A block whose foot is below the framed region is cut by the crop, not ended: no border.
    if (label.blockBottom > frame.labelsBottom) continue;
    const y = Math.round(label.blockBottom) - 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(widthPx, y);
  }
  ctx.stroke();

  ctx.fillStyle = palette.ink;
  ctx.font = EXPORT_GUTTER_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const label of layout.labels) {
    label.lines.forEach((line, i) => {
      ctx.fillText(
        line,
        GUTTER_PAD_PX,
        label.top + LABEL_PAD_TOP + i * GUTTER_LINE_PX + BASELINE_IN_LINE,
      );
    });
  }
}
