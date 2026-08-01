import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarFormDialog } from './CalendarFormDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type * as Env from '@/config/env';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
// Flag ON. The flag-off surface stays pinned by `CalendarFormDialog.test.tsx`, which is kept rather
// than weakened — it is the rollback contract (ADR-0053 M6 precedent).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  CALENDAR_SHIFT_EDITOR_ENABLED: true,
}));

const CALENDAR: CalendarSummary = {
  id: 'cal-1',
  name: 'Site',
  description: null,
  workingWeekdays: 31,
  shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1020 })),
  hoursPerDay: 9,
  hoursPerDayMinutes: 540,
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
      <AnnouncerProvider>
        <CalendarFormDialog orgSlug="acme" open onClose={vi.fn()} calendar={CALENDAR} {...props} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

/** A day's periods as `["08:00–17:00"]`, read from the rendered fields. */
function hoursOf(day: string): string[] {
  const group = within(screen.getByRole('group', { name: `${day} hours` }));
  const starts = group.queryAllByRole('textbox', { name: /^Start time/ });
  const ends = group.queryAllByRole('textbox', { name: /^End time/ });
  return starts.map(
    (start, index) =>
      `${(start as HTMLInputElement).value}–${(ends[index] as HTMLInputElement | undefined)?.value ?? ''}`,
  );
}

async function sentShifts(): Promise<
  { weekday: number; startMinute: number; endMinute: number }[]
> {
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PATCH')!;
  const body = JSON.parse(call[1]?.body as string) as {
    shifts: { weekday: number; startMinute: number; endMinute: number }[];
  };
  return body.shifts;
}

describe('WeeklyShiftEditor — presets', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...CALENDAR, exceptions: [] });
  });

  function applyPreset(label: RegExp): void {
    fireEvent.click(screen.getByRole('button', { name: 'Start from a preset' }));
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
  }

  it('labels every preset with its hours, so the choice is not a guess', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Start from a preset' }));
    expect(
      screen.getByRole('menuitem', { name: /Standard week — Mon–Fri, 08:00–17:00/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Two shift/ })).toHaveTextContent('06:00–14:00');
  });

  it('replaces every day, not only the ones the preset works', () => {
    renderDialog();
    applyPreset(/Two shift/);
    expect(hoursOf('Monday')).toEqual(['06:00–14:00', '14:00–22:00']);
    expect(hoursOf('Friday')).toEqual(['06:00–14:00', '14:00–22:00']);
    // Saturday held nothing and still holds nothing — but a preset that only ADDED would leave a
    // previous week's Saturday behind, which is the failure this asserts against.
    expect(hoursOf('Saturday')).toEqual([]);
  });

  it('empties the week for Window-only, rather than leaving the old one in place', () => {
    renderDialog();
    applyPreset(/Window-only/);
    for (const day of ['Monday', 'Wednesday', 'Sunday']) {
      expect(hoursOf(day)).toEqual([]);
    }
  });

  it('announces what the week became', async () => {
    renderDialog();
    applyPreset(/24\/7/);
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Working week set to Every day, all day.',
      ),
    );
  });

  /** A preset is a verb: it writes windows and then has no further existence. */
  it('lets a single day be edited afterwards without disturbing the others', async () => {
    renderDialog();
    applyPreset(/Standard week/);
    const monday = within(screen.getByRole('group', { name: 'Monday hours' }));
    fireEvent.change(monday.getByRole('textbox', { name: /^End time/ }), {
      target: { value: '15:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const shifts = await sentShifts();
    expect(shifts[0]).toEqual({ weekday: 0, startMinute: 480, endMinute: 930 });
    expect(shifts[1]).toEqual({ weekday: 1, startMinute: 480, endMinute: 1020 });
  });

  /** A calendar IS its windows: nothing may persist which preset produced them. */
  it('sends no preset identifier of any kind', async () => {
    renderDialog();
    applyPreset(/Two shift/);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const call = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(call[1]?.body as string).not.toMatch(/preset|two-shift|standard/i);
  });
});

describe('WeeklyShiftEditor — copy day', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...CALENDAR, exceptions: [] });
  });

  function copy(day: string, target: RegExp): void {
    fireEvent.click(screen.getByRole('button', { name: `Copy ${day} to…` }));
    fireEvent.click(screen.getByRole('menuitem', { name: target }));
  }

  it('copies a day’s hours onto the weekend', () => {
    renderDialog();
    copy('Monday', /the weekend/);
    expect(hoursOf('Saturday')).toEqual(['08:00–17:00']);
    expect(hoursOf('Sunday')).toEqual(['08:00–17:00']);
  });

  it('replaces what the target day held rather than merging into it', () => {
    renderDialog();
    const saturday = within(screen.getByRole('group', { name: 'Saturday hours' }));
    fireEvent.click(saturday.getByRole('button', { name: /^Add hours/ }));
    copy('Monday', /every other day/);
    expect(hoursOf('Saturday')).toEqual(['08:00–17:00']);
  });

  /** The overwrite is the half a planner cannot see once it has happened. */
  it('announces which days were overwritten', async () => {
    renderDialog();
    copy('Monday', /the weekend/);
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Monday hours — 08:00–17:00 — copied to Saturday, Sunday, replacing what those days held',
      ),
    );
  });

  it('copies an empty day, so “Friday doesn’t work either” is expressible', () => {
    renderDialog();
    copy('Saturday', /the other weekdays/);
    expect(hoursOf('Friday')).toEqual([]);
  });

  it('offers a copy menu on every day, keyboard-reachable as a real button', () => {
    renderDialog();
    for (const day of ['Monday', 'Sunday']) {
      const trigger = screen.getByRole('button', { name: `Copy ${day} to…` });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).not.toHaveAttribute('disabled');
    }
  });

  it('offers neither preset nor copy to a reader', () => {
    renderDialog({ readOnly: true });
    expect(screen.queryByRole('button', { name: 'Start from a preset' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Copy / })).not.toBeInTheDocument();
  });
});
