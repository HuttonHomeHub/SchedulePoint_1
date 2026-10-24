import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import type { ActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable, type ActivitiesTableSwimlanes } from './ActivitiesTable';

import type { SwimlaneAssignment } from '@/features/tsld/model/swimlane-assignment';

/**
 * The Swimlane column and the bulk-assign bar (swimlanes M4-T1). The write itself is the host's
 * `assignment.assign`, tested with its hook; this pins what only the table can get wrong — when the
 * column and the selection appear, what a cell says, the WBS source's read-only reason, and that the
 * bar hands the host the ticked rows.
 */
const ROWS: Partial<ActivitySummary>[] = [
  { id: 'a1', name: 'Excavate', type: 'TASK' },
  { id: 'a2', name: 'Blind', type: 'TASK' },
];
const SUMMARY: Partial<ActivitySummary> = {
  id: 'sum',
  name: 'Substructure',
  type: 'WBS_SUMMARY',
};

const MEMBERS: Record<string, string | null> = { a1: 's1', a2: null };

function manual(assign = vi.fn()): ActivitiesTableSwimlanes {
  assign.mockResolvedValue({ applied: true, conflict: null, moved: 2 });
  const assignment: SwimlaneAssignment = {
    shown: true,
    choices: [
      { id: 's1', name: 'Civil' },
      { id: null, name: 'No swimlane' },
    ],
    currentOf: (id) => MEMBERS[id] ?? null,
    assign,
  };
  return { source: 'MANUAL', assignment };
}

function renderTable(
  swimlanes: ActivitiesTableSwimlanes | null | undefined,
  canEdit = true,
  rows: Partial<ActivitySummary>[] = ROWS,
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    activityKeys.listByPlan('acme', 'pl1'),
    rows.map((r) => ({ parentId: null, ...r })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={canEdit}
        calendars={[]}
        {...(swimlanes === undefined ? {} : { swimlanes })}
      />
    </QueryClientProvider>,
  );
}

const rowOf = (name: string): HTMLElement => screen.getByText(name).closest('tr') as HTMLElement;

describe('ActivitiesTable — Swimlane column', () => {
  it('is absent, and so is the selection column, when the host offers no swimlanes', () => {
    renderTable(undefined);
    expect(screen.queryByRole('columnheader', { name: 'Swimlane' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select all activities' })).toBeNull();
  });

  it('is absent when the host passes null, as for a hand-made plan with no swimlanes yet', () => {
    renderTable(null);
    expect(screen.queryByRole('columnheader', { name: 'Swimlane' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select all activities' })).toBeNull();
  });

  it('names each activity’s swimlane, and an em dash for one that is in none', () => {
    renderTable(manual());
    expect(screen.getByRole('columnheader', { name: 'Swimlane' })).toBeInTheDocument();
    expect(within(rowOf('Excavate')).getByText('Civil')).toBeInTheDocument();
    // The same cell position in the other row: the Swimlane column.
    const civilCell = within(rowOf('Excavate')).getByText('Civil').closest('td') as HTMLElement;
    const position = Array.from(rowOf('Excavate').children).indexOf(civilCell);
    expect(rowOf('Blind').children[position]).toHaveTextContent('—');
    expect(within(rowOf('Blind')).queryByText('No swimlane')).toBeNull();
  });

  it('is read-only with its reason under the WBS source, and offers no selection', () => {
    renderTable({ source: 'WBS' });
    expect(screen.getByRole('columnheader', { name: 'Swimlane' })).toBeInTheDocument();
    const cell = within(rowOf('Excavate')).getByText('Follows the WBS');
    expect(cell).not.toHaveAttribute('title');
    // The full reason is stated once, visibly, not on every row.
    expect(screen.getAllByText('Swimlanes follow the WBS in this plan.')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: 'Select all activities' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
  });
});

describe('ActivitiesTable — bulk assign to a swimlane', () => {
  it('shows no bar until something is ticked, then moves the ticked rows through the host', async () => {
    const assign = vi.fn();
    renderTable(manual(assign));
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Blind' }));
    expect(screen.getByText('2 activities selected')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Move to swimlane' }), {
      target: { value: 's1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(['a1', 'a2'], 's1'));
    // The move landed, so the selection is cleared and the bar goes with it.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move' })).toBeNull());
  });

  it('gives a summary no checkbox, and shares the WBS bar’s count and Clear when both apply', () => {
    renderTable(manual(), true, [...ROWS, SUMMARY]);
    expect(screen.queryByRole('checkbox', { name: 'Select Substructure' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    // One container, one count, one Clear and one live region for both rows.
    expect(screen.getAllByText(/1 activity selected/)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Clear selection' })).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    const swimlaneRow = screen.getByRole('group', { name: 'Swimlane' });
    const assign = screen.getByRole('button', { name: 'Assign' });
    expect(swimlaneRow).toContainElement(screen.getByRole('button', { name: 'Move' }));
    expect(swimlaneRow.parentElement).toContainElement(assign);
  });

  it('shades Move with aria-disabled and says why when the reader may not write', () => {
    renderTable(manual(), false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    const button = screen.getByRole('button', { name: 'Move' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(screen.getByText('You can’t change swimlanes here.')).toBeInTheDocument();
  });

  it('reuses the editor’s General gate for the swimlane write, by its reason', () => {
    const gating = {
      general: { writable: false, reason: 'Start editing to change this plan.' },
      members: { writable: true, reason: null },
    } as unknown as ActivityEditorGating;
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      activityKeys.listByPlan('acme', 'pl1'),
      ROWS.map((r) => ({ parentId: null, ...r })),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule
          editorGating={gating}
          calendars={[]}
          swimlanes={manual()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(screen.getByText('Start editing to change this plan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('clears the selection from the bar', () => {
    renderTable(manual());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Excavate' })).not.toBeChecked();
  });
});
