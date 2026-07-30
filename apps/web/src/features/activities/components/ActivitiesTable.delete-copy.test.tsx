import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The delete confirmation must warn that deleting a `WBS_SUMMARY` takes its whole subtree with it
 * (ADR-0038). The copy itself is unit-tested in `lib/delete-activity-copy.test.ts`; this asserts
 * this call site actually reaches it, because the same dialog is raised from a second place
 * (`activity-crud-dialogs`) and a warning on only one of them is the defect all over again.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // The tabbed editor owns Edit; Delete stays a plain confirm either way. Pinned so a flag flip
  // elsewhere cannot quietly change which dialog this test is looking at.
  ACTIVITY_EDITOR_TABS_ENABLED: false,
}));

const BASE: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

function renderTable(rows: Partial<ActivitySummary>[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    activityKeys.listByPlan('acme', 'pl1'),
    rows.map((r) => ({ ...BASE, ...r })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable orgSlug="acme" planId="pl1" canEditSchedule calendars={[]} />
    </QueryClientProvider>,
  );
}

/** Open a row's overflow menu and choose Delete. */
function openDeleteFor(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete' }));
}

describe('ActivitiesTable — delete confirmation copy', () => {
  it('warns that a summary takes its subtree, with the count', () => {
    renderTable([
      { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' },
      { id: 'c1', name: 'Excavate', parentId: 'sum' },
      { id: 'c2', name: 'Blind', parentId: 'sum' },
    ]);
    openDeleteFor('Substructure');
    expect(screen.getByText(/2 activities below it/)).toBeInTheDocument();
  });

  it('leaves a plain activity’s copy unchanged', () => {
    renderTable([{ id: 'c1', name: 'Excavate' }]);
    openDeleteFor('Excavate');
    expect(screen.getByText('Delete “Excavate”? You can restore it later.')).toBeInTheDocument();
  });
});
