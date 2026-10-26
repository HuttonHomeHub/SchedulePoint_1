import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import {
  CROSS_DATA_DATE,
  crossCalendarNetwork,
  link,
  middle,
  runCrossCalendar,
  WEEKDAY_CAL,
  WEEKDAY_MINUTES,
  WEEKEND_CAL,
} from './compute.cross-calendar.fixture';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  absMinutesToInstant,
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
    // assert COMPLETION + shape (not a CI wall-clock — see docs/PERFORMANCE.md).
    //
    // **And now that is true, where it used to say it and then not do it** (`docs/TECH_DEBT.md`
    // #241). The line below the comment was `expect(elapsedMs).toBeLessThan(5000)`. The sweep that
    // closed #241 found **four** absolute wall-clock assertions in `apps/api`, and **three of them
    // sat under a comment arguing against exactly that assertion** — this one, and two in
    // `level.spec.ts`. Nothing was wrong in any single file; the wrongness was between each comment
    // and the line beneath it, which is why reading one at a time never caught it.
    //
    // A hang still fails: the vitest timeout is the backstop, and it does not depend on how busy the
    // runner is relative to a number somebody picked.
    const SIX_DAY = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4, 5]), []);
    const cals = [undefined, TWENTY_FOUR_SEVEN, SIX_DAY];
    const activities: EngineActivity[] = [];
    const edges: EngineEdge[] = [];
    for (let i = 0; i < 2000; i += 1) {
      activities.push(task(`N${i}`, DAY, cals[i % 3]));
      if (i > 0) edges.push(edge(`N${i - 1}`, `N${i}`));
    }
    const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
    expect(output.results).toHaveLength(2000);
    expect(output.summary.projectFinish).not.toBeNull();
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

/**
 * **A zero-span activity keeps the instant its logic gives it, across calendars** (`docs/TECH_DEBT.md`
 * #539; `docs/specs/milestone-cross-calendar/`). The engine snaps a zero-duration activity onto its own
 * calendar in both passes (`compute.ts` forward `:266`, backward `:510`), so a milestone between a
 * weekend task and weekday work either pushes the weekday work a week (milestone on the weekend
 * calendar) or reads the day before the weekend work and charges it a weekend of negative float
 * (milestone on the plan calendar). The network and its dates are `compute.cross-calendar.fixture.ts`.
 *
 * **Every case here passes since M2 (D1) except the FNLT one, which needed M3 (D2):** a date given for
 * a finish milestone is read as midnight at the end of its day. The cases began as `it.fails` (they
 * asserted the correct values while the engine was wrong, so `main` stayed green and the fix had to
 * flip them). The all-minutes control passed before M2 and is a plain `it`: the same network with no
 * calendar seam at `M`.
 */
