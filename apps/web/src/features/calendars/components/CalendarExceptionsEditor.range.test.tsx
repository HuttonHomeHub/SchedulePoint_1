import { WorkingWeekdays } from '@repo/types';
import type { CalendarDetail } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys } from '../api/use-calendars';

import { CalendarExceptionsEditor } from './CalendarExceptionsEditor';

import type * as ApiClient from '@/lib/api/client';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

/**
 * A calendar exception spanning more than one day (surface audit F2).
 *
 * Storage has modelled a range since the table was created and the engine has always read one; only
 * the write paths collapsed it, so a two-week shutdown had to be entered as fourteen entries. These
 * cover the half that was missing: authoring a span, seeing it as a span, and extending one.
 */
const SHUTDOWN = {
  id: 'ex-shutdown',
  date: '2026-12-24',
  endDate: '2027-01-02',
  isWorking: false,
  windows: [],
  label: 'Christmas shutdown',
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const DETAIL: CalendarDetail = {
  id: 'cal-1',
  name: 'Standard',
  description: null,
  workingWeekdays: 31,
  shifts: WorkingWeekdays.toFullDayShifts(31),
  hoursPerDay: 24,
  hoursPerDayMinutes: 1440,
  scope: 'ORG',
  projectId: null,
  archivedAt: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  exceptions: [SHUTDOWN],
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

function bodyOf(method: string): Record<string, unknown> {
  const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === method);
  return JSON.parse(call?.[1]?.body as string) as Record<string, unknown>;
}

describe('CalendarExceptionsEditor — date ranges', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(DETAIL);
  });

  it('shows a multi-day exception as a span, not as its first day', () => {
    renderEditor();
    expect(screen.getByText('24 Dec 2026 – 02 Jan 2027')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove exception on 24 Dec 2026 – 02 Jan 2027' }),
    ).toBeInTheDocument();
  });

  it('still shows a single-day exception as one date', () => {
    renderEditor({
      ...DETAIL,
      exceptions: [{ ...SHUTDOWN, date: '2026-12-25', endDate: '2026-12-25' }],
    });
    expect(screen.getByText('25 Dec 2026')).toBeInTheDocument();
  });

  it('POSTs an endDate when the planner enters one', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-24' } });
    fireEvent.change(screen.getByLabelText('To (optional)'), { target: { value: '2027-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add exception' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    expect(bodyOf('POST')).toMatchObject({ date: '2026-12-24', endDate: '2027-01-02' });
  });

  it('omits endDate entirely when the field is left empty', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add exception' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    // Absent, not null: the API reads an absent `endDate` as "a single day", which is what a date
    // on its own has always meant.
    expect(bodyOf('POST')).not.toHaveProperty('endDate');
  });

  it('refuses a range that runs backwards, at the field', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-01-02' } });
    fireEvent.change(screen.getByLabelText('To (optional)'), { target: { value: '2026-12-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add exception' }));

    await waitFor(() =>
      expect(
        screen.getAllByText('The last day cannot be before the first day.').length,
      ).toBeGreaterThan(0),
    );
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('PATCHes a new last day when a shutdown is extended', async () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit exception on 24 Dec 2026 – 02 Jan 2027' }),
    );
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-01-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
        true,
      ),
    );
    expect(bodyOf('PATCH')).toMatchObject({ endDate: '2027-01-05', version: 3 });
  });

  it('collapses a range to one day when the last day is cleared', async () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit exception on 24 Dec 2026 – 02 Jan 2027' }),
    );
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
        true,
      ),
    );
    // A blank has to mean something, and "one day" is the only reading that matches what the field
    // shows when it is blank — never "leave the span alone", which would silently ignore the edit.
    expect(bodyOf('PATCH')).toMatchObject({ endDate: '2026-12-24' });
  });

  it('refuses an edit that would end the exception before it starts', async () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit exception on 24 Dec 2026 – 02 Jan 2027' }),
    );
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText('The last day cannot be before the first day.')).toBeInTheDocument(),
    );
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });
});
