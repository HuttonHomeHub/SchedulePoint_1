import type { ConstraintType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Secondary constraint (ADR-0035 §10, M4-F3). A second (type, date) per activity: the primary drives
 * the **forward** pass (early dates), the secondary drives the **backward** pass (late dates) only.
 * A secondary of a forward-only kind (SNET/FNET) is a documented no-op on the backward clamp, and no
 * secondary at all leaves the single-constraint result byte-identical.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (
  id: string,
  durationDays: number,
  constraint?: {
    type: ConstraintType;
    date: string;
    secondaryType?: ConstraintType;
    secondaryDate?: string;
  },
): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
  constraintType: constraint?.type ?? null,
  constraintDate: constraint?.date ?? null,
  secondaryConstraintType: constraint?.secondaryType ?? null,
  secondaryConstraintDate: constraint?.secondaryDate ?? null,
});

const edge = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}-FS`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
});

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

describe('secondary constraint — backward pass only (ADR-0035 §10)', () => {
  // A(2) → C(1); B(6) → C(1). A carries 4 days of float against the 6-day B path.
  const floatedNetwork = (a: EngineActivity) =>
    run([a, task('B', 6), task('C', 1)], [edge('A', 'C'), edge('B', 'C')]);

  it('a FNLT secondary tightens the late finish (cuts float) without moving the early dates', () => {
    const base = floatedNetwork(task('A', 2));
    // No secondary: A floats by 4 days against the long B path.
    expect(base.byId.get('A')!.totalFloat).toBe(4 * DAY);

    const withSecondary = floatedNetwork(
      task('A', 2, {
        type: 'SNET',
        date: '2026-01-01',
        secondaryType: 'FNLT',
        secondaryDate: '2026-01-03',
      }),
    );
    const a = withSecondary.byId.get('A')!;
    // Early (forward) dates are untouched — the SNET(01-01) is a no-op at the data date.
    expect(a.earlyStartOffset).toBe(0);
    expect(a.earlyFinishOffset).toBe(2 * DAY);
    // The FNLT(01-03) secondary clamps the late finish to the end of 01-03 (offset 3 days), so the
    // 4-day float collapses to 1 day — the backward pass moved, the forward pass did not.
    expect(a.lateFinishOffset).toBe(3 * DAY);
    expect(a.totalFloat).toBe(1 * DAY);
  });

  it('a forward-only secondary (SNET) is a no-op on the backward pass', () => {
    const base = floatedNetwork(task('A', 2));
    const withForwardOnlySecondary = floatedNetwork(
      task('A', 2, {
        type: 'FNLT',
        date: '2026-01-30',
        secondaryType: 'SNET',
        secondaryDate: '2026-01-02',
      }),
    );
    // The SNET secondary does not clamp the backward pass, so A's float is unchanged from the base.
    expect(withForwardOnlySecondary.byId.get('A')!.totalFloat).toBe(base.byId.get('A')!.totalFloat);
  });

  it('primary (forward) and secondary (backward) are both active on one activity', () => {
    // A(2) parallel to a longer B(5). SNET moves A's early start; FNLT tightens its late finish.
    const network = (a: EngineActivity) => run([a, task('B', 5)]);
    const base = network(task('A', 2, { type: 'SNET', date: '2026-01-03' }));
    // Primary only: A starts on 01-03 and floats against B (finishes on offset 5).
    expect(base.byId.get('A')!.earlyStartOffset).toBe(2 * DAY); // SNET forward active
    expect(base.byId.get('A')!.totalFloat).toBe(1 * DAY); // slack against B

    const both = network(
      task('A', 2, {
        type: 'SNET',
        date: '2026-01-03',
        secondaryType: 'FNLT',
        secondaryDate: '2026-01-04',
      }),
    );
    const a = both.byId.get('A')!;
    expect(a.earlyStartOffset).toBe(2 * DAY); // SNET still drives the forward pass
    expect(a.lateFinishOffset).toBe(4 * DAY); // FNLT(01-04) drives the backward pass
    expect(a.totalFloat).toBe(0); // the two together pin A
    expect(a.isCritical).toBe(true);
  });

  it('no secondary is byte-identical to the single-constraint result', () => {
    const primaryOnly = run([task('A', 2, { type: 'SNET', date: '2026-01-04' })]);
    const withNullSecondary = run([
      { ...task('A', 2, { type: 'SNET', date: '2026-01-04' }), secondaryConstraintType: null },
    ]);
    expect(withNullSecondary.byId.get('A')).toEqual(primaryOnly.byId.get('A'));
  });
});
