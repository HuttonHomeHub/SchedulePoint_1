import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

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

const BASE: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  constraintType: 'MANDATORY_START',
  constraintDate: '2026-05-01',
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
  loeNoSpan: false,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
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
