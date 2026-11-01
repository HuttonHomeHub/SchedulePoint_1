import { describe, expect, it } from 'vitest';

import {
  deriveExternalInstants,
  type CrossPlanLocalActivity,
  type CrossPlanRemoteEndpoint,
} from '../cross-plan-derivation';
import {
  computeSchedule,
  type EngineActivity,
  type EngineEdge,
  type EngineResult,
  type WorkingTimeCalendar,
} from '../engine';
import {
  CROSS_DATA_DATE,
  crossCalendarNetwork,
  link,
  middle,
  WEEKDAY_CAL,
  WEEKDAY_MINUTES,
  WEEKEND_CAL,
} from '../engine/compute.cross-calendar.fixture';

/**
 * **The #539 fixture, split across two plans** (`docs/TECH_DEBT.md` #555, `docs/specs/milestone-cross-calendar/`
 * US-4, ADR-0207). `A` (weekdays) → `W` (the weekend task, on a Saturday-Sunday calendar) → `M` (a
 * zero-span activity) → `K` (weekdays) → `F`. The engine specs run it in one plan; this runs it as two
 * plans joined by one cross-plan link, cut at `M → K` and at `W → M`, in the order the product solves a
 * programme (upstream forward, downstream both passes, upstream backward), and asserts every activity's
 * dates and float equal the one-plan run's.
 *
 * Why the cut at `W → M` matters: `W` finishes on a Sunday, a day with no working time on the
 * weekday plan, so a remote date read on the wrong calendar or rolled to a working minute lands a
 * weekend away. The matrix's weekend pairs (`cross-plan-twin.characterisation.spec.ts`) cover the same
 * seam over every link type and lag; this is the row's own network, with the numbers the engine specs pin.
 *
 * **Two variants.** The row's network as written has `K` setting the project finish, so the upstream
 * plan's own finish already binds `M` and `W` and the cross-plan late bound could be wrong without a
 * float moving. The `longer` variant adds an unlinked weekday task to each plan so the project finish
 * stops binding and `F`'s `FNLT` reaches `W` and `A` only through the cross-plan link.
 */

const LONG_DAYS = 60;

/** The calendar an activity schedules on: its own, else the plan's (the weekday calendar here). */
const calendarOf = (a: EngineActivity): WorkingTimeCalendar => a.calendar ?? WEEKDAY_CAL;

type Cut = 'M->K' | 'W->M';

const FIELDS = [
  'earlyStart',
  'earlyFinish',
  'lateStart',
  'lateFinish',
  'totalFloat',
  'earlyStartOffset',
  'lateFinishOffset',
] as const satisfies readonly (keyof EngineResult)[];

function pick(r: EngineResult): Record<(typeof FIELDS)[number], unknown> {
  return Object.fromEntries(FIELDS.map((f) => [f, r[f]])) as Record<
    (typeof FIELDS)[number],
    unknown
  >;
}

function run(activities: EngineActivity[], edges: EngineEdge[]): Map<string, EngineResult> {
  const out = computeSchedule(activities, edges, {
    dataDate: CROSS_DATA_DATE,
    calendar: WEEKDAY_CAL,
  });
  return new Map(out.results.map((r) => [r.activityId, r]));
}

function network(m: EngineActivity, longer: boolean) {
  const base = crossCalendarNetwork(m);
  const long = (id: string): EngineActivity => ({
    id,
    type: 'TASK',
    durationMinutes: LONG_DAYS * WEEKDAY_MINUTES,
  });
  return { ...base, long, longer };
}

function onePlan(m: EngineActivity, longer: boolean): Map<string, EngineResult> {
  const { activities, edges, long } = network(m, longer);
  return run(longer ? [...activities, long('L')] : activities, edges);
}

