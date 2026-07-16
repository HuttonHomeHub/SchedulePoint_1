import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The per-activity calendar picker (ADR-0037, M5) with `VITE_ACTIVITY_CALENDAR` forced ON — the
 * feature ships dark by default, so this suite pins the flag to prove the Select renders, defaults to
 * inherit, persists a chosen calendar, and round-trips a seeded one. (The flag-off behaviour — no
 * picker, value still round-trips — is covered by `ActivityFormDialog.test.tsx`.)
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
  calendarId: 'cal-247',
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
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Route the calendars GET to the library; everything else (the create/update mutation) to the row.
function mockApi(): void {
  vi.mocked(apiFetch)
    .mockReset()
    .mockImplementation((path: string) => {
      if (path.endsWith('/calendars')) return Promise.resolve(CALENDARS);
      return Promise.resolve(ACTIVITY);
    });
}

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityFormDialog orgSlug="acme" planId="pl1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityFormDialog — calendar picker (flag on)', () => {
  beforeEach(mockApi);

  it('offers "Plan default (inherit)" plus each org calendar, defaulting to inherit on a new activity', async () => {
    renderDialog();
    const select = await screen.findByLabelText('Calendar');
    await waitFor(() => {
      const labels = within(select)
        .getAllByRole('option')
        .map((o) => o.textContent);
      expect(labels).toEqual(['Plan default (inherit)', '5-day week', '24/7']);
    });
    expect(select).toHaveValue('');
  });

  it('creates an activity on a chosen calendar', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    const select = await screen.findByLabelText('Calendar');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    fireEvent.change(select, { target: { value: 'cal-5day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/plans/pl1/activities',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === '/organizations/acme/plans/pl1/activities')!;
    expect(JSON.parse(call[1]?.body as string)).toMatchObject({
      name: 'Pour slab',
      calendarId: 'cal-5day',
    });
  });

  it('seeds the activity’s calendar and clears it to inherit (null) on save', async () => {
    renderDialog({ activity: ACTIVITY });
    const select = await screen.findByLabelText('Calendar');
    await waitFor(() => expect(select).toHaveValue('cal-247'));
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/activities/a1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === '/organizations/acme/activities/a1')!;
    expect(JSON.parse(call[1]?.body as string)).toMatchObject({ version: 4, calendarId: null });
  });
});
