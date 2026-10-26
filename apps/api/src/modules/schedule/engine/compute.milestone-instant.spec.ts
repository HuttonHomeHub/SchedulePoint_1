import { describe, expect, it } from 'vitest';

import { computeSchedule, type ComputeOptions } from './compute';
import {
  CROSS_DATA_DATE,
  WEEKDAY_CAL,
  WEEKEND_CAL,
  crossCalendarNetwork,
  link,
  middle,
} from './compute.cross-calendar.fixture';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  absMinutesToInstant,
  allMinutesWorkCalendar,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **A zero-span activity keeps the instant its logic gives it: what the rule does to everything that
 * can reach a zero-span activity** (#539, ADR-0207; `docs/specs/milestone-cross-calendar/`). The
 * fixture and its dates are `compute.cross-calendar.fixture.ts` (plan calendar Mon-Fri 08:00-16:00,
 * weekend calendar Sat-Sun 07:00-19:00, data date Monday 2027-06-14; `A` ends Fri 06-18 16:00, `W` works
 * Sat 06-26 07:00 to Sun 06-27 19:00, `K` starts Mon 06-28 08:00). Every expectation is derived by hand
 * in the case's comment from those instants, never read off a run.
 *
 * Each describe pins one family of input: constraints, progress, external dates, lag calendars, the
 * negative-float late date, the project-finish ranking, and the differential that says the milestone's
 * own calendar cannot change what its neighbours read.
 */
const A: EngineActivity = { id: 'A', durationMinutes: 5 * 480, type: 'TASK' };
const K: EngineActivity = { id: 'K', durationMinutes: 5 * 480, type: 'TASK' };

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  extra: Partial<ComputeOptions> = {},
) {
  const out = computeSchedule(activities, edges, {
    dataDate: CROSS_DATA_DATE,
    calendar: WEEKDAY_CAL,
    ...extra,
  });
  const byId = new Map<string, EngineResult>(out.results.map((r) => [r.activityId, r]));
  return { out, get: (id: string) => byId.get(id)! };
}

const network = (m: EngineActivity) => crossCalendarNetwork(m);
const lagged = (
  from: string,
  to: string,
  lagMinutes: number,
  lagCalendar: WorkingTimeCalendar,
): EngineEdge => ({ ...link(from, to), lagMinutes, lagCalendar });

describe('constraints on a zero-span activity across calendars', () => {
  it('MFO on a finish milestone after weekend work: pinned to the end of Sunday, W floats 0', () => {
    // MFO Sun 06-27 is midnight Mon 06-28 00:00, which is in the gap between W's end (Sun 19:00) and
    // K's opening (Mon 08:00): zero weekday minutes from logic, so nothing is late or violated. M reads
    // the real minute before it, Sunday.
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, {
        constraintType: 'MFO',
        constraintDate: '2027-06-27',
      }),
    );
    const { get } = run(activities, edges);
    expect(get('M').earlyFinish).toBe('2027-06-27');
    expect(get('M').lateFinish).toBe('2027-06-27');
    expect(get('K').earlyStart).toBe('2027-06-28');
    expect(get('W').totalFloat).toBe(0);
    expect(get('M').constraintViolated).toBe(false);
  });

  it('MFO on the Friday before W ends pins M there and charges W its whole weekend', () => {
    // MFO Fri 06-25 is Sat 06-26 00:00, earlier than W's finish (Sun 06-27 19:00). The pin governs, so
    // W's late finish is that instant rolled back on the weekend calendar to Sun 06-20 19:00 and its
    // float is the 1,440 minutes of work (Sat 06-26 and Sun 06-27) it is behind. MFO is a pin, not a
    // mandatory constraint, so nothing is flagged as violated.
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, {
        constraintType: 'MFO',
        constraintDate: '2027-06-25',
      }),
    );
    const { get } = run(activities, edges);
    expect(get('M').earlyFinish).toBe('2027-06-25');
    expect(get('W').totalFloat).toBe(-1440);
    expect(get('K').earlyStart).toBe('2027-06-28');
    expect(get('M').constraintViolated).toBe(false);
  });

  it('MANDATORY_FINISH before logic still breaks logic, is produced as pinned, and is flagged (ADR-0035 §7)', () => {
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, {
        constraintType: 'MANDATORY_FINISH',
        constraintDate: '2027-06-25',
      }),
    );
    const { get, out } = run(activities, edges);
    expect(get('M').earlyFinish).toBe('2027-06-25');
    expect(get('M').constraintViolated).toBe(true);
    expect(out.summary.constraintViolationCount).toBe(1);
    // The successor still starts where the link puts it, from the pinned instant (Sat 00:00).
    expect(get('K').earlyStart).toBe('2027-06-28');
  });

  it('SNET on a start milestone on the weekend calendar reads the first weekend working minute', () => {
    // A ends Fri 06-18 16:00. SNET Tue 06-22 is read as the first working minute at or after the start
    // of that day ON THE MILESTONE'S CALENDAR: Sat 06-26 07:00. K follows it, Mon 06-28 08:00. M's float
    // is the weekend working time between Sat 07:00 and K's opening: Sat and Sun, 1,440.
    const { get } = run(
      [
        A,
        middle('START_MILESTONE', WEEKEND_CAL, {
          constraintType: 'SNET',
          constraintDate: '2027-06-22',
        }),
        K,
      ],
      [link('A', 'M'), link('M', 'K')],
    );
    expect(get('M').earlyStart).toBe('2027-06-26');
    expect(get('K').earlyStart).toBe('2027-06-28');
    expect(get('M').totalFloat).toBe(1440);
  });

  it('SNET on a zero-duration task on the weekend calendar reads the same minute', () => {
    const { get } = run(
      [A, middle('TASK', WEEKEND_CAL, { constraintType: 'SNET', constraintDate: '2027-06-22' }), K],
      [link('A', 'M'), link('M', 'K')],
    );
    expect(get('M').earlyStart).toBe('2027-06-26');
    expect(get('K').earlyStart).toBe('2027-06-28');
  });

  it('MSO on a zero-duration task on the plan calendar pins it to that morning, and drags its successor there', () => {
    // MSO Wed 06-23 is Wed 08:00 on the plan calendar. A ends Fri 06-18, so the pin is later than
    // logic and K starts at the pinned instant, Wed 06-23 08:00, with no weekend between.
    const { get } = run(
      [A, middle('TASK', undefined, { constraintType: 'MSO', constraintDate: '2027-06-23' }), K],
      [link('A', 'M'), link('M', 'K')],
    );
    expect(get('M').earlyStart).toBe('2027-06-23');
    expect(get('K').earlyStart).toBe('2027-06-23');
  });
});

