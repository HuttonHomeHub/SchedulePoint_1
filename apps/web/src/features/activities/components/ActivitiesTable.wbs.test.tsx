import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

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
      <ActivitiesTable orgSlug="acme" planId="pl1" canWrite calendars={[]} />
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
