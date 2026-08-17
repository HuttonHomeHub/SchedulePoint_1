import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IDLE, reduceCellEdit, type GanttGridEditing } from '../model/cell-edit';
import type { GanttCellGate } from '../model/cell-gate';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * jsdom has no layout, so the real virtualizer measures a zero-height scroller and renders no rows
 * at all. Stubbed to a pass-through exactly as `GanttPanel.test.tsx` does — that virtualization
 * really windows is a browser property and belongs to the journey, not here.
 */
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

/**
 * **M2 — the grid with editing wired in.**
 *
 * The point of the `editing` prop being **optional** is that its absence is the read-only grid,
 * byte-for-byte; `GanttPanel.test.tsx` asserts that path and passed unchanged through this work.
 * This file asserts the other one.
 *
 * What it deliberately does not do is prove a write. `commitCell`'s status branches are unit tests
 * against an injected mutation, and the real write is `e2e-gantt-editing/grid-edit.spec.ts` — a
 * mocked fetch accepts any `version`, so only a real server can show the optimistic check is armed.
 * Asserting a "save" here would be asserting the mock.
 */

const OPEN: GanttCellGate = { writable: true, readable: true, readOnly: false, reason: null };
const SHUT: GanttCellGate = {
  writable: false,
  readable: true,
  readOnly: true,
  reason: 'Start editing to change this.',
};

const activity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  anActivity({
    id: 'a1',
    code: 'A1',
    name: 'Foundations',
    durationDays: 5,
    durationMinutes: 2400,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    totalFloat: 0,
    ...over,
  });

function editingBundle(over: Partial<GanttGridEditing> = {}): GanttGridEditing {
  return {
    state: IDLE,
    hasComputedSchedule: true,
    gateFor: () => OPEN,
    begin: vi.fn(),
    change: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    errorMessage: null,
    ...over,
  };
}

const renderGrid = (editing: GanttGridEditing | undefined, activities = [activity()]) =>
  render(<GanttPanel activities={activities} editing={editing} />);

/** The cell under a given column header, on the first activity row. */
function cellUnder(label: string): HTMLElement {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((h) => (h.textContent ?? '').trim().startsWith(label));
  expect(index, `no column headed ${label}`).toBeGreaterThanOrEqual(0);
  const row = screen.getAllByRole('row').find((r) => r.getAttribute('aria-rowindex') === '2');
  expect(row, 'no first activity row').toBeDefined();
  const cells = within(row!).getAllByRole('gridcell');
  return cells[index]!;
}

describe('with no editing bundle', () => {
  it('renders no editable cell at all — the read-only grid, unchanged', () => {
    renderGrid(undefined);
    // Nothing is aria-readonly, because nothing claims to be a cell you could otherwise type into.
    expect(document.querySelector('[aria-readonly]')).toBeNull();
    fireEvent.doubleClick(cellUnder('Activity'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('with editing wired in', () => {
  it('opens the cell on double-click, seeded from what the row reads', () => {
    const begin = vi.fn();
    renderGrid(editingBundle({ begin }));

    fireEvent.doubleClick(cellUnder('Duration'));
    // Seeded from the RENDERED text, not re-derived — so the planner edits the value they can see,
    // including its unit. Re-deriving would be a second answer to "how long is this?".
    expect(begin).toHaveBeenCalledWith({ activityId: 'a1', key: 'duration' }, '5 d');
  });

  it('shows the field only in the open cell, and the other cells stay text', () => {
    const state = reduceCellEdit(IDLE, {
      type: 'begin',
      target: { activityId: 'a1', key: 'duration' },
      seed: '5 d',
    });
    renderGrid(editingBundle({ state }));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(within(cellUnder('Duration')).getByRole('textbox')).toBeInTheDocument();
    expect(within(cellUnder('Activity')).queryByRole('textbox')).toBeNull();
  });

  it('shades a shut cell read-only with its reason, and leaves the value readable', () => {
    renderGrid(editingBundle({ gateFor: () => SHUT }));
    const cell = cellUnder('Duration');

    expect(cell).toHaveAttribute('aria-readonly', 'true');
    expect(cell).not.toHaveAttribute('aria-disabled');
    // The whole ADR-0083 point: the reader still gets the number.
    expect(cell).toHaveTextContent('5 d');
    const describedBy = cell.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Start editing to change this.',
    );
  });

  it('keeps the summary emphasis and the off-path marker inside the editable name cell', () => {
    // Both used to live in the plain cell branch. An editable cell that dropped them would look
    // right and lose a WCAG 1.4.1 text equivalent — the exact half-applied-pattern shape this
    // register keeps recording.
    renderGrid(editingBundle(), [activity({ type: 'WBS_SUMMARY', name: 'Substructure' })]);
    expect(cellUnder('Activity')).toHaveTextContent('Substructure');
    expect(cellUnder('Activity').querySelector('.font-semibold')).not.toBeNull();
  });

  it('leaves the non-editable columns as plain cells', () => {
    // `code` and `totalFloat` are engine output or identity nobody types here. They must not become
    // read-only-looking cells, because that would promise an editing capability that does not exist.
    renderGrid(editingBundle({ gateFor: () => SHUT }));
    expect(cellUnder('Code')).not.toHaveAttribute('aria-readonly');
    expect(cellUnder('Float')).not.toHaveAttribute('aria-readonly');
  });
});
