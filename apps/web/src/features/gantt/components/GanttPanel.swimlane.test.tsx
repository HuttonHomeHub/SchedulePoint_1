import type { ActivitySummary } from '@repo/types';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IDLE, type GanttGridEditing } from '../model/cell-edit';
import type { GanttCellGate } from '../model/cell-gate';
import type { GanttSwimlanes } from '../model/swimlane-cell';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type { SwimlaneAssignOutcome, SwimlaneAssignment } from '@/features/tsld';
import { SWIMLANES_FOLLOW_WBS_REASON } from '@/features/tsld';
import { anActivity } from '@/test/activity-fixture';

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
 * **The Gantt's Swimlane column** (swimlanes M4-T2): offered only when the plan has swimlanes, it reads
 * the swimlane's name (an em dash for none), moves one activity through the host's one assignment, and
 * is shut with its reason under the WBS source or without the pen. The real write and its undo step are
 * `useSwimlaneAssignment`'s own tests and the `swimlanes-elsewhere` journey; this asserts the cell.
 */

const OPEN: GanttCellGate = { writable: true, readable: true, readOnly: false, reason: null };
const NO_PEN: GanttCellGate = {
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

function editingBundle(gate: GanttCellGate = OPEN): GanttGridEditing {
  return {
    state: IDLE,
    hasComputedSchedule: true,
    gateFor: () => gate,
    begin: vi.fn(),
    change: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    errorMessage: null,
    onCellClosed: vi.fn(),
  };
}

function assignmentOf(
  over: {
    current?: string | null;
    assign?: SwimlaneAssignment['assign'];
  } = {},
): SwimlaneAssignment {
  return {
    shown: true,
    choices: [
      { id: 'z1', name: 'Zone A' },
      { id: 'z2', name: 'Zone B' },
      { id: null, name: 'No swimlane' },
    ],
    currentOf: () => over.current ?? null,
    assign:
      over.assign ??
      vi.fn(() => Promise.resolve<SwimlaneAssignOutcome>({ applied: true, conflict: null })),
  };
}

const manual = (assignment: SwimlaneAssignment): GanttSwimlanes => ({
  source: 'MANUAL',
  assignment,
});

function renderGrid(
  swimlanes: GanttSwimlanes | null | undefined,
  editing: GanttGridEditing | null = editingBundle(),
) {
  return render(
    <AnnouncerProvider>
      <GanttPanel activities={[activity()]} editing={editing ?? undefined} swimlanes={swimlanes} />
    </AnnouncerProvider>,
  );
}

function swimlaneCell(): HTMLElement {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((h) => (h.textContent ?? '').trim() === 'Swimlane');
  expect(index, 'no Swimlane column').toBeGreaterThanOrEqual(0);
  const row = screen.getAllByRole('row').find((r) => r.getAttribute('aria-rowindex') === '2')!;
  return within(row).getAllByRole('gridcell')[index]!;
}

describe('whether the column is offered', () => {
  it('is absent when the plan has no swimlanes to show', () => {
    renderGrid(null);
    expect(screen.queryByRole('columnheader', { name: 'Swimlane' })).toBeNull();
  });

  it('is absent when the host says nothing about swimlanes', () => {
    renderGrid(undefined);
    expect(screen.queryByRole('columnheader', { name: 'Swimlane' })).toBeNull();
  });

  it('is a plain, non-sortable header when the plan has swimlanes', () => {
    renderGrid(manual(assignmentOf()));
    const header = screen.getByRole('columnheader', { name: 'Swimlane' });
    expect(within(header).queryByRole('button')).toBeNull();
  });
});

describe('what the cell reads', () => {
  it('names the swimlane the activity is in', () => {
    renderGrid(manual(assignmentOf({ current: 'z2' })));
    expect(swimlaneCell()).toHaveTextContent('Zone B');
  });

  it('reads an em dash for none', () => {
    renderGrid(manual(assignmentOf()));
    expect(swimlaneCell()).toHaveTextContent('—');
  });

  it('is plain text, not a cell you could edit, without an editing bundle', () => {
    renderGrid(manual(assignmentOf({ current: 'z1' })), null);
    const cell = swimlaneCell();
    expect(cell).toHaveTextContent('Zone A');
    expect(cell).not.toHaveAttribute('aria-readonly');
    fireEvent.doubleClick(cell);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('moving one activity from the cell', () => {
  it('opens a list of the swimlanes on double-click, on the current one', () => {
    renderGrid(manual(assignmentOf({ current: 'z1' })));
    fireEvent.doubleClick(swimlaneCell());
    const list = within(swimlaneCell()).getByRole('combobox', { name: 'Swimlane, Foundations' });
    expect(list).toHaveValue('z1');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Zone A', 'Zone B', 'No swimlane']);
    expect(list).toHaveFocus();
  });

  it('writes one move through the assignment, then closes and hands focus back', async () => {
    const assign = vi.fn(() =>
      Promise.resolve<SwimlaneAssignOutcome>({ applied: true, conflict: null, moved: 1 }),
    );
    const editing = editingBundle();
    renderGrid(manual(assignmentOf({ assign })), editing);
    fireEvent.doubleClick(swimlaneCell());
    fireEvent.change(screen.getByRole('combobox', { name: 'Swimlane, Foundations' }), {
      target: { value: 'z2' },
    });

    expect(assign).toHaveBeenCalledExactlyOnceWith(['a1'], 'z2');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(editing.onCellClosed).toHaveBeenCalled();
  });

  it('files the activity under no swimlane with a null target', () => {
    const assign = vi.fn(() =>
      Promise.resolve<SwimlaneAssignOutcome>({ applied: true, conflict: null }),
    );
    renderGrid(manual(assignmentOf({ current: 'z1', assign })));
    fireEvent.doubleClick(swimlaneCell());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__none__' } });
    expect(assign).toHaveBeenCalledExactlyOnceWith(['a1'], null);
  });

  it('does not write when the pick is where the activity already is', () => {
    const assign = vi.fn(() =>
      Promise.resolve<SwimlaneAssignOutcome>({ applied: true, conflict: null }),
    );
    const editing = editingBundle();
    renderGrid(manual(assignmentOf({ current: 'z1', assign })), editing);
    fireEvent.doubleClick(swimlaneCell());
    const list = screen.getByRole('combobox');
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('treats a change that follows an arrow key as a draft until Enter commits it', () => {
    // Some browsers change a closed select on every arrow key; writing on each would be a string of
    // moves and undo steps for a keyboard user who is only looking.
    const assign = vi.fn(() =>
      Promise.resolve<SwimlaneAssignOutcome>({ applied: true, conflict: null }),
    );
    renderGrid(manual(assignmentOf({ assign })));
    fireEvent.doubleClick(swimlaneCell());
    const list = screen.getByRole('combobox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.change(list, { target: { value: 'z1' } });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.change(list, { target: { value: 'z2' } });
    expect(assign).not.toHaveBeenCalled();
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(assign).toHaveBeenCalledExactlyOnceWith(['a1'], 'z2');
  });

  it('cancels on Escape without writing', () => {
    const assign = vi.fn(() =>
      Promise.resolve<SwimlaneAssignOutcome>({ applied: true, conflict: null }),
    );
    const editing = editingBundle();
    renderGrid(manual(assignmentOf({ assign })), editing);
    fireEvent.doubleClick(swimlaneCell());
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(editing.onCellClosed).toHaveBeenCalled();
  });

  it('keeps the list open beside the refusal when the move is refused', async () => {
    const assign = vi.fn(() =>
      Promise.resolve<SwimlaneAssignOutcome>({
        applied: false,
        conflict: 'Someone else changed this activity.',
      }),
    );
    renderGrid(manual(assignmentOf({ assign })));
    fireEvent.doubleClick(swimlaneCell());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });

    await waitFor(() =>
      expect(swimlaneCell()).toHaveTextContent('Someone else changed this activity.'),
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the list open and says so when the write fails outright', async () => {
    const assign = vi.fn(() => Promise.reject(new Error('Network down')));
    renderGrid(manual(assignmentOf({ assign })));
    fireEvent.doubleClick(swimlaneCell());
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
      await Promise.resolve();
    });
    await waitFor(() => expect(swimlaneCell()).toHaveTextContent('Network down'));
  });
});

describe('when the cell is shut', () => {
  it('is read-only with the pen’s reason, and a double-click does not open it', () => {
    renderGrid(manual(assignmentOf({ current: 'z1' })), editingBundle(NO_PEN));
    const cell = swimlaneCell();
    expect(cell).toHaveAttribute('aria-readonly', 'true');
    expect(cell).not.toHaveAttribute('aria-disabled');
    expect(cell).toHaveTextContent('Zone A');
    expect(document.getElementById(cell.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Start editing to change this.',
    );
    fireEvent.doubleClick(cell);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('is read-only under the WBS source, with the rule as its reason, even for a writer', () => {
    renderGrid({ source: 'WBS' });
    const cell = swimlaneCell();
    expect(cell).toHaveTextContent('Follows the WBS');
    expect(cell).toHaveAttribute('aria-readonly', 'true');
    expect(document.getElementById(cell.getAttribute('aria-describedby')!)).toHaveTextContent(
      SWIMLANES_FOLLOW_WBS_REASON,
    );
    fireEvent.doubleClick(cell);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows the reason in the app’s own tip on a double-click, not hover alone', () => {
    renderGrid({ source: 'WBS' });
    fireEvent.doubleClick(swimlaneCell());
    expect(document.querySelector('[data-tooltip]')).toHaveTextContent(SWIMLANES_FOLLOW_WBS_REASON);
  });
});
