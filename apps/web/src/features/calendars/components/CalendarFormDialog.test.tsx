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

  it('seeds the form in edit mode and PATCHes with the row version and mask', async () => {
    renderDialog({ calendar: CALENDAR });

    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Standard');

    fireEvent.change(name, { target: { value: 'Standard UK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const patchCall = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    const [path, init] = patchCall!;
    expect(path).toBe('/organizations/acme/calendars/cal-1');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Standard UK',
      workingWeekdays: 31,
      version: 3,
    });
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
});
