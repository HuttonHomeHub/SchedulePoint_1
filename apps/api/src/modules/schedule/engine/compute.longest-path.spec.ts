import type { ConstraintType, DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule, type ComputeOptions } from './compute';
import type { CriticalPathDefinition, EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Longest-Path critical definition goldens (M6-F2, ADR-0035 §17–§20). The discriminator (fixture
 * A12700, scenario S07) is an **open-ended, negative-float** activity: it is critical under
 * `TOTAL_FLOAT ≤ 0` (its float is negative) but NOT under `LONGEST_PATH` (no driving chain reaches it
 * from the latest-finishing activity). Switching the definition changes only the critical FLAG — the
 * dates and float are identical. All values hand-verified on a 24/7 calendar (1 day = 1440 minutes).
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (
  id: string,
  durationDays: number,
  over: Partial<EngineActivity> = {},
): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
  ...over,
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
): EngineEdge => ({
  id: `${predecessorId}-${successorId}-${type}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: 0,
});

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  criticalDefinition: CriticalPathDefinition,
  extra: Partial<ComputeOptions> = {},
) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
    criticalDefinition,
    ...extra,
  });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

// Critical spine A(2)→B(4); a separate OPEN-ENDED X(3) with an early Finish-No-Later-Than that forces
// negative float (its late finish is clamped below its early finish) but leaves it off every driving
// chain. B finishes last (day 6), so it is the sole finish driver.
const SPINE: EngineActivity[] = [
  task('A', 2),
  task('B', 4),
  task('X', 3, { constraintType: 'FNLT' as ConstraintType, constraintDate: '2026-01-02' }),
];
const LOGIC: EngineEdge[] = [edge('A', 'B')];

describe('computeSchedule — Longest-Path critical definition (M6-F2)', () => {
  it('marks the open-ended negative-float activity critical under TOTAL_FLOAT (the default)', () => {
    const byId = run(SPINE, LOGIC, 'TOTAL_FLOAT');
    expect(byId.get('X')!.totalFloat).toBeLessThan(0); // FNLT clamps its late finish below early finish
    expect(byId.get('X')!.isCritical).toBe(true);
    expect(byId.get('A')!.isCritical).toBe(true);
    expect(byId.get('B')!.isCritical).toBe(true);
  });

  it('drops the open-ended activity from the critical set under LONGEST_PATH', () => {
    const byId = run(SPINE, LOGIC, 'LONGEST_PATH');
    // The driving chain A→B is the longest path; X is not reachable from the day-6 finish driver.
    expect(byId.get('A')!.isCritical).toBe(true);
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(byId.get('X')!.isCritical).toBe(false);
    // The definition changes only the FLAG — X's (negative) float is unchanged.
    expect(byId.get('X')!.totalFloat).toBeLessThan(0);
  });

  it('changes criticality only, never the dates (S07 is a flag-only differential)', () => {
    const tf = run(SPINE, LOGIC, 'TOTAL_FLOAT');
    const lp = run(SPINE, LOGIC, 'LONGEST_PATH');
    for (const id of ['A', 'B', 'X']) {
      const a = tf.get(id)!;
      const b = lp.get(id)!;
      expect({
        es: b.earlyStart,
        ef: b.earlyFinish,
        ls: b.lateStart,
        lf: b.lateFinish,
        f: b.totalFloat,
      }).toEqual({
        es: a.earlyStart,
        ef: a.earlyFinish,
        ls: a.lateStart,
        lf: a.lateFinish,
        f: a.totalFloat,
      });
    }
  });

  it('walks the full driving chain back from the finish driver, including a merge', () => {
    // A(2)→B(2)→D(1); C(6)→D. C drives D (day 6); B feeds D with float. D is the finish driver.
    // Longest path = C→D (the driving ties); A and B are NOT on it though A→B→D is contiguous logic.
    const byId = run(
      [task('A', 2), task('B', 2), task('C', 6), task('D', 1)],
      [edge('A', 'B'), edge('B', 'D'), edge('C', 'D')],
      'LONGEST_PATH',
    );
    expect(byId.get('C')!.isCritical).toBe(true);
    expect(byId.get('D')!.isCritical).toBe(true);
    expect(byId.get('A')!.isCritical).toBe(false);
    expect(byId.get('B')!.isCritical).toBe(false);
  });

  it('widens the critical band with a positive TOTAL_FLOAT threshold', () => {
    // A(2)→B(2)→D(1); C(6)→D. B carries 2 days (2880 min) of total float; with a 2-day threshold it
    // becomes critical too, while near-critical (which excludes critical) no longer double-counts it.
    const byId = run(
      [task('A', 2), task('B', 2), task('C', 6), task('D', 1)],
      [edge('A', 'B'), edge('B', 'D'), edge('C', 'D')],
      'TOTAL_FLOAT',
      { criticalFloatThresholdMinutes: 2 * DAY },
    );
    expect(byId.get('B')!.totalFloat).toBe(2 * DAY);
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(byId.get('B')!.isNearCritical).toBe(false);
  });
});
