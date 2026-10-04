import { useCallback, useRef, useState } from 'react';

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
  /**
   * Change a width **for the frames of a drag**: state only, clamped and chart-guarded like
   * `setWidth`, but nothing is stored. Returns the width applied.
   */
  setTransient: (key: ResizableColumnKey, width: number) => number;
  /** End a drag: store what `setTransient` left, once. A no-op when nothing was changed. */
  commit: () => void;
  /**
   * Publish the panel's chart guard; returns the function that withdraws it. A registration rather
   * than a writable ref, so a host cannot clear or replace the panel's guard by accident.
   */
  registerGuard: (guard: ColumnWidthGuard) => () => void;
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
  // True between a `setTransient` and the `commit` that stores it.
  const dirty = useRef(false);
  // The latest value, so a second change in the same tick builds on the first rather than on a
  // stale render's copy.
  const latest = useRef(widths);

  const persist = useCallback((next: ColumnWidths) => {
    try {
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, serialiseWidths(next));
    } catch {
      // Storage full or disabled — the widths apply for the session and will not persist.
    }
  }, []);

  const apply = useCallback((key: ResizableColumnKey, width: number): number => {
    const asked = clampColumnWidth(width);
    const applied = clampColumnWidth(guardRef.current?.(key, asked) ?? asked);
    const next: ColumnWidths = { ...latest.current, [key]: applied };
    latest.current = next;
    setWidths(next);
    return applied;
  }, []);

  const setWidth = useCallback(
    (key: ResizableColumnKey, width: number): number => {
      const applied = apply(key, width);
      dirty.current = false;
      persist(latest.current);
      return applied;
    },
    [apply, persist],
  );

  const setTransient = useCallback(
    (key: ResizableColumnKey, width: number): number => {
      dirty.current = true;
      return apply(key, width);
    },
    [apply],
  );

  const commit = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    persist(latest.current);
  }, [persist]);

  const registerGuard = useCallback((guard: ColumnWidthGuard) => {
    guardRef.current = guard;
    return () => {
      // Withdraw only our own registration: a newer panel's guard must survive an older one's cleanup.
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    latest.current = {};
    dirty.current = false;
    setWidths({});
    try {
      localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY);
    } catch {
      // As above.
    }
  }, []);

  return { widths, setWidth, setTransient, commit, reset, registerGuard };
}
