import { WorkingWeekdays } from '@repo/types';
import type { CalendarDetail, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarFormDialog } from './CalendarFormDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CALENDAR: CalendarSummary = {
  id: 'cal-1',
  name: 'Standard',
  description: 'Weekdays only',
  workingWeekdays: 31, // Mon–Fri
  shifts: WorkingWeekdays.toFullDayShifts(31),
  // Every fixture is a shared organisation calendar — the only tier before ADR-0053.
  scope: 'ORG',
  projectId: null,
  archivedAt: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const CALENDAR_DETAIL: CalendarDetail = { ...CALENDAR, exceptions: [] };

function renderDialog(props: Partial<React.ComponentProps<typeof CalendarFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarFormDialog orgSlug="acme" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('CalendarFormDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(CALENDAR_DETAIL);
  });

  /** The PATCH body of the last request — the only place the flattening defect is visible. */
  async function patchedBody(): Promise<Record<string, unknown>> {
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const patchCall = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall![0]).toBe('/organizations/acme/calendars/cal-1');
    return JSON.parse(patchCall![1]?.body as string) as Record<string, unknown>;
  }

  it('seeds the form in edit mode and PATCHes with the row version', async () => {
    renderDialog({ calendar: CALENDAR });

    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Standard');

    fireEvent.change(name, { target: { value: 'Standard UK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await patchedBody()).toMatchObject({ name: 'Standard UK', version: 3 });
  });

  /**
   * This assertion is INVERTED from what it used to be — it asserted `workingWeekdays: 31` on a
   * rename, i.e. it pinned the defect. The repository replaces every stored shift row whenever the
   * field is present, so submitting an unchanged mask flattened a split shift to whole days on a
   * save that had nothing to do with the week (spec Q0). Silent: no error, and the response looks
   * fine because the mask really is Mon–Fri either way.
   */
  it('omits `workingWeekdays` when the week was not touched, so stored hours survive a rename', async () => {
    renderDialog({ calendar: CALENDAR });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard UK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await patchedBody()).not.toHaveProperty('workingWeekdays');
  });

  it('sends `workingWeekdays` when the planner actually changes the week', async () => {
    renderDialog({ calendar: CALENDAR });

    // Mon–Fri (31) plus Saturday (bit 5) = 63.
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await patchedBody()).toMatchObject({ workingWeekdays: 63 });
  });

  it('says the week is shown simplified when the calendar works specific hours', () => {
    const splitShift: CalendarSummary = {
      ...CALENDAR,
      // Monday 08:00–12:00 and 13:00–17:00 — a split shift the seven checkboxes cannot express.
      shifts: [
        { weekday: 0, startMinute: 480, endMinute: 720 },
        { weekday: 0, startMinute: 780, endMinute: 1020 },
      ],
    };
    renderDialog({ calendar: splitShift });

    expect(screen.getByText(/works specific hours/i)).toBeInTheDocument();
  });

  it('says nothing extra for an ordinary whole-day calendar', () => {
    renderDialog({ calendar: CALENDAR });

    expect(screen.queryByText(/works specific hours/i)).not.toBeInTheDocument();
  });

  it('POSTs a new calendar in create mode', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nights' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/calendars');
    expect(init?.method).toBe('POST');
  });

  it('embeds the exceptions editor in edit mode (and not in create mode)', () => {
    const { unmount } = renderDialog({ calendar: CALENDAR });
    expect(screen.getByRole('heading', { name: 'Exceptions' })).toBeInTheDocument();
    unmount();

    renderDialog();
    expect(screen.queryByRole('heading', { name: 'Exceptions' })).not.toBeInTheDocument();
  });

  it('rejects an empty working-day pattern with a validation error (no request)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'None' } });
    // Toggle every worked weekday (Mon–Fri) off → mask 0.
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    // Surfaced in both the form error summary and inline on the toggle group.
    const messages = await screen.findAllByText('Select at least one working day.');
    expect(messages.length).toBeGreaterThan(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('renders read-only for a reader: fields shown, no save/edit affordances', () => {
    renderDialog({ calendar: CALENDAR, readOnly: true });
    expect(screen.getByLabelText('Name')).toHaveValue('Standard');
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    // Readers still see the exceptions section, but no add form / remove buttons.
    expect(screen.getByRole('heading', { name: 'Exceptions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add exception' })).not.toBeInTheDocument();
  });

  it('round-trips the weekday toggle group to the bitmask (Saturday sets bit 5)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Six-day' } });

    // Saturday is not worked in the default Mon–Fri mask.
    const saturday = screen.getByRole('button', { name: 'Saturday' });
    expect(saturday).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(saturday);
    expect(saturday).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    const mask = JSON.parse(init?.body as string).workingWeekdays as number;
    // Bit 5 (Saturday) is now set: 31 | (1 << 5) = 63.
    expect(mask & (1 << 5)).not.toBe(0);
    expect(mask).toBe(63);
  });

  it('builds the weekday group from the shared ToggleChip, not a one-off button', () => {
    // The weekday picker is `ToggleChip`'s reference consumer (TECH_DEBT #57, since closed). It
    // was previously a hand-rolled `<Button variant={pressed ? 'default' : 'outline'}>`, which is
    // exactly the one-off styling CLAUDE.md §12 forbids — and a silent revert to it would still
    // pass every behavioural test above, since `aria-pressed` and the bitmask round-trip are
    // identical either way. So assert the chrome only the primitive supplies: the pill radius, and
    // a pressed state carried by fill AND border rather than by colour alone (WCAG 1.4.1).
    renderDialog();
    const saturday = screen.getByRole('button', { name: 'Saturday' });
    const monday = screen.getByRole('button', { name: 'Monday' });

    expect(saturday).toHaveClass('rounded-full');
    expect(saturday).toHaveAttribute('aria-pressed', 'false');
    expect(saturday).toHaveClass('border-input');
    expect(monday).toHaveAttribute('aria-pressed', 'true');
    expect(monday).toHaveClass('border-primary', 'bg-primary');
  });
});
