import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * Flag-OFF invisibility (ADR-0046): with `VITE_NOTES` off, the note count badge never renders — even
 * if a count map is passed — so the activities table is byte-identical to today. `NOTES_ENABLED` is
 * the config default (off), asserted explicitly here by NOT overriding it.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NOTES_ENABLED: false,
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

describe('ActivitiesTable — note count badge (flag off)', () => {
  it('renders no badge even when a count map is supplied', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [
      { ...BASE, id: 'a1', name: 'Annotated' },
    ]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          orgSlug="acme"
          planId="pl1"
          canWrite
          noteCountByActivityId={new Map([['a1', 3]])}
        />
      </QueryClientProvider>,
    );
    const row = screen.getByText('Annotated').closest('tr')!;
    expect(within(row).queryByText('3 notes')).not.toBeInTheDocument();
  });
});
