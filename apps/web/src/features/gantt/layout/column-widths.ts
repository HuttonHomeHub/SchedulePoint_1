import type { GanttColumnKey } from '../model/gantt-view-state';

import type { GanttColumn } from './grid-columns';

/**
 * **Every width the Gantt's pinned grid is laid out from, in one pure module** (the resizable-columns
 * epic, `docs/specs/gantt-column-resize/`, ADR-0173).
 *
 * The panel, the `View ▾` Columns chooser, the host's pane state and the structural test all ask
 * here, because the failure this arithmetic guards against is **two answers to "how wide is the
 * grid"**: ADR-0095 shipped a literal `420` beside columns that summed to 500, and the Float column
 * painted 80 px on top of the chart. Every width a planner can now reach has the same blast radius.
 *
 * The model, restated from the spec (§2.4):
 *
 * ```text
 * w[k]    = clamp(stored[k] ?? DEFAULT[k], 48, 400)    each visible non-name column
 * FIXED   = Σ w[k] + NAME_MIN + extraPinned            (extraPinned = the `vs baseline` column)
 * ceiling = max(GANTT_GRID_MAX_WIDTH, FIXED)           the floor always wins
 * name    = pane − (FIXED − NAME_MIN)                  the one elastic column
 * ```
 */

/** A column whose width a planner may set. `name` is elastic and has no width of its own. */
export type ResizableColumnKey = Exclude<GanttColumnKey, 'name' | 'wbs'>;

/** The planner's stored widths — only the columns they have set, already clamped. */
export type ColumnWidths = Readonly<Partial<Record<ResizableColumnKey, number>>>;

/**
 * The widths the grid shipped with, **total** over the resizable columns. `predecessors` is written
 * down here rather than reached through a `?? 90` fallback, because a fallback is how a column ended
 * up with a width nobody had decided (ADR-0095 left it off its width table entirely).
 *
 * `duration` is wide enough for the longest realistic sub-day read-out (`12d 7h 45m`) without
 * wrapping; the whole-day case (`5 d`) is far shorter, and a column sized for the common case would
 * truncate exactly the values ADR-0070 exists to make visible.
 */
export const DEFAULT_COLUMN_WIDTHS: Readonly<Record<ResizableColumnKey, number>> = {
  code: 80,
  duration: 84,
  earlyStart: 90,
  earlyFinish: 90,
  totalFloat: 60,
  predecessors: 90,
};

/** The Activity column's width when the pane is first seeded; it is elastic afterwards. */
export const DEFAULT_NAME_WIDTH = 180;

/** Bounds for one column. 48 px keeps a sort button and a few glyphs; 400 px is a whole name. */
export const COLUMN_MIN = 48;
export const COLUMN_MAX = 400;

/** The chart is never asked to be narrower than this by a width the planner types or drags. */
export const CHART_MIN_WIDTH = 240;

/**
 * The grid pane's drag ceiling (Graphite M8). A fixed number rather than a share of the container,
 * because what it protects is the **chart's** usable width — and that requirement does not shrink
 * when the window does. It is a ceiling on the pane, **not on the columns**: see {@link gridCeiling}.
 */
export const GANTT_GRID_MAX_WIDTH = 720;

/**
 * The **name** column's floor. Everything else is fixed, so this is the column that absorbs the
 * difference between the pane's width and its content — which is what makes a splitter mean
 * something. Without it, dragging wider adds blank space and dragging narrower paints the columns
 * over the chart (measured: at the 180 px minimum the headers still occupied 0–584 while the
 * Timeline began at 180 — the ADR-0095 defect exactly).
 */
export const NAME_COLUMN_MIN_WIDTH = 120;

/** Width of the variance column, shown only when a baseline is active. Not a `GanttColumn`. */
export const VARIANCE_COLUMN_WIDTH = 72;

export const COLUMN_WIDTHS_STORAGE_KEY = 'schedulepoint:gantt-column-widths';

/** The stored shape's version. Anything else is ignored as a whole rather than half-read. */
export const COLUMN_WIDTHS_VERSION = 1;

