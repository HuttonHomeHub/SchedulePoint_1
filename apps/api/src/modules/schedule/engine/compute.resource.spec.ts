import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Resource-dependent scheduling tests (M7, ADR-0035 §23 / ADR-0039). The engine treats a
 * `RESOURCE_DEPENDENT` activity **exactly like a `TASK` for logic** — its whole contribution is
 * that the *service* resolves its `calendar` port to the driving resource's calendar (or the
 * fallback chain) before the pass runs, and hands the engine a `resourceDriverMissing` flag when
 * no driving assignment existed. The engine therefore only has two jobs, both proven here:
 *   1. schedule the activity on whatever calendar port it is given (byte-identical to a `TASK`), and
 *   2. carry `resourceDriverMissing` through to the result + roll it up into the summary count.
 * The plan calendar is Mon–Fri, full days; `2026-01-05` is a Monday. `DAY = 1440` working-minutes.
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;

/** Mon–Fri, 24 h on working days — the plan calendar under test. */
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
/** The 24/7 elapsed calendar — a driving resource (crew/plant) that works weekends. */
const TWENTY_FOUR_SEVEN = allMinutesWorkCalendar;

function activity(
  id: string,
  type: EngineActivity['type'],
  durationMinutes: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity {
  return { id, durationMinutes, type, ...overrides };
}

function edge(predecessorId: string, successorId: string, type: DependencyType = 'FS'): EngineEdge {
  return { id: `${predecessorId}-${successorId}`, predecessorId, successorId, type, lagMinutes: 0 };
}

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
  return {
    byId: new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r])),
    summary: output.summary,
  };
}

describe('resource-dependent scheduling (M7, ADR-0035 §23 / ADR-0039)', () => {
  it('schedules a RESOURCE_DEPENDENT activity byte-identically to a TASK on the same calendar port', () => {
    // Same duration, same driving (24/7) calendar → the two must land on identical dates and float.
    // This proves the engine special-cases nothing for the resource type: it is a TASK for logic.
    const asTask = run([activity('A', 'TASK', 10 * DAY, { calendar: TWENTY_FOUR_SEVEN })]).byId.get(
      'A',
    )!;
    const asResource = run([
      activity('A', 'RESOURCE_DEPENDENT', 10 * DAY, { calendar: TWENTY_FOUR_SEVEN }),
    ]).byId.get('A')!;

    expect(asResource.earlyStart).toBe(asTask.earlyStart);
    expect(asResource.earlyFinish).toBe(asTask.earlyFinish);
    expect(asResource.lateStart).toBe(asTask.lateStart);
    expect(asResource.lateFinish).toBe(asTask.lateFinish);
    expect(asResource.totalFloat).toBe(asTask.totalFloat);
    expect(asResource.isCritical).toBe(asTask.isCritical);
  });

  it('drives a RESOURCE_DEPENDENT successor on its own (24/7) calendar while a 5-day peer waits for Monday', () => {
    // A (24/7 resource) finishes at the Sat 01-10 boundary (inclusive last day Fri 01-09). Its two
    // successors each roll onto their OWN resolved calendar: the 24/7-driven resource activity starts
    // Saturday; the plan-calendar TASK waits until Monday. Proves the port genuinely drives placement.
    const { byId } = run(
      [
        activity('A', 'RESOURCE_DEPENDENT', 5 * DAY, { calendar: TWENTY_FOUR_SEVEN }),
        activity('B', 'TASK', DAY), // inherits the 5-day plan calendar
        activity('C', 'RESOURCE_DEPENDENT', DAY, { calendar: TWENTY_FOUR_SEVEN }),
      ],
      [edge('A', 'B'), edge('A', 'C')],
    );
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-09'); // Fri (worked through the weekend)
    expect(byId.get('C')!.earlyStart).toBe('2026-01-10'); // Sat — the 24/7 crew starts at once
    expect(byId.get('B')!.earlyStart).toBe('2026-01-12'); // Mon — the 5-day work waits out the weekend
  });

  it('carries resourceDriverMissing through to the result and defaults it false', () => {
    const { byId } = run([
      activity('flagged', 'RESOURCE_DEPENDENT', DAY, { resourceDriverMissing: true }),
      activity('driven', 'RESOURCE_DEPENDENT', DAY, { calendar: TWENTY_FOUR_SEVEN }),
      activity('plain', 'TASK', DAY),
    ]);
    expect(byId.get('flagged')!.resourceDriverMissing).toBe(true);
    // A driven resource activity (has a resolved calendar) is not flagged.
    expect(byId.get('driven')!.resourceDriverMissing).toBe(false);
    // A non-resource activity is never flagged.
    expect(byId.get('plain')!.resourceDriverMissing).toBe(false);
  });

  it('a flagged activity still schedules (produce-and-flag, never dropped)', () => {
    // resourceDriverMissing means "no driving resource, scheduled on the fallback calendar" — the
    // activity is NOT excluded from the network. It must still get real dates.
    const { byId } = run(
      [
        activity('A', 'TASK', 2 * DAY),
        activity('B', 'RESOURCE_DEPENDENT', 3 * DAY, { resourceDriverMissing: true }),
      ],
      [edge('A', 'B')],
    );
    const b = byId.get('B')!;
    expect(b.resourceDriverMissing).toBe(true);
    expect(b.earlyStart).not.toBeNull();
    expect(b.earlyFinish).not.toBeNull();
    // A (2 days) Mon 01-05→Tue 01-06; B starts Wed 01-07 and runs 3 working days → Fri 01-09.
    expect(b.earlyStart).toBe('2026-01-07');
    expect(b.earlyFinish).toBe('2026-01-09');
  });

  it('rolls the driver-missing count into the summary (produce-and-flag, ADR-0035 §23)', () => {
    const { summary } = run([
      activity('a', 'RESOURCE_DEPENDENT', DAY, { resourceDriverMissing: true }),
      activity('b', 'RESOURCE_DEPENDENT', DAY, { resourceDriverMissing: true }),
      activity('c', 'RESOURCE_DEPENDENT', DAY, { calendar: TWENTY_FOUR_SEVEN }),
      activity('d', 'TASK', DAY),
    ]);
    expect(summary.resourceDriverMissingCount).toBe(2);
  });

  it('reports zero driver-missing when every resource activity is driven', () => {
    const { summary } = run([
      activity('a', 'RESOURCE_DEPENDENT', DAY, { calendar: TWENTY_FOUR_SEVEN }),
      activity('b', 'TASK', DAY),
    ]);
    expect(summary.resourceDriverMissingCount).toBe(0);
  });
});
