import { WorkingWeekdays } from '@repo/types';
import type { CalendarDetail } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys } from '../api/use-calendars';

import { CalendarExceptionsEditor } from './CalendarExceptionsEditor';

import type * as Env from '@/config/env';
import type * as ApiClient from '@/lib/api/client';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));
// Flag ON. The flag-off surface stays pinned by `CalendarExceptionsEditor.test.tsx`, which is kept
// rather than weakened — it is the rollback contract (ADR-0053 M6 precedent).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  CALENDAR_SHIFT_EDITOR_ENABLED: true,
}));

/** A half-day before a shutdown: worked, but not for the whole day. */
const HALF_DAY = {
  id: 'ex-half',
  date: '2026-12-24',
  endDate: '2026-12-24',
  isWorking: true,
  windows: [{ startMinute: 480, endMinute: 720 }],
  label: 'Christmas Eve',
  version: 2,
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
  exceptions: [HALF_DAY],
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

async function sentBody(method: string): Promise<Record<string, unknown>> {
  await waitFor(() =>
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === method)).toBe(true),
  );
  const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === method)!;
  return JSON.parse(call[1]?.body as string) as Record<string, unknown>;
}

describe('CalendarExceptionsEditor — hours (VITE_CALENDAR_SHIFT_EDITOR)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(DETAIL);
  });

  /** The capability a "Working day" badge alone cannot express — and the defect it hid. */
  it("shows a half-day's actual hours beside the badge", () => {
    renderEditor();
    // Scoped to the row: "Working day" is also one of the add form's Type options.
    const row = within(screen.getAllByRole('listitem')[0]!);
    expect(row.getByText('Working day')).toBeInTheDocument();
    expect(row.getByText('08:00–12:00')).toBeInTheDocument();
  });

  it('adds an exception with specific hours rather than a whole worked day', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-01-02' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'hours' } });
    const hours = screen.getByRole('group', { name: 'Exception hours' });
    fireEvent.click(within(hours).getByRole('button', { name: /^Add hours/ }));
    fireEvent.change(within(hours).getByRole('textbox', { name: /^Start time/ }), {
      target: { value: '07:00' },
    });
    fireEvent.change(within(hours).getByRole('textbox', { name: /^End time/ }), {
      target: { value: '13:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add exception' }));

    const body = await sentBody('POST');
    expect(body.windows).toEqual([{ startMinute: 420, endMinute: 810 }]);
    // The two are mutually exclusive at the API — a body carrying both is a 422 naming the pair.
    expect(body).not.toHaveProperty('isWorking');
  });

  it('still sends the whole-day shorthand for an ordinary worked day', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-01-02' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'allDay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add exception' }));

    const body = await sentBody('POST');
    expect(body.isWorking).toBe(true);
    expect(body).not.toHaveProperty('windows');
  });

  it('refuses "specific hours" with no periods, and says what to do instead', async () => {
    renderEditor({ ...DETAIL, exceptions: [] });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-01-02' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'hours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add exception' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Add the hours this day works/);
    expect(vi.mocked(apiFetch).mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  /** Before the PATCH endpoint, this was delete-then-recreate — two writes, and a window in
      between during which the holiday had become an ordinary working day. */
  it('edits a stored exception in place, gated on the exception’s own version', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit exception on 24 Dec 2026' }));

    const hours = screen.getByRole('group', { name: 'Hours on 24 Dec 2026' });
    fireEvent.change(within(hours).getByRole('textbox', { name: /^End time/ }), {
      target: { value: '13:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const body = await sentBody('PATCH');
    expect(body).toMatchObject({
      version: 2,
      windows: [{ startMinute: 480, endMinute: 780 }],
      label: 'Christmas Eve',
    });
    const [path] = vi.mocked(apiFetch).mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(path).toBe('/organizations/acme/calendars/cal-1/exceptions/ex-half');
  });

  /** A full-day window is what the `isWorking: true` shorthand writes, so it must read back as the
      shorthand — otherwise every worked Saturday opens showing 00:00–24:00 in two text fields. */
  it('opens a whole worked day as "Working day", not as 00:00–24:00', () => {
    renderEditor({
      ...DETAIL,
      exceptions: [{ ...HALF_DAY, windows: [{ startMinute: 0, endMinute: 1440 }] }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit exception on 24 Dec 2026' }));

    const row = within(screen.getAllByRole('listitem')[0]!);
    expect(row.getByLabelText('Type')).toHaveValue('allDay');
    expect(screen.queryByRole('group', { name: 'Hours on 24 Dec 2026' })).not.toBeInTheDocument();
  });

  it('does not send unparseable hours to the server', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit exception on 24 Dec 2026' }));
    const hours = screen.getByRole('group', { name: 'Hours on 24 Dec 2026' });
    fireEvent.change(within(hours).getByRole('textbox', { name: /^Start time/ }), {
      target: { value: 'half eight' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        within(hours).getByRole('textbox', { name: /^Start time/ }),
      ).toHaveAccessibleDescription(/24-hour HH:MM/),
    );
    expect(vi.mocked(apiFetch).mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);
  });
});
