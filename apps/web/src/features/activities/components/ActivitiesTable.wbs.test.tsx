import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { anActivity } from '@/test/activity-fixture';

/**
 * The activities table's read-only **WBS** column (ADR-0038, entry-route gap #7) with
 * `VITE_ADVANCED_ACTIVITY_TYPES` forced ON. It resolves each activity's `parentId` to the parent
 * WBS-summary's display string (code, else name) from the loaded activities — no extra fetch — and
 * shows an em dash for a top-level activity. Flag-off (no column) is the default the base suite covers.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_ACTIVITY_TYPES_ENABLED: true,
}));

const BASE: ActivitySummary = anActivity({
  planId: 'pl1',
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  accrualType: 'UNIFORM',
});

function renderTable(data: ActivitySummary[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        calendars={[]}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — WBS column (flag on)', () => {
  it('shows the parent summary’s code for a nested activity, and an em dash for a top-level one', () => {
    renderTable([
      { ...BASE, id: 'sum', code: 'WBS-1', name: 'Substructure', type: 'WBS_SUMMARY' },
      { ...BASE, id: 'child', code: 'A100', name: 'Excavate', parentId: 'sum' },
      { ...BASE, id: 'top', code: 'A200', name: 'Top level', parentId: null },
    ]);
    expect(screen.getByRole('columnheader', { name: 'WBS' })).toBeInTheDocument();
    // The nested activity names its parent by code.
    const childRow = screen.getByText('Excavate').closest('tr')!;
    expect(within(childRow).getByText('WBS-1')).toBeInTheDocument();
    // The top-level activity shows an em dash in the WBS column.
    const topRow = screen.getByText('Top level').closest('tr')!;
    expect(topRow).toHaveTextContent('—');
  });

  it('falls back to the parent summary’s name when it has no code', () => {
    renderTable([
      { ...BASE, id: 'sum', code: null, name: 'Substructure', type: 'WBS_SUMMARY' },
      { ...BASE, id: 'child', code: 'A100', name: 'Excavate', parentId: 'sum' },
    ]);
    const childRow = screen.getByText('Excavate').closest('tr')!;
    expect(within(childRow).getByText('Substructure')).toBeInTheDocument();
  });
});
