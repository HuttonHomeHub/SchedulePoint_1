import { useEffect } from 'react';

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

/**
 * Where the divider's position is kept. **`.v2` is the one-time reset** (the narrow-default change,
 * owner decision Q1, 2026-11-13): until then the pane stored its seed the first time the Gantt
 * opened, so a stored width could not be told from one somebody placed, and no stored width could
 * follow the columns. The old key is read by nothing now and removed once on first use; a planner
 * who had dragged the divider drags it again once. Recorded on this device only — nothing is sent.
 */
export const GANTT_GRID_STORAGE_KEY = 'schedulepoint:gantt-grid-width.v2';
const LEGACY_GANTT_GRID_STORAGE_KEY = 'schedulepoint:gantt-grid-width';

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
 * under them. **Only a placed width is stored** (`persist: 'on-change'`): an untouched pane reads the
 * seed, so a different default set of columns reaches everyone who has merely opened the Gantt.
 */
export function useGanttGridPrefs(input: {
  columns: readonly GanttColumn[];
  widths: ColumnWidths;
  extraPinnedWidth: number;
  /** The code columns drawn after `columns` (P6 activity codes, M3-T2); they are part of the floor. */
  codeColumnCount: number;
  /**
   * The columns the pane's **seed** is taken from, when that is not `columns`: the host holds the set
   * the view opened with, so ticking a column on or off afterwards does not move a divider nobody
   * touched (Activity absorbs, ADR-0173 D5). Defaults to `columns`.
   */
  seedColumns?: readonly GanttColumn[];
  /**
   * Activity's width in the seed. Its default unless the view opened narrow with no column choice,
   * when the host passes the floor so the timeline keeps its share (owner decision, 2026-11-14).
   */
  seedNameWidth?: number;
}): GanttGridPrefs {
  const {
    columns,
    widths,
    extraPinnedWidth,
    codeColumnCount,
    seedColumns = columns,
    seedNameWidth,
  } = input;
  // The floor keeps the identity column readable; below it the pane stops being a grid and becomes a
  // margin. It is what the fixed columns need, not a round number: a pane narrower than that cannot
  // lay its columns out and they overflow onto the chart.
  const min = ganttFixedWidth(columns, widths, extraPinnedWidth, codeColumnCount);
  const max = gridCeiling(min);
  const seed = defaultGridWidth(seedColumns, extraPinnedWidth, codeColumnCount, seedNameWidth);
  const prefs = useResizablePanelPrefs({
    storageKey: GANTT_GRID_STORAGE_KEY,
    min,
    max,
    defaultSize: seed,
    // Stored only once somebody moves the divider, so an untouched pane follows the seed.
    persist: 'on-change',
  });
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_GANTT_GRID_STORAGE_KEY);
    } catch {
      // Storage disabled: there is nothing stored to remove.
    }
  }, []);
  return { ...prefs, min, max, seed };
}
