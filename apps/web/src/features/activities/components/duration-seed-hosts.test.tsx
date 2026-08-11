import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';
import { useDurationSeed } from '../model/use-duration-seed';

import { ActivityEditorDialog } from './ActivityEditorDialog';
import { ActivityFormDialog } from './ActivityFormDialog';

/**
 * **Both hosts hand `useDurationSeed` a live reader, not a captured value** (ADR-0070; `TECH_DEBT`
 * #83).
 *
 * The hook's own suite proves the rule — a late-arriving working-hours factor never overwrites what
 * a planner typed — by driving `readDuration` itself. What it cannot see is the wiring: the defect
 * that shipped was a **host** passing something captured by the render its effect belonged to (a
 * `dirtyFields` flag then; a watched value would do it again now), so the hook asked a question that
 * had already gone stale. There are two hosts, and this repository's signature defect is a correct
 * pattern applied to one and not its neighbour — so both are asserted here, in one file, from one
 * list.
 *
 * **Why the wiring and not the race.** The race cannot be reproduced in jsdom: `fireEvent` flushes
 * React synchronously, so even a re-captured value is current by the time the effect runs, and a
 * regressed host would pass a behavioural test. What distinguishes the two implementations is
 * whether the reader **stays** live — so the reader is captured before the field changes and called
 * after it, which is exactly the ordering the real race produces and the only part of it a unit test
 * can hold. The end-to-end behaviour stays `apps/web/e2e-sub-day/`, which is where #83 was found.
 */

vi.mock('../model/use-duration-seed', () => ({ useDurationSeed: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

function calendar(id: string, hoursPerDay: number): CalendarSummary {
  return {
    id,
    name: `${String(hoursPerDay)}-hour week`,
    description: null,
    workingWeekdays: 0b0011111,
    shifts: WorkingWeekdays.toFullDayShifts(0b0011111),
    hoursPerDay,
    hoursPerDayMinutes: Math.round(hoursPerDay * 60),
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const CALENDARS = [calendar('cal-8', 8)];

const ACTIVITY = {
  id: 'a1',
  planId: 'pl1',
  name: 'Lift steel',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 0,
  durationMinutes: 240,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  calendarId: null,
  parentId: null,
  version: 4,
} as unknown as ActivitySummary;

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

/** The last `{ readDuration, setDuration }` pair the host handed the hook. */
function lastWiring(): { readDuration: () => string; setDuration: (text: string) => void } {
  const call = vi.mocked(useDurationSeed).mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0];
}

/**
 * The two hosts, each rendered on the same sub-day row. `ActivityFormDialog` is the create/legacy
 * edit host; `ActivityEditorDialog` is the tabbed editor, whose General tab owns the field.
 */
const HOSTS = [
  {
    name: 'ActivityFormDialog',
    render: () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ActivityFormDialog
            orgSlug="acme"
            planId="pl1"
            open
            onClose={vi.fn()}
            activity={ACTIVITY}
            calendars={CALENDARS}
            planCalendarId="cal-8"
          />
        </QueryClientProvider>,
      ),
  },
  {
    name: 'ActivityEditorDialog',
    render: () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ActivityEditorDialog
            orgSlug="acme"
            planId="pl1"
            open
            onClose={vi.fn()}
            activity={ACTIVITY}
            gating={PLANNER_WITH_PEN}
            calendars={CALENDARS}
            planCalendarId="cal-8"
          />
        </QueryClientProvider>,
      ),
  },
] as const;

beforeEach(() => {
  vi.mocked(useDurationSeed).mockClear();
});

describe.each(HOSTS)('$name — the duration seed wiring', ({ render: renderHost }) => {
  it('reads the field’s value at the moment it is asked, not the one its render captured', () => {
    renderHost();
    // Captured BEFORE the edit — a reader closed over a render-scope value would answer with what
    // it saw here for the rest of that render's life, which is the whole of #83.
    const { readDuration } = lastWiring();
    expect(readDuration()).toBe('4h');

    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '2d 4h' } });

    expect(readDuration()).toBe('2d 4h');
  });

  it('writes through to the field, so a re-seed the planner has not pre-empted lands', () => {
    renderHost();
    const { setDuration } = lastWiring();

    act(() => setDuration('90m'));

    expect(screen.getByLabelText('Duration')).toHaveValue('90m');
  });
});