describe('progress on a zero-span activity across calendars', () => {
  it('a completed finish milestone reports its actuals and drives its successor from the actual', () => {
    // Actual finish Sun 06-27 is the end of that day, Mon 06-28 00:00; K rolls it to Mon 08:00.
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, {
        actualStart: '2027-06-27',
        actualFinish: '2027-06-27',
      }),
    );
    const { get } = run(activities, edges);
    expect(get('M').earlyStart).toBe('2027-06-27');
    expect(get('M').earlyFinish).toBe('2027-06-27');
    expect(get('M').lateFinish).toBe('2027-06-27');
    expect(get('K').earlyStart).toBe('2027-06-28');
  });

  it('a started zero-duration task keeps its actual start and holds the late side at its early finish', () => {
    // IN_PROGRESS with nothing remaining: the start is the actual (Sun 06-27), the finish is where the
    // link puts it (Sun 19:00), and the clamp `finish < earlyFinish` keeps the late finish from falling
    // behind it, so its float is 0. K is still driven from it.
    const { activities, edges } = network(middle('TASK', undefined, { actualStart: '2027-06-27' }));
    const { get } = run(activities, edges);
    expect(get('M').earlyStart).toBe('2027-06-27');
    expect(Math.abs(get('M').totalFloat)).toBe(0);
    expect(get('K').earlyStart).toBe('2027-06-28');
  });
});

describe('external dates on a milestone across calendars', () => {
  it('an external early start on a finish milestone is the end of that day and is flagged as driving', () => {
    // External early start Tue 06-29 on a finish milestone is Wed 06-30 00:00. It is later than the link
    // (Sun 19:00), so it drives: M reads Tue 06-29, K starts Wed 06-30 08:00, and the flag is set.
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, { externalEarlyStart: '2027-06-29' }),
    );
    const { get } = run(activities, edges);
    expect(get('M').earlyFinish).toBe('2027-06-29');
    expect(get('K').earlyStart).toBe('2027-06-30');
    expect(get('M').externalDriven).toBe(true);
  });

  it('ignoreExternalRelationships drops it: the milestone is back where the work ends, and not flagged', () => {
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, { externalEarlyStart: '2027-06-29' }),
    );
    const { get } = run(activities, edges, { ignoreExternalRelationships: true });
    expect(get('M').earlyFinish).toBe('2027-06-27');
    expect(get('K').earlyStart).toBe('2027-06-28');
    expect(get('M').externalDriven).toBeUndefined();
  });

  it('an external late finish before the work ends charges W its weekend, not M, and is flagged', () => {
    // External late finish Fri 06-25 is Sat 06-26 00:00, before W's finish. W's late finish rolls back on
    // the weekend calendar to Sun 06-20 19:00, so W floats -1,440; M floats 0 on its own calendar (no
    // weekday minute lies between Sunday 19:00 and Saturday 00:00).
    const { activities, edges } = network(
      middle('FINISH_MILESTONE', undefined, { externalLateFinish: '2027-06-25' }),
    );
    const { get } = run(activities, edges);
    expect(get('W').totalFloat).toBe(-1440);
    expect(Math.abs(get('M').totalFloat)).toBe(0);
    expect(get('M').externalDriven).toBe(true);
    const ignored = run(activities, edges, { ignoreExternalRelationships: true });
    expect(ignored.get('W').totalFloat).toBe(0);
    expect(ignored.get('M').externalDriven).toBeUndefined();
  });

  it('an external early start on a start milestone on the weekend calendar rolls onto that calendar', () => {
    // Tue 06-29 on the weekend calendar is the first weekend working minute: Sat 07-03 07:00, and K,
    // on the weekday calendar, follows to Mon 07-05.
    const { activities, edges } = network(
      middle('START_MILESTONE', WEEKEND_CAL, { externalEarlyStart: '2027-06-29' }),
    );
    const { get } = run(activities, edges);
    expect(get('M').earlyStart).toBe('2027-07-03');
    expect(get('K').earlyStart).toBe('2027-07-05');
    expect(get('M').externalDriven).toBe(true);
  });
});

