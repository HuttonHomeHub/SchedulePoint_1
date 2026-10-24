import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * A hand-made swimlane plan with `VITE_WBS_IMPROVEMENTS` off (swimlanes M4-T1): the selection column
 * and the swimlane bar stand on their own, and the WBS assign bar does not appear even though the plan
 * holds a summary.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: false,
}));

describe('ActivitiesTable — swimlanes with the WBS flag off', () => {
  it('shows the swimlane bar and no WBS bar', () => {
    const queryClient = new QueryClient();
    const rows: Partial<ActivitySummary>[] = [
      { id: 'a1', name: 'Excavate', type: 'TASK' },
      { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' },
    ];
    queryClient.setQueryData(
      activityKeys.listByPlan('acme', 'pl1'),
      rows.map((r) => ({ parentId: null, ...r })),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule
          calendars={[]}
          swimlanes={{
            source: 'MANUAL',
            assignment: {
              shown: true,
              choices: [{ id: null, name: 'No swimlane' }],
              currentOf: () => null,
              assign: vi.fn(),
            },
          }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByText('1 activity selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });
});
