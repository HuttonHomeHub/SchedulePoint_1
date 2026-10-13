/**
 * **The widths of what the Gantt's pinned block holds that is not a `GanttColumn`**, in a module
 * with no imports so a Playwright journey can read the same numbers the panel lays out with
 * (`column-widths.ts` reaches `config/env.ts` through the grid columns, and Playwright's loader does
 * not define the compile-time `__APP_VERSION__` that file reads).
 */

/** Width of the variance column, shown only when a baseline is active. Not a `GanttColumn`. */
export const VARIANCE_COLUMN_WIDTH = 72;

/**
 * The width of the row-menu column, which is `size-7` (the `icon-sm` button, #215;
 * `GanttRowMenu.test.tsx` pins the button at this width). It used to have none: the cell sat after
 * the columns, which already summed to the whole pane, so every `⋯` hung 0 to 28 px **past** the
 * pinned block, over the chart's first bars and under the divider's strip (`docs/TECH_DEBT.md`
 * #494). A column that has a width is one the arithmetic can place.
 */
export const ACTIONS_COLUMN_WIDTH = 28;

/**
 * The empty gutter at the pinned block's trailing edge, so no table control sits under the
 * divider's mouse strip (#494). The strip's left edge is 15 px inside the block's edge
 * (`m5-measurement.md`: 25 px wide, centred 2.5 px inside the border), so the margin from the last
 * control to the strip is this gutter less 15: 5 px at 20, which also clears the row menu's 4 px
 * focus ring (`ring-2` plus `ring-offset-2`; the forced-colours outline is the same 2 px plus 2 px).
 * At 16 the ring reached about 3 px under the strip. Widening the strip instead is what ADR-0188 D3
 * refuses for this divider.
 */
export const GRID_END_GUTTER = 20;

/**
 * The width of pinned content that is not a `GanttColumn`: the `vs baseline` column (present only
 * while a baseline is active), the row-menu column (present wherever the host supplies row menus)
 * and the trailing gutter. One derivation, because three sites used to spell it and the ADR-0095
 * incident was two answers to "how wide is the grid".
 */
export function pinnedExtraWidth(showVariance: boolean, hasRowMenus: boolean): number {
  return (
    (showVariance ? VARIANCE_COLUMN_WIDTH : 0) +
    (hasRowMenus ? ACTIONS_COLUMN_WIDTH : 0) +
    GRID_END_GUTTER
  );
}
