import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { levelSchedule } from './level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  EngineResult,
  LevelingOptions,
} from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * **Levelling anchors on the placed span (`docs/specs/placed-load-basis/`, TECH_DEBT #413).**
 *
 * Before M1, `levelSchedule` read the network dates (`earlyStartOffset`, `totalFloat`, `earlyStart`) at
 * every one of the seven sites the spec's C2 lists, so a bar the planner had dragged was levelled as if
 * it were still where logic puts it. L1-L4 say what it does instead under `anchor: 'PLACED'`; each was
 * recorded red against that code (the "Red before" comments carry the numbers) and flipped by M1.
 *
 * **Every placed case is paired with a plain `it` that asserts the placed and network starts
 * differ** (ADR-0093): a fixture in which the two agree would pass for the wrong reason.
 *
 * The plan calendar is 24/7, so one working day is 1440 minutes and an offset equals the absolute
 * minute delta. Data date D = 2026-01-01 (offset 0); D+n is `2026-01-(1+n)`.
 *
 * The two L5 cases are the "nothing changes" reference: the results recorded before M1 on L1's and
 * L2's fixtures, which `anchor: 'NETWORK'` reproduces.
 */
const DATA_DATE = '2026-01-01';
const DAY = 1440;
const CAL = allMinutesWorkCalendar;

const task = (
  id: string,
  durationDays: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({ id, durationMinutes: durationDays * DAY, type: 'TASK', ...overrides });

const fs = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
});

const crane: EngineResource[] = [{ id: 'CRANE', capacity: 1 }];
const onCrane = (...ids: string[]): EngineAssignment[] =>
  ids.map((activityId) => ({ activityId, resourceId: 'CRANE', unitsPerHour: 1 }));

/** Run the network pass and then the levelling pass exactly as a recalculation does. */
function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  ids: readonly string[],
  levelWithinFloatOnly = false,
  anchor: LevelingOptions['anchor'] = 'PLACED',
) {
  const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: CAL });
  const leveled = levelSchedule(activities, output, edges, onCrane(...ids), crane, {
    levelWithinFloatOnly,
    dataDate: DATA_DATE,
    planCalendar: CAL,
    anchor,
  });
  return {
    output,
    leveled,
    byId: new Map<string, EngineResult>(leveled.results.map((r) => [r.activityId, r])),
  };
}

/** The date a bar is drawn starting on: the value the canvas paints and the precondition cases compare. */
const drawnStartDay = (r: EngineResult) => r.visualEffectiveStart;

describe('levelSchedule — L1: a hand-separated clash disappears', () => {
  // A and B, 3 days each, both on the crane, no logic, both early at D. B is dragged to D+5, so as
  // drawn they no longer overlap.
  const A = task('A', 3, { levelingPriority: 1 });
  const B = task('B', 3, { levelingPriority: 2, visualStart: '2026-01-06' });

  it('precondition: B is drawn at D+5 while its network start is D', () => {
    const { byId } = run([A, B], [], ['A', 'B']);
    expect(byId.get('B')!.earlyStart).toBe('2026-01-01');
    expect(drawnStartDay(byId.get('B')!)).toBe('2026-01-06');
    expect(byId.get('A')!.visualEffectiveStart).toBe('2026-01-01');
  });

  // Red before #413 M1: levelling reads B's early start, sees a clash, and delays B to D+3 (recorded: B
  // leveledStartOffset 3 days, levelingDelay 3 days, leveledStart 2026-01-04).
  it('delays neither bar and levels B at its drawn start', () => {
    const { byId } = run([A, B], [], ['A', 'B']);
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(byId.get('B')!.levelingDelay).toBe(0);
    expect(byId.get('B')!.leveledStartOffset).toBe(5 * DAY);
    expect(byId.get('B')!.leveledStart).toBe('2026-01-06');
  });
});

