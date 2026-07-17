import type { ActivityType, ConstraintType, DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge } from './types';
import {
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Level of Effort (M5-epic F1, ADR-0035 §21). An LOE is a **hammock**: its dates are derived from the
 * span of its SS-predecessor's start to its FF-successor's finish, not from an input duration. It
 * **never drives a successor, never appears on the critical path, and never inherits negative float**.
 * First-principles goldens (no external oracle — ADR-0034): a plain Mon–Fri plan, `DATA_DATE = 2026-01-05`
 * (Mon), full working days so a duration in days maps cleanly. The keystone parity assertion proves a
 * non-LOE network is byte-identical whether or not an LOE hangs off it.
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

function act(id: string, durationMinutes: number, type: ActivityType = 'TASK'): EngineActivity {
  return { id, durationMinutes, type };
}

function loe(id: string): EngineActivity {
  // An LOE's input duration is 0 (ignored — the engine derives its span). ADR-0035 §21.
  return { id, durationMinutes: 0, type: 'LEVEL_OF_EFFORT' };
}

function withConstraint(
  activity: EngineActivity,
  constraintType: ConstraintType,
  constraintDate: string,
): EngineActivity {
  return { ...activity, constraintType, constraintDate };
}

function edge(
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagMinutes = 0,
): EngineEdge {
  return {
    id: `${predecessorId}-${successorId}-${type}`,
    predecessorId,
    successorId,
    type,
    lagMinutes,
  };
}

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  return computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
}

describe('Level of Effort — span derivation (ADR-0035 §21)', () => {
  it('derives its span from its SS-predecessor start to its FF-successor finish', () => {
    // A: 2-day task Mon–Tue (01-05 → 01-06). B: 3-day FS-after A, Wed–Fri (01-07 → 01-09).
    // H (LOE): SS from A (start with A) + FF to B (finish with B) ⇒ spans 01-05 … 01-09.
    const out = run(
      [act('A', 2 * DAY), act('B', 3 * DAY), loe('H')],
      [edge('A', 'B', 'FS'), edge('A', 'H', 'SS'), edge('H', 'B', 'FF')],
    );
    const h = out.results.find((r) => r.activityId === 'H')!;
    expect(h.earlyStart).toBe('2026-01-05'); // = A's start
    expect(h.earlyFinish).toBe('2026-01-09'); // = B's finish
    // A hammock carries no float and is never critical.
    expect(h.totalFloat).toBe(0);
    expect(h.freeFloat).toBe(0);
    expect(h.isCritical).toBe(false);
    expect(h.isNearCritical).toBe(false);
  });

  it('takes the EARLIEST SS-predecessor start and the LATEST FF-successor finish (multi-tie)', () => {
    // Two SS predecessors (A starts 01-05, C starts 01-06) ⇒ earliest = 01-05.
    // Two FF successors (P finishes 01-07, Q finishes 01-09) ⇒ latest = 01-09.
    const out = run(
      [
        act('A', 1 * DAY), // 01-05
        act('C', 1 * DAY), // FS after A ⇒ 01-06
        act('P', 1 * DAY), // 01-07 (FS after C)
        act('Q', 3 * DAY), // 01-07 → 01-09 (FS after C)
        loe('H'),
      ],
      [
        edge('A', 'C', 'FS'),
        edge('C', 'P', 'FS'),
        edge('C', 'Q', 'FS'),
        edge('A', 'H', 'SS'),
        edge('C', 'H', 'SS'),
        edge('H', 'P', 'FF'),
        edge('H', 'Q', 'FF'),
      ],
    );
    const h = out.results.find((r) => r.activityId === 'H')!;
    expect(h.earlyStart).toBe('2026-01-05'); // earliest of A (01-05) / C (01-06)
    expect(h.earlyFinish).toBe('2026-01-09'); // latest of P (01-07) / Q (01-09)
  });
});

describe('Level of Effort — never drives / never critical (ADR-0035 §21)', () => {
  it('never drives a successor: an FS successor of the LOE starts at the data date, not the LOE finish', () => {
    // A → H (SS), H → B (FF) span the hammock; H → C (FS) would push C IF the LOE drove. It must not.
    const out = run(
      [act('A', 2 * DAY), act('B', 3 * DAY), loe('H'), act('C', 1 * DAY)],
      [edge('A', 'B', 'FS'), edge('A', 'H', 'SS'), edge('H', 'B', 'FF'), edge('H', 'C', 'FS')],
    );
    const c = out.results.find((r) => r.activityId === 'C')!;
    expect(c.earlyStart).toBe('2026-01-05'); // unmoved by the LOE (no other driver ⇒ data date)
    // The edge out of the LOE is never a driver.
    const hc = out.edges.find((e) => e.edgeId === 'H-C-FS')!;
    expect(hc.isDriving).toBe(false);
  });

  it('leaves the rest of the network byte-identical whether or not the LOE is attached (parity)', () => {
    const network: readonly [EngineActivity[], EngineEdge[]] = [
      [act('A', 2 * DAY), act('B', 3 * DAY), act('D', 4 * DAY)],
      [edge('A', 'B', 'FS'), edge('B', 'D', 'FS')],
    ];
    const withoutLoe = run(network[0], network[1]);
    const withLoe = run(
      [...network[0], loe('H')],
      [...network[1], edge('A', 'H', 'SS'), edge('H', 'D', 'FF')],
    );
    for (const id of ['A', 'B', 'D']) {
      const before = withoutLoe.results.find((r) => r.activityId === id)!;
      const after = withLoe.results.find((r) => r.activityId === id)!;
      expect(after).toEqual(before); // every field byte-identical
    }
    // The LOE also never changes the project finish.
    expect(withLoe.summary.projectFinish).toBe(withoutLoe.summary.projectFinish);
    expect(withLoe.summary.criticalCount).toBe(withoutLoe.summary.criticalCount);
  });
});

describe('Level of Effort — never inherits negative float (ADR-0035 §21)', () => {
  it('stays at float 0 even when its FF-successor carries negative float from an impossible FNLT', () => {
    // B finishes 01-09 but is pinned FNLT 01-06 ⇒ B's late finish is clamped early ⇒ B float is negative.
    // The LOE hangs off B via FF; a plain successor would inherit B's tight late finish and go negative.
    // The LOE must NOT — its late is pinned to its early, so its float is a non-negative 0.
    const out = run(
      [act('A', 2 * DAY), withConstraint(act('B', 3 * DAY), 'FNLT', '2026-01-06'), loe('H')],
      [edge('A', 'B', 'FS'), edge('A', 'H', 'SS'), edge('H', 'B', 'FF')],
    );
    const b = out.results.find((r) => r.activityId === 'B')!;
    const h = out.results.find((r) => r.activityId === 'H')!;
    expect(b.totalFloat).toBeLessThan(0); // the impossible FNLT surfaces as negative float on B
    expect(h.totalFloat).toBe(0); // the LOE never inherits it
    expect(h.freeFloat).toBe(0);
    expect(h.isCritical).toBe(false);
  });
});
