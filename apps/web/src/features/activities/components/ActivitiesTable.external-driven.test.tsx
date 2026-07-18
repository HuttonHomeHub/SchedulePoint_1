import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The activities table's "External" badge (ADR-0043 M1) with `VITE_INTER_PROJECT_DATES` forced ON.
 * An engine-flagged `externalDriven` activity — one whose schedule this recalculation was gated by an
 * imported date from another project — surfaces a neutral informational pill in the Name cell,
 * mirroring the "Conflict" badge test. Flag-off (no badge) is the default the other table suites
 * exercise.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  INTER_PROJECT_DATES_ENABLED: true,
}));

const BASE: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
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
      <ActivitiesTable orgSlug="acme" planId="pl1" canWrite />
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
