/**
 * **How many code columns the printed programme can carry** (P6 activity codes, M3-T2, the owner's
 * print decision in `m3-spec.md` §4.6).
 *
 * The page is a fixed 980 px and the chart takes what the columns leave, so a plan with many code
 * columns on screen cannot print them all and keep a chart worth reading. The rule is the one the owner
 * chose: add the switched-on code columns **in on-screen order, while the chart stays at least
 * {@link PRINT_CHART_MIN}**, and name the rest on one line under the chart — a printout that drops
 * columns without saying so is a printout nobody can tell is incomplete (ADR-0127: draw what you know,
 * count what you do not).
 *
 * Pure, so the arithmetic is tested directly and the surface only draws what it is told.
 */

/** A printed code column's width. The surface's own fallback for a column it has no entry for. */
export const PRINT_CODE_COLUMN_WIDTH = 72;

/**
 * The chart is never printed narrower than this — the screen's `CHART_MIN_WIDTH`, restated rather than
 * imported because the two are different surfaces that happen to agree today, and paper's number should
 * move on paper's account alone.
 */
export const PRINT_CHART_MIN = 240;

export interface PrintCodeFit<T> {
  /** The columns that print, in the order given. */
  printed: readonly T[];
  /** The columns left off, in the order given — named on the page. */
  omitted: readonly T[];
}

/**
 * @param pageWidth the document's width.
 * @param standardWidth the standard columns that will print, summed.
 * @param varianceWidth the `vs baseline` column's width, or 0 when it is not printed — it sits after the
 *   code columns but takes its room first, because the screen gives it a fixed place and a baseline is
 *   a statement the programme exists to make.
 * @param codeColumns the switched-on code columns in on-screen order.
 */
export function fitPrintCodeColumns<T>(
  pageWidth: number,
  standardWidth: number,
  varianceWidth: number,
  codeColumns: readonly T[],
): PrintCodeFit<T> {
  const room = pageWidth - standardWidth - varianceWidth - PRINT_CHART_MIN;
  const fits = Math.max(
    0,
    Math.min(codeColumns.length, Math.floor(room / PRINT_CODE_COLUMN_WIDTH)),
  );
  return { printed: codeColumns.slice(0, fits), omitted: codeColumns.slice(fits) };
}

/** The one line under the chart that names what was left off, or `null` when nothing was. */
export function omittedCodesSentence(omittedLabels: readonly string[]): string | null {
  return omittedLabels.length === 0
    ? null
    : `Not printed, to leave room for the chart: ${omittedLabels.join(', ')}.`;
}
