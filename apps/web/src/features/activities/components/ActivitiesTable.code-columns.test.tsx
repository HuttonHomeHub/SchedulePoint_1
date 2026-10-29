import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import type { CodeColumn } from '@/lib/code-columns';
import { anActivity } from '@/test/activity-fixture';

/**
 * **Code columns in the Activities table** (P6 activity codes, M3-T2): one column per shown type after
 * WBS, a cell that reads a value's name, an em dash for none, and — while the type's values load or
 * when they could not — a word rather than an id, with one sentence above the table for a failure.
 */

const ACTIVITIES: ActivitySummary[] = [
  anActivity({ id: 'a1', code: 'CD_1', name: 'Pour slab' }),
  anActivity({ id: 'a2', code: 'CD_7', name: 'Handover' }),
];

const area = (over: Partial<CodeColumn> = {}): CodeColumn => ({
  key: 'area',
  label: 'Area',
  status: 'ready',
  text: (activity) => (activity.id === 'a1' ? 'Ground floor' : '—'),
  ...over,
});

function renderTable(codeColumns: readonly CodeColumn[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), ACTIVITIES);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        calendars={[]}
        onOpenEditor={() => {}}
        codeColumns={codeColumns}
      />
    </QueryClientProvider>,
  );
}

const cellOf = (rowName: string, header: string): HTMLElement => {
  const row = screen.getByText(rowName).closest('tr') as HTMLElement;
  const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
  return within(row).getAllByRole('cell')[headers.indexOf(header)] as HTMLElement;
};

describe('ActivitiesTable — code columns', () => {
  it('draws no column and no sentence when none is shown', () => {
    renderTable([]);
    expect(screen.queryByRole('columnheader', { name: 'Area' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('heads the column with the type’s name and reads the value’s name, or an em dash', () => {
    renderTable([area()]);
    expect(screen.getByRole('columnheader', { name: 'Area' })).toBeInTheDocument();
    expect(cellOf('Pour slab', 'Area')).toHaveTextContent('Ground floor');
    expect(cellOf('Handover', 'Area')).toHaveTextContent('—');
  });

  it('puts the code columns after WBS and before the engine’s dates', () => {
    renderTable([area()]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.indexOf('Area')).toBeGreaterThan(-1);
    expect(headers.indexOf('Area')).toBeLessThan(headers.indexOf('Early start'));
  });

  it('keeps the shown types in the order the host gave them', () => {
    renderTable([area(), area({ key: 'trade', label: 'Trade', text: () => 'Finishes' })]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.indexOf('Area')).toBeLessThan(headers.indexOf('Trade'));
  });

  it('is hidden below lg like the other definition-detail columns', () => {
    renderTable([area()]);
    expect(screen.getByRole('columnheader', { name: 'Area' })).toHaveClass(
      'hidden',
      'lg:table-cell',
    );
    expect(cellOf('Pour slab', 'Area')).toHaveClass('hidden', 'lg:table-cell');
  });

  it('reads Loading… in muted italic while a type’s values load, never an id', () => {
    renderTable([area({ status: 'loading' })]);
    const cell = cellOf('Pour slab', 'Area');
    expect(cell).toHaveTextContent('Loading…');
    expect(cell.querySelector('span')).toHaveClass('italic');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reads Unavailable, with ONE sentence above the table rather than one per cell', () => {
    renderTable([area({ status: 'error' })]);
    expect(cellOf('Pour slab', 'Area')).toHaveTextContent('Unavailable');
    expect(cellOf('Handover', 'Area')).toHaveTextContent('Unavailable');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Area’s values could not be loaded.');
  });
});
