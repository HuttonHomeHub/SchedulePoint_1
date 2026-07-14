import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { allDaysWorkCalendar } from './calendar';
import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';

/**
 * ADR-0033 §Decision-4/5 — the effective-Visual (Pass 2) engine tests. Pass 1
 * (pure-network forward/backward) must stay a byte-for-byte function of the
 * network regardless of `visualStart`; Pass 2 is a forward-only, additive read
 * of `earlyStart`/predecessors' propagated finishes that never writes back.
 */

const DATA_DATE = '2026-01-01';

const task = (
  id: string,
  durationDays: number,
  extra: Partial<EngineActivity> = {},
): EngineActivity => ({
  id,
  durationDays,
  type: 'TASK',
  ...extra,
});
const milestone = (id: string, extra: Partial<EngineActivity> = {}): EngineActivity => ({
  id,
  durationDays: 0,
  type: 'START_MILESTONE',
  ...extra,
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
  lagDays,
});

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[]) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allDaysWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

/** The pure-network fields Pass 2 must never perturb. */
const pureFields = (r: EngineResult) => ({
  earlyStart: r.earlyStart,
  earlyFinish: r.earlyFinish,
  lateStart: r.lateStart,
  lateFinish: r.lateFinish,
  totalFloat: r.totalFloat,
  isCritical: r.isCritical,
  isNearCritical: r.isNearCritical,
});

describe('computeSchedule — effective-Visual pass, golden parity (Pass 1 purity)', () => {
  // Same worked network as compute.spec.ts: A(3)→B(4)→D(5)→E(1); A(3)→C(2)→D(5).
  const activities = [task('A', 3), task('B', 4), task('C', 2), task('D', 5), task('E', 1)];
  const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D'), edge('D', 'E')];

  it('with no visualStart anywhere, visualEffective* mirrors early*, no conflicts, drift null', () => {
    const { results } = run(activities, edges);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.visualEffectiveStart).toBe(r.earlyStart);
      expect(r.visualEffectiveFinish).toBe(r.earlyFinish);
      expect(r.visualConflict).toBe(false);
      expect(r.visualDriftDays).toBeNull();
    }
  });

  it('a placement elsewhere in the network never perturbs early*/late*/float/isCritical (golden-suite parity)', () => {
    const baseline = run(activities, edges);
    // Place A well past its early start — this pushes B/C/D/E's *effective* dates,
    // but must not touch a single pure-network field.
    const placed = activities.map((a) =>
      a.id === 'A' ? task('A', 3, { visualStart: '2026-01-20' }) : a,
    );
    const withPlacement = run(placed, edges);
    for (const id of ['A', 'B', 'C', 'D', 'E']) {
      expect(pureFields(withPlacement.byId.get(id)!)).toEqual(pureFields(baseline.byId.get(id)!));
    }
    expect(withPlacement.summary.projectFinishOffset).toBe(baseline.summary.projectFinishOffset);
    expect(withPlacement.summary.projectFinish).toBe(baseline.summary.projectFinish);
    expect(withPlacement.summary.criticalCount).toBe(baseline.summary.criticalCount);
  });
});

describe('computeSchedule — effective-Visual pass, placement pushes successors', () => {
  it('a later visualStart on A pushes unplaced B, while both activities’ pure early* stay put', () => {
    // A(3) FS→ B(2), no constraints. A's early start is the data date (offset 0);
    // placing A at offset 5 ('2026-01-06') must push B from A's placed finish.
    const { byId } = run(
      [task('A', 3, { visualStart: '2026-01-06' }), task('B', 2)],
      [edge('A', 'B')],
    );
    const a = byId.get('A')!;
    const b = byId.get('B')!;

    // Pure pass unaffected by the placement.
    expect(a.earlyStart).toBe('2026-01-01');
    expect(a.earlyFinish).toBe('2026-01-03');
    expect(b.earlyStart).toBe('2026-01-04');
    expect(b.earlyFinish).toBe('2026-01-05');

    // Effective-Visual: A sits exactly on its placement; B is pushed to flow from it.
    expect(a.visualEffectiveStart).toBe('2026-01-06');
    expect(a.visualEffectiveFinish).toBe('2026-01-08'); // 3 working days from the placement
    expect(a.visualConflict).toBe(false);
    expect(a.visualDriftDays).toBe(5); // placed (offset 5) − pure earlyStart (offset 0)

    expect(b.visualEffectiveStart).toBe('2026-01-09'); // the day after A's placed finish
    expect(b.visualEffectiveFinish).toBe('2026-01-10');
    expect(b.visualConflict).toBe(false);
    expect(b.visualDriftDays).toBeNull(); // B itself is unplaced
  });
});

