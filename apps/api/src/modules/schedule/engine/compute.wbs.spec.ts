import type { ActivityType, DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge } from './types';
import {
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * WBS-summary rollup (M5-epic F6, ADR-0035 §24). A `WBS_SUMMARY` activity **carries no logic** (F5
 * rejects any dependency touching one, so it has no edges) and its dates **roll up from its branch**:
 * the earliest early-start to the latest early-finish over its DIRECT children in the `parentId`
 * containment tree. A summary **never drives, is never critical, and never defines the project finish**;
 * its float is a by-convention 0 (late pinned to the rolled-up early). First-principles goldens (no
 * external oracle — ADR-0034): a plain Mon–Fri plan, `DATA_DATE = 2026-01-05` (Mon), full working days
 * so a duration in days maps cleanly. The keystone parity assertion proves a non-summary network is
 * byte-identical whether or not a summary is attached (a summary has no edges, so it changes nothing but
 * its own row).
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

function act(
  id: string,
  durationMinutes: number,
  parentId?: string,
  type: ActivityType = 'TASK',
): EngineActivity {
  return { id, durationMinutes, type, ...(parentId ? { parentId } : {}) };
}

function summary(id: string, parentId?: string): EngineActivity {
  // A summary's input duration is 0 (ignored — the engine derives its span from its branch). §24.
  return { id, durationMinutes: 0, type: 'WBS_SUMMARY', ...(parentId ? { parentId } : {}) };
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

describe('WBS summary — branch rollup (ADR-0035 §24)', () => {
  it('rolls up earliest start to latest finish over a two-task branch; never critical, float 0', () => {
    // A: 2-day task Mon–Tue (01-05 → 01-06). B: 3-day FS-after A, Wed–Fri (01-07 → 01-09).
    // S (summary) is the parent of A and B ⇒ spans A's earliest start (01-05) to B's latest finish (01-09).
    const out = run(
      [act('A', 2 * DAY, 'S'), act('B', 3 * DAY, 'S'), summary('S')],
      [edge('A', 'B', 'FS')],
    );
    const s = out.results.find((r) => r.activityId === 'S')!;
    expect(s.earlyStart).toBe('2026-01-05'); // = min child start (A)
    expect(s.earlyFinish).toBe('2026-01-09'); // = max child finish (B)
    // Late is pinned to the rolled-up early ⇒ a by-convention 0 float, never critical.
    expect(s.lateStart).toBe('2026-01-05');
    expect(s.lateFinish).toBe('2026-01-09');
    expect(s.totalFloat).toBe(0);
    expect(s.freeFloat).toBe(0);
    expect(s.isCritical).toBe(false);
    expect(s.isNearCritical).toBe(false);
    // The summary never defines the project finish — B (a real activity) does.
    expect(out.summary.projectFinish).toBe('2026-01-09');
  });

  it('rolls up a NESTED summary (summary of summaries) deepest-first', () => {
    // Inner branch: A (2-day 01-05→01-06) + B (3-day FS-after A, 01-07→01-09), both under SI.
    // SI (parent SO) rolls up to 01-05 → 01-09. C (1-day standalone 01-05→01-05) is also under SO.
    // SO rolls up its children {SI, C} ⇒ 01-05 (both start Mon) → 01-09 (SI's finish). Processed
    // deepest-first (SI before SO), so SO reads SI's finalised dates.
    const out = run(
      [
        act('A', 2 * DAY, 'SI'),
        act('B', 3 * DAY, 'SI'),
        act('C', 1 * DAY, 'SO'),
        summary('SI', 'SO'),
        summary('SO'),
      ],
      [edge('A', 'B', 'FS')],
    );
    const si = out.results.find((r) => r.activityId === 'SI')!;
    const so = out.results.find((r) => r.activityId === 'SO')!;
    // Inner summary spans its two tasks.
    expect(si.earlyStart).toBe('2026-01-05');
    expect(si.earlyFinish).toBe('2026-01-09');
    expect(si.totalFloat).toBe(0);
    expect(si.isCritical).toBe(false);
    // Outer summary rolls up the inner summary + C — 01-09 comes from the nested summary's finish.
    expect(so.earlyStart).toBe('2026-01-05');
    expect(so.earlyFinish).toBe('2026-01-09');
    expect(so.lateStart).toBe('2026-01-05');
    expect(so.lateFinish).toBe('2026-01-09');
    expect(so.totalFloat).toBe(0);
    expect(so.freeFloat).toBe(0);
    expect(so.isCritical).toBe(false);
  });

  it('collapses an EMPTY summary (no children) to the data date', () => {
    // E has no children (no activity carries parentId E) ⇒ the defined empty convention: data date.
    const out = run([act('A', 2 * DAY), summary('E')], []);
    const e = out.results.find((r) => r.activityId === 'E')!;
    expect(e.earlyStart).toBe('2026-01-05'); // data date
    expect(e.earlyFinish).toBe('2026-01-05'); // zero-length point
    expect(e.lateStart).toBe('2026-01-05');
    expect(e.lateFinish).toBe('2026-01-05');
    expect(e.totalFloat).toBe(0);
    expect(e.isCritical).toBe(false);
  });
});

describe('WBS summary — parity (ADR-0035 §24)', () => {
  it('leaves the rest of the network byte-identical whether or not a summary is attached', () => {
    // The non-summary network: a plain A → B → D chain.
    const withoutSummary = run(
      [act('A', 2 * DAY), act('B', 3 * DAY), act('D', 4 * DAY)],
      [edge('A', 'B', 'FS'), edge('B', 'D', 'FS')],
    );
    // The same chain with a summary S hung over A/B/D via `parentId` (no new edges — a summary carries
    // no logic). Attaching it must change nothing but the summary's own row.
    const withSummary = run(
      [act('A', 2 * DAY, 'S'), act('B', 3 * DAY, 'S'), act('D', 4 * DAY, 'S'), summary('S')],
      [edge('A', 'B', 'FS'), edge('B', 'D', 'FS')],
    );
    for (const id of ['A', 'B', 'D']) {
      const before = withoutSummary.results.find((r) => r.activityId === id)!;
      const after = withSummary.results.find((r) => r.activityId === id)!;
      // `parentId` is not a schedule input, so it is not part of the compared result rows.
      expect(after).toEqual(before); // every field byte-identical
    }
    // The summary never changes the project finish or the critical count of the real network.
    expect(withSummary.summary.projectFinish).toBe(withoutSummary.summary.projectFinish);
    expect(withSummary.summary.criticalCount).toBe(withoutSummary.summary.criticalCount);
  });
});