describe('levelSchedule — L2: a hand-made clash appears', () => {
  // P (5 days) -> B (3 days), so B's early start is D+5. A (3 days) is dragged to D+5, onto B.
  const P = task('P', 5);
  const A = task('A', 3, { levelingPriority: 1, visualStart: '2026-01-06' });
  const B = task('B', 3, { levelingPriority: 2 });

  it('precondition: A is drawn at D+5 while its network start is D, and B starts at D+5', () => {
    const { byId } = run([P, A, B], [fs('P', 'B')], ['A', 'B']);
    expect(byId.get('A')!.earlyStart).toBe('2026-01-01');
    expect(drawnStartDay(byId.get('A')!)).toBe('2026-01-06');
    expect(byId.get('B')!.earlyStart).toBe('2026-01-06');
    expect(drawnStartDay(byId.get('B')!)).toBe('2026-01-06');
  });

  // Red before #413 M1: A (D..D+3) and B (D+5..D+8) never meet on network dates, so nothing is delayed
  // (recorded: B levelingDelay 0, leveledStartOffset 5 days).
  it('delays the lower-priority bar behind the one it now overlaps, measured from its drawn start', () => {
    const { byId } = run([P, A, B], [fs('P', 'B')], ['A', 'B']);
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(byId.get('B')!.leveledStartOffset).toBe(8 * DAY);
    expect(byId.get('B')!.levelingDelay).toBe(3 * DAY);
  });
});

