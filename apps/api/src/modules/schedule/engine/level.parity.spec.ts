import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { levelSchedule } from './level';
import type { EngineActivity, EngineAssignment, EngineEdge, EngineResource } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
} from './working-time-calendar';

/**
 * **A pre-refactor capture of what `levelSchedule` does today — not a specification of what it
 * should do.**
 *
 * ADR-0071 M2 gives the levelling pass per-assignment demand windows, which means editing the
 * occupancy model and the placement search together. The single most important sequencing rule in
 * that milestone is that these snapshots are taken **before** `level.ts` is touched: a snapshot
 * written afterwards asserts the refactor against itself and proves nothing. So this file exists
 * first, and its `.snap` is committed in the same commit as this line.
 *
 * Every scenario below is **zero-lag**, because zero-lag is the state of every plan in the system
 * today. If any of these snapshots move when M2 lands, the refactor has changed an existing plan's
 * levelled dates and the correct response is to stop, not to update the snapshot.
 *
 * The corpus deliberately spans the shapes the pass branches on rather than being a large random
 * sample: serialisation, float-first vs extend, `levelWithinFloatOnly`, a capacity > 1 resource
 * admitting partial concurrency, an exclusion that must not move, a non-24/7 calendar, several
 * resources interleaved, and a chain where a delay has to propagate. A shape the pass does not
 * branch on adds a snapshot to maintain and no protection.
 *
 * {@link ./level.spec.ts} keeps the hand-verified first-principles assertions; those say what is
 * *correct*. This file says what is *current*. Both matter and they are not the same claim.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (
  id: string,
  durationDays: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({ id, durationMinutes: durationDays * DAY, type: 'TASK', ...overrides });

const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: 0,
});

const assign = (
  activityId: string,
  resourceId: string,
  unitsPerHour: number,
): EngineAssignment => ({ activityId, resourceId, unitsPerHour });

const resource = (
  id: string,
  capacity: number,
  calendar = allMinutesWorkCalendar,
): EngineResource => ({
  id,
  capacity,
  calendar,
});

interface Scenario {
  name: string;
  activities: readonly EngineActivity[];
  edges: readonly EngineEdge[];
  assignments: readonly EngineAssignment[];
  resources: readonly EngineResource[];
  levelWithinFloatOnly?: boolean;
  calendar?: typeof allMinutesWorkCalendar;
}

/** Monday–Friday, so a weekend sits inside every multi-day span — the non-24/7 branch. */
const WEEKDAYS = buildWorkingTimeCalendar(fullDayWeek([1, 2, 3, 4, 5]), []);

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'two equal activities contend for a single-unit resource',
    activities: [task('A', 2), task('B', 2)],
    edges: [],
    assignments: [assign('A', 'CRANE', 1), assign('B', 'CRANE', 1)],
    resources: [resource('CRANE', 1)],
  },
  {
    name: 'a delay absorbed by float, ahead of a successor chain',
    activities: [task('A', 2), task('B', 2), task('C', 3), task('D', 1)],
    edges: [edge('A', 'C'), edge('C', 'D')],
    assignments: [assign('A', 'CRANE', 1), assign('B', 'CRANE', 1)],
    resources: [resource('CRANE', 1)],
  },
  {
    name: 'the same contention with levelWithinFloatOnly, which forbids extending',
    activities: [task('A', 2), task('B', 2), task('C', 3)],
    edges: [edge('A', 'C')],
    assignments: [assign('A', 'CRANE', 1), assign('B', 'CRANE', 1)],
    resources: [resource('CRANE', 1)],
    levelWithinFloatOnly: true,
  },
  {
    name: 'a capacity-2 resource admits partial concurrency',
    activities: [task('A', 2), task('B', 2), task('C', 2)],
    edges: [],
    assignments: [assign('A', 'GANG', 1), assign('B', 'GANG', 1), assign('C', 'GANG', 1)],
    resources: [resource('GANG', 2)],
  },
  {
    name: 'a milestone is an exclusion and never moves',
    activities: [task('A', 2), task('B', 2), task('M', 0, { type: 'START_MILESTONE' })],
    edges: [edge('M', 'A')],
    assignments: [assign('A', 'CRANE', 1), assign('B', 'CRANE', 1)],
    resources: [resource('CRANE', 1)],
  },
  {
    name: 'three resources interleaved, so the priority order is exercised',
    activities: [task('A', 2), task('B', 3), task('C', 1), task('D', 2), task('E', 1)],
    edges: [edge('A', 'D')],
    assignments: [
      assign('A', 'CRANE', 1),
      assign('B', 'CRANE', 1),
      assign('C', 'PUMP', 1),
      assign('D', 'PUMP', 1),
      assign('E', 'CRANE', 1),
    ],
    resources: [resource('CRANE', 1), resource('PUMP', 1)],
  },
  {
    name: 'a five-day working week, so every delay crosses a weekend',
    activities: [task('A', 3), task('B', 3)],
    edges: [],
    assignments: [assign('A', 'CRANE', 1), assign('B', 'CRANE', 1)],
    resources: [resource('CRANE', 1, WEEKDAYS)],
    calendar: WEEKDAYS,
  },
  {
    name: 'a delay that must propagate down a chain of successors',
    activities: [task('A', 3), task('B', 3), task('C', 1), task('D', 1), task('E', 1)],
    edges: [edge('B', 'C'), edge('C', 'D'), edge('D', 'E')],
    assignments: [assign('A', 'CRANE', 1), assign('B', 'CRANE', 1)],
    resources: [resource('CRANE', 1)],
  },
];

describe('levelSchedule — pre-ADR-0071 parity corpus (zero lag)', () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      const calendar = scenario.calendar ?? allMinutesWorkCalendar;
      const output = computeSchedule(scenario.activities, scenario.edges, {
        dataDate: DATA_DATE,
        calendar,
      });
      const leveled = levelSchedule(
        scenario.activities,
        output,
        scenario.assignments,
        scenario.resources,
        {
          levelWithinFloatOnly: scenario.levelWithinFloatOnly ?? false,
          dataDate: DATA_DATE,
          planCalendar: calendar,
        },
      );
      // Snapshot the fields levelling OWNS, sorted by id, so a reordering of the results array is
      // not mistaken for a scheduling change and a change to an unrelated CPM field is not either.
      const shape = [...leveled.results]
        .sort((a, b) => a.activityId.localeCompare(b.activityId))
        .map((r) => ({
          id: r.activityId,
          leveledStart: r.leveledStart ?? null,
          leveledFinish: r.leveledFinish ?? null,
          levelingDelay: r.levelingDelay ?? null,
          levelingWindowExceeded: r.levelingWindowExceeded ?? false,
          selfOverAllocated: r.selfOverAllocated ?? false,
        }));
      expect(shape).toMatchSnapshot();
    });
  }
});
