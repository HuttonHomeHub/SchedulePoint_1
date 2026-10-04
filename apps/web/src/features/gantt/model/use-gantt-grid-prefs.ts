import {
  defaultGridWidth,
  ganttFixedWidth,
  gridCeiling,
  type ColumnWidths,
} from '../layout/column-widths';
import type { GanttColumn } from '../layout/grid-columns';

import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/** The grid pane's persisted size, with the bounds and seed it was clamped against. */
export interface GanttGridPrefs extends UseResizablePanelPrefs {
  /** The pane's floor: what the visible columns (and the baseline column) need. */
  min: number;
  /** The pane's ceiling — never below the floor (`gridCeiling`). */
  max: number;
  /** The pane's width when nothing has been placed: the default widths, summed. */
  seed: number;
}

/**
 * **The grid pane's width, draggable and remembered** (ADR-0099 D6, Graphite M8) — lifted out of the
 * panel so the host can hand ONE instance to both the grid and the `View ▾` Table width field. Two
 * `useResizablePanelPrefs` over one key do not sync (each holds its own `useState`), so a second
 * reader in the toolbar would have shown a different number from the divider.
 *
 * The pane's bounds are derived here from the same pure arithmetic the panel lays out with
 * (`column-widths.ts`), so the instance the host owns and the floor the panel enforces cannot
 * disagree. The stored size stands when a column changes: a width somebody placed does not move
 * under them.
 */
export function useGanttGridPrefs(input: {
  columns: readonly GanttColumn[];
  widths: ColumnWidths;
  extraPinnedWidth: number;
}): GanttGridPrefs {
  const { columns, widths, extraPinnedWidth } = input;
  // The floor keeps the identity column readable; below it the pane stops being a grid and becomes a
  // margin. It is what the fixed columns need, not a round number: a pane narrower than that cannot
  // lay its columns out and they overflow onto the chart.
  const min = ganttFixedWidth(columns, widths, extraPinnedWidth);
  const max = gridCeiling(min);
  const seed = defaultGridWidth(columns, extraPinnedWidth);
  const prefs = useResizablePanelPrefs({
    storageKey: 'schedulepoint:gantt-grid-width',
    min,
    max,
    defaultSize: seed,
  });
  return { ...prefs, min, max, seed };
}
