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
  hoursPerDay: 24,
  hoursPerDayMinutes: 1440,
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

  /** A new calendar starts from the Standard week preset, NOT a full-day Mon–Fri: the old seed made
      every hand-made calendar a 24-hour one, whose activities then scheduled three times too fast. */
  it('seeds a new calendar with an ordinary Mon–Fri working day', () => {
    renderDialog();
    const monday = screen.getByRole('group', { name: 'Monday hours' });
    expect(within(monday).getByRole('textbox', { name: /^Start time/ })).toHaveValue('08:00');
    expect(within(monday).getByRole('textbox', { name: /^End time/ })).toHaveValue('17:00');
    // And the standard working day agrees with it, rather than opening at a contradictory 24.
    expect(screen.getByLabelText(/Hours per day/)).toHaveValue(9);
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

  /** ADR-0068. Without this field nothing in the product can say what "one day" means. */
  it('sends the calendar’s standard working day', async () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    fireEvent.change(screen.getByLabelText('Hours per day'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const body = await sentBody('PATCH');
    expect(body.hoursPerDay).toBe(8);
  });

  it('suggests what the authored week implies without overwriting the field', () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    // Monday works 08:00–12:00 + 13:00–17:00 = 8 hours; the stored value is 24.
    expect(screen.getByText(/works 8 hours on a typical day/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hours per day')).toHaveValue(24);
  });

  /** The hazard ADR-0068 §6 names: a planner retyping a remembered number after the factor moves. */
  /** Linked to the field, not merely beside it — and NOT a live region: it is derived from a value
      the planner is still typing, so an alert would interrupt on every keystroke, announcing a
      transition rather than a settled result. */
  it('warns that changing it re-reads every existing duration, linked to the field itself', () => {
    renderDialog({ calendar: SPLIT_SHIFT });
    const field = screen.getByLabelText('Hours per day');
    expect(field).not.toHaveAccessibleDescription(/No dates move/);
    fireEvent.change(field, { target: { value: '8' } });
    expect(field).toHaveAccessibleDescription(/No dates move/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

describe('CalendarFormDialog — the window-only calendar is savable (VITE_CALENDAR_SHIFT_EDITOR)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...SPLIT_SHIFT, exceptions: [] });
  });

  /**
   * A calendar with no working week is valid at the domain and at the API — it is the shutdown /
   * turnaround shape — but the form kept a hidden `workingWeekdays >= 1` rule that the shift editor
   * does not render. Applying the Window-only preset and saving produced "Select at least one
   * working day" with **no control anywhere on screen** able to satisfy it: a dead end.
   */
  it('saves an empty week instead of refusing it through a control that is not rendered', async () => {
    renderDialog({ calendar: { ...SPLIT_SHIFT, workingWeekdays: 0, shifts: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const body = await sentBody('PATCH');
    expect(body.shifts).toEqual([]);
    expect(screen.queryByText(/Select at least one working day/)).not.toBeInTheDocument();
  });
});
