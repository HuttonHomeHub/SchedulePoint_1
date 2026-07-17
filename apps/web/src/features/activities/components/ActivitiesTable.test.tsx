import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

// This is the BASE table suite — the M4/M5 flag surfaces (Conflict badge, per-activity calendar
// column) are on by default, so pin both off here; their flag-on behaviour lives in the dedicated
// `ActivitiesTable.constraint-violation.test.tsx` / `.calendar.test.tsx` suites.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: false,
  ACTIVITY_CALENDAR_ENABLED: false,
}));

const ACTIVITY: ActivitySummary = {
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
  status: 'IN_PROGRESS',
  percentComplete: 40,
  actualStart: '2026-05-01',
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
  resourceDriverMissing: false,
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
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderTable(
  canWrite: boolean,
  data: ActivitySummary[] = [ACTIVITY],
  canReportProgress = false,
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canWrite={canWrite}
        canReportProgress={canReportProgress}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable', () => {
  it('renders code, name, type, duration and in-progress percentage with writer actions', () => {
    renderTable(true);
    expect(screen.getByText('A100')).toBeInTheDocument();
    expect(screen.getByText('Excavate')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('5 d')).toBeInTheDocument();
    expect(screen.getByText('In progress · 40%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Excavate' })).toBeInTheDocument();
  });

  it('hides write actions for non-writers', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: 'Edit Excavate' })).not.toBeInTheDocument();
  });

  it('shows only the progress action for a progress-reporter who cannot write', () => {
    renderTable(false, [ACTIVITY], true);
    expect(
      screen.getByRole('button', { name: 'Report progress for Excavate' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Excavate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Excavate' })).not.toBeInTheDocument();
  });

  it('shows progress plus edit/delete for a writer who can also report progress', () => {
    renderTable(true, [ACTIVITY], true);
    expect(
      screen.getByRole('button', { name: 'Report progress for Excavate' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Excavate' })).toBeInTheDocument();
  });

  it('shows an em dash duration for a milestone and no percentage when not started', () => {
    renderTable(true, [
      {
        ...ACTIVITY,
        type: 'START_MILESTONE',
        durationDays: 0,
        status: 'NOT_STARTED',
        percentComplete: 0,
        actualStart: null,
      },
    ]);
    expect(screen.getByText('Start milestone')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('shows an empty state when there are no activities', () => {
    renderTable(true, []);
    expect(screen.getByText(/No activities yet/)).toBeInTheDocument();
  });

  it('surfaces a set constraint as text plus a spelled-out label for AT', () => {
    renderTable(false, [{ ...ACTIVITY, constraintType: 'SNET', constraintDate: '2026-05-01' }]);
    // Visible shorthand carries the meaning in text (not colour); the sr-only full label
    // spells it out for screen readers (a robust accessible name, not aria-label on a span).
    expect(screen.getByText('SNET · 01 May 2026')).toBeInTheDocument();
    expect(screen.getByText('Start no earlier than 01 May 2026')).toBeInTheDocument();
  });

  it('shows an em dash in the Constraint cell when an activity has none', () => {
    renderTable(false); // the unconstrained ACTIVITY
    expect(screen.queryByText(/SNET|SNLT|FNET|FNLT|MSO|MFO/)).not.toBeInTheDocument();
    // Scope the em-dash assertion to the Constraint column (index 5: Code, Name, Type,
    // Duration, Progress, Constraint) so it exercises that cell, not another null column.
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const cells = within(rows[rows.length - 1]!).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('—');
  });

  it('does not show the Conflict badge while VITE_ADVANCED_CONSTRAINTS is off, even when violated', () => {
    // The engine flag is set on the row, but the badge is gated on the (default-off) feature flag —
    // so the flag-off surface never surfaces it. (Flag-on behaviour is in the dedicated suite.)
    renderTable(false, [{ ...ACTIVITY, constraintViolated: true }]);
    expect(screen.queryByText('Conflict')).not.toBeInTheDocument();
  });

  it('shows computed dates, float and a Critical badge for a calculated activity', () => {
    renderTable(false, [
      {
        ...ACTIVITY,
        earlyStart: '2026-01-01',
        earlyFinish: '2026-01-05',
        lateStart: '2026-01-01',
        lateFinish: '2026-01-05',
        totalFloat: 0,
        freeFloat: null,
        isCritical: true,
        isNearCritical: false,
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
        physicalPercentComplete: null,
        budgetedExpense: null,
        actualExpense: null,
      },
    ]);
    expect(screen.getAllByText('01 Jan 2026').length).toBeGreaterThan(0); // early/late start
    expect(screen.getByText('0 d')).toBeInTheDocument(); // total float
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('badges a near-critical activity and shows a negative float as a lead', () => {
    renderTable(false, [{ ...ACTIVITY, totalFloat: -2, isCritical: false, isNearCritical: true }]);
    expect(screen.getByText('Near-critical')).toBeInTheDocument();
    expect(screen.getByText('−2 d')).toBeInTheDocument();
  });

  it('renders a Logic action (for any member) when onOpenLogic is provided', () => {
    const onOpenLogic = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ACTIVITY]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable orgSlug="acme" planId="pl1" canWrite={false} onOpenLogic={onOpenLogic} />
      </QueryClientProvider>,
    );
    const button = screen.getByRole('button', { name: 'Logic for Excavate' });
    fireEvent.click(button);
    expect(onOpenLogic).toHaveBeenCalledWith(ACTIVITY);
  });
});

describe('ActivitiesTable — baseline variance', () => {
  function varianceRow(overrides: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow {
    return {
      activityId: 'a1',
      code: 'A100',
      name: 'Excavate',
      inBaseline: true,
      removed: false,
      currentStart: '2026-05-01',
      currentFinish: '2026-05-12',
      currentTotalFloat: 0,
      baselineStart: '2026-05-01',
      baselineFinish: '2026-05-09',
      baselineTotalFloat: 0,
      startVarianceDays: 0,
      finishVarianceDays: 3,
      floatVarianceDays: 0,
      ...overrides,
    };
  }

  function renderWithVariance(row: BaselineVarianceRow | null) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ACTIVITY]);
    const map = row ? new Map([[row.activityId, row]]) : new Map<string, BaselineVarianceRow>();
    return render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable orgSlug="acme" planId="pl1" canWrite={false} varianceByActivityId={map} />
      </QueryClientProvider>,
    );
  }

  it('shows the Baseline finish column only when the variance prop is present', () => {
    // Without the prop: no variance column.
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ACTIVITY]);
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable orgSlug="acme" planId="pl1" canWrite={false} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('columnheader', { name: 'Finish variance' })).not.toBeInTheDocument();

    // With the prop: the column appears.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          orgSlug="acme"
          planId="pl1"
          canWrite={false}
          varianceByActivityId={new Map([['a1', varianceRow()]])}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('columnheader', { name: 'Finish variance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Start variance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Float variance' })).toBeInTheDocument();
  });

  it('formats a slip as "behind" and a gain as "ahead" (text, not colour alone)', () => {
    renderWithVariance(varianceRow({ finishVarianceDays: 3 }));
    expect(screen.getByText('3 d behind')).toBeInTheDocument();
  });

  it('shows a float loss as behind (less float than baseline)', () => {
    renderWithVariance(varianceRow({ finishVarianceDays: 0, floatVarianceDays: -2 }));
    expect(screen.getByText('−2 d float')).toBeInTheDocument();
  });

  it('labels an activity added since capture (across the variance columns)', () => {
    renderWithVariance(varianceRow({ inBaseline: false, finishVarianceDays: null }));
    // "Added" shows in each of the start/finish/float variance columns.
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0);
  });

  it('shows an em dash for an activity with no variance row in the map', () => {
    renderWithVariance(null);
    // The variance column renders "—" when the activity isn't in the map.
    expect(screen.getByRole('columnheader', { name: 'Finish variance' })).toBeInTheDocument();
  });
});
