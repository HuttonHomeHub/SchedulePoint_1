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
];

/**
 * **The cases where the split does NOT equal the one-plan run today** (`docs/TECH_DEBT.md` #565). They
 * are `it.fails`, the form the #539 fixture itself took before its fix: each asserts the one-plan
 * answer, so the case turns red the day the divergence is closed and has to be flipped to a plain `it`.
 * Each key is `middle name|cut|longer`.
 *
 * - A start milestone on the weekend calendar: one plan keeps the instant its logic gives (Sunday
 *   evening, so `K` starts Monday 06-28); across plans the date the milestone stores is Saturday 07-03,
 *   its own next working minute (ADR-0035 §22), and `K` starts a week late, Monday 07-05 (cut at
 *   `M → K`); with the cut at `W → M` the external early start is rolled onto `M`'s own calendar and
 *   the same week is lost.
 * - A finish milestone on the plan calendar with the cut at `W → M` and float to spare: its late
 *   instant is a Monday opening, stored as the Friday before, and read back as midnight at the end of
 *   that Friday, so `W` and `A` lose a weekend and a week of float.
 * - A finish milestone on the weekend calendar, cut at `M → K`: `M`'s late date reads Sunday 06-27
 *   across plans (the external clamp rolls it onto its calendar) and Monday 06-28 in one plan. Display
 *   only; no float or other activity differs.
 */
const DIVERGES = new Set([
  'a finish milestone on the weekend calendar|M->K|false',
  'a start milestone on the weekend calendar|M->K|false',
  'a start milestone on the weekend calendar|M->K|true',
  'a start milestone on the weekend calendar|W->M|false',
  'a start milestone on the weekend calendar|W->M|true',
  'a finish milestone on the plan calendar|W->M|true',
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
});
