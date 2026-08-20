import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

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

const BASE: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'RESOURCE_DEPENDENT',
  durationDays: 5,
  durationMinutes: 2400,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: null,
  laneIndex: 0,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  remainingDurationDays: null,
  remainingDurationMinutes: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  constraintViolated: false,
  externalDriven: false,
  loeNoSpan: false,
  resourceDriverMissing: false,
  externalEarlyStart: null,
  externalLateFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  levelingPriority: null,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

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
