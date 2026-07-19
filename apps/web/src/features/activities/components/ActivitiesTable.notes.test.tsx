import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The activities table's per-row **note count badge** (ADR-0046) with `VITE_NOTES` forced ON. The
 * count comes from a route-composed map (fed by ONE batch `activity-counts` query, never per-row); a
 * row with ≥1 note shows the badge, and a row at zero shows none. The companion `.notes-off` suite
 * proves the flag-off invisibility.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NOTES_ENABLED: true,
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

function renderTable(data: ActivitySummary[], noteCountByActivityId?: ReadonlyMap<string, number>) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canWrite
        {...(noteCountByActivityId ? { noteCountByActivityId } : {})}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — note count badge (flag on)', () => {
  it('badges a row with notes and leaves a zero-note row bare', () => {
    renderTable(
      [
        { ...BASE, id: 'a1', name: 'Annotated' },
        { ...BASE, id: 'a2', name: 'Bare' },
      ],
      new Map([['a1', 3]]),
    );
    const annotated = screen.getByText('Annotated').closest('tr')!;
    expect(within(annotated).getByText('3 notes')).toBeInTheDocument();

    const bare = screen.getByText('Bare').closest('tr')!;
    expect(within(bare).queryByText(/notes?$/)).not.toBeInTheDocument();
  });

  it('shows no badge when the map is absent (counts not loaded)', () => {
    renderTable([{ ...BASE, id: 'a1', name: 'Annotated' }]);
    const row = screen.getByText('Annotated').closest('tr')!;
    expect(within(row).queryByText(/notes?$/)).not.toBeInTheDocument();
  });
});
