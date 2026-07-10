import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { allDaysWorkCalendar } from './calendar';
import { computeSchedule } from './compute';
import { ScheduleGraphNotADagError } from './errors';
import type { EngineActivity, EngineEdge, EngineResult } from './types';

const DATA_DATE = '2026-01-01';

const task = (id: string, durationDays: number): EngineActivity => ({
  id,
  durationDays,
  type: 'TASK',
});
const milestone = (id: string): EngineActivity => ({
  id,
  durationDays: 0,
  type: 'START_MILESTONE',
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagDays = 0,
): EngineEdge => ({ predecessorId, successorId, type, lagDays });

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[]) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allDaysWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

/** Compact offset view for hand-verified assertions. */
const offsets = (r: EngineResult) => ({
  es: r.earlyStartOffset,
  ef: r.earlyFinishOffset,
  ls: r.lateStartOffset,
  lf: r.lateFinishOffset,
  tf: r.totalFloat,
});

describe('computeSchedule — worked CPM example (all values hand-verified)', () => {
  // A(3) → B(4) → D(5) → E(1); A(3) → C(2) → D(5). All FS, lag 0.
  // Critical chain A→B→D→E; C carries 2 working days of float.
  const activities = [task('A', 3), task('B', 4), task('C', 2), task('D', 5), task('E', 1)];
  const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D'), edge('D', 'E')];

  it('computes the forward pass (ES/EF)', () => {
    const { byId } = run(activities, edges);
    expect(offsets(byId.get('A')!)).toMatchObject({ es: 0, ef: 3 });
    expect(offsets(byId.get('B')!)).toMatchObject({ es: 3, ef: 7 });
    expect(offsets(byId.get('C')!)).toMatchObject({ es: 3, ef: 5 });
    expect(offsets(byId.get('D')!)).toMatchObject({ es: 7, ef: 12 });
    expect(offsets(byId.get('E')!)).toMatchObject({ es: 12, ef: 13 });
  });

  it('computes the backward pass (LS/LF) and total float', () => {
    const { byId } = run(activities, edges);
    expect(offsets(byId.get('A')!)).toMatchObject({ ls: 0, lf: 3, tf: 0 });
    expect(offsets(byId.get('B')!)).toMatchObject({ ls: 3, lf: 7, tf: 0 });
    expect(offsets(byId.get('C')!)).toMatchObject({ ls: 5, lf: 7, tf: 2 });
    expect(offsets(byId.get('D')!)).toMatchObject({ ls: 7, lf: 12, tf: 0 });
    expect(offsets(byId.get('E')!)).toMatchObject({ ls: 12, lf: 13, tf: 0 });
  });

  it('flags the critical chain and only the critical chain', () => {
    const { byId } = run(activities, edges);
    expect(byId.get('A')!.isCritical).toBe(true);
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(byId.get('D')!.isCritical).toBe(true);
    expect(byId.get('E')!.isCritical).toBe(true);
    expect(byId.get('C')!.isCritical).toBe(false);
    expect(byId.get('C')!.isNearCritical).toBe(true); // float 2 ≤ 5
  });

  it('maps offsets to inclusive calendar dates (ADR-0023)', () => {
    const { byId, summary } = run(activities, edges);
    // A: starts on the data date, spans 3 days → finishes on the 3rd (inclusive).
    expect(byId.get('A')!.earlyStart).toBe('2026-01-01');
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-03');
    // E: a 1-day activity starting on offset 12 → the 13th, start = finish.
    expect(byId.get('E')!.earlyStart).toBe('2026-01-13');
    expect(byId.get('E')!.earlyFinish).toBe('2026-01-13');
    expect(summary.projectFinish).toBe('2026-01-13');
    expect(summary.projectFinishOffset).toBe(13);
  });

  it('rolls up the plan summary', () => {
    const { summary } = run(activities, edges);
    expect(summary).toMatchObject({
      activityCount: 5,
      criticalCount: 4,
      nearCriticalCount: 1,
      parkedConstraintCount: 0,
    });
  });
});

