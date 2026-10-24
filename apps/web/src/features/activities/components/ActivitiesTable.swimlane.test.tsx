import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

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

  it('names each activity’s swimlane, and "No swimlane" for one that is in none', () => {
    renderTable(manual());
    expect(screen.getByRole('columnheader', { name: 'Swimlane' })).toBeInTheDocument();
    expect(within(rowOf('Excavate')).getByText('Civil')).toBeInTheDocument();
    expect(within(rowOf('Blind')).getByText('No swimlane')).toBeInTheDocument();
  });

  it('is read-only with its reason under the WBS source, and offers no selection', () => {
    renderTable({ source: 'WBS' });
    expect(screen.getByRole('columnheader', { name: 'Swimlane' })).toBeInTheDocument();
    const cell = within(rowOf('Excavate')).getByText('Follows the WBS');
    expect(cell).toHaveAttribute('title', 'Swimlanes follow the WBS in this plan.');
    expect(cell).toHaveTextContent('Swimlanes follow the WBS in this plan.');
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
    // Two bars over one selection, one count and one Clear between them.
    expect(screen.getAllByText('1 activity selected')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Clear selection' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
  });

  it('shades Move with aria-disabled and says why when the reader may not write', () => {
    renderTable(manual(), false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    const button = screen.getByRole('button', { name: 'Move' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(screen.getByText('You can’t change swimlanes here.')).toBeInTheDocument();
  });

  it('clears the selection from the bar', () => {
    renderTable(manual());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Excavate' })).not.toBeChecked();
  });
});