/** The two-plan programme, solved upstream forward, downstream, then upstream backward. */
function twoPlans(m: EngineActivity, longer: boolean, cut: Cut): Map<string, EngineResult> {
  const { activities, edges, long } = network(m, longer);
  const upIds = new Set(cut === 'M->K' ? ['A', 'W', 'M'] : ['A', 'W']);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const split = (ids: (id: string) => boolean) => ({
    activities: activities.filter((a) => ids(a.id)),
    // The cross-plan link is the one edge with a foot in each plan; it is not an in-plan edge.
    edges: edges.filter((e) => ids(e.predecessorId) && ids(e.successorId)),
  });
  const up = split((id) => upIds.has(id));
  const down = split((id) => !upIds.has(id));
  if (longer) {
    up.activities.push(long('L'));
    down.activities.push(long('L2'));
  }
  const [predId, succId] = cut === 'M->K' ? ['M', 'K'] : ['W', 'M'];
  const pred = byId.get(predId)!;
  const succ = byId.get(succId)!;
  const cross = link(predId, succId);

  const endpoint = (a: EngineActivity): CrossPlanRemoteEndpoint => ({
    type: a.type ?? 'TASK',
    durationMinutes: a.durationMinutes,
    calendar: calendarOf(a),
    dataDate: CROSS_DATA_DATE,
  });
  const locals = (plan: { activities: EngineActivity[] }) =>
    new Map<string, CrossPlanLocalActivity>(
      plan.activities.map((a) => [
        a.id,
        { type: a.type ?? 'TASK', durationMinutes: a.durationMinutes, calendar: calendarOf(a) },
      ]),
    );
  const m1 = (plan: { activities: EngineActivity[] }) =>
    new Map(
      plan.activities.map((a) => [a.id, { externalEarlyStart: null, externalLateFinish: null }]),
    );
  const withDerived = (
    plan: { activities: EngineActivity[]; edges: EngineEdge[] },
    derived: ReturnType<typeof deriveExternalInstants>['derived'],
  ) =>
    plan.activities.map((a) => {
      const d = derived.get(a.id);
      return d
        ? {
            ...a,
            externalEarlyStart: d.externalEarlyStart,
            externalLateFinish: d.externalLateFinish,
          }
        : a;
    });

  const upFirst = run(up.activities, up.edges);
  const { derived: forward } = deriveExternalInstants({
    incoming: [
      {
        successorActivityId: succId,
        type: cross.type,
        lagMinutes: 0,
        lagCalendar: WEEKDAY_CAL,
        predecessor: endpoint(pred),
        predecessorPlacedStart: upFirst.get(predId)!.visualEffectiveStart,
        predecessorPlacedFinish: upFirst.get(predId)!.visualEffectiveFinish,
      },
    ],
    outgoing: [],
    m1: m1(down),
    activities: locals(down),
    dataDate: CROSS_DATA_DATE,
  });
  const downResults = run(withDerived(down, forward), down.edges);
  const { derived: backward } = deriveExternalInstants({
    incoming: [],
    outgoing: [
      {
        predecessorActivityId: predId,
        type: cross.type,
        lagMinutes: 0,
        lagCalendar: WEEKDAY_CAL,
        successor: endpoint(succ),
        successorLateStart: downResults.get(succId)!.lateStart,
        successorLateFinish: downResults.get(succId)!.lateFinish,
      },
    ],
    m1: m1(up),
    activities: locals(up),
    dataDate: CROSS_DATA_DATE,
  });
  const upResults = run(withDerived(up, backward), up.edges);
  return new Map([...upResults, ...downResults]);
}

const MIDDLES: readonly [string, () => EngineActivity][] = [
  ['a finish milestone on the plan calendar', () => middle('FINISH_MILESTONE')],
  ['a finish milestone on the weekend calendar', () => middle('FINISH_MILESTONE', WEEKEND_CAL)],
  ['a start milestone on the plan calendar', () => middle('START_MILESTONE')],
  ['a start milestone on the weekend calendar', () => middle('START_MILESTONE', WEEKEND_CAL)],
  ['a zero-duration task', () => middle('TASK')],
  ['a zero-duration task on the weekend calendar', () => middle('TASK', WEEKEND_CAL)],
];

/**
 * **The cases where the split does NOT equal the one-plan run, and cannot without a stored instant**
 * (`docs/TECH_DEBT.md` #565). They are `it.fails`, the form the #539 fixture itself took before its fix:
 * each asserts the one-plan answer, so the case turns red the day the divergence is closed and has to be
 * flipped to a plain `it`. Each key is `middle name|cut|longer`. The "stored date cannot say" block below
 * proves the first three bullets below (the weekend start milestone and zero-duration task, and the plan-calendar finish milestone)
 * share one limit, the stored date; the fourth is the upstream plan's own finish basis.
 *
 * - A start milestone, or a zero-duration task (same date rule, ADR-0207 D3), on the weekend calendar,
 *   cut at `M → K`: one plan keeps the instant its logic gives
 *   (Monday 06-28 00:00, where the weekend work ended), so `K` starts Monday 06-28; the date the plan
 *   stores for a start milestone is the day its next working minute opens (ADR-0207 D3), Saturday 07-03,
 *   and `K` starts a week late, Monday 07-05.
 * - A finish milestone on the plan calendar, cut at `W → M` with float to spare: its late instant is
 *   Monday 07-05 08:00, stored as the Friday before; `W` and `A` lose a weekend and a week of float.
 * - A finish milestone on the weekend calendar, cut at `M → K`: `M`'s late date reads Sunday 06-27 across
 *   plans and Monday 06-28 in one plan. Not a derivation fault: the upstream plan's backward pass starts
 *   from its own project finish (Sunday 19:00, where `M` is), which the downstream bound cannot loosen.
 *   The `longer` variant, where that finish stops binding, equals one plan.
 *
 * #565 closed the other two of its six: a start milestone on the weekend calendar, cut at `W → M`.
 */
