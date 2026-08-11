import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';
import { ActivityFormDialog } from './ActivityFormDialog';

/**
 * **A duration typed before the calendar list resolves survives the re-seed — on BOTH hosts**
 * (ADR-0070; `docs/TECH_DEBT.md` #83).
 *
 * `use-duration-seed.test.ts` proves the rule at the hook, driving `readDuration` directly. What no
 * hook test can see is that a host actually *composes* it: there are two dialogs carrying this
 * field, and this repository's signature defect is a correct pattern applied to one host and not its
 * neighbour (ADR-0064 §7, ADR-0080). So both are driven here, from one list, through the surface a
 * planner touches — the field, not the wiring.
 *
 * The sequence is the one #83 describes: the dialog opens with the factor unknown (the calendar
 * query is still in flight, so the field degrades to whole working days), the planner types, and
 * *then* the list resolves. Both directions are asserted, because only the pair is a statement:
 * an untouched field **is** re-seeded from the row's exact minutes, and a typed one **is not**.
 * Without the first, this would pass on a host that had stopped re-seeding altogether — the
 * ADR-0080 "assert the unsqueezed control too" rule.
 *
 * **What it does not cover, and where that lives.** jsdom flushes React synchronously inside
 * `fireEvent`, so the genuine interleaving — a keystroke and a network response as independent
 * events, with no render between them — is not reproducible here; a host that regressed to a
 * render-captured flag could still pass this file. That case is held at the hook (`does NOT
 * overwrite a value typed before the factor arrives`) and end-to-end in `apps/web/e2e-sub-day/`,
 * which is where #83 was found in the first place. This file's job is the composition either side
 * of it.
 */

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

/** The list once the query settles. Before that the hosts are handed `[]` — nothing resolves. */
const CALENDARS = [calendar('cal-8', 8)];

/** Four hours on an eight-hour calendar: the shape the whole ADR exists for. `durationDays` is 0. */
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

/**
 * Each host as a function of the calendar list, so a test can open it empty (the query in flight)
 * and re-render it full (the query resolved) without remounting — a remount would re-seed for a
 * different reason and prove nothing.
 */
const HOSTS = [
  {
    name: 'ActivityFormDialog',
    element: (calendars: CalendarSummary[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <ActivityFormDialog
          orgSlug="acme"
          planId="pl1"
          open
          onClose={vi.fn()}
          activity={ACTIVITY}
          calendars={calendars}
          planCalendarId="cal-8"
        />
      </QueryClientProvider>
    ),
  },
  {
    name: 'ActivityEditorDialog',
    element: (calendars: CalendarSummary[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <ActivityEditorDialog
          orgSlug="acme"
          planId="pl1"
          open
          onClose={vi.fn()}
          activity={ACTIVITY}
          gating={PLANNER_WITH_PEN}
          calendars={calendars}
          planCalendarId="cal-8"
        />
      </QueryClientProvider>
    ),
  },
] as const;

/** The degraded control's label — it states the unit precisely because the unit is then fixed. */
const DEGRADED = 'Duration (working days)';

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(HOSTS)('$name — a late calendar list', ({ element }) => {
  it('re-seeds an untouched duration from the row’s exact minutes', () => {
    const { rerender } = render(element([]));
    // Whole working days is all the field can say without a factor, and four hours rounds to zero
    // — the value the planner used to be shown, and used to save over the top of the real one.
    expect(screen.getByLabelText(DEGRADED)).toHaveValue(0);

    rerender(element(CALENDARS));

    expect(screen.getByLabelText('Duration')).toHaveValue('4h');
  });

  it('leaves a duration typed before it arrived exactly as typed', () => {
    const { rerender } = render(element([]));
    fireEvent.change(screen.getByLabelText(DEGRADED), { target: { value: '2' } });

    rerender(element(CALENDARS));

    // Not '4h': a value the planner entered always outranks a default that arrives after it.
    expect(screen.getByLabelText('Duration')).toHaveValue('2');
  });
});