const RESIZABLE_KEYS = Object.keys(DEFAULT_COLUMN_WIDTHS) as ResizableColumnKey[];

/** Clamp a candidate column width to `[COLUMN_MIN, COLUMN_MAX]`, whole px. */
export function clampColumnWidth(width: number): number {
  return Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(width)));
}

/** Whether a column key is one a planner can size — i.e. not `name` (elastic) and not the `wbs` sort. */
export function isResizableKey(key: GanttColumnKey): key is ResizableColumnKey {
  return Object.hasOwn(DEFAULT_COLUMN_WIDTHS, key);
}

/**
 * One column's own width: the planner's, else the default. A key that is not resizable has no width
 * of its own and answers 0 — `name` is laid out against the pane by its callers and `wbs` is a sort
 * key that is not a column; `grid-width.structural.test.ts` pins that no `GANTT_COLUMNS` entry is
 * anything else, so the 0 can never be a column quietly taking no room.
 */
export function columnWidthOf(key: GanttColumnKey, widths: ColumnWidths): number {
  return isResizableKey(key) ? clampColumnWidth(widths[key] ?? DEFAULT_COLUMN_WIDTHS[key]) : 0;
}

/**
 * Read a stored value, **totally**. Corrupt JSON, a different version, an unknown key (`name` among
 * them), a non-finite or non-number width: each is dropped, and what survives is clamped. Nothing
 * here throws, because a hand-edited `localStorage` lands the planner on a working grid.
 *
 * Takes the PARSED value (`unknown`); the JSON parse is the caller's, wrapped in its own `try`.
 */