const DIVERGES = new Set([
  'a finish milestone on the weekend calendar|M->K|false',
  'a start milestone on the weekend calendar|M->K|false',
  'a start milestone on the weekend calendar|M->K|true',
  'a finish milestone on the plan calendar|W->M|true',
  'a zero-duration task on the weekend calendar|M->K|false',
  'a zero-duration task on the weekend calendar|M->K|true',
]);

describe('the #539 fixture split across two plans equals the one-plan run (#555)', () => {
  for (const cut of ['M->K', 'W->M'] as const) {
    for (const longer of [false, true]) {
      for (const [name, build] of MIDDLES) {
        const diverges = DIVERGES.has(`${name}|${cut}|${longer}`);
        const title = `${name}, cut at ${cut}${longer ? ', with a longer task' : ''}${diverges ? ' (#565)' : ''}`;
        (diverges ? it.fails : it)(title, () => {
          const single = onePlan(build(), longer);
          const split = twoPlans(build(), longer, cut);
          for (const id of ['A', 'W', 'M', 'K', 'F']) {
            expect(pick(split.get(id)!), id).toEqual(pick(single.get(id)!));
          }
        });
      }
    }
  }

  it('the row’s numbers hold in the split: K starts Monday 06-28, W has no float, A five weekdays', () => {
    for (const cut of ['M->K', 'W->M'] as const) {
      const split = twoPlans(middle('FINISH_MILESTONE'), false, cut);
      expect(split.get('K')!.earlyStart, cut).toBe('2027-06-28');
      expect(split.get('W')!.totalFloat, cut).toBe(0);
      expect(split.get('A')!.totalFloat, cut).toBe(5 * WEEKDAY_MINUTES);
      expect(split.get('M')!.earlyFinish, cut).toBe('2027-06-27');
    }
  });

  it('non-vacuity: the longer variant leaves W float for the cross-plan bound to carry', () => {
    // If the project finish still bound W, the longer variant would assert the same as the first.
    expect(onePlan(middle('FINISH_MILESTONE'), false).get('W')!.totalFloat).toBe(0);
    expect(onePlan(middle('FINISH_MILESTONE'), true).get('W')!.totalFloat).toBeGreaterThan(0);
    const split = twoPlans(middle('FINISH_MILESTONE'), true, 'M->K');
    expect(split.get('W')!.totalFloat).toBeGreaterThan(0);
  });

  describe('what a stored date cannot say (#565)', () => {
    it('two instants of a weekend start milestone store one date, and K starts a week apart', () => {
      // The fixture: the weekend work ends Sunday 19:00 and the milestone keeps Monday 00:00. The
      // witness: an SNET on Saturday 07-03 puts it at that day's first working minute.
      const driven = onePlan(middle('START_MILESTONE', WEEKEND_CAL), false);
      const pinned = onePlan(
        middle('START_MILESTONE', WEEKEND_CAL, {
          constraintType: 'SNET',
          constraintDate: '2027-07-03',
        }),
        false,
      );
      expect(driven.get('M')!.earlyStart).toBe('2027-07-03');
      expect(pinned.get('M')!.earlyStart).toBe('2027-07-03');
      expect(driven.get('K')!.earlyStart).toBe('2027-06-28');
      expect(pinned.get('K')!.earlyStart).toBe('2027-07-05');
    });

    it('two instants of a weekday finish milestone store one late date, and W has float a week apart', () => {
      // The fixture: M's late instant is the Monday 07-05 08:00 opening. The witness: an FNLT on Friday
      // 07-02 puts it at the end of that day. Both are dated Friday.
      const successorDriven = onePlan(middle('FINISH_MILESTONE'), true);
      const constrained = onePlan(
        middle('FINISH_MILESTONE', undefined, {
          constraintType: 'FNLT',
          constraintDate: '2027-07-02',
        }),
        true,
      );
      expect(successorDriven.get('M')!.lateFinish).toBe('2027-07-02');
      expect(constrained.get('M')!.lateFinish).toBe('2027-07-02');
      expect(successorDriven.get('W')!.totalFloat).toBe(1440);
      expect(constrained.get('W')!.totalFloat).toBe(0);
    });

    it('a weekend finish milestone reads its own plan’s finish, which a downstream bound cannot loosen', () => {
      const { activities } = network(middle('FINISH_MILESTONE', WEEKEND_CAL), false);
      const upstreamAlone = run(
        activities.filter((a) => ['A', 'W', 'M'].includes(a.id)),
        [link('A', 'W'), link('W', 'M')],
      );
      const split = twoPlans(middle('FINISH_MILESTONE', WEEKEND_CAL), false, 'M->K');
      expect(pick(split.get('M')!)).toEqual(pick(upstreamAlone.get('M')!));
      expect(
        twoPlans(middle('FINISH_MILESTONE', WEEKEND_CAL), true, 'M->K').get('M')!.lateFinish,
      ).toBe(onePlan(middle('FINISH_MILESTONE', WEEKEND_CAL), true).get('M')!.lateFinish);
    });
  });
});
