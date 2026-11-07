import { describe, expect, it } from 'vitest';

import {
  deriveExternalInstants,
  type CrossPlanEdgeType,
  type CrossPlanRemoteEndpoint,
} from '../cross-plan-derivation';
import {
  allMinutesWorkCalendar,
  computeSchedule,
  type EngineActivity,
  type EngineEdge,
  type EngineResult,
  type WorkingTimeCalendar,
} from '../engine';
import { link, WEEKDAY_CAL } from '../engine/compute.cross-calendar.fixture';

/**
 * **A progressed upstream, and a placed finish milestone upstream, across a link** (ADR-0212, the
 * prediction's section 3 and 4 in `docs/specs/cross-plan-instants/m0/prediction.md`). Neither is in the
 * matrix or the milestone fixture, which run unplaced, unprogressed work, so each is run here as the
 * two-plan programme the product solves (upstream, then the downstream that reads it) against the same
 * network in one plan, with the instants supplied and withheld.
 *
 * The plan calendar is the weekday one (Monday to Friday 08:00-16:00). `P` is the remote predecessor
 * and `S` the successor one day long.
 */
const FS_DAY = 480;

function remote(a: EngineActivity, dataDate: string): CrossPlanRemoteEndpoint {
  return {
    type: a.type ?? 'TASK',
    durationMinutes: a.durationMinutes,
    calendar: WEEKDAY_CAL,
    dataDate,
  };
}

function solve(
  activities: EngineActivity[],
  edges: EngineEdge[],
  dataDate: string,
  calendar: WorkingTimeCalendar = WEEKDAY_CAL,
): Map<string, EngineResult> {
  const out = computeSchedule(activities, edges, { dataDate, calendar });
  return new Map(out.results.map((r) => [r.activityId, r]));
}

/** `S`'s result when it reads `P` across a link, and in one plan; `calendar` is `S`'s plan's. */
function bothWays(
  p: EngineActivity,
  dataDate: string,
  instants: boolean,
  calendar: WorkingTimeCalendar = WEEKDAY_CAL,
  type: CrossPlanEdgeType = 'FS',
): { split: EngineResult; single: EngineResult } {
  const s: EngineActivity = { id: 'S', type: 'TASK', durationMinutes: FS_DAY };
  const single = solve([p, s], [link('P', 'S', type)], dataDate, calendar).get('S')!;
  const up = solve([p], [], dataDate).get('P')!;
  const { derived } = deriveExternalInstants({
    incoming: [
      {
        successorActivityId: 'S',
        type,
        lagMinutes: 0,
        lagCalendar: calendar,
        predecessor: remote(p, dataDate),
        predecessorPlacedStart: up.visualEffectiveStart,
        predecessorPlacedFinish: up.visualEffectiveFinish,
        predecessorPlacedStartInstant: instants ? up.placedStartInstant : null,
        predecessorPlacedFinishInstant: instants ? up.placedFinishInstant : null,
      },
    ],
    outgoing: [],
    m1: new Map([['S', { externalEarlyStart: null, externalLateFinish: null }]]),
    activities: new Map([['S', { type: 'TASK', durationMinutes: FS_DAY, calendar }]]),
    dataDate,
  });
  const d = derived.get('S')!;
  const split = solve(
    [{ ...s, externalEarlyStart: d.externalEarlyStart, externalLateFinish: d.externalLateFinish }],
    [],
    dataDate,
    calendar,
  ).get('S')!;
  return { split, single };
}

/**
 * `P`'s late side when it reads a downstream `S` across a link, and in one plan: the backward twin of
 * {@link bothWays}. `S` is the remote end; its late dates and instants come from its own plan's run.
 */
function bothWaysBackward(
  s: EngineActivity,
  dataDate: string,
  instants: boolean,
  type: CrossPlanEdgeType = 'FS',
): { split: EngineResult; single: EngineResult } {
  // Shorter than the remote's remaining work, so in one plan the project finish is the remote's and its
  // late finish is not stretched to a local task's early finish.
  const p: EngineActivity = { id: 'P', type: 'TASK', durationMinutes: 120 };
  const single = solve([p, s], [link('P', 'S', type)], dataDate).get('P')!;
  const down = solve([s], [], dataDate).get('S')!;
  const { derived } = deriveExternalInstants({
    incoming: [],
    outgoing: [
      {
        predecessorActivityId: 'P',
        type,
        lagMinutes: 0,
        lagCalendar: WEEKDAY_CAL,
        successor: remote(s, dataDate),
        successorLateStart: down.lateStart,
        successorLateFinish: down.lateFinish,
        successorLateStartInstant: instants ? down.lateStartInstant : null,
        successorLateFinishInstant: instants ? down.lateFinishInstant : null,
      },
    ],
    m1: new Map([['P', { externalEarlyStart: null, externalLateFinish: null }]]),
    activities: new Map([['P', { type: 'TASK', durationMinutes: 120, calendar: WEEKDAY_CAL }]]),
    dataDate,
  });
  const d = derived.get('P')!;
  const split = solve(
    [{ ...p, externalEarlyStart: d.externalEarlyStart, externalLateFinish: d.externalLateFinish }],
    [],
    dataDate,
  ).get('P')!;
  return { split, single };
}