describe('a lag out of a milestone is walked from the kept instant (Q2 A)', () => {
  const direct = (lag: EngineEdge) => run([A, K], [lag]);

  it('a 24-hour elapsed lag after a milestone gives the successor what the direct link gives it', () => {
    // A ends Fri 06-18 16:00. Elapsed 1,440 minutes from there is Sat 06-19 16:00, which K rolls to Mon
    // 06-21 08:00 either way: A -> M -> K equals A -> K. Rolled first (Mon 08:00 + 24 h) it was Tue.
    const lag = lagged('A', 'K', 1440, allMinutesWorkCalendar);
    const viaMilestone = run(
      [A, middle('FINISH_MILESTONE'), K],
      [link('A', 'M'), lagged('M', 'K', 1440, allMinutesWorkCalendar)],
    );
    expect(viaMilestone.get('K').earlyStart).toBe(direct(lag).get('K').earlyStart);
    expect(viaMilestone.get('K').earlyStart).toBe('2027-06-21');
    expect(viaMilestone.get('K').earlyFinish).toBe(direct(lag).get('K').earlyFinish);
  });

  it('the single-calendar consequence: the lag counts from Friday 16:00, so the successor can start earlier', () => {
    // On one calendar the same plan is the single-calendar consequence the spec names (Q2): the 24-hour
    // lag starts counting at the moment the work ended, Fri 16:00, not at Monday 08:00. Ending the lag at
    // Saturday 16:00 rather than Tuesday 08:00 puts K on Monday 06-21 rather than Tuesday 06-22.
    const { get } = run(
      [A, middle('FINISH_MILESTONE'), K],
      [link('A', 'M'), lagged('M', 'K', 1440, allMinutesWorkCalendar)],
    );
    expect(get('K').earlyStart).toBe('2027-06-21');
    expect(get('K').earlyStart).not.toBe('2027-06-22');
  });

  it('a lag that resolves to another calendar (the weekend one) also equals the direct link', () => {
    // 720 weekend minutes from Fri 16:00: the weekend calendar's first working minute is Sat 07:00, so
    // the lag ends Sat 19:00 and K rolls to Mon 06-21 08:00, through the milestone or not.
    const lag = lagged('A', 'K', 720, WEEKEND_CAL);
    const viaMilestone = run(
      [A, middle('FINISH_MILESTONE', WEEKEND_CAL), K],
      [link('A', 'M'), lagged('M', 'K', 720, WEEKEND_CAL)],
    );
    expect(viaMilestone.get('K').earlyStart).toBe(direct(lag).get('K').earlyStart);
    expect(viaMilestone.get('K').earlyStart).toBe('2027-06-21');
  });
});

describe('a finish milestone with negative float on its own calendar (D3)', () => {
  it('reads a late date EARLIER than its early date: the clamp applies to non-negative float only', () => {
    // A ends Fri 06-18 16:00. FNLT Wed 06-16 is Thu 06-17 00:00; the milestone cannot meet it. On its
    // own calendar it floats -960 (Thu 08-16 and Fri 08-16 lie between its late and early instants), so
    // its late date is the plain reading of Thu 00:00, Wednesday 06-16, and is NOT lifted to Friday.
    const { get } = run(
      [
        A,
        middle('FINISH_MILESTONE', undefined, {
          constraintType: 'FNLT',
          constraintDate: '2027-06-16',
        }),
      ],
      [link('A', 'M')],
    );
    expect(get('M').earlyFinish).toBe('2027-06-18');
    expect(get('M').totalFloat).toBe(-960);
    expect(get('M').lateFinish).toBe('2027-06-16');
  });
});

