import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

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
  laneIndex: 0,
  status: 'IN_PROGRESS',
  percentComplete: 40,
  actualStart: '2026-05-01',
  actualFinish: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  isCritical: false,
  isNearCritical: false,
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
});
