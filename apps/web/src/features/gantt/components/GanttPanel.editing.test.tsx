import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IDLE, reduceCellEdit, type GanttGridEditing } from '../model/cell-edit';
import { ganttCellGate, type GanttCellGate } from '../model/cell-gate';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
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

describe('on a plan that has not been calculated', () => {
  const unscheduled = () => activity({ earlyStart: null, earlyFinish: null, totalFloat: null });

  it('renders the grid, so the cells are reachable at all', () => {
    // The branch returned a sentence and NO grid until M2-T4, which made every cell unreachable on
    // precisely the plan a planner is most likely to be typing into: a fresh one, before the first
    // recalculation.
    renderGrid(editingBundle({ hasComputedSchedule: false }), [unscheduled()]);
    expect(screen.getByRole('treegrid')).toBeInTheDocument();
  });

  it('still says the plan has not been calculated', () => {
    // Showing the grid is the fix for "unreachable". It is not a reason to stop explaining why the
    // chart column is empty — and the explanation is a live region, so it is not sight-only.
    renderGrid(editingBundle({ hasComputedSchedule: false }), [unscheduled()]);
    expect(screen.getByRole('status')).toHaveTextContent('This plan has not been calculated');
  });

  it('keeps name and duration writable there — the half most likely to regress', () => {
    // Asserted through the REAL gate rather than a stub, because this is the decision itself: a
    // duration is an input, not a rollup, so it does not depend on a computed schedule the way a
    // date does. The first draft made it read-only and the ux re-review corrected it.
    renderGrid(
      {
        ...editingBundle({ hasComputedSchedule: false }),
        gateFor: (key) =>
          ganttCellGate({
            key,
            activity: { type: 'TASK' },
            gating: deriveActivityEditorGating({
              penManaged: true,
              holdsPen: true,
              canWrite: true,
              canProgress: true,
              canReadCost: true,
            }),
            hasComputedSchedule: false,
          }),
      },
      [unscheduled()],
    );

    expect(cellUnder('Activity')).not.toHaveAttribute('aria-readonly');
    expect(cellUnder('Duration')).not.toHaveAttribute('aria-readonly');
    // And the dates are shut with an action, not a report of unavailability.
    const start = cellUnder('Start');
    expect(start).toHaveAttribute('aria-readonly', 'true');
    expect(document.getElementById(start.getAttribute('aria-describedby')!)).toHaveTextContent(
      /Recalculate/i,
    );
  });
});

describe('keyboard entry into a cell', () => {
  const grid = () => screen.getByRole('treegrid');

  it('opens the first writable cell on F2', () => {
    const begin = vi.fn();
    renderGrid(editingBundle({ begin }));

    fireEvent.keyDown(grid(), { key: 'F2' });
    // The Activity column is the first editable one, so that is where F2 lands. Seeded from the
    // rendered text like the pointer path — one seed, not two.
    expect(begin).toHaveBeenCalledWith({ activityId: 'a1', key: 'name' }, 'Foundations');
  });

  it('skips a cell the gate has shut and opens the next writable one', () => {
    // Otherwise F2 would appear to do nothing on a row whose first editable column happens to be
    // read-only — a dead key, which is the lit-but-inert shape one keystroke along.
    const begin = vi.fn();
    renderGrid(
      editingBundle({
        begin,
        gateFor: (key) => (key === 'name' ? SHUT : OPEN),
      }),
    );

    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(begin).toHaveBeenCalledWith({ activityId: 'a1', key: 'duration' }, '5 d');
  });

  it('does nothing on F2 when every editable cell is shut', () => {
    const begin = vi.fn();
    renderGrid(editingBundle({ begin, gateFor: () => SHUT }));
    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(begin).not.toHaveBeenCalled();
  });

  it('does nothing on F2 with no editing bundle at all', () => {
    renderGrid(undefined);
    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('returns to row mode on Escape', () => {
    const cancel = vi.fn();
    const state = reduceCellEdit(IDLE, {
      type: 'begin',
      target: { activityId: 'a1', key: 'duration' },
      seed: '5 d',
    });
    renderGrid(editingBundle({ state, cancel }));

    fireEvent.keyDown(grid(), { key: 'Escape' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape alone when no cell is open, so the rung below still gets it', () => {
    // Escape is a ladder (ADR-0064/ADR-0080): the cell, then the grid, then whatever the workspace
    // does with it. Swallowing it here unconditionally would take a rung away from a planner who
    // has no cell open at all.
    const cancel = vi.fn();
    renderGrid(editingBundle({ cancel }));
    fireEvent.keyDown(grid(), { key: 'Escape' });
    expect(cancel).not.toHaveBeenCalled();
  });
});