describe('a progressed upstream (prediction section 3)', () => {
  it('a task in progress with four hours left hands over at 12:00, not at the end of its day', () => {
    // Data date Tuesday 06-15; P started Monday and has four working hours remaining, so it finishes
    // Tuesday 12:00 (its date is Tuesday, which a day reads as 16:00).
    const p: EngineActivity = {
      id: 'P',
      type: 'TASK',
      durationMinutes: 3 * FS_DAY,
      actualStart: '2027-06-14',
      remainingMinutes: 240,
    };
    const withInstants = bothWays(p, '2027-06-15', true);
    expect(withInstants.split.earlyStartOffset).toBe(withInstants.single.earlyStartOffset);
    // Non-vacuity, and the predicted direction: the date alone starts S later, never earlier.
    const without = bothWays(p, '2027-06-15', false);
    expect(without.split.earlyStartOffset).toBeGreaterThan(without.single.earlyStartOffset);
  });

  it('a complete task already read correctly: instants change nothing', () => {
    const p: EngineActivity = {
      id: 'P',
      type: 'TASK',
      durationMinutes: 2 * FS_DAY,
      actualStart: '2027-06-14',
      actualFinish: '2027-06-15',
    };
    const withInstants = bothWays(p, '2027-06-16', true);
    const without = bothWays(p, '2027-06-16', false);
    expect(withInstants.split.earlyStartOffset).toBe(withInstants.single.earlyStartOffset);
    expect(without.split.earlyStartOffset).toBe(without.single.earlyStartOffset);
    expect(withInstants.split).toEqual(without.split);
  });

  it('a started task read through SS and FF hands over at its own instants', () => {
    // Started Monday with four working hours left on Tuesday 06-15: it finishes Tuesday 12:00, and an
    // SS successor reads its actual start (Monday 08:00), an FF one its finish less its own day.
    const p: EngineActivity = {
      id: 'P',
      type: 'TASK',
      durationMinutes: 3 * FS_DAY,
      actualStart: '2027-06-14',
      remainingMinutes: 240,
    };
    for (const type of ['SS', 'FF'] as const) {
      const withInstants = bothWays(p, '2027-06-15', true, WEEKDAY_CAL, type);
      expect(withInstants.split.earlyStartOffset, type).toBe(withInstants.single.earlyStartOffset);
    }
  });
});

describe('a progressed downstream, read backward (the late side)', () => {
  const started: EngineActivity = {
    id: 'S',
    type: 'TASK',
    durationMinutes: 3 * FS_DAY,
    actualStart: '2027-06-14',
    remainingMinutes: 240,
  };

  it('a started successor bounds its predecessor exactly as in one plan', () => {
    // Parity, not discrimination: a started task's late start falls on a day boundary here, so the date
    // read agrees too (measured: withholding the instants gives the same offset). The instants are
    // what keeps it so for a late start that is not. The two types that read the successor's late START. An FF reads its late finish, which a lone
    // plan clamps to its own project finish where one plan has the other's, so it is not a like pair.
    for (const type of ['FS', 'SS'] as const) {
      const withInstants = bothWaysBackward(started, '2027-06-15', true, type);
      expect(withInstants.split.lateFinishOffset, type).toBe(withInstants.single.lateFinishOffset);
      expect(withInstants.split.totalFloat, type).toBe(withInstants.single.totalFloat);
    }
  });
});

describe('a placed finish milestone upstream (prediction section 4)', () => {
  const placed = (day: string): EngineActivity => ({
    id: 'P',
    type: 'FINISH_MILESTONE',
    durationMinutes: 0,
    visualStart: day,
  });

  it('on a day with no working time the instant and the date agree', () => {
    // Sunday 06-20 on the weekday calendar: both are the end of the day.
    const withInstants = bothWays(placed('2027-06-20'), '2027-06-14', true);
    const without = bothWays(placed('2027-06-20'), '2027-06-14', false);
    expect(withInstants.split).toEqual(without.split);
  });

  it('on a working day it reads the end of the typed day, which a successor working in the evening sees', () => {
    // Wednesday 06-16: a placed finish milestone's instant is midnight at the end of the typed day
    // (ADR-0207 D2), where the date reader gives the last working minute, Wednesday 16:00. On the
    // weekday calendar both roll to Thursday 08:00; on an every-minute calendar the successor starts
    // at the instant, later. This is the one place the change moves a date later, and it is the
    // answer one plan's Pass 2 gives (hence outside the parity domain), as the prediction says.
    const withInstants = bothWays(placed('2027-06-16'), '2027-06-14', true, allMinutesWorkCalendar);
    const without = bothWays(placed('2027-06-16'), '2027-06-14', false, allMinutesWorkCalendar);
    expect(withInstants.split.earlyStartOffset).toBeGreaterThan(without.split.earlyStartOffset);
    const weekday = bothWays(placed('2027-06-16'), '2027-06-14', true);
    // One plan reads a placement in Pass 2 only, so its NETWORK early start is not the comparison
    // (that is day 0); the day the successor is drawn on is.
    expect(weekday.split.visualEffectiveStart).toBe(weekday.single.visualEffectiveStart);
  });
});