describe('computeSchedule — each relationship type with lag', () => {
  // p(3) → s(2), varying the type and lag; assert the successor's offsets.
  const network = (type: DependencyType, lag: number) =>
    run([task('p', 3), task('s', 2)], [edge('p', 's', type, lag)]);

  it('FS+2: successor starts 2 after the predecessor finishes', () => {
    expect(offsets(network('FS', 2).byId.get('s')!)).toMatchObject({ es: 5, ef: 7 });
  });

  it('SS+2: successor starts 2 after the predecessor starts', () => {
    expect(offsets(network('SS', 2).byId.get('s')!)).toMatchObject({ es: 2, ef: 4 });
  });

  it('FF+2: successor finishes 2 after the predecessor finishes', () => {
    const s = network('FF', 2).byId.get('s')!;
    expect(offsets(s)).toMatchObject({ es: 3, ef: 5 }); // EF = EF_p + 2 = 5
  });

  it('SF+2: successor finishes 2 after the predecessor starts', () => {
    const s = network('SF', 2).byId.get('s')!;
    expect(offsets(s)).toMatchObject({ es: 0, ef: 2 }); // EF = ES_p + 2 = 2
  });

  it('FS−1 (a lead) pulls the successor earlier', () => {
    expect(offsets(network('FS', -1).byId.get('s')!)).toMatchObject({ es: 2, ef: 4 });
  });

  it('floors the early start at the data date when a lead would go negative', () => {
    // SS−5 wants ES_s = −5; the data date (offset 0) is the floor.
    expect(offsets(network('SS', -5).byId.get('s')!)).toMatchObject({ es: 0, ef: 2 });
  });
});

describe('computeSchedule — milestones', () => {
  it('places a start milestone with no predecessors on the data date', () => {
    const { byId } = run([milestone('M')], []);
    const m = byId.get('M')!;
    expect(offsets(m)).toMatchObject({ es: 0, ef: 0 });
    expect(m.earlyStart).toBe('2026-01-01');
    expect(m.earlyFinish).toBe('2026-01-01'); // start = finish for a zero-duration node
  });

  it('a finish milestone sits the day after the driving task’s last day', () => {
    // A(5) FS→ M(0). A occupies days 1–5 (inclusive); M is the instant after → day 6.
    const { byId, summary } = run([task('A', 5), milestone('M')], [edge('A', 'M')]);
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-05');
    expect(byId.get('M')!.earlyStart).toBe('2026-01-06');
    expect(byId.get('M')!.earlyFinish).toBe('2026-01-06');
    // The milestone drives the project finish date one day past the task’s last day.
    expect(summary.projectFinish).toBe('2026-01-06');
  });
});

describe('computeSchedule — parallel paths & the near-critical band', () => {
  // Three open-start tasks A(10), B(5), C(4) all FS→ E(milestone). T = 10.
  // Floats: A 0 (critical), B 5 (near-critical, boundary), C 6 (neither).
  const activities = [task('A', 10), task('B', 5), task('C', 4), milestone('E')];
  const edges = [edge('A', 'E'), edge('B', 'E'), edge('C', 'E')];

  it('marks float ≤ 0 critical, 0 < float ≤ 5 near-critical, and > 5 neither', () => {
    const { byId } = run(activities, edges);
    expect(byId.get('A')!.totalFloat).toBe(0);
    expect(byId.get('A')!.isCritical).toBe(true);

    expect(byId.get('B')!.totalFloat).toBe(5);
    expect(byId.get('B')!.isCritical).toBe(false);
    expect(byId.get('B')!.isNearCritical).toBe(true);

    expect(byId.get('C')!.totalFloat).toBe(6);
    expect(byId.get('C')!.isCritical).toBe(false);
    expect(byId.get('C')!.isNearCritical).toBe(false);
  });
});

describe('computeSchedule — degenerate shapes', () => {
  it('returns an empty result and null finish for an empty plan', () => {
    const { results, summary } = run([], []);
    expect(results).toEqual([]);
    expect(summary.projectFinishOffset).toBeNull();
    expect(summary.projectFinish).toBeNull();
    expect(summary.activityCount).toBe(0);
  });

  it('schedules islands (no edges): each starts at the data date, floats to the finish', () => {
    // A(3) and B(5) disconnected → T = 5; A carries 2 float, B is critical.
    const { byId, summary } = run([task('A', 3), task('B', 5)], []);
    expect(offsets(byId.get('A')!)).toMatchObject({ es: 0, ef: 3, tf: 2 });
    expect(offsets(byId.get('B')!)).toMatchObject({ es: 0, ef: 5, tf: 0 });
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(summary.projectFinish).toBe('2026-01-05');
  });

  it('fails loud (does not loop) if a cycle reaches the engine', () => {
    expect(() =>
      computeSchedule([task('A', 1), task('B', 1)], [edge('A', 'B'), edge('B', 'A')], {
        dataDate: DATA_DATE,
        calendar: allDaysWorkCalendar,
      }),
    ).toThrow(ScheduleGraphNotADagError);
  });
});
