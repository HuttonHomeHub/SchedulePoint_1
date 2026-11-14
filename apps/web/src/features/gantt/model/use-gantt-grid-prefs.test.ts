import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_NAME_WIDTH,
  NAME_COLUMN_MIN_WIDTH,
  pinnedExtraWidth,
  type ColumnWidths,
} from '../layout/column-widths';
import { GANTT_COLUMNS } from '../layout/grid-columns';

import { GANTT_GRID_STORAGE_KEY, useGanttGridPrefs } from './use-gantt-grid-prefs';

const COLUMNS = GANTT_COLUMNS.filter((c) => c.key !== 'predecessors' && c.key !== 'swimlane');
const WIDENED: ColumnWidths = { code: 160 };

describe('useGanttGridPrefs — Reset widths restores the divider', () => {
  beforeEach(() => localStorage.clear());

  /**
   * The journey's defect: widen a column past what Activity can give, so the floor rises above the
   * pane, then reset. Setting the pane to the seed through `setSize` clamps against the bounds of the
   * render the click happened in — the WIDENED floor — so the seed was clamped back up to it, stored,
   * and survived the widths being cleared: the divider stayed 20 px off its seed and Reset never
   * went back to "already standard".
   */
  it('puts the pane back on its seed even though the floor it was clamped against was widened', () => {
    const { result, rerender } = renderHook(
      ({ widths }: { widths: ColumnWidths }) =>
        useGanttGridPrefs({ columns: COLUMNS, widths, extraPinnedWidth: 0, codeColumnCount: 0 }),
      { initialProps: { widths: WIDENED } },
    );
    expect(result.current.seed).toBe(584);
    expect(result.current.min).toBe(604);
    expect(result.current.size).toBe(604);

    act(() => {
      result.current.resetSize();
    });
    rerender({ widths: {} });

    expect(result.current.size).toBe(result.current.seed);
    // Nothing is stored for a pane nobody placed: the reset returns it to following the seed.
    expect(localStorage.getItem(GANTT_GRID_STORAGE_KEY)).toBeNull();
  });
});

describe('useGanttGridPrefs: a pane stored before the row-menu column and the gutter existed', () => {
  beforeEach(() => localStorage.clear());

  /** The stored pane stands (ADR-0173) unless it is under the floor the new extras raise. */
  it('is read back clamped up to that floor, and left alone above it', () => {
    const extra = pinnedExtraWidth(false, true);
    localStorage.setItem(GANTT_GRID_STORAGE_KEY, JSON.stringify({ size: 500 }));
    const low = renderHook(() =>
      useGanttGridPrefs({
        columns: COLUMNS,
        widths: {},
        extraPinnedWidth: extra,
        codeColumnCount: 0,
      }),
    );
    expect(low.result.current.min).toBe(584 - 180 + 120 + extra);
    expect(low.result.current.size).toBe(low.result.current.min);

    localStorage.setItem(GANTT_GRID_STORAGE_KEY, JSON.stringify({ size: 700 }));
    const old = renderHook(() =>
      useGanttGridPrefs({
        columns: COLUMNS,
        widths: {},
        extraPinnedWidth: extra,
        codeColumnCount: 0,
      }),
    );
    expect(old.result.current.size).toBe(700);
  });
});

describe('useGanttGridPrefs: stored only once placed, and reset once for everyone', () => {
  beforeEach(() => localStorage.clear());
  const NARROW = COLUMNS.filter((c) => c.key !== 'code' && c.key !== 'earlyFinish');
  const hook = (columns = COLUMNS, seedColumns?: typeof COLUMNS) =>
    renderHook(() =>
      useGanttGridPrefs({
        columns,
        widths: {},
        extraPinnedWidth: 0,
        codeColumnCount: 0,
        ...(seedColumns ? { seedColumns } : {}),
      }),
    );

  it('stores nothing when the Gantt merely opens, and opens at the seed of the columns shown', () => {
    const { result } = hook(NARROW);
    expect(localStorage.getItem(GANTT_GRID_STORAGE_KEY)).toBeNull();
    expect(result.current.size).toBe(result.current.seed);
    expect(result.current.seed).toBeLessThan(584);
  });

  it('keeps the seed of the columns the view opened with when the shown columns change', () => {
    const { result } = hook(COLUMNS, NARROW);
    expect(result.current.seed).toBe(hook(NARROW).result.current.seed);
    expect(result.current.seed).not.toBe(hook(COLUMNS).result.current.seed);
  });

  it('stores a width once somebody places it', () => {
    const { result } = hook();
    act(() => result.current.setSize(640));
    expect(JSON.parse(localStorage.getItem(GANTT_GRID_STORAGE_KEY) ?? '{}').size).toBe(640);
  });

  it('ignores a divider saved under the old key and removes it once', () => {
    localStorage.setItem('schedulepoint:gantt-grid-width', JSON.stringify({ size: 700 }));
    const { result } = hook();
    expect(result.current.size).toBe(result.current.seed);
    expect(localStorage.getItem('schedulepoint:gantt-grid-width')).toBeNull();
  });

  it('seeds Activity at its floor when the host says the view opened narrow', () => {
    const wide = renderHook(() =>
      useGanttGridPrefs({ columns: NARROW, widths: {}, extraPinnedWidth: 0, codeColumnCount: 0 }),
    );
    const narrow = renderHook(() =>
      useGanttGridPrefs({
        columns: NARROW,
        widths: {},
        extraPinnedWidth: 0,
        codeColumnCount: 0,
        seedNameWidth: NAME_COLUMN_MIN_WIDTH,
      }),
    );
    expect(wide.result.current.seed - narrow.result.current.seed).toBe(
      DEFAULT_NAME_WIDTH - NAME_COLUMN_MIN_WIDTH,
    );
    // The seed is then the floor itself, so Activity is at 120 and the timeline gets the rest.
    expect(narrow.result.current.seed).toBe(narrow.result.current.min);
    // A width the planner placed still wins over it.
    act(() => narrow.result.current.setSize(560));
    expect(narrow.result.current.size).toBe(560);
  });
});
