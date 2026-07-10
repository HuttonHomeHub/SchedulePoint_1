import type { ConstraintType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { allDaysWorkCalendar } from './calendar';
import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';

const DATA_DATE = '2026-01-01';

const task = (
  id: string,
  durationDays: number,
  constraint?: { type: ConstraintType; date: string },
): EngineActivity => ({
  id,
  durationDays,
  type: 'TASK',
  constraintType: constraint?.type ?? null,
  constraintDate: constraint?.date ?? null,
});
const edge = (predecessorId: string, successorId: string): EngineEdge => ({
  predecessorId,
  successorId,
  type: 'FS',
  lagDays: 0,
});

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allDaysWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

describe('constraint clamping — forward (early dates)', () => {
  it('SNET pushes the early start out to the constraint date', () => {
    const { byId } = run([task('A', 2, { type: 'SNET', date: '2026-01-04' })]);
    expect(byId.get('A')!.earlyStartOffset).toBe(3);
    expect(byId.get('A')!.earlyStart).toBe('2026-01-04');
  });

  it('FNET lands the early finish exactly on the constraint date', () => {
    const { byId } = run([task('A', 3, { type: 'FNET', date: '2026-01-06' })]);
    expect(byId.get('A')!.earlyStartOffset).toBe(3); // finishOffset(6) − D(3)
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-06');
  });

  it('MSO pins the early start on the constraint date regardless of logic', () => {
    const { byId } = run([task('A', 2, { type: 'MSO', date: '2026-01-05' })]);
    expect(byId.get('A')!.earlyStart).toBe('2026-01-05');
  });

  it('MFO pins the early finish on the constraint date', () => {
    const { byId } = run([task('A', 2, { type: 'MFO', date: '2026-01-05' })]);
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-05');
  });
});

describe('constraint clamping — backward (float)', () => {
  it('SNLT tightens the late start and removes float', () => {
    // A has 3 days of slack against the 5-day critical B; SNLT (start by day 0)
    // pulls its late start back to the data date, taking that float to zero.
    const { byId } = run([task('A', 2, { type: 'SNLT', date: '2026-01-01' }), task('B', 5)]);
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(byId.get('A')!.lateStartOffset).toBe(0);
    expect(byId.get('A')!.totalFloat).toBe(0);
  });

  it('an unsatisfiable FNLT surfaces as negative float and criticality', () => {
    // A(5) → B(1); B must finish by day 3 but cannot start until day 5.
    const { byId } = run(
      [task('A', 5), task('B', 1, { type: 'FNLT', date: '2026-01-03' })],
      [edge('A', 'B')],
    );
    expect(byId.get('B')!.totalFloat).toBe(-3);
    expect(byId.get('B')!.isCritical).toBe(true);
  });
});

describe('constraint clamping — pins do not silently drop logic', () => {
  it('a MSO earlier than logic holds the pin and surfaces the conflict on the predecessor', () => {
    // A(3) → B(2); B is pinned to start on day 1, but A does not finish until day 3.
    const { byId } = run(
      [task('A', 3), task('B', 2, { type: 'MSO', date: '2026-01-02' })],
      [edge('A', 'B')],
    );
    expect(byId.get('B')!.earlyStartOffset).toBe(1); // the pin holds
    expect(byId.get('A')!.totalFloat).toBe(-2); // the impossibility is visible on A
    expect(byId.get('A')!.isCritical).toBe(true);
  });
});

describe('mandatory constraints are parked as their moderate equivalents', () => {
  it('MANDATORY_START behaves as MSO and is counted', () => {
    const { byId, summary } = run([task('A', 2, { type: 'MANDATORY_START', date: '2026-01-03' })]);
    expect(byId.get('A')!.earlyStart).toBe('2026-01-03'); // pinned like MSO
    expect(summary.parkedConstraintCount).toBe(1);
  });

  it('MANDATORY_FINISH behaves as MFO and is counted', () => {
    const { byId, summary } = run([task('A', 2, { type: 'MANDATORY_FINISH', date: '2026-01-05' })]);
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-05'); // pinned like MFO
    expect(summary.parkedConstraintCount).toBe(1);
  });

  it('leaves parkedConstraintCount at zero when only moderate constraints are used', () => {
    const { summary } = run([task('A', 2, { type: 'SNET', date: '2026-01-04' })]);
    expect(summary.parkedConstraintCount).toBe(0);
  });
});
