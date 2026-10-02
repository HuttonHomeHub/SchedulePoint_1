import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **The late Remaining seed lands even when nobody was looking at the field** (ADR-0169 M4;
 * `docs/TECH_DEBT.md` #83).
 *
 * `remaining` is registered only while the Progress tab is mounted, and RHF's `resetField` is a no-op
 * for a field that is not registered. The late seed fires when the calendar list lands, marks itself
 * resolved, and — with the reader on General — wrote nothing, so a later visit to Progress showed the
 * degraded whole-day seed under an hours label and a save wrote 8h over 4h.
 */

const PATCHES: Record<string, unknown>[] = [];

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-8',
    name: '8-hour week',
    description: null,
    workingWeekdays: 0b0011111,
    shifts: WorkingWeekdays.toFullDayShifts(0b0011111),
    hoursPerDay: 8,
    hoursPerDayMinutes: 480,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

/** Four hours remaining on an eight-hour calendar: `remainingDurationDays` is 1, the whole-day lie. */
const ROW = {
  id: 'a1',
  planId: 'pl1',
  name: 'Lift steel',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 1,
  durationMinutes: 480,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  calendarId: null,
  parentId: null,
  percentComplete: 10,
  remainingDurationDays: 1,
  remainingDurationMinutes: 240,
  version: 4,
} as unknown as ActivitySummary;

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

beforeEach(() => {
  PATCHES.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') PATCHES.push(JSON.parse(init.body as string));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: init?.method === 'PATCH' ? ROW : [] }),
      } as unknown as Response);
    }),
  );
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function element(calendars: CalendarSummary[]): React.ReactElement {
  return (
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={vi.fn()}
        activity={ROW}
        gating={GATING}
        calendars={calendars}
        planCalendarId="cal-8"
      />
    </QueryClientProvider>
  );
}

describe('a calendar list that lands while the reader is on another tab', () => {
  it('seeds Remaining in hours for the later visit, without marking it edited', () => {
    const { rerender } = render(element([]));
    rerender(element(CALENDARS));

    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));

    expect(screen.getByLabelText('Remaining duration')).toHaveValue('4h');
    expect(
      screen.queryByRole('tab', { name: /Progress.*unsaved changes/ }),
    ).not.toBeInTheDocument();
  });

  it('saves the exact minutes, not the degraded whole day', async () => {
    const { rerender } = render(element([]));
    rerender(element(CALENDARS));
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]).toMatchObject({ percentComplete: 50, remainingDurationMinutes: 240 });
  });

  it('keeps what the reader typed on Progress before the list landed, and its dirtiness', () => {
    const { rerender } = render(element([]));
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));

    rerender(element(CALENDARS));
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));

    expect(screen.getByLabelText('Percent complete')).toHaveValue(50);
    expect(screen.getByLabelText('Remaining duration')).toHaveValue('4h');
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();
  });
});
