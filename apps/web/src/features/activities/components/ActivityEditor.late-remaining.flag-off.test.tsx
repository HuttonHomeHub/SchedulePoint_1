import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **With `VITE_PROGRESS_INGESTION` off the Remaining input is never registered, so the late seed has
 * no field to find** — yet the save still sends `values.remaining`. It must send the hours the row
 * holds, not the degraded whole day (see `ActivityEditor.late-remaining.test.tsx`).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PROGRESS_INGESTION_ENABLED: false,
}));

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

describe('a late calendar list with the Remaining input hidden by its flag', () => {
  it('still saves the row’s exact remaining minutes', async () => {
    const { rerender } = render(element([]));
    rerender(element(CALENDARS));
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    expect(screen.queryByLabelText(/Remaining duration/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]).toMatchObject({ remainingDurationMinutes: 240 });
  });
});