describe('computeSchedule — effective-Visual pass, feasible-finish propagation (SQ-b)', () => {
  it('an infeasible (too-early) placement flags the activity but pushes its successor from the FEASIBLE finish', () => {
    // P(3) FS→ A(2) FS→ B(2). Logic alone puts A at offset 3 (right after P). A is
    // placed at offset 1 — a day it cannot legally start (before P finishes).
    const { byId } = run(
      [task('P', 3), task('A', 2, { visualStart: '2026-01-02' }), task('B', 2)],
      [edge('P', 'A'), edge('A', 'B')],
    );
    const p = byId.get('P')!;
    const a = byId.get('A')!;
    const b = byId.get('B')!;

    // Pure pass is unaffected: A's early start is still driven by P's early finish.
    expect(p.earlyFinish).toBe('2026-01-03');
    expect(a.earlyStart).toBe('2026-01-04');
    expect(a.earlyFinish).toBe('2026-01-05');

    // A stays flagged and rendered exactly on its illegal placement (stay-and-flag, SQ-a).
    expect(a.visualConflict).toBe(true);
    expect(a.visualEffectiveStart).toBe('2026-01-02'); // the illegal placement, honoured exactly
    expect(a.visualEffectiveFinish).toBe('2026-01-03'); // its own (illegal) 2-day span
    expect(a.visualDriftDays).toBe(-2); // placed (offset 1) − pure earlyStart (offset 3)

    // B is pushed from A's FEASIBLE finish (offset 3 + 2 = 5 → '2026-01-06'), never from
    // the illegal finish (offset 1 + 2 = 3 → would be '2026-01-04').
    expect(b.visualEffectiveStart).toBe('2026-01-06');
    expect(b.visualEffectiveStart).not.toBe('2026-01-04');
    expect(b.visualEffectiveFinish).toBe('2026-01-07');
    expect(b.visualConflict).toBe(false);
  });
});

describe('computeSchedule — effective-Visual pass, drift sign & working days', () => {
  it('drift is positive for a later placement, negative for an earlier one, and null when unplaced', () => {
    const { byId } = run(
      [
        task('Later', 3, { visualStart: '2026-01-06' }), // offset 5, no predecessor ⇒ later than earlyStart (0)
        task('Earlier', 3, { visualStart: '2025-12-30' }), // offset −2, earlier than earlyStart (0)
        task('Unplaced', 3),
      ],
      [],
    );
    expect(byId.get('Later')!.visualDriftDays).toBe(5);
    expect(byId.get('Later')!.visualConflict).toBe(false);

    expect(byId.get('Earlier')!.visualDriftDays).toBe(-2);
    expect(byId.get('Earlier')!.visualConflict).toBe(true); // placed before the only legal start

    expect(byId.get('Unplaced')!.visualDriftDays).toBeNull();
    expect(byId.get('Unplaced')!.visualConflict).toBe(false);
  });
});

describe('computeSchedule — effective-Visual pass, a placed successor stays put', () => {
  it('B’s own placement wins over the push from a placed A, even though it conflicts', () => {
    // A(3) placed far later (offset 10); B(2) FS-successor but ALSO placed, at an
    // earlier date than the push would imply.
    const { byId } = run(
      [
        task('A', 3, { visualStart: '2026-01-11' }), // offset 10
        task('B', 2, { visualStart: '2026-01-03' }), // offset 2 — earlier than A's push (offset 13)
      ],
      [edge('A', 'B')],
    );
    const b = byId.get('B')!;

    // B renders on its OWN placement, not on the pushed date (which would be A's
    // placed finish, offset 13 → '2026-01-14').
    expect(b.visualEffectiveStart).toBe('2026-01-03');
    expect(b.visualEffectiveStart).not.toBe('2026-01-14');
    expect(b.visualEffectiveFinish).toBe('2026-01-04');
    // Flagged, since its own placement is earlier than what logic (the push) allows.
    expect(b.visualConflict).toBe(true);
    expect(b.visualDriftDays).toBe(-1); // placed (offset 2) − pure earlyStart (offset 3)
  });
});

describe('computeSchedule — effective-Visual pass, milestones', () => {
  it('a placed milestone (0-duration) renders with start === finish', () => {
    const { byId } = run([milestone('M', { visualStart: '2026-01-06' })], []);
    const m = byId.get('M')!;
    expect(m.visualEffectiveStart).toBe('2026-01-06');
    expect(m.visualEffectiveFinish).toBe('2026-01-06');
    expect(m.visualConflict).toBe(false);
  });
});

describe('computeSchedule — effective-Visual pass, known M0 gap', () => {
  it.todo(
    'flags visualConflict when a placement is AFTER an explicit SNLT/FNLT ceiling (upper-bound case, follow-up to M0)',
  );
});
