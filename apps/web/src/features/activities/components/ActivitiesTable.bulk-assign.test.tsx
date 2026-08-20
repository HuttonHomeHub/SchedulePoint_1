import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The table's **multi-select** (WBS improvements M4b), with `VITE_WBS_IMPROVEMENTS` forced on.
 *
 * The bar itself is unit-tested next to its own model; this suite pins the things only the table
 * can get wrong — which rows offer a checkbox, when the column appears at all, and the tri-state
 * select-all. The last is the quiet one: `indeterminate` is a DOM property with no attribute, so
 * "some selected" rendered as unchecked would tell a screen-reader user their selection was gone.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

const BASE: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

function renderTable(rows: Partial<ActivitySummary>[], canEditSchedule = true) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    activityKeys.listByPlan('acme', 'pl1'),
    rows.map((r) => ({ ...BASE, ...r })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={canEditSchedule}
        calendars={[]}
      />
    </QueryClientProvider>,
  );
}

const WITH_SUMMARY = [
  { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' as const },
  { id: 'c1', name: 'Excavate' },
  { id: 'c2', name: 'Blind' },
];

const selectAll = () => screen.getByRole('checkbox', { name: 'Select all activities' });

describe('ActivitiesTable — bulk assign selection (flag on)', () => {
  it('offers a checkbox on every activity but the summaries', () => {
    renderTable(WITH_SUMMARY);
    expect(screen.getByRole('checkbox', { name: 'Select Excavate' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Blind' })).toBeInTheDocument();
    // Nesting a summary is the Breakdown picker's job (spec C-1b) — there is no box at all here,
    // rather than a shaded one implying a permission problem.
    expect(screen.queryByRole('checkbox', { name: 'Select Substructure' })).not.toBeInTheDocument();
  });

  /**
   * With nothing to file things under, "Assign to" could offer only the top level — a column of
   * checkboxes leading to a control that cannot change anything. Same rule as the derived Gantt
   * bucket, and it leaves a WBS-less plan's table exactly as it is today.
   */
  it('does not add the column to a plan with no summaries', () => {
    renderTable([{ id: 'c1', name: 'Excavate' }]);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the bar only once something is selected', () => {
    renderTable(WITH_SUMMARY);
    expect(screen.queryByLabelText('Assign to')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(screen.getByLabelText('Assign to')).toBeInTheDocument();
  });

  it('select-all takes every selectable row and none of the summaries', () => {
    renderTable(WITH_SUMMARY);
    fireEvent.click(selectAll());
    expect(screen.getByRole('checkbox', { name: 'Select Excavate' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Blind' })).toBeChecked();
    expect(screen.getByRole('status').textContent).toContain('2 activities selected');
  });

  it('renders the select-all as indeterminate while the selection is partial', () => {
    renderTable(WITH_SUMMARY);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    const all = selectAll() as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Blind' }));
    expect((selectAll() as HTMLInputElement).indeterminate).toBe(false);
    expect(selectAll()).toBeChecked();
  });

  it('un-ticking select-all empties the selection and hides the bar', () => {
    renderTable(WITH_SUMMARY);
    fireEvent.click(selectAll());
    fireEvent.click(selectAll());
    expect(screen.queryByLabelText('Assign to')).not.toBeInTheDocument();
  });

  /**
   * Selecting is a **read**, so it is not gated on the write right — and it must not be, because
   * the bar it opens is the only place that says why the write is shut. Disabling the boxes would
   * leave a reader with a column of dead controls and the explanation locked behind them: the dead
   * end this epic keeps finding, inverted.
   */
  it('lets a reader select, and shades the write instead', () => {
    renderTable(WITH_SUMMARY, false);
    const box = screen.getByRole('checkbox', { name: 'Select Excavate' });
    expect(box).toBeEnabled();

    fireEvent.click(box);
    // Inert via `aria-disabled` (the house convention — a natively disabled button blurs to
    // `<body>` when it flips), so the reason stays reachable in the tab order.
    expect(screen.getByRole('button', { name: 'Assign' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Assign to')).toBeDisabled();
  });
});
