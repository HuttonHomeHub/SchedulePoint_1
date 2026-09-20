import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The Duration column reads on the calendar the work happens on (`docs/TECH_DEBT.md` #86).
 *
 * **Written because the M5 test-engineer review found that nothing set a non-null
 * `drivingResourceCalendarId` anywhere in the web suite.** Every existing fixture leaves it `null`,
 * and on a `null` driver the two frames are *identical by construction* — so swapping this call site
 * back to `{ kind: 'own' }` would have left the entire suite green. The epic's client half was
 * untested in the only state it changes.
 *
 * ## Why 600 minutes, and not the 7,200 the epic's own e2e uses
 *
 * `formatDurationRead` prints the row's own `durationDays` whenever the value divides evenly by the
 * factor, precisely so a whole-day plan does not churn. That branch is **factor-insensitive in its
 * output**: at 7,200 minutes both frames take it and both print `5 d`, so a test built on the
 * obvious fixture would assert a number the frame cannot change and prove nothing.
 *
 * 600 minutes takes the text branch on both (600 % 480 ≠ 0, 600 % 1440 ≠ 0) and prints a different
 * string on each: ten hours of crane time is `10h`, and the same ten minutes-per-hour read against
 * the crew's eight-hour day is `1d 2h`. That difference is the whole defect, in one cell.
 *
 * The flag is left at its ambient value (on since 2026-08-02), for the reason
 * `day-factor-divergence.characterisation.test.ts` gives: pinning it off takes `formatDurationRead`
 * down the whole-days branch where the factor is provably unused, and the file would then look like
 * it had proved something on a path the defect cannot occur on.
 */

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

const CREW_8H = 'cal-crew-8h';
const CRANE_24H = 'cal-crane-24h';
const CALENDARS: CalendarSummary[] = [calendar(CREW_8H, 8), calendar(CRANE_24H, 24)];

const BASE: ActivitySummary = {
  drivingResourceCalendarId: null,
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 1,
  durationMinutes: 600,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: CREW_8H,
  laneIndex: 0,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  remainingDurationDays: null,
  remainingDurationMinutes: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  constraintViolated: false,
  externalDriven: false,
  loeNoSpan: false,
  resourceDriverMissing: false,
  externalEarlyStart: null,
  externalLateFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  remainingFloat: null,
  levelingPriority: null,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderTable(data: ActivitySummary[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        calendars={CALENDARS}
      />
    </QueryClientProvider>,
  );
}

function durationCellOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe('ActivitiesTable — Duration reads the scheduling frame (#86)', () => {
  it('prints a driven row’s duration on its DRIVING resource’s calendar', () => {
    renderTable([
      {
        ...BASE,
        id: 'a1',
        name: 'Crane lift',
        type: 'RESOURCE_DEPENDENT',
        drivingResourceCalendarId: CRANE_24H,
      },
    ]);
    // 600 minutes on the crane's 24 h day: ten hours.
    expect(durationCellOf('Crane lift')).toHaveTextContent('10h');
    // And explicitly NOT the own-frame answer, so the assertion cannot be satisfied by a string
    // that merely happens to contain the right digits.
    expect(durationCellOf('Crane lift')).not.toHaveTextContent('1d 2h');
  });

  it('ignores a driving calendar on a TASK — the type gate, which is the other half of the rule', () => {
    // A TASK with an assigned resource keeps its own calendar (the A5500 contrast). Without this,
    // a build that read the driver for EVERY row would pass the case above.
    renderTable([
      {
        ...BASE,
        id: 'a2',
        name: 'Ordinary task',
        type: 'TASK',
        drivingResourceCalendarId: CRANE_24H,
      },
    ]);
    expect(durationCellOf('Ordinary task')).toHaveTextContent('1d 2h');
  });

  it('falls back to the row’s own calendar when a driven row has no driver', () => {
    renderTable([
      {
        ...BASE,
        id: 'a3',
        name: 'Unassigned lift',
        type: 'RESOURCE_DEPENDENT',
        drivingResourceCalendarId: null,
      },
    ]);
    expect(durationCellOf('Unassigned lift')).toHaveTextContent('1d 2h');
  });
});
