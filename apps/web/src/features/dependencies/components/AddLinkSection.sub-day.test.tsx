import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The lag field with `VITE_SUB_DAY_DURATIONS` **on** (ADR-0070 §5).
 *
 * Its own file because the flag is a build-time constant: the panel's existing suite runs flag-off
 * and is the rollback contract, so it must keep asserting the whole-days number box. This one
 * asserts the other half — that the same form reads `4h` and sends exact minutes.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
}));

const created = vi.fn();
vi.mock('../api/use-dependencies', () => ({
  useCreateDependency: () => ({
    mutate: (input: unknown, opts?: { onSuccess?: (edge: unknown) => void }) => {
      created(input);
      opts?.onSuccess?.({ id: 'new-edge' });
    },
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const { AddLinkSection } = await import('./AddLinkSection');

/** An eight-hour working day — so a day is 480 minutes and not 1440 (ADR-0068). */
const EIGHT_HOUR = { id: 'cal-8', name: 'Site week', hoursPerDay: 8 } as CalendarSummary;

const anchor = { id: 'a1', name: 'Pour slab', calendarId: null } as ActivitySummary;
const other = { id: 'a2', name: 'Strike formwork', calendarId: null } as ActivitySummary;

function renderSection(calendars: CalendarSummary[] = [EIGHT_HOUR]): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddLinkSection
        orgSlug="acme"
        planId="pl1"
        anchor={anchor}
        options={[other]}
        calendars={calendars}
        {...(calendars.length > 0 ? { planCalendarId: 'cal-8' } : {})}
        gate={{ writable: true, reason: null }}
      />
    </QueryClientProvider>,
  );
}

function lagField(): HTMLElement {
  return screen.getByLabelText(/^Lag \(/);
}

function submitWithLag(lag: string): void {
  fireEvent.change(screen.getByLabelText(/Predecessor activity/), { target: { value: 'a2' } });
  fireEvent.change(lagField(), { target: { value: lag } });
  fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
}

describe('AddLinkSection — sub-day lags', () => {
  beforeEach(() => {
    created.mockReset();
  });

  it('reads the field as text once the factor is known', () => {
    renderSection();
    // A number input would refuse `4h` before the parser ever saw it.
    expect(lagField()).toHaveAttribute('type', 'text');
    expect(lagField()).toHaveAccessibleName(expect.stringContaining('working time'));
  });

  it('sends exact minutes for a sub-day lag — the value the field could not express before', async () => {
    renderSection();
    submitWithLag('4h');
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith(expect.objectContaining({ lagMinutes: 240 }));
    });
    expect(created.mock.calls[0]?.[0]).not.toHaveProperty('lagDays');
  });

  it('still reads a bare number as days, on the plan calendar’s own day', async () => {
    // The property that makes this not a migration: `2` has always meant two days and still does —
    // 960 minutes on an eight-hour calendar, not 2,880.
    renderSection();
    submitWithLag('2');
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith(expect.objectContaining({ lagMinutes: 960 }));
    });
  });

  it('reads a lead as negative', async () => {
    renderSection();
    submitWithLag('-1d 4h');
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith(expect.objectContaining({ lagMinutes: -720 }));
    });
  });

  it('refuses weeks by name rather than guessing a length', async () => {
    renderSection();
    submitWithLag('1w');
    // Beside the field AND in the error summary — by design, so the message is reachable both by a
    // reader who is at the control and by one who submitted from the bottom of the form.
    expect(await screen.findAllByText(/Weeks are not supported/)).toHaveLength(2);
    expect(created).not.toHaveBeenCalled();
  });

  it('measures a 24-hour lag as ELAPSED time, not on the plan calendar', async () => {
    renderSection();
    fireEvent.change(screen.getByLabelText(/Lag calendar/), {
      target: { value: 'TWENTY_FOUR_HOUR' },
    });
    submitWithLag('1d');
    // 1,440 — NOT the plan calendar's 480. A seven-day cure is seven calendar days, which is the
    // entire reason that option exists and the trap ADR-0070 was written to prevent.
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith(expect.objectContaining({ lagMinutes: 1440 }));
    });
  });

  it('degrades to whole days when the calendar list has not resolved', async () => {
    renderSection([]);
    // Back to the bounded number spinner, which is also what a rollback restores — the degraded
    // state and the flag-off state are deliberately the same control.
    expect(lagField()).toHaveAttribute('type', 'number');
    // A number input already refuses `4h` at the keyboard, so the case that actually reaches the
    // submit guard is a well-formed value days cannot express: half a day, with no factor to read it.
    submitWithLag('1.5');
    expect(await screen.findAllByText(/Enter a whole number of days/)).not.toHaveLength(0);
    expect(created).not.toHaveBeenCalled();
  });

  it('sends days, not minutes, on the degraded path', async () => {
    renderSection([]);
    submitWithLag('3');
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith(expect.objectContaining({ lagDays: 3 }));
    });
    expect(created.mock.calls[0]?.[0]).not.toHaveProperty('lagMinutes');
  });
});
