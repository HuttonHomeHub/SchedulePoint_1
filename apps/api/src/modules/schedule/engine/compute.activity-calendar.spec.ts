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
 * Per-activity working-time calendar tests (M5, ADR-0037). Each activity may schedule on its own
 * calendar — its duration advances, its float is measured, and its dates are derived on THAT
 * calendar — while an activity with no calendar inherits the plan calendar (the byte-identical
 * default proven by the golden suite). The plan calendar here is **Mon–Fri, full days**;
 * `2026-01-05` is a Monday. `DAY = 1440` working-minutes = one full day.
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;

/** Mon–Fri, 24 h on working days (weekends off) — the plan calendar under test. */
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
/** The 24/7 elapsed calendar — a commissioning / concrete-cure crew that works weekends. */
const TWENTY_FOUR_SEVEN = allMinutesWorkCalendar;

function task(id: string, durationMinutes: number, calendar?: WorkingTimeCalendar): EngineActivity {
  return { id, durationMinutes, type: 'TASK', ...(calendar ? { calendar } : {}) };
}

function edge(predecessorId: string, successorId: string, type: DependencyType = 'FS'): EngineEdge {
  return { id: `${predecessorId}-${successorId}`, predecessorId, successorId, type, lagMinutes: 0 };
}

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

describe('per-activity calendars (M5, ADR-0037)', () => {
  it('measures a 24/7 activity in elapsed time — 10 working-days = 10 elapsed days, spanning weekends', () => {
    // 10 days of work. On the 5-day plan that is two calendar weeks; on a 24/7 calendar it is 10
    // elapsed days. The two MUST land on different finish dates (the assignment is provably wired).
    const inherit = run([task('A', 10 * DAY)]).get('A')!;
    const elapsed = run([task('A', 10 * DAY, TWENTY_FOUR_SEVEN)]).get('A')!;

    // Inherited: Mon 01-05 through the 10th working day = Fri 01-16.
    expect(inherit.earlyStart).toBe('2026-01-05');
    expect(inherit.earlyFinish).toBe('2026-01-16');
    // 24/7: Mon 01-05 + 10 elapsed days → inclusive last day 01-14 (spans two weekends).
    expect(elapsed.earlyStart).toBe('2026-01-05');
    expect(elapsed.earlyFinish).toBe('2026-01-14');
    expect(elapsed.earlyFinish).not.toBe(inherit.earlyFinish);
  });

  it('assigning the plan calendar explicitly is a no-op (matches inheriting)', () => {
    const inherit = run([task('A', 3 * DAY)]).get('A')!;
    const explicit = run([task('A', 3 * DAY, FIVE_DAY)]).get('A')!;
    expect(explicit.earlyStart).toBe(inherit.earlyStart);
    expect(explicit.earlyFinish).toBe(inherit.earlyFinish);
    expect(explicit.totalFloat).toBe(inherit.totalFloat);
  });

  it('a 24/7 predecessor lets a 24/7 successor start on the weekend, while a 5-day successor waits for Monday', () => {
    // A (24/7) works 5 elapsed days from Mon 01-05 → finishes at the Sat 01-10 boundary (inclusive
    // last day Fri 01-09). Its successors start from that REAL finish instant, each rolled onto its
    // OWN calendar: the 24/7 successor starts immediately Saturday; the 5-day one waits until Monday.
    const byId = run(
      [
        task('A', 5 * DAY, TWENTY_FOUR_SEVEN),
        task('B', DAY), // inherits the 5-day plan calendar
        task('C', DAY, TWENTY_FOUR_SEVEN),
      ],
      [edge('A', 'B'), edge('A', 'C')],
    );
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-09'); // Fri (worked through the weekend)
    expect(byId.get('C')!.earlyStart).toBe('2026-01-10'); // Sat — the 24/7 crew starts at once
    expect(byId.get('B')!.earlyStart).toBe('2026-01-12'); // Mon — the 5-day crew waits out the weekend
  });

  it('measures total float on the activity’s own calendar (P6/ADR-0037 §4)', () => {
    // A 24/7 activity with slack: its float is counted in ITS OWN (elapsed) minutes, not the plan’s.
    // A drives the finish; B (24/7) has one spare elapsed day.
    const byId = run(
      [task('A', 6 * DAY, TWENTY_FOUR_SEVEN), task('B', 5 * DAY, TWENTY_FOUR_SEVEN)],
      [edge('A', 'B', 'SS')], // B starts with A but is a day shorter → one elapsed day of float
    );
    expect(byId.get('A')!.totalFloat).toBe(0);
    expect(byId.get('A')!.isCritical).toBe(true);
    // One elapsed day of float, measured on B’s 24/7 calendar = 1440 minutes (not a plan working day).
    expect(byId.get('B')!.totalFloat).toBe(DAY);
    expect(byId.get('B')!.isCritical).toBe(false);
  });

  it('computes a 2,000-activity mixed-calendar chain within budget (scale — no O(n²), no per-minute walk)', () => {
    // The instant axis costs one extra O(log) calendar-port round-trip per activity vs the old pure
    // offset add; this proves it stays linear across three calendars at the ADR-0036 §7 ceiling. We
    // assert COMPLETION + shape (not a CI wall-clock — see docs/PERFORMANCE.md), with a generous 5 s
    // guard that only trips on a pathological blow-up, never on normal timing noise.
    const SIX_DAY = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4, 5]), []);
    const cals = [undefined, TWENTY_FOUR_SEVEN, SIX_DAY];
    const activities: EngineActivity[] = [];
    const edges: EngineEdge[] = [];
    for (let i = 0; i < 2000; i += 1) {
      activities.push(task(`N${i}`, DAY, cals[i % 3]));
      if (i > 0) edges.push(edge(`N${i - 1}`, `N${i}`));
    }
    const started = performance.now();
    const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
    const elapsedMs = performance.now() - started;
    expect(output.results).toHaveLength(2000);
    expect(output.summary.projectFinish).not.toBeNull();
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('keeps a mixed-calendar critical chain free of spurious negative float (forward/backward inverse)', () => {
    // A (24/7) → B (5-day) → C (24/7), all on the longest path. None should show negative float:
    // the forward and backward passes must be exact inverses across each calendar seam.
    const byId = run(
      [
        task('A', 2 * DAY, TWENTY_FOUR_SEVEN),
        task('B', 2 * DAY),
        task('C', 2 * DAY, TWENTY_FOUR_SEVEN),
      ],
      [edge('A', 'B'), edge('B', 'C')],
    );
    for (const id of ['A', 'B', 'C']) {
      expect(byId.get(id)!.totalFloat).toBe(0);
      expect(byId.get(id)!.isCritical).toBe(true);
    }
  });
});
