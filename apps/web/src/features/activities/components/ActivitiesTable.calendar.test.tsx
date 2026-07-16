import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { calendarKeys } from '@/features/calendars';

/**
 * The activities table's per-activity calendar column (ADR-0037, M5) with `VITE_ACTIVITY_CALENDAR`
 * forced ON. The column names an activity's own calendar and stays quiet (em dash) when it inherits
 * the plan's — so the common all-inherit case reads the same as before. Flag-off (no column, no
 * fetch) is the default the other table suite exercises.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_CALENDAR_ENABLED: true,
}));

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-247',
    name: '24/7',
    description: null,
    workingWeekdays: 0b1111111,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

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
  calendarId: null,
  laneIndex: 0,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  isCritical: false,
  isNearCritical: false,
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
  queryClient.setQueryData(calendarKeys.list('acme'), CALENDARS);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable orgSlug="acme" planId="pl1" canWrite />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — calendar column (flag on)', () => {
  it('shows the assigned calendar name, and an em dash for an inheriting activity', () => {
    renderTable([
      { ...BASE, id: 'a1', name: 'On 24/7', calendarId: 'cal-247' },
      { ...BASE, id: 'a2', name: 'Inherits', calendarId: null },
    ]);
    // The header is present…
    expect(screen.getByRole('columnheader', { name: 'Calendar' })).toBeInTheDocument();
    // …the assigned row names its calendar…
    expect(screen.getByText('24/7')).toBeInTheDocument();
    // …and the inheriting row shows an em dash (not a calendar name).
    const inheritRow = screen.getByText('Inherits').closest('tr')!;
    expect(inheritRow).toHaveTextContent('—');
  });
});
