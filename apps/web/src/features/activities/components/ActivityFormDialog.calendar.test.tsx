import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The per-activity calendar picker (ADR-0037, M5) with `VITE_ACTIVITY_CALENDAR` forced ON — the
 * feature ships dark by default, so this suite pins the flag to prove the Select renders, defaults to
 * inherit, persists a chosen calendar, round-trips a seeded one, and surfaces a load error without
 * masking a seeded calendar as "inherit". The org calendars are route-composed (passed as a prop),
 * so no calendars fetch is mocked here — only the create/update mutation hits `apiFetch`. (The
 * flag-off behaviour — no picker, value still round-trips — is covered by `ActivityFormDialog.test.tsx`.)
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_CALENDAR_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-5day',
    name: '5-day week',
    description: null,
    workingWeekdays: 0b0011111, // Mon–Fri
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cal-247',
    name: '24/7',
    description: null,
    workingWeekdays: 0b1111111, // every day
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

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
  calendarId: 'cal-247',
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
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ActivityFormDialog — calendar picker (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('offers "Plan default (inherit)" plus each org calendar, defaulting to inherit on a new activity', () => {
    renderDialog();
    const select = screen.getByLabelText('Calendar (optional)');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['Plan default (inherit)', '5-day week', '24/7']);
    expect(select).toHaveValue('');
  });

  it('creates an activity on a chosen calendar', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Calendar (optional)'), {
      target: { value: 'cal-5day' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      calendarId: 'cal-5day',
    });
  });

  it('seeds the activity’s calendar and clears it to inherit (null) on save', async () => {
    renderDialog({ activity: ACTIVITY });
    const select = screen.getByLabelText('Calendar (optional)');
    expect(select).toHaveValue('cal-247');
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1');
    expect(JSON.parse(init?.body as string)).toMatchObject({ version: 4, calendarId: null });
  });

  it('surfaces a load error and keeps a seeded calendar visibly distinct from inherit', () => {
    // The org calendar list failed to load: empty options + calendarsError, with a seeded calendar.
    renderDialog({ activity: ACTIVITY, calendars: [], calendarsError: true });

    // The failure is announced, not silent.
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t load the calendar list/);
    // The seeded calendar still shows as selected under an honest label — never blank (= inherit).
    const select = screen.getByLabelText('Calendar (optional)');
    expect(select).toHaveValue('cal-247');
    expect(within(select).getByRole('option', { name: 'Unavailable' })).toBeInTheDocument();
  });
});
