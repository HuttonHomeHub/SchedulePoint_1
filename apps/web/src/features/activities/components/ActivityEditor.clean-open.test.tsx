import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import type { ActivityEditorIntent } from '@/features/activities/lib/activity-editor-intent';

/**
 * **An editor opened and not touched has no unsaved work** (docs/specs/activity-editor-seeding, M3b
 * regression found by the `Report progress and Steps` journey).
 *
 * Seeding must never make a clean form dirty: every form is born with its row, and a value that
 * arrives later (a calendar's hours-per-day, a steps query) is a re-seed of the form's *baseline*,
 * not an edit. Each case opens on a tab, makes no edit and asks to close; the editor must close
 * with no confirmation. **Under StrictMode**, as the app is mounted: react-hook-form re-attaches each
 * registered field once at mount, and a field whose seed OMITS its key (a null physical %, an unset
 * priority or expense) then gains an explicit `undefined` key, which its deep-equal reads as a
 * difference from the defaults. The calendar differs from the 24 h default so the duration and the
 * remaining-hours seeds both move once the list lands.
 */

// The journeys run with the flags on, and the Progress tab's panels exist only behind these.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_STEPS_ENABLED: true,
  EARNED_VALUE_ENABLED: true,
  COST_ACCRUAL_ENABLED: true,
  ACTIVITY_CALENDAR_ENABLED: true,
  SUB_DAY_DURATIONS_ENABLED: true,
  ADVANCED_ACTIVITY_TYPES_ENABLED: true,
  INTER_PROJECT_DATES_ENABLED: true,
  RESOURCE_LEVELLING_ENABLED: true,
}));

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const ROW = {
  id: 'act-1',
  planId: 'plan-1',
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 1,
  durationMinutes: 240,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  percentComplete: 0,
  physicalPercentComplete: null,
  remainingDurationDays: 1,
  remainingDurationMinutes: 480,
  actualStart: null,
  actualFinish: null,
  suspendDate: null,
  resumeDate: null,
  calendarId: null,
  parentId: null,
  description: null,
  version: 1,
} as unknown as ActivitySummary;

const CALENDAR = {
  id: 'cal-1',
  name: 'Site',
  hoursPerDay: 8,
  hoursPerDayMinutes: 480,
} as unknown as CalendarSummary;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(url.includes('/steps') ? { data: [] } : { data: ROW }),
      } as unknown as Response),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

function Host({
  tab,
  withCalendarLate,
}: {
  tab: ActivityEditorIntent['tab'];
  withCalendarLate: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [calendars, setCalendars] = useState<CalendarSummary[]>([]);
  return (
    <>
      <button onClick={() => setCalendars([CALENDAR])}>calendars land</button>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open={open}
        onClose={() => setOpen(false)}
        activity={open ? ROW : undefined}
        intent={{ activityId: ROW.id, tab }}
        gating={GATING}
        calendars={withCalendarLate ? calendars : [CALENDAR]}
        planCalendarId={CALENDAR.id}
      />
    </>
  );
}

function mount(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `main.tsx` mounts the app under StrictMode, which re-attaches every registered field once at
  // mount; that is the condition under which a seed that omits a key reads as an edit.
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </StrictMode>,
  );
}

describe('an editor opened and left alone closes without a confirmation', () => {
  it.each([
    ['General', 'general', false],
    ['Progress', 'progress', false],
    ['Scheduling', 'scheduling', false],
    ['Cost', 'cost', false],
    ['General, calendar lands after open', 'general', true],
    ['Progress, calendar lands after open', 'progress', true],
  ] as const)('%s', async (_name, tab, late) => {
    mount(<Host tab={tab} withCalendarLate={late} />);
    // Let the steps query and any seed settle, as a real browser does before a key is pressed.
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (late) fireEvent.click(screen.getByRole('button', { name: 'calendars land' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
  });
});
