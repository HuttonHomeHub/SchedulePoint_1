import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { WorkingWeekdays } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFloatPathsPanel } from './use-float-paths-panel';

/**
 * The target's day factor comes from the calendar it SCHEDULES on (`docs/TECH_DEBT.md` #86/#317).
 *
 * **Written because nothing in the web suite set a non-null `drivingResourceCalendarId` here.** On a
 * null driver `schedulingCalendarId` falls straight through to `ownCalendarId`, so the two frames
 * are identical by construction and this call site could have been swapped back to `{ kind: 'own' }`
 * with every existing test green. The rule it implements was unobserved.
 *
 * ## Why 600 minutes, and not a whole-day figure
 *
 * `formatRelativeFloat` delegates to `formatDurationText`, which prints a whole number of days
 * whenever the value divides evenly by the factor — and that branch is **factor-insensitive in its
 * output**. A relative float of 2,880 minutes prints `+2d` on the crane's 24 h day and `+6d` on the
 * crew's 8 h one, which does discriminate; but 7,200 prints `+5d` and `+15d`, and the obvious
 * "5 days" fixture (2,400) prints `+5d` against the crew and `+1d 16h` against the crane, so the
 * choice is not arbitrary. 600 takes the sub-day branch on BOTH — `10h` against the crane, `1d 2h`
 * against the crew — which keeps the assertion on one rendered string that only the frame can move.
 *
 * The flag is pinned ON because this file is about behaviour, not about the rollback contract that
 * `float-paths-flag-off.parity.test.tsx` owns.
 */

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FLOAT_PATHS_ENABLED: true,
}));

const CREW_8H = 'cal-crew-8h';
const CRANE_24H = 'cal-crane-24h';

function calendar(id: string, hoursPerDay: number): CalendarSummary {
  return {
    id,
    name: id,
    description: null,
    workingWeekdays: 0b0111110,
    shifts: WorkingWeekdays.toFullDayShifts(0b0111110),
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

const CALENDARS = [calendar(CREW_8H, 8), calendar(CRANE_24H, 24)];

function activity(overrides: Partial<ActivitySummary>): ActivitySummary {
  return {
    id: 'target',
    name: 'Crane lift',
    code: 'A100',
    type: 'TASK',
    calendarId: CREW_8H,
    drivingResourceCalendarId: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-05',
    totalFloat: 0,
    ...overrides,
  } as ActivitySummary;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          targetActivityId: 'target',
          // Index 0 is the driving path and renders no relative float at all, so the assertion
          // rides on index 1 — the first path that prints a magnitude.
          paths: [
            { index: 0, relativeFloatMinutes: 0, activityIds: ['target'] },
            { index: 1, relativeFloatMinutes: 600, activityIds: ['target'] },
          ],
          hasMorePaths: false,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function relativeFloatTextFor(target: ActivitySummary): Promise<string | null> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(
    () =>
      useFloatPathsPanel({
        orgSlug: 'acme',
        planId: 'plan-1',
        activities: [target],
        planCalendarId: CREW_8H,
        calendars: CALENDARS,
        selectedActivityId: 'target',
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );

  result.current.openWith('target');
  await waitFor(() => {
    expect(result.current.model).not.toBeNull();
  });
  return result.current.model?.rows[1]?.relativeFloatText ?? null;
}

describe('float paths — the target’s factor follows the scheduling calendar (#86)', () => {
  it('measures a DRIVEN target’s relative float on its driving resource’s calendar', async () => {
    const text = await relativeFloatTextFor(
      activity({ type: 'RESOURCE_DEPENDENT', drivingResourceCalendarId: CRANE_24H }),
    );
    // 600 minutes on the crane's 24 h day.
    expect(text).toBe('+10h');
    // And explicitly not the own-frame answer, so a string that merely contains the right digits
    // cannot satisfy this.
    expect(text).not.toBe('+1d 2h');
  });

  it('ignores a driving calendar on a TASK — the type gate', async () => {
    // A TASK with an assigned resource keeps its own calendar (the A5500 contrast). Without this, a
    // build reading the driver for every activity would pass the case above.
    const text = await relativeFloatTextFor(
      activity({ type: 'TASK', drivingResourceCalendarId: CRANE_24H }),
    );
    expect(text).toBe('+1d 2h');
  });

  it('falls back to the target’s own calendar when a driven target has no driver', async () => {
    const text = await relativeFloatTextFor(
      activity({ type: 'RESOURCE_DEPENDENT', drivingResourceCalendarId: null }),
    );
    expect(text).toBe('+1d 2h');
  });
});
