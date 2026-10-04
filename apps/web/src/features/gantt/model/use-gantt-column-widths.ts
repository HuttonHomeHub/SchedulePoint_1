import { useCallback, useRef, useState, type MutableRefObject } from 'react';

import {
  COLUMN_WIDTHS_STORAGE_KEY,
  clampColumnWidth,
  readStoredWidths,
  serialiseWidths,
  type ColumnWidths,
  type ResizableColumnKey,
} from '../layout/column-widths';

/**
 * A rule the PANEL publishes for the host to apply: given a column and a width asked for, the width
 * that leaves the chart at least `CHART_MIN_WIDTH`. Only the panel knows the pieces (the visible
 * columns, whether a baseline column is showing, the pane, the scroller's width), so it hands the
 * host a function rather than the host re-deriving them.
 */
export type ColumnWidthGuard = (key: ResizableColumnKey, candidate: number) => number;

/** What a host hands the panel to make the planner's column widths count (ADR-0173). */
export interface GanttColumnWidthsBundle {
  /** The widths the planner has set — only those, already clamped. Absent keys use the default. */
  widths: ColumnWidths;
  /**
   * Set one column's width, clamped (and chart-guarded once the panel has published its guard).
   * Returns the width **applied**, so a caller can say when it differs from what was asked.
   */
  setWidth: (key: ResizableColumnKey, width: number) => number;
  /** Put every column back to its standard width and **delete** the stored preference. */
  reset: () => void;
  guardRef: MutableRefObject<ColumnWidthGuard | null>;
}

function readFromStorage(): ColumnWidths {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    return raw === null ? {} : readStoredWidths(JSON.parse(raw));
  } catch {
    // Corrupt JSON or storage denied: standard widths, silently. The next change overwrites it.
    return {};
  }
}

/**
 * The planner's column widths, kept on this device (ADR-0173 D1).
 *
 * **Writes only on a planner's change, never on mount.** `useResizablePanelPrefs` writes its seed as
 * soon as it mounts, which for the pane is harmless (the seed is what it would have read anyway); for
 * widths it would freeze today's defaults into every browser, so that a future change to a default
 * never reached anyone who had merely opened a plan. `reset` therefore **removes** the key.
 *
 * Held by the host rather than the panel because two surfaces read it — the grid and the `View ▾`
 * Columns chooser — and two `useState`s over one key do not sync.
 */
export function useGanttColumnWidths(): GanttColumnWidthsBundle {
  const [widths, setWidths] = useState<ColumnWidths>(readFromStorage);
  const guardRef = useRef<ColumnWidthGuard | null>(null);
  // The latest value, so a second change in the same tick builds on the first rather than on a
  // stale render's copy.
  const latest = useRef(widths);

  const setWidth = useCallback((key: ResizableColumnKey, width: number): number => {
    const asked = clampColumnWidth(width);
    const applied = clampColumnWidth(guardRef.current?.(key, asked) ?? asked);
    const next: ColumnWidths = { ...latest.current, [key]: applied };
    latest.current = next;
    setWidths(next);
    try {
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, serialiseWidths(next));
    } catch {
      // Storage full or disabled — the widths apply for the session and will not persist.
    }
    return applied;
  }, []);

  const reset = useCallback(() => {
    latest.current = {};
    setWidths({});
    try {
      localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY);
    } catch {
      // As above.
    }
  }, []);

  return { widths, setWidth, reset, guardRef };
}
