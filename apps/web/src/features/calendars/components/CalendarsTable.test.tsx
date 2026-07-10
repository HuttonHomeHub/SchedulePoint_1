import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys } from '../api/use-calendars';

import { CalendarsTable } from './CalendarsTable';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-1',
    name: 'Standard',
    description: 'Weekdays only',
    workingWeekdays: 31, // Mon–Fri
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cal-2',
    name: 'Seven-day',
    description: null,
    workingWeekdays: 127, // every day
    version: 2,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function renderTable(canWrite: boolean, data: CalendarSummary[] = CALENDARS) {
  // Seeded data stays fresh (no background refetch) and mutations don't retry, so
  // the only apiFetch call is the one under test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(calendarKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarsTable orgSlug="acme" canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

describe('CalendarsTable', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('renders each calendar with its working-day summary and write actions', () => {
    renderTable(true);

    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Mon–Fri')).toBeInTheDocument();
    expect(screen.getByText('Every day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Standard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Seven-day' })).toBeInTheDocument();
  });

  it('hides write actions for non-writers', () => {
    renderTable(false);

    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Standard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Seven-day' })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no calendars', () => {
    renderTable(true, []);
    expect(screen.getByText(/No calendars yet/)).toBeInTheDocument();
  });

  it('confirms before deleting', () => {
    renderTable(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Standard' }));
    expect(screen.getByRole('heading', { name: 'Delete calendar' })).toBeInTheDocument();
  });

  it('surfaces a friendly in-use message when a delete is blocked (409)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'Calendar in use.',
        details: { reason: 'CALENDAR_IN_USE', count: 2 },
      }),
    );
    renderTable(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/In use by 2 plans/)).toBeInTheDocument();
  });
});
