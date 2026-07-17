import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The activities table's per-activity calendar column (ADR-0037, M5) with `VITE_ACTIVITY_CALENDAR`
 * forced ON. The column names an activity's own calendar, stays quiet (em dash) when it inherits the
 * plan's, and — crucially — never renders that same em dash for a calendar that simply isn't nameable
 * yet: "Loading…" while the (route-composed) list loads, "Unnamed" once settled without a match.
 * Flag-off (no column) is the default the other table suite exercises.
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
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderTable(
  data: ActivitySummary[],
  calendarProps: Partial<React.ComponentProps<typeof ActivitiesTable>> = {},
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canWrite
        calendars={CALENDARS}
        {...calendarProps}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — calendar column (flag on)', () => {
  it('shows the assigned calendar name, and an em dash for an inheriting activity', () => {
    renderTable([
      { ...BASE, id: 'a1', name: 'On 24/7', calendarId: 'cal-247' },
      { ...BASE, id: 'a2', name: 'Inherits', calendarId: null },
    ]);
    expect(screen.getByRole('columnheader', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByText('24/7')).toBeInTheDocument();
    // The inheriting row shows an em dash (not a calendar name).
    const inheritRow = screen.getByText('Inherits').closest('tr')!;
    expect(inheritRow).toHaveTextContent('—');
  });

  it('reads "Loading…" (not an em dash) for an assigned calendar while the list is still loading', () => {
    // A row assigned to a calendar the (still-loading) list can't yet name must not read as inherit.
    renderTable([{ ...BASE, id: 'a1', name: 'Assigned', calendarId: 'cal-unknown' }], {
      calendars: [],
      calendarsLoading: true,
    });
    // The calendar cell (keyed by the id title) shows "Loading…", never the inherit em dash.
    const cell = screen.getByTitle('cal-unknown');
    expect(cell).toHaveTextContent('Loading…');
    expect(cell).not.toHaveTextContent('—');
  });

  it('reads "Unnamed" for an assigned calendar the settled list can’t resolve', () => {
    renderTable([{ ...BASE, id: 'a1', name: 'Assigned', calendarId: 'cal-unknown' }], {
      calendars: [],
      calendarsLoading: false,
    });
    const cell = screen.getByTitle('cal-unknown');
    expect(cell).toHaveTextContent('Unnamed');
    expect(cell).not.toHaveTextContent('—');
  });
});
