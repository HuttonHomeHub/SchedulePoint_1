import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  describe('header edges (ADR-0173 M2)', () => {
    let frames: FrameRequestCallback[] = [];
    beforeEach(() => {
      frames = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
      HTMLElement.prototype.setPointerCapture = vi.fn();
      HTMLElement.prototype.releasePointerCapture = vi.fn();
      HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    });
    afterEach(() => vi.unstubAllGlobals());

    const edges = (): HTMLElement[] => [
      ...document.querySelectorAll<HTMLElement>('[data-gantt-column-edge]'),
    ];
    const edgeOf = (label: string): HTMLElement =>
      screen
        .getByRole('columnheader', { name: label })
        .querySelector<HTMLElement>('[data-gantt-column-edge]')!;

    it('puts an edge on each resizable column and on Activity — and none without a host', () => {
      const bare = render(<GanttPanel activities={ACTIVITIES} />);
      expect(edges()).toHaveLength(0);
      bare.unmount();
      render(<Host />);
      // Code, Activity, Duration, Start, Finish, Float.
      expect(edges()).toHaveLength(6);
      expect(screen.queryAllByRole('separator', { name: /width/i })).toHaveLength(1);
    });

    it('is hidden from assistive technology, unfocusable, and withheld under a coarse pointer', () => {
      render(<Host />);
      for (const edge of edges()) {
        expect(edge).toHaveAttribute('aria-hidden', 'true');
        expect(edge).not.toHaveAttribute('tabindex');
        expect(edge.className).toContain('pointer-coarse:hidden');
        expect(edge.className).toContain('touch-none');
      }
      // The header's accessible names are exactly what they were.
      expect(screen.getByRole('columnheader', { name: 'Code' })).toBeInTheDocument();
    });

    it('drags Code 60 wider: Activity gives it up, the pane stays, and one write follows the release', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      render(<Host />);
      const edge = edgeOf('Code');
      fireEvent.pointerDown(edge, { pointerId: 1, clientX: 100 });
      for (let dx = 2; dx <= 60; dx += 2) {
        fireEvent.pointerMove(edge, { pointerId: 1, clientX: 100 + dx });
        act(() => frames.splice(0).forEach((cb) => cb(0)));
      }
      expect(headerWidths()).toEqual([140, 120, 84, 90, 90, 60]);
      expect(headerWidths().reduce((a, b) => a + b, 0)).toBe(584);
      expect(setItem.mock.calls.filter(([k]) => k === COLUMN_WIDTHS_STORAGE_KEY)).toHaveLength(0);
      fireEvent.pointerUp(edge, { pointerId: 1, clientX: 160 });
      expect(setItem.mock.calls.filter(([k]) => k === COLUMN_WIDTHS_STORAGE_KEY)).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) ?? 'null')).toEqual({
        v: 1,
        widths: { code: 140 },
      });
    });

    it('never sorts: a drag leaves every aria-sort as it was', () => {
      render(<Host />);
      const before = screen.getAllByRole('columnheader').map((h) => h.getAttribute('aria-sort'));
      const edge = edgeOf('Code');
      fireEvent.pointerDown(edge, { pointerId: 1, clientX: 10 });
      fireEvent.pointerMove(edge, { pointerId: 1, clientX: 50 });
      fireEvent.pointerUp(edge, { pointerId: 1, clientX: 50 });
      fireEvent.click(edge);
      expect(screen.getAllByRole('columnheader').map((h) => h.getAttribute('aria-sort'))).toEqual(
        before,
      );
    });

    it('double-clicking an edge returns that column to its standard width', () => {
      localStorage.setItem(
        COLUMN_WIDTHS_STORAGE_KEY,
        JSON.stringify({ v: 1, widths: { code: 160 } }),
      );
      render(<Host />);
      expect(headerWidths()[0]).toBe(160);
      fireEvent.doubleClick(edgeOf('Code'));
      expect(headerWidths()[0]).toBe(80);
    });

    it("Activity's edge is the table width: the separator follows it", () => {
      render(<Host />);
      const edge = edgeOf('Activity');
      fireEvent.pointerDown(edge, { pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(edge, { pointerId: 1, clientX: 40 });
      fireEvent.pointerUp(edge, { pointerId: 1, clientX: 40 });
      expect(screen.getByRole('separator', { name: 'Grid width' })).toHaveAttribute(
        'aria-valuenow',
        '624',
      );
      expect(headerWidths()[1]).toBe(220);
      fireEvent.doubleClick(edge);
      expect(screen.getByRole('separator', { name: 'Grid width' })).toHaveAttribute(
        'aria-valuenow',
        '584',
      );
    });
  });
});
