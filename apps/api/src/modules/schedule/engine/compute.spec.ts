import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { ScheduleGraphNotADagError } from './errors';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

const DATA_DATE = '2026-01-01';

const task = (id: string, durationDays: number): EngineActivity => ({
  id,
  durationMinutes: durationDays * 1440,
  type: 'TASK',
});
const milestone = (id: string): EngineActivity => ({
  id,
  durationMinutes: 0,
  type: 'START_MILESTONE',
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagDays = 0,
): EngineEdge => ({
  id: `${predecessorId}-${successorId}-${type}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: lagDays * 1440,
});

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[]) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  const drivingById = new Map<string, boolean>(output.edges.map((e) => [e.edgeId, e.isDriving]));
  return { ...output, byId, drivingById };
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
    expect(offsets(byId.get('A')!)).toMatchObject({ es: 0, ef: 4320 });
    expect(offsets(byId.get('B')!)).toMatchObject({ es: 4320, ef: 10080 });
    expect(offsets(byId.get('C')!)).toMatchObject({ es: 4320, ef: 7200 });
    expect(offsets(byId.get('D')!)).toMatchObject({ es: 10080, ef: 17280 });
    expect(offsets(byId.get('E')!)).toMatchObject({ es: 17280, ef: 18720 });
  });

  it('flags driving edges: only C→D has slack, so it is the sole non-driving edge (M3)', () => {
    const { drivingById } = run(activities, edges);
    // Binding ties on the critical spine and the driving reach into C.
    expect(drivingById.get('A-B-FS')).toBe(true);
    expect(drivingById.get('A-C-FS')).toBe(true);
    expect(drivingById.get('B-D-FS')).toBe(true);
    expect(drivingById.get('D-E-FS')).toBe(true);
    // C finishes at 5 but D starts at 7 (B drives it), so C→D carries slack.
    expect(drivingById.get('C-D-FS')).toBe(false);
  });

  it('computes the backward pass (LS/LF) and total float', () => {
    const { byId } = run(activities, edges);
    expect(offsets(byId.get('A')!)).toMatchObject({ ls: 0, lf: 4320, tf: 0 });
    expect(offsets(byId.get('B')!)).toMatchObject({ ls: 4320, lf: 10080, tf: 0 });
    expect(offsets(byId.get('C')!)).toMatchObject({ ls: 7200, lf: 10080, tf: 2880 });
    expect(offsets(byId.get('D')!)).toMatchObject({ ls: 10080, lf: 17280, tf: 0 });
    expect(offsets(byId.get('E')!)).toMatchObject({ ls: 17280, lf: 18720, tf: 0 });
  });

  it('flags the critical chain and only the critical chain', () => {
    const { byId } = run(activities, edges);
    expect(byId.get('A')!.isCritical).toBe(true);
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(byId.get('D')!.isCritical).toBe(true);
    expect(byId.get('E')!.isCritical).toBe(true);
    expect(byId.get('C')!.isCritical).toBe(false);
    expect(byId.get('C')!.isNearCritical).toBe(true); // float 2880 ≤ 7200 (5 days)
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
    expect(summary.projectFinishOffset).toBe(18720);
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
    expect(offsets(network('FS', 2).byId.get('s')!)).toMatchObject({ es: 7200, ef: 10080 });
  });

  it('SS+2: successor starts 2 after the predecessor starts', () => {
    expect(offsets(network('SS', 2).byId.get('s')!)).toMatchObject({ es: 2880, ef: 5760 });
  });

  it('FF+2: successor finishes 2 after the predecessor finishes', () => {
    const s = network('FF', 2).byId.get('s')!;
    expect(offsets(s)).toMatchObject({ es: 4320, ef: 7200 }); // EF = EF_p + 2 = 5
  });

  it('SF+2: successor finishes 2 after the predecessor starts', () => {
    const s = network('SF', 2).byId.get('s')!;
    expect(offsets(s)).toMatchObject({ es: 0, ef: 2880 }); // EF = ES_p + 2 = 2
  });

  it('FS−1 (a lead) pulls the successor earlier', () => {
    expect(offsets(network('FS', -1).byId.get('s')!)).toMatchObject({ es: 2880, ef: 5760 });
  });

  it('floors the early start at the data date when a lead would go negative', () => {
    // SS−5 wants ES_s = −5; the data date (offset 0) is the floor.
    expect(offsets(network('SS', -5).byId.get('s')!)).toMatchObject({ es: 0, ef: 2880 });
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

  it('marks float ≤ 0 critical, 0 < float ≤ 7200 (5 days) near-critical, and > 7200 neither', () => {
    const { byId } = run(activities, edges);
    expect(byId.get('A')!.totalFloat).toBe(0);
    expect(byId.get('A')!.isCritical).toBe(true);

    expect(byId.get('B')!.totalFloat).toBe(7200);
    expect(byId.get('B')!.isCritical).toBe(false);
    expect(byId.get('B')!.isNearCritical).toBe(true);

    expect(byId.get('C')!.totalFloat).toBe(8640);
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
    expect(offsets(byId.get('A')!)).toMatchObject({ es: 0, ef: 4320, tf: 2880 });
    expect(offsets(byId.get('B')!)).toMatchObject({ es: 0, ef: 7200, tf: 0 });
    expect(byId.get('B')!.isCritical).toBe(true);
    expect(summary.projectFinish).toBe('2026-01-05');
  });

  it('fails loud (does not loop) if a cycle reaches the engine', () => {
    expect(() =>
      computeSchedule([task('A', 1), task('B', 1)], [edge('A', 'B'), edge('B', 'A')], {
        dataDate: DATA_DATE,
        calendar: allMinutesWorkCalendar,
      }),
    ).toThrow(ScheduleGraphNotADagError);
  });
});

describe('computeSchedule — driving edges (M3)', () => {
  it('flags BOTH incoming edges driving when two predecessors tie on the successor start', () => {
    // A(3) and B(3) both FS→ C: C starts at day 3, so both ties are binding (a tied driver).
    const { drivingById } = run(
      [task('A', 3), task('B', 3), task('C', 1)],
      [edge('A', 'C'), edge('B', 'C')],
    );
    expect(drivingById.get('A-C-FS')).toBe(true);
    expect(drivingById.get('B-C-FS')).toBe(true);
  });

  it('a negative lag floored at the data date is non-driving (0-floor edge case)', () => {
    // A(2) SS(−5)→ B: the bound is −5 but B floors at the data date (0), so the tie does
    // not set B's start and must not be flagged driving.
    const { byId, drivingById } = run([task('A', 2), task('B', 2)], [edge('A', 'B', 'SS', -5)]);
    expect(byId.get('B')!.earlyStartOffset).toBe(0);
    expect(drivingById.get('A-B-SS')).toBe(false);
  });

  it('flags an SS-with-lag tie driving by its own arithmetic (not just FS)', () => {
    // A(4) SS(+2)→ B: B.es = A.es(0) + 2 = 2, so the SS tie drives B — exercises the
    // per-type forwardLowerBound in the driving pass, not only the FS path.
    const { byId, drivingById } = run([task('A', 4), task('B', 2)], [edge('A', 'B', 'SS', 2)]);
    expect(byId.get('B')!.earlyStartOffset).toBe(2880);
    expect(drivingById.get('A-B-SS')).toBe(true);
  });
});