describe('the project finish ranks zero-span activities where they were ranked before (#539)', () => {
  it('a zero-duration task on the plan calendar outranks a finish milestone on the weekend calendar at the same moment', () => {
    // A ends Fri 06-18 16:00. Both follow it. The task rolls onto the plan calendar (Mon 06-21 08:00, so
    // it ranks one minute before that), the milestone onto the weekend calendar (Sat 06-19 07:00). The task
    // ranks later, so the project finish is the task's date, Mon 06-21 (the day its next working minute
    // opens). Ranked by the kept instants the milestone (Fri 16:00) would win and read Friday.
    const { out } = run(
      [A, middle('FINISH_MILESTONE', WEEKEND_CAL), { id: 'Z', durationMinutes: 0, type: 'TASK' }],
      [link('A', 'M'), link('A', 'Z')],
    );
    expect(out.summary.projectFinish).toBe('2027-06-21');
  });
});

describe('the milestone’s own calendar cannot change what its neighbours read (differential)', () => {
  const variants: [string, WorkingTimeCalendar | undefined][] = [
    ['the plan calendar', undefined],
    ['the weekend calendar', WEEKEND_CAL],
    ['an all-minutes calendar', allMinutesWorkCalendar],
  ];

  it.each(variants)(
    'A -> W -> M -> K with M on %s gives K and W the same dates and float',
    (_n, cal) => {
      const { activities, edges } = network(middle('FINISH_MILESTONE', cal));
      const { get } = run(activities, edges);
      expect(get('W').earlyStart).toBe('2027-06-26');
      expect(get('W').totalFloat).toBe(0);
      expect(get('K').earlyStart).toBe('2027-06-28');
      expect(get('K').earlyFinish).toBe('2027-07-02');
      expect(get('A').totalFloat).toBe(5 * 480);
    },
  );

  it.each(variants)(
    'the START_MILESTONE and zero-duration TASK variants on %s do not move K or W either',
    (_n, cal) => {
      for (const type of ['START_MILESTONE', 'TASK'] as const) {
        const { activities, edges } = network(middle(type, cal));
        const { get } = run(activities, edges);
        expect(get('W').totalFloat, type).toBe(0);
        expect(get('K').earlyStart, type).toBe('2027-06-28');
      }
    },
  );
});

describe('converting a zero-duration task to a finish milestone keeps its POSITION on its own calendar (ADR-0162 D3)', () => {
  // The re-expression moves each stored date one calendar day earlier when a task becomes a finish
  // milestone. Since D2 the milestone's reading is midnight rather than the next working minute, so what
  // is kept is the position on the milestone's own calendar, not the raw instant.
  it('a weekday successor is unchanged; an every-minute successor sees the gap (8 hours) the roll used to hide', () => {
    const successors: EngineActivity[] = [
      { id: 'D', durationMinutes: 480, type: 'TASK' },
      { id: 'E', durationMinutes: 60, type: 'TASK', calendar: allMinutesWorkCalendar },
    ];
    const edges = [link('A', 'Z'), link('Z', 'D'), link('Z', 'E')];
    // A task pinned SNET Fri 06-25 (its opening, Fri 08:00) ...
    const asTask = run(
      [
        A,
        {
          id: 'Z',
          durationMinutes: 0,
          type: 'TASK',
          constraintType: 'SNET',
          constraintDate: '2027-06-25',
        },
        ...successors,
      ],
      edges,
    );
    // ... and the same activity as a finish milestone with the date re-expressed to Thu 06-24 (Fri 00:00).
    const asMilestone = run(
      [
        A,
        {
          id: 'Z',
          durationMinutes: 0,
          type: 'FINISH_MILESTONE',
          constraintType: 'SNET',
          constraintDate: '2027-06-24',
        },
        ...successors,
      ],
      edges,
    );
    // Position on its own calendar: the weekday successor and Z's own float and schedule are identical.
    expect(asMilestone.get('D').earlyStart).toBe(asTask.get('D').earlyStart);
    expect(asMilestone.get('D').earlyStart).toBe('2027-06-25');
    expect(asMilestone.get('Z').totalFloat).toBe(asTask.get('Z').totalFloat);
    // The raw instant is NOT kept: the every-minute successor starts at Fri 00:00 instead of Fri 08:00.
    expect(absMinutesToInstant(asTask.get('E').passOnStartInstant)).toBe('2027-06-25T08:00');
    expect(absMinutesToInstant(asMilestone.get('E').passOnStartInstant)).toBe('2027-06-25');
  });
});
