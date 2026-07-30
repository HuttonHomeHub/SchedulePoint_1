import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The **rollback contract** for the WBS improvements epic on this surface: with
 * `VITE_WBS_IMPROVEMENTS` off, the row menu is exactly what it was — no Dissolve, no Members — and
 * the delete confirmation still carries its subtree warning, because that one shipped **unflagged**
 * (M0-T4) and must survive a rollback of everything around it.
 *
 * Pinned by mocking the flag off rather than relying on its default, so the day the flag flips
 * default-on this suite still describes the flag-off surface instead of silently becoming a
 * duplicate of the flag-on one.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: false,
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

const ROWS = [
  { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' as const },
  { id: 'c1', name: 'Excavate', parentId: 'sum' },
];

describe('ActivitiesTable — VITE_WBS_IMPROVEMENTS off (parity)', () => {
  it('offers no Dissolve and no Members on a summary', () => {
    renderTable(ROWS);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Substructure' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Dissolve' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Members' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  // M4b. The selection column is the most structural thing the epic adds to this surface — it
  // shifts every other column one to the right — so a rollback that left it behind would be
  // visible on the first screenshot and invisible to every test that queries by role.
  it('adds no selection column and no bulk-assign bar', () => {
    renderTable(ROWS);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Assign to')).not.toBeInTheDocument();
  });

  // M0-T4 is deliberately unflagged: an honest delete warning is a bug fix, not a feature, so it
  // must not disappear with the flag it happens to have been built alongside.
  it('keeps the unflagged subtree warning on delete', () => {
    renderTable(ROWS);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Substructure' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText(/the 1 activity below it/)).toBeInTheDocument();
  });
});
