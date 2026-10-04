import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COLUMN_WIDTHS_STORAGE_KEY } from '../layout/column-widths';
import { GANTT_COLUMNS } from '../layout/grid-columns';
import { useGanttColumnWidths } from '../model/use-gantt-column-widths';
import { useGanttGridPrefs } from '../model/use-gantt-grid-prefs';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/** Same stub as `GanttPanel.test.tsx`: jsdom has no layout, so the virtualizer yields no rows. */
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * GANTT_ROW_HEIGHT,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * GANTT_ROW_HEIGHT,
        size: GANTT_ROW_HEIGHT,
      })),
    scrollToIndex: () => {},
  }),
}));

const ACTIVITIES = [
  anActivity({
    id: 'a',
    code: 'A10',
    name: 'Excavate',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
];

const IDENTITY = GANTT_COLUMNS.filter((c) => c.key !== 'predecessors');

/** The identity header widths, in column order. */
const headerWidths = (): number[] =>
  screen
    .getAllByRole('columnheader')
    .slice(0, IDENTITY.length)
    .map((h) => parseFloat(h.style.width));

/** The first activity row's identity cell widths, in column order. */
const cellWidths = (): number[] => {
  const row = screen.getAllByRole('row').find((r) => r.getAttribute('aria-rowindex') === '2');
  return [...(row?.querySelectorAll('[role="gridcell"]') ?? [])]
    .slice(0, IDENTITY.length)
    .map((cell) => parseFloat((cell as HTMLElement).style.width));
};

/** A host in miniature: the same two hooks `plan-workspace-toolbar.tsx` owns, passed down whole. */
function Host(): React.ReactElement {
  const columnWidths = useGanttColumnWidths();
  const gridPrefs = useGanttGridPrefs({
    columns: IDENTITY,
    widths: columnWidths.widths,
    extraPinnedWidth: 0,
  });
  return <GanttPanel activities={ACTIVITIES} columnWidths={columnWidths} gridPrefs={gridPrefs} />;
}

describe('GanttPanel — column widths', () => {
  beforeEach(() => localStorage.clear());

  it('renders the shipped widths when nothing is supplied, bare', () => {
    render(<GanttPanel activities={ACTIVITIES} />);
    // Code 80, Activity 180, Duration 84, Start 90, Finish 90, Float 60: the grid as it was before
    // widths were planner-set, summing to the 584 px seed.
    expect(headerWidths()).toEqual([80, 180, 84, 90, 90, 60]);
    expect(cellWidths()).toEqual(headerWidths());
  });

  it('renders the same widths when a host supplies an empty widths bundle', () => {
    render(<Host />);
    expect(headerWidths()).toEqual([80, 180, 84, 90, 90, 60]);
    expect(cellWidths()).toEqual(headerWidths());
  });

  it('makes Activity give up the room a wider column takes, the pane staying where it was', () => {
    localStorage.setItem(
      COLUMN_WIDTHS_STORAGE_KEY,
      JSON.stringify({ v: 1, widths: { code: 100 } }),
    );
    render(<Host />);
    // 584 pane, Code 80 → 100: Activity 180 → 160. The pane did not move.
    expect(headerWidths()).toEqual([100, 160, 84, 90, 90, 60]);
    expect(headerWidths().reduce((a, b) => a + b, 0)).toBe(584);
  });

  it('agrees between header and rows at every width it lays out', () => {
    localStorage.setItem(
      COLUMN_WIDTHS_STORAGE_KEY,
      JSON.stringify({ v: 1, widths: { code: 400, duration: 400, totalFloat: 48 } }),
    );
    render(<Host />);
    expect(cellWidths()).toEqual(headerWidths());
  });

  it('lets the table grow into the chart once Activity is at its floor — the floor wins', () => {
    localStorage.setItem(
      COLUMN_WIDTHS_STORAGE_KEY,
      JSON.stringify({ v: 1, widths: { code: 400, earlyStart: 400, earlyFinish: 400 } }),
    );
    render(<Host />);
    const widths = headerWidths();
    // Activity is at its 120 floor and the block is the sum of its columns, which is wider than the
    // old 720 cap — never narrower than its own columns.
    expect(widths[1]).toBe(120);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(400 + 120 + 84 + 400 + 400 + 60);
    const separator = screen.getByRole('separator', { name: 'Grid width' });
    expect(Number(separator.getAttribute('aria-valuenow'))).toBe(widths.reduce((a, b) => a + b, 0));
    expect(Number(separator.getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(
      Number(separator.getAttribute('aria-valuemin')),
    );
  });
});
