import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The duration field with `VITE_SUB_DAY_DURATIONS` **on** (ADR-0070).
 *
 * The claims that matter here are the ones a pure parser test cannot make: that the field reads the
 * factor from the calendar the **form** currently selects (not the saved one), that it sends
 * `durationMinutes` rather than `durationDays`, and that it degrades honestly to whole working days
 * when the calendar list has not resolved. The flag-off behaviour — a whole-days number box sending
 * `durationDays` — stays pinned by `ActivityFormDialog.test.tsx`, which is the rollback contract.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
  ACTIVITY_CALENDAR_ENABLED: true,
  // The base native picker, not the tier-grouped combobox — this suite is about the duration field,
  // and the flat `<select>` is the simpler thing to drive.
  LIBRARY_SCOPING_ENABLED: false,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

function calendar(id: string, name: string, hoursPerDay: number): CalendarSummary {
  return {
    id,
    name,
    description: null,
    workingWeekdays: 0b0011111,
    shifts: WorkingWeekdays.toFullDayShifts(0b0011111),
    hoursPerDay,
    hoursPerDayMinutes: Math.round(hoursPerDay * 60),
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/** An eight-hour plan calendar and a 24-hour one — the same "1d" is a different number of minutes. */
const CALENDARS = [
  calendar('cal-8', 'Eight-hour week', 8),
  calendar('cal-24', 'Round the clock', 24),
];

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Lift steel',
  description: null,
  type: 'TASK',
  // Four hours on the eight-hour calendar — the shape the whole epic exists for. `durationDays`
  // rounds it to zero, which is what the field used to show.
  durationDays: 0,
  durationMinutes: 240,
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
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityFormDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={vi.fn()}
        calendars={CALENDARS}
        planCalendarId="cal-8"
        {...props}
      />
    </QueryClientProvider>,
  );
}

/** The parsed body of the single mutation call. */
function sentBody(): Record<string, unknown> {
  const call = vi.mocked(apiFetch).mock.calls[0];
  return JSON.parse((call?.[1] as { body: string }).body) as Record<string, unknown>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(ACTIVITY);
});

describe('ActivityFormDialog — sub-day durations', () => {
  it('seeds a sub-day duration as text instead of showing it as 0 days', () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('Duration')).toHaveValue('4h');
  });

  it('names the calendar’s own day length, because 1d is not a fixed quantity', () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByText(/A day is 8 working hours/)).toBeInTheDocument();
  });

  it('sends exact minutes, never durationDays', async () => {
    renderDialog({ activity: ACTIVITY });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '2d 4h' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = sentBody();
    expect(body.durationMinutes).toBe(1200); // 2 × 480 + 240
    expect(body).not.toHaveProperty('durationDays');
  });

  it('follows the calendar the FORM selects, not the one the row was saved on', async () => {
    renderDialog({ activity: ACTIVITY });
    // Move the activity onto the 24-hour calendar in the same edit. "1d" must now mean 1440.
    fireEvent.change(screen.getByLabelText('Calendar'), { target: { value: 'cal-24' } });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '1d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(sentBody().durationMinutes).toBe(1440);
  });

  it('refuses a unit it does not have, naming the ones it does', async () => {
    renderDialog({ activity: ACTIVITY });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '1w' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Twice by design: once beside the field, once in the form's error summary.
    expect(await screen.findAllByText(/Weeks are not supported/)).toHaveLength(2);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('degrades to whole working days — and says so — when the factor is unknown', () => {
    // No calendar list, so nothing resolves the day length. Days is the one unit that needs no
    // factor; guessing 24 would read a planner's "1d" as three days of eight-hour work.
    renderDialog({ activity: ACTIVITY, calendars: [] });
    expect(screen.getByLabelText('Duration (working days)')).toHaveValue(0);
    expect(screen.queryByText(/A day is/)).not.toBeInTheDocument();
  });
});
