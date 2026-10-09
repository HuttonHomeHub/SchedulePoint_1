/**
 * Row height (px) for the pointer in use. Rows are single-line, so no per-item measurement is
 * needed — but the height is a number the virtualizer multiplies by, so it cannot come from a
 * `pointer-coarse:` class and must be stated here. 44 is the house rule (ADR-0118 D1; `--control-h`
 * under `@media (pointer: coarse)`), pinned to this literal by the parity test in
 * `styles/input-axis.structural.test.ts`. The cost is
 * measured, not estimated (`docs/specs/dense-row-touch-targets/m0-measurement.md`): at 1912 × 1104
 * on touch the tree shows 20 rows at 28 and 12 at 44 (-40 %), and at 1024 × 600 it shows 4 and
 * 2 (-50 %), whole rows only.
 */
export function treeRowHeight(coarse: boolean): number {
  return coarse ? 44 : 28;
}

/**
 * Where the scroller is, expressed in rows so it survives a change of row height: the row at the
 * top, how far into it (px), and the height those two were measured at.
 */
export interface RowAnchor {
  index: number;
  intraOffset: number;
  height: number;
}

/**
 * The anchor for a `scrollTop`. The scroller carries 4 px of top padding (`py-1`) that this does
 * not subtract: the error is at most 4 px of a 28–44 px row, scales with the height ratio on a
 * flip, and is accepted rather than coupling this pure function to a class name.
 */
export function anchorAt(scrollTop: number, height: number): RowAnchor {
  const index = Math.floor(scrollTop / height);
  return { index, intraOffset: scrollTop - index * height, height };
}

/** The `scrollTop` that keeps the same row, the same fraction into it, at `height`. */
export function reanchoredOffset(anchor: RowAnchor, height: number): number {
  return anchor.index * height + (anchor.intraOffset * height) / anchor.height;
}

/**
 * The rows to mount: the virtualizer's window (`windowed`, from its own range extractor) plus every
 * pinned index. Always keeping the focused, selected and open-menu rows mounted lets roving-tabindex
 * focus, deep-link selection and menu focus-return reach them even when scrolled out of the window
 * — and lets a re-layout (a pointer change resizes every row) leave focus on the element it was on
 * (WCAG 2.4.3). Takes the window rather than the range so this module stays free of the library.
 */
export function pinnedRange(windowed: readonly number[], pins: readonly number[]): number[] {
  const indices = new Set(windowed);
  for (const pin of pins) if (pin >= 0) indices.add(pin);
  return [...indices].sort((a, b) => a - b);
}