describe('levelSchedule — L3: each of the seven sites, one case per site', () => {
  // Written so that leaving ONLY that site on the network basis still fails it.

  describe('pinned occupancy at the drawn span, and the pinned activity is levelled where it is drawn', () => {
    // M is mandatory (never moved), network D, dragged to D+5. C is levellable, network D.
    const M = task('M', 3, {
      constraintType: 'MANDATORY_START',
      constraintDate: '2026-01-01',
      visualStart: '2026-01-06',
    });
    const C = task('C', 3);

    it('precondition: M is drawn at D+5 with a network start of D; C has no placement', () => {
      const { byId } = run([M, C], [], ['M', 'C']);
      expect(byId.get('M')!.earlyStart).toBe('2026-01-01');
      expect(drawnStartDay(byId.get('M')!)).toBe('2026-01-06');
      expect(byId.get('C')!.earlyStart).toBe('2026-01-01');
    });

    // Red before #413 M1 (site: pinned occupancy): M occupies D..D+3 on network dates, so C is pushed to
    // D+3 (recorded: C levelingDelay 3 days).
    it('site 1: a pinned bar occupies its drawn span, so an unplaced bar is not pushed', () => {
      const { byId } = run([M, C], [], ['M', 'C']);
      expect(byId.get('C')!.levelingDelay).toBe(0);
      expect(byId.get('C')!.leveledStartOffset).toBe(0);
    });

    // Red before #413 M1 (site: pinned levelled dates): M's overlay is its network dates.
    it('site 2: a pinned bar keeps its drawn dates as its levelled dates', () => {
      const { byId } = run([M, C], [], ['M', 'C']);
      const m = byId.get('M')!;
      expect(m.leveledStart).toBe(m.visualEffectiveStart);
      expect(m.leveledFinish).toBe(m.visualEffectiveFinish);
      expect(m.leveledStartOffset).toBe(5 * DAY);
      expect(m.levelingDelay).toBe(0);
    });
  });

  describe('site 3: the delay is measured from the drawn start, not the network start', () => {
    // X (priority 1) is dragged to D+2 and Y (priority 2) to D+3, 4 days each. Network: both at D,
    // so Y sits behind X at D+4, a 4-day delay. Drawn: Y (wanting D+3) sits behind X's D+6 finish, a
    // 3-day delay measured from where it is drawn. Anchoring the start but not the delay would give
    // 6 days, which is why the fixture separates the two.
    const X = task('X', 4, { levelingPriority: 1, visualStart: '2026-01-03' });
    const Y = task('Y', 4, { levelingPriority: 2, visualStart: '2026-01-04' });

    it('precondition: both are drawn later than their network starts', () => {
      const { byId } = run([X, Y], [], ['X', 'Y']);
      expect(byId.get('X')!.earlyStart).toBe('2026-01-01');
      expect(drawnStartDay(byId.get('X')!)).toBe('2026-01-03');
      expect(byId.get('Y')!.earlyStart).toBe('2026-01-01');
      expect(drawnStartDay(byId.get('Y')!)).toBe('2026-01-04');
    });

    // Red before #413 M1: Y leveledStartOffset 4 days, levelingDelay 4 days.
    it('delays Y to the end of X, 3 days from where Y is drawn', () => {
      const { byId } = run([X, Y], [], ['X', 'Y']);
      expect(byId.get('X')!.levelingDelay).toBe(0);
      expect(byId.get('Y')!.leveledStartOffset).toBe(6 * DAY);
      expect(byId.get('Y')!.levelingDelay).toBe(3 * DAY);
    });
  });

  describe('site 4: the negative-float guard clamps to the drawn start', () => {
    // T must finish by D+5 (FNLT) but is dragged to D+10, past its bound. Under levelWithinFloatOnly
    // the cap arithmetic walks the start back to before the drawn start.
    const T = task('T', 3, {
      constraintType: 'FNLT',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-11',
    });

    it('precondition: T is drawn at D+10 with a network start of D and a negative remaining float', () => {
      const { byId } = run([T], [], ['T'], true);
      expect(byId.get('T')!.earlyStart).toBe('2026-01-01');
      expect(drawnStartDay(byId.get('T')!)).toBe('2026-01-11');
      expect(byId.get('T')!.remainingFloatMinutes).toBeLessThan(0);
    });

    // Red before #413 M1: T's network finish (D+3) is inside its bound, so the cap never fires and T is
    // levelled at its network start (recorded: leveledStartOffset 0), 10 days before it is drawn.
    // Once anchored on the drawn span the cap does fire (D+13 is past the bound) and walks the start
    // to D+2, so this case is the guard's: it must clamp to the DRAWN start, not the early one.
    it('never levels T before its drawn start', () => {
      const { byId } = run([T], [], ['T'], true);
      expect(byId.get('T')!.leveledStartOffset).toBe(10 * DAY);
    });
  });

  describe('site 5: a tie between equal contenders is broken by the drawn start', () => {
    // PX -> X and PY -> Y, then both -> Z, so X and Y have the same total float (0) and, being
    // unplaced, the same remaining float. PX is dragged to D+3, which pushes X's drawn start to D+4
    // while Y stays at D+1. Priorities are equal. Today the tie falls to the network start (equal,
    // D+1) and then the id, so X ("A") is placed first. As drawn, Y starts first and is placed first.
    const PX = task('PX', 1, { visualStart: '2026-01-04' });
    const PY = task('PY', 1);
    const X = task('A', 4);
    const Y = task('B', 4);
    const Z = task('Z', 1);
    const edges = [fs('PX', 'A'), fs('PY', 'B'), fs('A', 'Z'), fs('B', 'Z')];
    const all = [PX, PY, X, Y, Z];

    it('precondition: A is drawn at D+4, B at D+1, and both have a network start of D+1', () => {
      const { byId } = run(all, edges, ['A', 'B']);
      expect(byId.get('A')!.earlyStart).toBe('2026-01-02');
      expect(byId.get('B')!.earlyStart).toBe('2026-01-02');
      expect(drawnStartDay(byId.get('A')!)).toBe('2026-01-05');
      expect(drawnStartDay(byId.get('B')!)).toBe('2026-01-02');
      expect(byId.get('A')!.totalFloat).toBe(byId.get('B')!.totalFloat);
    });

    // Red before #413 M1: A is placed first at D+1, B is pushed behind it (recorded: B levelingDelay 4 days).
    it('places the bar that is drawn first, first', () => {
      const { byId } = run(all, edges, ['A', 'B']);
      expect(byId.get('B')!.levelingDelay).toBe(0);
      expect(byId.get('B')!.leveledStartOffset).toBe(1 * DAY);
    });
  });

  describe('site 6: the levelled project finish counts a non-participant at its drawn finish', () => {
    // N is not on the crane and is dragged to D+10, so it is drawn finishing at D+13. P is on the
    // crane alone at D..D+3.
    const N = task('N', 3, { visualStart: '2026-01-11' });
    const P = task('P', 3);

    it('precondition: N is drawn at D+10 with a network start of D', () => {
      const { byId } = run([N, P], [], ['P']);
      expect(byId.get('N')!.earlyStart).toBe('2026-01-01');
      expect(drawnStartDay(byId.get('N')!)).toBe('2026-01-11');
    });

    // Red before #413 M1: N's network finish (D+3) is used, so the finish is D+3 (recorded: 3 days).
    it('reports the levelled project finish at N’s drawn finish', () => {
      const { leveled } = run([N, P], [], ['P']);
      expect(leveled.summary.leveledProjectFinishOffset).toBe(13 * DAY);
      expect(leveled.summary.leveledProjectFinish).toBe('2026-01-13');
    });
  });
});