export function readStoredWidths(raw: unknown): ColumnWidths {
  if (typeof raw !== 'object' || raw === null) return {};
  const record = raw as { v?: unknown; widths?: unknown };
  if (record.v !== COLUMN_WIDTHS_VERSION) return {};
  if (typeof record.widths !== 'object' || record.widths === null) return {};
  const stored = record.widths as Record<string, unknown>;
  const out: Partial<Record<ResizableColumnKey, number>> = {};
  for (const key of RESIZABLE_KEYS) {
    const value = stored[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = clampColumnWidth(value);
  }
  return out;
}

/** The inverse of {@link readStoredWidths}. */
export function serialiseWidths(widths: ColumnWidths): string {
  return JSON.stringify({ v: COLUMN_WIDTHS_VERSION, widths });
}

/** Every resizable column's width, planner's or default — what the `View ▾` fields display. */
export function resolveColumnWidths(
  widths: ColumnWidths,
): Readonly<Record<ResizableColumnKey, number>> {
  return Object.fromEntries(
    RESIZABLE_KEYS.map((key) => [key, clampColumnWidth(widths[key] ?? DEFAULT_COLUMN_WIDTHS[key])]),
  ) as Record<ResizableColumnKey, number>;
}

/** True when nothing the planner set differs from the shipped widths. */
export function isDefaultWidths(widths: ColumnWidths): boolean {
  return RESIZABLE_KEYS.every((key) => {
    const set = widths[key];
    return set === undefined || clampColumnWidth(set) === DEFAULT_COLUMN_WIDTHS[key];
  });
}

/**
 * What the **fixed** columns need — the floor a resizable pane may not go below.
 *
 * Pure and exported so `grid-width.structural.test.ts` can assert the property this arithmetic
 * exists for, rather than a component test asserting a pixel it read out of the same expression.
 */
export function ganttFixedWidth(
  columns: readonly GanttColumn[],
  widths: ColumnWidths,
  /**
   * Width of pinned content that is NOT one of {@link columns} — today only the `vs baseline`
   * column, which renders inside the pinned block when a baseline is active and is deliberately
   * not a `GanttColumn` (it is not sortable, hideable or part of the column vocabulary).
   *
   * **Required, never defaulted** (the ADR-0070 `hoursPerDay` rule). A default of 0 is silently
   * wrong on exactly the plans that have a baseline, and the consequence is the ADR-0095 incident:
   * `name` absorbs against a floor that does not know about the column, so the pinned block sums to
   * `pane + 72` and the variance column paints on top of the chart. That shipped, and was found by
   * a browser (`docs/TECH_DEBT.md` #151) rather than by this file's own gate, which summed
   * `columns` alone and therefore agreed with the bug.
   */
  extraPinnedWidth: number,
): number {
  return (
    columns.reduce(
      (sum, c) => sum + (c.key === 'name' ? NAME_COLUMN_MIN_WIDTH : columnWidthOf(c.key, widths)),
      0,
    ) + extraPinnedWidth
  );
}

/**
 * One column's width **resolved against the pane**: `name` absorbs whatever the pane has beyond the
 * fixed columns, floored at {@link NAME_COLUMN_MIN_WIDTH}; everything else is its own width.
 *
 * The invariant worth stating, because it is the one ADR-0095's `Float` incident violated: summed
 * over the visible columns this equals the pane width whenever the pane is at or above
 * {@link ganttFixedWidth}. Columns therefore fill the grid exactly and can never paint over the
 * chart — which is what the splitter's floor is for, and what the structural test pins.
 */
export function ganttColumnWidth(
  column: GanttColumn,
  widths: ColumnWidths,
  paneWidth: number,
  fixedWidth: number,
): number {
  return column.key === 'name'
    ? Math.max(NAME_COLUMN_MIN_WIDTH, paneWidth - (fixedWidth - NAME_COLUMN_MIN_WIDTH))
    : columnWidthOf(column.key, widths);
}

/**
 * The pane's ceiling. **The floor always wins**: a ceiling below the floor makes `clampSize` return
 * the ceiling, i.e. a pane narrower than its own columns, which is ADR-0095's Float-over-chart
 * incident again. With the shipped widths `FIXED` tops out at 686 — all six columns at their defaults,
 * Activity at its 120 px floor, and the 72 px baseline column (`column-widths.test.ts` pins it) — so
 * the inversion was latent; per-column widths are what make it live. (The 746 a fresh pane seeds
 * to is the same sum with Activity at its 180 px default, which is a size, not a floor.)
 */
export function gridCeiling(fixedWidth: number): number {
  return Math.max(GANTT_GRID_MAX_WIDTH, fixedWidth);
}

/**
 * The seed for the pane, from the **default** widths only. The planner's stored pane then stands
 * (a width somebody placed does not move under them when a column changes), and the zoom framing
 * input derives from this and never from a planner's width, so a column change cannot rescale bars.
 */
export function defaultGridWidth(
  columns: readonly GanttColumn[],
  extraPinnedWidth: number,
): number {
  return (
    columns.reduce(
      (sum, c) =>
        sum +
        (c.key === 'name'
          ? DEFAULT_NAME_WIDTH
          : isResizableKey(c.key)
            ? DEFAULT_COLUMN_WIDTHS[c.key]
            : 0),
      0,
    ) + extraPinnedWidth
  );
}

/**
 * The most a column may grow to without leaving the chart narrower than {@link CHART_MIN_WIDTH}.
 *
 * The pinned block is `max(pane, fixed)`: while the pane is the wider of the two, Activity absorbs
 * the change and the block does not grow, so only the fixed sum matters once it passes the pane.
 * Never below {@link COLUMN_MIN}, and never refuses — a window already too narrow for a 240 px chart
 * keeps whatever width the planner asked for within the pane (nothing is shrunk automatically).
 */
export function chartGuard(
  candidate: number,
  limits: { fixedWithoutColumn: number; pane: number; scrollerWidth: number },
): number {
  // A scroller that reports 0 is **unmeasured** (not yet laid out, or `display: none`), not a window
  // with no room: treating it as zero would clamp every typed width to the floor.
  const scroller = limits.scrollerWidth > 0 ? limits.scrollerWidth : Number.POSITIVE_INFINITY;
  const room = Math.max(scroller - CHART_MIN_WIDTH, limits.pane) - limits.fixedWithoutColumn;
  return Math.min(candidate, Math.max(COLUMN_MIN, room));
}
