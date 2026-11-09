import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { anActivity } from '@/test/activity-fixture';

/**
 * The activities table's "External" badge (ADR-0043 M1).
 * An engine-flagged `externalDriven` activity — one whose schedule this recalculation was gated by an
 * imported date from another project — surfaces a neutral informational pill in the Name cell,
 * mirroring the "Conflict" badge test.
 */

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
      <ActivitiesTable onOpenEditor={() => {}} orgSlug="acme" planId="pl1" canEditSchedule />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — external-driven badge (flag on)', () => {
  it('shows an External badge on an externally-driven activity, and none on an unaffected one', () => {
    renderTable([
      { ...BASE, id: 'a1', name: 'Imported', externalDriven: true },
      { ...BASE, id: 'a2', name: 'Local', externalDriven: false },
    ]);
    const imported = screen.getByText('Imported').closest('tr')!;
    expect(within(imported).getByText('External')).toBeInTheDocument();

    const local = screen.getByText('Local').closest('tr')!;
    expect(within(local).queryByText('External')).not.toBeInTheDocument();
  });
});
