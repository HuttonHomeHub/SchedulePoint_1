import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { anActivity } from '@/test/activity-fixture';

/**
 * The activities table's "Conflict" badge (M4, ADR-0035 §7) with `VITE_ADVANCED_CONSTRAINTS` forced
 * ON. An engine-flagged `constraintViolated` activity — a mandatory pin that broke logic, produced
 * and flagged rather than repaired — surfaces a critical pill in the Constraint cell. The badge text
 * carries the meaning (never colour alone, WCAG 1.4.1). Flag-off (no badge) is the default the other
 * table suites exercise.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: true,
}));

const BASE: ActivitySummary = anActivity({
  planId: 'pl1',
  constraintType: 'MANDATORY_START',
  constraintDate: '2026-05-01',
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

describe('ActivitiesTable — constraint-violation badge (flag on)', () => {
  it('shows a Conflict badge on a violated activity, and none on a clean one', () => {
    renderTable([
      { ...BASE, id: 'a1', name: 'Broken', constraintViolated: true },
      { ...BASE, id: 'a2', name: 'Fine', constraintViolated: false },
    ]);
    const broken = screen.getByText('Broken').closest('tr')!;
    expect(within(broken).getByText('Conflict')).toBeInTheDocument();

    const fine = screen.getByText('Fine').closest('tr')!;
    expect(within(fine).queryByText('Conflict')).not.toBeInTheDocument();
  });
});
