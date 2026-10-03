import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ColumnWidths } from '../layout/column-widths';
import { GANTT_COLUMNS } from '../layout/grid-columns';

import { useGanttGridPrefs } from './use-gantt-grid-prefs';

const COLUMNS = GANTT_COLUMNS.filter((c) => c.key !== 'predecessors');
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
        useGanttGridPrefs({ columns: COLUMNS, widths, extraPinnedWidth: 0 }),
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
    expect(JSON.parse(localStorage.getItem('schedulepoint:gantt-grid-width') ?? '{}').size).toBe(
      584,
    );
  });
});