describe('a zero-span activity between calendars keeps its logic instant (#539)', () => {
  const FNLT_FRIDAY = { constraintType: 'FNLT', constraintDate: '2027-06-25' } as const;

  function expectedFixtureOutcome(get: (id: string) => EngineResult) {
    expect(get('W').totalFloat).toBe(0);
    expect(get('K').earlyStart).toBe('2027-06-28');
    // Five weekdays of slack between A and W's SNET: Fri 06-18 → Fri 06-25.
    expect(get('A').totalFloat).toBe(5 * WEEKDAY_MINUTES);
  }

  it('control: M on an all-minutes calendar already gives K Monday and W float 0', () => {
    const { activities, edges } = crossCalendarNetwork(
      middle('FINISH_MILESTONE', TWENTY_FOUR_SEVEN),
    );
    const { get } = runCrossCalendar(activities, edges);
    expectedFixtureOutcome(get);
    expect(get('M').earlyFinish).toBe('2027-06-27');
  });

  it('FINISH_MILESTONE on the plan calendar: K starts Monday, W float 0, M reads Sunday', () => {
    const { activities, edges } = crossCalendarNetwork(middle('FINISH_MILESTONE'));
    const { get } = runCrossCalendar(activities, edges);
    expectedFixtureOutcome(get);
    expect(get('M').earlyStart).toBe('2027-06-27');
    expect(get('M').earlyFinish).toBe('2027-06-27');
    expect(get('M').lateFinish).toBe('2027-06-27');
  });

  it('FINISH_MILESTONE on the weekend calendar: K starts Monday, not a week later', () => {
    const { activities, edges } = crossCalendarNetwork(middle('FINISH_MILESTONE', WEEKEND_CAL));
    const { get } = runCrossCalendar(activities, edges);
    expectedFixtureOutcome(get);
    expect(get('M').earlyFinish).toBe('2027-06-27');
  });

  it('START_MILESTONE on the plan calendar: K starts Monday, W float 0, M reads Monday', () => {
    const { activities, edges } = crossCalendarNetwork(middle('START_MILESTONE'));
    const { get } = runCrossCalendar(activities, edges);
    expectedFixtureOutcome(get);
    expect(get('M').earlyStart).toBe('2027-06-28');
  });

  it('START_MILESTONE on the weekend calendar: K starts Monday, W float 0', () => {
    const { activities, edges } = crossCalendarNetwork(middle('START_MILESTONE', WEEKEND_CAL));
    const { get } = runCrossCalendar(activities, edges);
    expectedFixtureOutcome(get);
  });

  it('a zero-duration TASK in M’s place: K starts Monday, W float 0', () => {
    const { activities, edges } = crossCalendarNetwork(middle('TASK'));
    const { get } = runCrossCalendar(activities, edges);
    expectedFixtureOutcome(get);
    expect(get('M').earlyStart).toBe('2027-06-28');
  });

  it('an edge into a milestone between calendars drives it, and the longest path runs through it', () => {
    const { activities, edges } = crossCalendarNetwork(middle('FINISH_MILESTONE'));
    const out = computeSchedule(activities, edges, {
      dataDate: CROSS_DATA_DATE,
      calendar: WEEKDAY_CAL,
      criticalDefinition: 'LONGEST_PATH',
    });
    const driving = new Map(out.edges.map((e) => [e.edgeId, e.isDriving]));
    // W → M: the bound IS M's kept start (Sunday 19:00), which M's own calendar would roll to Monday.
    expect(driving.get('W-M')).toBe(true);
    expect(driving.get('M-K')).toBe(true);
    const critical = out.results.filter((r) => r.isCritical).map((r) => r.activityId);
    expect(critical).toEqual(expect.arrayContaining(['W', 'M', 'K', 'F']));
    // A has the five weekdays of slack before W's SNET, so the chain does not reach back through it.
    expect(critical).not.toContain('A');
  });

  it('a milestone DRIVEN to exactly the data date keeps the link instant, in both passes', () => {
    // P is a zero-duration task on an every-minute calendar, so it finishes at the data date itself
    // (Monday 00:00), and M, a start milestone on the weekend calendar, is driven by it. A bound that
    // equals the data date is a driver, not the floor: M keeps Monday 00:00 where an undriven M rolls to
    // Saturday 07:00 (plan offset 2,400).
    const { get } = runCrossCalendar(
      [
        { id: 'P', durationMinutes: 0, type: 'TASK', calendar: allMinutesWorkCalendar },
        middle('START_MILESTONE', WEEKEND_CAL),
      ],
      [link('P', 'M')],
    );
    expect(get('M').earlyStartOffset).toBe(0);
    expect(absMinutesToInstant(get('M').passOnStartInstant)).toBe('2027-06-14');
  });

  it('a milestone nothing drives still rolls its bound, the data date, onto its own calendar', () => {
    // The one bound D1 does not keep: the data date itself, so a free-standing milestone does not move.
    // Monday 00:00 is a gap on the weekend calendar; M reads the first working minute of that calendar.
    const { get } = runCrossCalendar([middle('START_MILESTONE', WEEKEND_CAL)], []);
    expect(get('M').earlyStartOffset).toBe(5 * WEEKDAY_MINUTES);
    expect(absMinutesToInstant(get('M').passOnStartInstant)).toBe('2027-06-19T07:00');
    expect(get('M').earlyStart).toBe('2027-06-19');
  });

  it('FNLT on the Friday after W: W carries its whole weekend, M reads Sunday and floats 0', () => {
    const { activities, edges } = crossCalendarNetwork(
      middle('FINISH_MILESTONE', undefined, FNLT_FRIDAY),
    );
    const { get } = runCrossCalendar(activities, edges);
    expect(get('W').totalFloat).toBe(-1440);
    expect(Math.abs(get('M').totalFloat)).toBe(0);
    expect(get('M').earlyFinish).toBe('2027-06-27');
  });

  it('the mirror: weekday work → a milestone on the weekend calendar → weekend work', () => {
    // L is a long weekday task that sets the project finish well past W's FNLT, so A and W have room.
    const { get } = runCrossCalendar(
      [
        { id: 'A', durationMinutes: 5 * WEEKDAY_MINUTES, type: 'TASK' },
        middle('FINISH_MILESTONE', WEEKEND_CAL),
        {
          id: 'W',
          durationMinutes: 1440,
          type: 'TASK',
          calendar: WEEKEND_CAL,
          constraintType: 'FNLT',
          constraintDate: '2027-06-27',
        },
        { id: 'L', durationMinutes: 20 * WEEKDAY_MINUTES, type: 'TASK' },
      ],
      [link('A', 'M'), link('M', 'W')],
    );
    // W works Sat 06-19 to Sun 06-20 and may finish as late as Sun 06-27: one weekend of float. A may
    // finish as late as Fri 06-25, five weekdays after it does; a weekend must not reduce that.
    expect(get('W').totalFloat).toBe(1440);
    expect(get('A').totalFloat).toBe(5 * WEEKDAY_MINUTES);
  });
});
