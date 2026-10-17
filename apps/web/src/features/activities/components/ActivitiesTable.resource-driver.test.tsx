import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { anActivity } from '@/test/activity-fixture';

/**
 * The activities table's "Needs a driver" badge (ADR-0035 §23) with `VITE_ADVANCED_ACTIVITY_TYPES`
 * forced ON — the same shape as the "Conflict" and "External" badge suites.
 *
 * **Why this test exists at all.** The engine has flagged `resourceDriverMissing` since M7.2, the API
 * has returned it, the database has stored it — and nothing rendered it. A resource-dependent
 * activity with no driving assignment scheduled on the wrong calendar and looked entirely normal.
 * Every layer was tested; the one that was missing had no test to fail. The badge is the fix, so the
 * badge is what gets pinned.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_ACTIVITY_TYPES_ENABLED: true,
}));

const BASE: ActivitySummary = anActivity({
  planId: 'pl1',
  type: 'RESOURCE_DEPENDENT',
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

describe('ActivitiesTable — resource-driver badge (flag on)', () => {
  it('badges a resource-dependent activity with no driving assignment, and leaves a driven one clean', () => {
    renderTable([
      { ...BASE, id: 'a1', name: 'Undriven', resourceDriverMissing: true },
      { ...BASE, id: 'a2', name: 'Driven', resourceDriverMissing: false },
    ]);

    const undriven = screen.getByText('Undriven').closest('tr')!;
    expect(within(undriven).getByText('Needs a driver')).toBeInTheDocument();

    const driven = screen.getByText('Driven').closest('tr')!;
    expect(within(driven).queryByText('Needs a driver')).not.toBeInTheDocument();
  });

  it('spells the consequence out for a screen reader, not just the label', () => {
    renderTable([{ ...BASE, id: 'a1', name: 'Undriven', resourceDriverMissing: true }]);

    // The visible word alone says something is wrong but not what it did to the dates. The
    // sr-only clause carries the meaning that matters: the activity WAS scheduled, on the wrong
    // calendar (produce-and-flag, ADR-0035) — it was not skipped or left blank.
    const badge = screen.getByText('Needs a driver').closest('span')!;
    expect(badge).toHaveTextContent(/scheduled on the plan’s calendar instead of the resource’s/);
    expect(badge).toHaveTextContent(/Assign a resource and mark it driving, then recalculate\./);
  });
});