describe('levelSchedule — L4: the priority key breaks a tie on remaining float', () => {
  // Equal priority. X has more TOTAL float (4 days) but was dragged 3 days, leaving 1 day of REMAINING
  // float; Y has 2 days of both. Z (7 days) sets the project finish. X drawn D+3..D+6 overlaps Y
  // D..D+5.
  const X = task('X', 3, { visualStart: '2026-01-04' });
  const Y = task('Y', 5);
  const Z = task('Z', 7);

  it('precondition: X has more total float and less remaining float than Y', () => {
    const { byId } = run([X, Y, Z], [], ['X', 'Y']);
    const x = byId.get('X')!;
    const y = byId.get('Y')!;
    expect(x.totalFloat).toBeGreaterThan(y.totalFloat);
    expect(x.remainingFloatMinutes).toBeLessThan(y.remainingFloatMinutes);
    expect(drawnStartDay(x)).toBe('2026-01-04');
  });

  // Red before #413 M1: Y (less total float) is placed first; X is pushed behind it (recorded: X
  // levelingDelay 5 days).
  it('places X, the one with less remaining float, first', () => {
    const { byId } = run([X, Y, Z], [], ['X', 'Y']);
    expect(byId.get('X')!.levelingDelay).toBe(0);
    expect(byId.get('X')!.leveledStartOffset).toBe(3 * DAY);
    expect(byId.get('Y')!.leveledStartOffset).toBe(6 * DAY);
  });
});

describe('levelSchedule — L5: the pre-M1 results, which `anchor: NETWORK` reproduces', () => {
  // Recorded BEFORE any change and green throughout: the reference M1 keeps byte-identical on the
  // network anchor. The literals are the current output, not derived from the new code.
  const snapshot = (byId: Map<string, EngineResult>, ids: readonly string[]) =>
    Object.fromEntries(
      ids.map((id) => {
        const r = byId.get(id)!;
        return [
          id,
          {
            leveledStartOffset: r.leveledStartOffset,
            leveledFinishOffset: r.leveledFinishOffset,
            levelingDelay: r.levelingDelay,
            leveledStart: r.leveledStart,
            leveledFinish: r.leveledFinish,
          },
        ];
      }),
    );

  it('L1’s fixture on the network basis: B is delayed behind A', () => {
    const A = task('A', 3, { levelingPriority: 1 });
    const B = task('B', 3, { levelingPriority: 2, visualStart: '2026-01-06' });
    const { byId, leveled } = run([A, B], [], ['A', 'B'], false, 'NETWORK');
    expect(snapshot(byId, ['A', 'B'])).toEqual({
      A: {
        leveledStartOffset: 0,
        leveledFinishOffset: 3 * DAY,
        levelingDelay: 0,
        leveledStart: '2026-01-01',
        leveledFinish: '2026-01-03',
      },
      B: {
        leveledStartOffset: 3 * DAY,
        leveledFinishOffset: 6 * DAY,
        levelingDelay: 3 * DAY,
        leveledStart: '2026-01-04',
        leveledFinish: '2026-01-06',
      },
    });
    expect(leveled.summary).toMatchObject({
      leveledActivityCount: 1,
      leveledProjectFinishOffset: 6 * DAY,
      leveledProjectFinish: '2026-01-06',
    });
  });

  it('L2’s fixture on the network basis: there is no contention, so nothing moves', () => {
    const P = task('P', 5);
    const A = task('A', 3, { levelingPriority: 1, visualStart: '2026-01-06' });
    const B = task('B', 3, { levelingPriority: 2 });
    const { byId, leveled } = run([P, A, B], [fs('P', 'B')], ['A', 'B'], false, 'NETWORK');
    expect(snapshot(byId, ['A', 'B'])).toEqual({
      A: {
        leveledStartOffset: 0,
        leveledFinishOffset: 3 * DAY,
        levelingDelay: 0,
        leveledStart: '2026-01-01',
        leveledFinish: '2026-01-03',
      },
      B: {
        leveledStartOffset: 5 * DAY,
        leveledFinishOffset: 8 * DAY,
        levelingDelay: 0,
        leveledStart: '2026-01-06',
        leveledFinish: '2026-01-08',
      },
    });
    expect(leveled.summary).toMatchObject({
      leveledActivityCount: 0,
      leveledProjectFinishOffset: 8 * DAY,
      leveledProjectFinish: '2026-01-08',
    });
  });
});
