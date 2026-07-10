import type { CalendarDetail } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys } from '../api/use-calendars';

import { CalendarExceptionsEditor } from './CalendarExceptionsEditor';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const DETAIL: CalendarDetail = {
  id: 'cal-1',
  name: 'Standard',
  description: null,
  workingWeekdays: 31,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  exceptions: [
    {
      id: 'ex-1',
      date: '2026-12-25',
      isWorking: false,
      label: 'Christmas Day',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
};

function renderEditor(detail: CalendarDetail = DETAIL) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(calendarKeys.detail('acme', 'cal-1'), detail);
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarExceptionsEditor orgSlug="acme" calendarId="cal-1" />
    </QueryClientProvider>,
  );
}

describe('CalendarExceptionsEditor', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(DETAIL);
  });

  it('lists existing exceptions with a text indicator and a remove action', () => {
    renderEditor();
    expect(screen.getByText('25 Dec 2026')).toBeInTheDocument();
    expect(screen.getByText('Holiday')).toBeInTheDocument();
    expect(screen.getByText('Christmas Day')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove exception on 25 Dec 2026' }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no exceptions', () => {
    renderEditor({ ...DETAIL, exceptions: [] });
    expect(screen.getByText('No exceptions yet.')).toBeInTheDocument();
  });

  it('POSTs a new exception with the date and holiday default', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2027-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    const postCall = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'POST')!;
    const [path, init] = postCall;
    expect(path).toBe('/organizations/acme/calendars/cal-1/exceptions');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      date: '2027-01-01',
      isWorking: false,
    });
  });

  it('surfaces a duplicate-date conflict (409) as a friendly message', async () => {
    vi.mocked(apiFetch).mockImplementation((_path, init) =>
      init?.method === 'POST'
        ? Promise.reject(
            new ApiFetchError(409, {
              code: 'CONFLICT',
              message: 'Duplicate.',
              details: { reason: 'DUPLICATE_EXCEPTION' },
            }),
          )
        : Promise.resolve(DETAIL),
    );
    renderEditor({ ...DETAIL, exceptions: [] });

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('An exception already exists for that date.'),
    ).toBeInTheDocument();
  });
});
