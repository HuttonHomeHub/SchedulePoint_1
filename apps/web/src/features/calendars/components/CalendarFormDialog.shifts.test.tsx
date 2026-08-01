import { WorkingWeekdays } from '@repo/types';
import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarFormDialog } from './CalendarFormDialog';

import type * as Env from '@/config/env';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
// Flag ON: this file is the shift editor's contract. The flag-off surface is pinned separately by
// `library-scoping-flag-off.test.tsx` and by `CalendarFormDialog.test.tsx`, which are kept rather
// than weakened — they are the rollback contract (ADR-0053 M6).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  CALENDAR_SHIFT_EDITOR_ENABLED: true,
}));

const SPLIT_SHIFT: CalendarSummary = {
  id: 'cal-1',
  name: 'Two shift',
  description: null,
  workingWeekdays: 1, // Monday only — all the mask can say about the week below
  shifts: [
    { weekday: 0, startMinute: 480, endMinute: 720 },
    { weekday: 0, startMinute: 780, endMinute: 1020 },
  ],
  scope: 'ORG',
  projectId: null,
  archivedAt: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof CalendarFormDialog>> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarFormDialog orgSlug="acme" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

async function sentBody(method: string): Promise<Record<string, unknown>> {
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === method);
  expect(call).toBeDefined();
  return JSON.parse(call![1]?.body as string) as Record<string, unknown>;
}

describe('CalendarFormDialog — shift editor (VITE_CALENDAR_SHIFT_EDITOR)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...SPLIT_SHIFT, exceptions: [] });
  });

  it('gives every weekday its own hours group', () => {
    renderDialog();
    for (const day of ['Monday', 'Tuesday', 'Sunday']) {
      expect(screen.getByRole('group', { name: `${day} hours` })).toBeInTheDocument();
    }
  });

  it('seeds a new calendar with an ordinary Mon–Fri week', () => {
    renderDialog();
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    expect(within(monday).getByRole('textbox', { name: /^Start time/ })).toHaveValue('00:00');
    expect(within(monday).getByRole('textbox', { name: /^End time/ })).toHaveValue('24:00');
    // Saturday is not worked, and says so rather than showing an empty area.
    const saturday = screen.getByRole('group', { name: 'Saturday hours' });
    expect(within(saturday).getByText('Not worked.')).toBeInTheDocument();
  });

  /** The capability the seven checkboxes could not express, and the reason this epic exists. */
  it('shows a stored split shift as two periods on one day', () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    expect(within(monday).getAllByRole('listitem')).toHaveLength(2);
    expect(within(monday).getAllByRole('textbox', { name: /^Start time/ })[1]).toHaveValue('13:00');
  });

  it('sends explicit shifts, not a weekday mask', async () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const body = await sentBody('PATCH');
    expect(body.shifts).toEqual([
      { weekday: 0, startMinute: 480, endMinute: 720 },
      { weekday: 0, startMinute: 780, endMinute: 1020 },
    ]);
    // The two are mutually exclusive at the API — sending both is a 422 naming the pair.
    expect(body).not.toHaveProperty('workingWeekdays');
  });

  it('saves an edited period at minute granularity', async () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    fireEvent.change(within(monday).getAllByRole('textbox', { name: /^End time/ })[0]!, {
      target: { value: '12:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const body = await sentBody('PATCH');
    expect((body.shifts as { endMinute: number }[])[0]?.endMinute).toBe(750);
  });

  it('saves a night shift as two adjacent-day windows', async () => {
    renderDialog({ calendar: { ...SPLIT_SHIFT, shifts: [] } });
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    fireEvent.click(within(monday).getByRole('button', { name: /^Add hours/ }));
    fireEvent.change(within(monday).getByRole('textbox', { name: /^Start time/ }), {
      target: { value: '20:00' },
    });
    fireEvent.change(within(monday).getByRole('textbox', { name: /^End time/ }), {
      target: { value: '24:00' },
    });
    const tuesday = screen.getByRole('group', { name: 'Tuesday hours' });
    fireEvent.click(within(tuesday).getByRole('button', { name: /^Add hours/ }));
    fireEvent.change(within(tuesday).getByRole('textbox', { name: /^Start time/ }), {
      target: { value: '00:00' },
    });
    fireEvent.change(within(tuesday).getByRole('textbox', { name: /^End time/ }), {
      target: { value: '06:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const body = await sentBody('PATCH');
    // 24:00 is 1440 — the value `<input type="time">` cannot express, and the reason the fields
    // are text (spec Q2).
    expect(body.shifts).toEqual([
      { weekday: 0, startMinute: 1200, endMinute: 1440 },
      { weekday: 1, startMinute: 0, endMinute: 360 },
    ]);
  });

  it('refuses to send a week it cannot parse, and says which row', async () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    fireEvent.change(within(monday).getAllByRole('textbox', { name: /^Start time/ })[0]!, {
      target: { value: 'half eight' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        within(monday).getAllByRole('textbox', { name: /^Start time/ })[0],
      ).toHaveAccessibleDescription(/24-hour HH:MM/),
    );
    // Nothing was sent: the planner is looking at the rows, and the server's message would name a
    // pair of minutes rather than the row they typed in.
    expect(vi.mocked(apiFetch).mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);
  });

  it('refuses overlapping periods before they reach the server', async () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    fireEvent.change(within(monday).getAllByRole('textbox', { name: /^End time/ })[0]!, {
      target: { value: '14:00' }, // now runs past the second period's 13:00 start
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        within(monday).getAllByRole('textbox', { name: /^Start time/ })[1],
      ).toHaveAccessibleDescription(/overlap/i),
    );
    expect(vi.mocked(apiFetch).mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);
  });

  it('reports problems on every day at once, not one save at a time', async () => {
    renderDialog({
      calendar: {
        ...SPLIT_SHIFT,
        shifts: WorkingWeekdays.toFullDayShifts(0b0000011), // Monday + Tuesday
      },
    });
    for (const day of ['Monday', 'Tuesday']) {
      const group = screen.getByRole('group', { name: `${day} hours` });
      fireEvent.change(within(group).getByRole('textbox', { name: /^End time/ }), {
        target: { value: 'nope' },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    for (const day of ['Monday', 'Tuesday']) {
      const group = screen.getByRole('group', { name: `${day} hours` });
      await waitFor(() =>
        expect(within(group).getByRole('textbox', { name: /^End time/ })).toHaveAttribute(
          'aria-invalid',
          'true',
        ),
      );
    }
  });

  it('drops the flag-off advisory, which would now be false', () => {
    // Flag off, the form says the week is "shown simplified" because seven checkboxes cannot carry
    // a split shift. Flag on it can, so the advisory would be a lie.
    renderDialog({ calendar: SPLIT_SHIFT });
    expect(screen.queryByText(/works specific hours/i)).not.toBeInTheDocument();
  });

  it('shows hours as plain text with no controls when read-only', () => {
    renderDialog({ calendar: SPLIT_SHIFT, readOnly: true });
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    expect(within(monday).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(monday).getByText('08:00–12:00')).toBeInTheDocument();
  });
});
