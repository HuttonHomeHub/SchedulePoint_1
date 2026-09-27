import type { LagCalendarSource } from '@prisma/client';

import type { PlanCrossEdge } from '../../cross-plan-dependencies/cross-plan-dependency.repository';
import {
  crossPlanLagCalendarId,
  type CrossPlanEndpointCalendarFacts,
} from '../../cross-plan-dependencies/cross-plan-lag-calendar';
import {
  deriveExternalInstants,
  type CrossPlanEdgeType,
  type CrossPlanLocalActivity,
  type CrossPlanRemoteEndpoint,
  type DerivedExternalInstant,
  type IncomingCrossPlanEdge,
  type M1ExternalInstant,
  type OutgoingCrossPlanEdge,
} from '../cross-plan-derivation';
import { allMinutesWorkCalendar, buildWorkingTimeCalendar, computeSchedule } from '../engine';
import type {
  EngineActivity,
  EngineEdge,
  EngineOutput,
  EngineResult,
  WorkingTimeCalendar,
} from '../engine';
import { resolveProgrammeOrder } from '../programme-order';

/**
 * The **cross-plan (live inter-project) conformance adapter** (F7.T1, inter-project M2 — ADR-0045
 * §2–§5 / ADR-0035 §30.5–§30.8). It is the multi-plan analogue of the single-plan `adapter.ts`: it
 * takes a small hand-built multi-plan fixture, resolves the programme order, derives each downstream
 * plan's external instants from its upstreams' **freshly-computed** dates, feeds those derived M1
 * external columns onto the plans' activities, and runs the **unchanged** engine per plan.
 *
 * Engine-free where possible (ADR-0034 §7): the cross-plan machinery under test — {@link
 * resolveProgrammeOrder} (topo upstream-first) and {@link deriveExternalInstants} (§30.5 later-of /
 * tighter-of) — is pure. The engine (`computeSchedule`) is invoked **only** as the existing per-plan
 * seam that interprets the derived bound exactly like a hand-entered M1 column (ADR-0043 §30.1). The
 * engine is never modified; cross-plan is derived strictly above it.
 *
 * No external oracle (ADR-0034 §3): the fixtures are tiny, on a 24/7 calendar (1 working day = 1440
 * minutes) by default so day arithmetic is transparent, and every asserted date is hand-computed from
 * the §30.5–§30.8 semantics in `cross-plan-conformance.spec.ts` — self-baselined, first-principles.
 * A fixture plan may name its own calendar port and an activity its own, which is how the
 * mixed-calendar axis (#385 M2-T6) runs through the same adapter.
 *
 * **It derives exactly as the product does** (#385): the same `deriveExternalInstants`, with edges
 * in BOTH directions, lags in working minutes, and each lag's port chosen by the one cross-plan
 * rule, `crossPlanLagCalendarId`. The fixtures carry ports rather than calendar ids, so each port is
 * given a synthetic id (`plan:<id>`, `act:<id>`) for the rule to decide between and is looked up
 * again afterwards: the adapter restates no part of the rule, which is the drift ADR-0065 describes.
 */

/** One plan in a cross-plan fixture — a bare engine network plus any hand-entered M1 external columns. */
export interface CrossPlanFixturePlan {
  id: string;
  name: string;
  /** The plan's data date (`YYYY-MM-DD`) — its schedule's earliest instant. */
  dataDate: string;
  /**
   * The plan's calendar port. Absent = the all-minutes 24/7 calendar every fixture used before the
   * mixed-calendar axis. An activity with its own `calendar` schedules on that instead.
   */
  calendar?: WorkingTimeCalendar;
  /** Engine-ready activities (no external columns; the derivation supplies those). */
  activities: EngineActivity[];
  /** Intra-plan logic edges (usually none for these interface fixtures). */
  intraEdges?: EngineEdge[];
  /** Hand-entered M1 external columns (ADR-0043) keyed by activity id — the derivation's `later-of` input. */
  m1?: Record<string, M1ExternalInstant>;
}

/** A directed cross-plan (inter-project) edge — its predecessor and successor live in different plans. */
export interface CrossPlanFixtureEdge {
  id: string;
  type: CrossPlanEdgeType;
  /**
   * The stored lag in working minutes on this edge's lag calendar (a lead is negative), as the
   * product stores it since #385: `lagDays × the lag calendar's hours-per-day`. On the default
   * 24/7 calendar a day is 1440.
   */
  lagMinutes: number;
  /** The lag's calendar source (default `PROJECT_DEFAULT`, the successor plan's calendar). */
  lagCalendar?: LagCalendarSource;
  predecessorPlanId: string;
  predecessorActivityId: string;
  successorPlanId: string;
  successorActivityId: string;
  /** The tier-1 structural coverage tag this edge claims (aggregated by {@link crossPlanCoverageIndex}). */
  coverageTag?: string;
}

/** A whole multi-plan fixture: its plans, its cross-plan edges, and the plan a programme recalc targets. */
export interface CrossPlanFixture {
  id: string;
  description: string;
  /** The plan whose programme recalc is being solved (the most-downstream plan). */
  targetPlanId: string;
  plans: CrossPlanFixturePlan[];
  edges: CrossPlanFixtureEdge[];
  /** Fixture-wide structural coverage tags (aggregated by {@link crossPlanCoverageIndex}). */
  coverageTags: string[];
}

/** One activity's persisted computed dates — the upstream snapshot the derivation reads. */
export interface ComputedDates {
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  /**
   * The **placed** span — what the forward cross-plan bound is derived from since
   * one-planning-surface M-H, mirroring `cross-plan-dependency.repository.ts`.
   *
   * **This adapter is the SECOND producer of that bound**, and it has to move in the same commit
   * as the first. The two feed the same `forwardBound`, so if only one switched the conformance
   * harness would be measuring a rule the product does not run — and it would say nothing, because
   * each side is internally consistent. `cross-plan-basis.structural.spec.ts` pins both.
   *
   * There is deliberately no placed equivalent of the late pair below: see
   * `OutgoingCrossPlanEdgeRow`.
   */
  placedStart: string;
  placedFinish: string;
}

export interface ProgrammeSolveResult {
  /** The topological plan order the solve walked (upstream-first; the target is LAST). */
  order: string[];
  /** Each plan's engine output, keyed by plan id. */
  outputs: Map<string, EngineOutput>;
  /** Every activity's engine result across all solved plans, keyed by activity id. */
  resultsByActivity: Map<string, EngineResult>;
  /** The freshly-computed dates the solve produced, keyed by activity id (the derivation snapshot). */
  computed: Map<string, ComputedDates>;
  /** Each cross-plan-linked activity's effective derived external instants, keyed by activity id. */
  derivedByActivity: Map<string, DerivedExternalInstant>;
  /** How many cross-plan edges pointed at a never-computed upstream endpoint this solve (N32). */
  upstreamMissingCount: number;
}

/** Options shared by both solve entry points. */
export interface CrossPlanSolveOptions {
  /** Drop every derived (and manual) external bound — the plan-level ignore-external toggle (§30.4, S09). */
  ignoreExternalRelationships?: boolean;
}

/** The plan-grain edge set (nodes are plans) the programme-order + cycle machinery reads. */
export function toPlanEdges(fixture: CrossPlanFixture): PlanCrossEdge[] {
  return fixture.edges.map((edge) => ({
    predecessorPlanId: edge.predecessorPlanId,
    successorPlanId: edge.successorPlanId,
  }));
}

/** A plan's calendar port: its own, or the 24/7 all-minutes calendar. */
const planCalendar = (plan: CrossPlanFixturePlan): WorkingTimeCalendar =>
  plan.calendar ?? allMinutesWorkCalendar;

/** Where one activity sits in a fixture: its plan and its engine row. */
interface Located {
  plan: CrossPlanFixturePlan;
  activity: EngineActivity;
}

function locate(fixture: CrossPlanFixture, activityId: string): Located {
  for (const plan of fixture.plans) {
    const activity = plan.activities.find((a) => a.id === activityId);
    if (activity) return { plan, activity };
  }
  throw new Error(`cross-plan fixture "${fixture.id}" has no activity "${activityId}"`);
}

/** Synthetic calendar ids, so the fixtures' ports can be decided between by the product's rule. */
const PLAN_CAL = 'plan:';
const ACTIVITY_CAL = 'act:';

function facts({ plan, activity }: Located): CrossPlanEndpointCalendarFacts {
  return {
    type: activity.type ?? 'TASK',
    calendarId: activity.calendar ? `${ACTIVITY_CAL}${activity.id}` : null,
    // The fixtures model no resources, so no driving calendar: an honest `null`, not an omission.
    drivingCalendarId: null,
    planCalendarId: `${PLAN_CAL}${plan.id}`,
  };
}

/** The port a synthetic calendar id names; `null` is "no calendar", the all-minutes port. */
function portOf(fixture: CrossPlanFixture, calId: string | null): WorkingTimeCalendar {
  if (calId === null) return allMinutesWorkCalendar;
  if (calId.startsWith(PLAN_CAL)) {
    const id = calId.slice(PLAN_CAL.length);
    const plan = fixture.plans.find((p) => p.id === id);
    if (!plan) throw new Error(`cross-plan fixture "${fixture.id}" has no plan "${id}"`);
    return planCalendar(plan);
  }
  const { activity } = locate(fixture, calId.slice(ACTIVITY_CAL.length));
  if (!activity.calendar)
    throw new Error(`"${calId}" was chosen and that activity has no calendar`);
  return activity.calendar;
}

/** The lag port for one edge, decided by the one cross-plan rule (`crossPlanLagCalendarId`). */
function lagPort(fixture: CrossPlanFixture, edge: CrossPlanFixtureEdge): WorkingTimeCalendar {
  return portOf(
    fixture,
    crossPlanLagCalendarId({
      lagCalendar: edge.lagCalendar ?? 'PROJECT_DEFAULT',
      predecessor: facts(locate(fixture, edge.predecessorActivityId)),
      successor: facts(locate(fixture, edge.successorActivityId)),
    }),
  );
}

/** A remote endpoint as the derivation reads it: its scheduling port and its plan's data date. */
function remote({ plan, activity }: Located): CrossPlanRemoteEndpoint {
  return {
    type: activity.type ?? 'TASK',
    durationMinutes: activity.durationMinutes,
    calendar: activity.calendar ?? planCalendar(plan),
    dataDate: plan.dataDate,
  };
}

/** This plan's activities, each on the port it schedules on. */
function localActivities(plan: CrossPlanFixturePlan): Map<string, CrossPlanLocalActivity> {
  return new Map(
    plan.activities.map((a) => [
      a.id,
      {
        type: a.type ?? 'TASK',
        durationMinutes: a.durationMinutes,
        calendar: a.calendar ?? planCalendar(plan),
      },
    ]),
  );
}

/**
 * Build the incoming cross-plan edges into `planId`, reading each predecessor's dates from `computed`
 * (a never-computed predecessor ⇒ null dates ⇒ the derivation counts it N32 and contributes no bound).
 */
function incomingEdgesInto(
  fixture: CrossPlanFixture,
  planId: string,
  computed: Map<string, ComputedDates>,
): IncomingCrossPlanEdge[] {
  return fixture.edges
    .filter((edge) => edge.successorPlanId === planId)
    .map((edge) => {
      const pred = computed.get(edge.predecessorActivityId) ?? null;
      return {
        successorActivityId: edge.successorActivityId,
        type: edge.type,
        lagMinutes: edge.lagMinutes,
        lagCalendar: lagPort(fixture, edge),
        predecessor: remote(locate(fixture, edge.predecessorActivityId)),
        predecessorPlacedStart: pred?.placedStart ?? null,
        predecessorPlacedFinish: pred?.placedFinish ?? null,
      };
    });
}

/**
 * Build the outgoing cross-plan edges out of `planId`, reading each successor's LATE dates from
 * `computed`. In an upstream-first solve the successor is not computed yet, so this contributes
 * nothing there, exactly as in the product (and it is not counted as N32).
 */
function outgoingEdgesFrom(
  fixture: CrossPlanFixture,
  planId: string,
  computed: Map<string, ComputedDates>,
): OutgoingCrossPlanEdge[] {
  return fixture.edges
    .filter((edge) => edge.predecessorPlanId === planId)
    .map((edge) => {
      const succ = computed.get(edge.successorActivityId) ?? null;
      return {
        predecessorActivityId: edge.predecessorActivityId,
        type: edge.type,
        lagMinutes: edge.lagMinutes,
        lagCalendar: lagPort(fixture, edge),
        successor: remote(locate(fixture, edge.successorActivityId)),
        successorLateStart: succ?.lateStart ?? null,
        successorLateFinish: succ?.lateFinish ?? null,
      };
    });
}

/**
 * Recalculate ONE plan: derive its activities' external instants from `computed` (the upstream
 * snapshot), feed them onto cloned activities, and run the unchanged engine. Returns the output plus
 * the derived instants and the N32 missing-upstream count for this plan.
 */
function recalcPlan(
  fixture: CrossPlanFixture,
  plan: CrossPlanFixturePlan,
  computed: Map<string, ComputedDates>,
  opts: CrossPlanSolveOptions,
): {
  output: EngineOutput;
  derived: Map<string, DerivedExternalInstant>;
  upstreamMissingCount: number;
} {
  const { derived, upstreamMissingCount } = deriveExternalInstants({
    incoming: incomingEdgesInto(fixture, plan.id, computed),
    outgoing: outgoingEdgesFrom(fixture, plan.id, computed),
    m1: new Map(Object.entries(plan.m1 ?? {})),
    activities: localActivities(plan),
    dataDate: plan.dataDate,
  });

  // Feed the derived (or manual-only) external columns onto cloned activities; the engine reads them
  // through the exact same seam as a hand-entered M1 column (ADR-0043 §30.1) — no engine change.
  const activities: EngineActivity[] = plan.activities.map((activity) => {
    const d = derived.get(activity.id);
    return d
      ? {
          ...activity,
          externalEarlyStart: d.externalEarlyStart,
          externalLateFinish: d.externalLateFinish,
        }
      : activity;
  });

  const output = computeSchedule(activities, plan.intraEdges ?? [], {
    dataDate: plan.dataDate,
    calendar: planCalendar(plan),
    ...(opts.ignoreExternalRelationships ? { ignoreExternalRelationships: true } : {}),
  });
  return { output, derived, upstreamMissingCount };
}

/** Record every activity result of `output` into the shared `computed` / `resultsByActivity` maps. */
function absorb(
  output: EngineOutput,
  computed: Map<string, ComputedDates>,
  resultsByActivity: Map<string, EngineResult>,
): void {
  for (const result of output.results) {
    computed.set(result.activityId, {
      earlyStart: result.earlyStart,
      earlyFinish: result.earlyFinish,
      lateStart: result.lateStart,
      lateFinish: result.lateFinish,
      placedStart: result.visualEffectiveStart,
      placedFinish: result.visualEffectiveFinish,
    });
    resultsByActivity.set(result.activityId, result);
  }
}

/**
 * Solve the **whole programme** for `fixture.targetPlanId`: resolve the upstream closure in
 * topological order (§30.8), then recalculate each plan **upstream-first** so every downstream plan
 * derives against its upstreams' freshly-written dates (ADR-0045 §4 / §30.5). The unchanged single-plan
 * engine is run once per plan. This is the "programme recalc, upstream fresh" side of the F7 differential.
 */
export function solveProgramme(
  fixture: CrossPlanFixture,
  opts: CrossPlanSolveOptions = {},
): ProgrammeSolveResult {
  const order = resolveProgrammeOrder(fixture.targetPlanId, toPlanEdges(fixture));
  const planById = new Map(fixture.plans.map((p) => [p.id, p]));

  const computed = new Map<string, ComputedDates>();
  const resultsByActivity = new Map<string, EngineResult>();
  const outputs = new Map<string, EngineOutput>();
  const derivedByActivity = new Map<string, DerivedExternalInstant>();
  let upstreamMissingCount = 0;

  for (const planId of order) {
    const plan = planById.get(planId);
    if (!plan) throw new Error(`cross-plan fixture "${fixture.id}" is missing plan "${planId}"`);
    const {
      output,
      derived,
      upstreamMissingCount: missing,
    } = recalcPlan(fixture, plan, computed, opts);
    outputs.set(planId, output);
    absorb(output, computed, resultsByActivity);
    for (const [id, instant] of derived) derivedByActivity.set(id, instant);
    upstreamMissingCount += missing;
  }

  return { order, outputs, resultsByActivity, computed, derivedByActivity, upstreamMissingCount };
}

/**
 * Recalculate ONLY the target plan against a supplied upstream `snapshot` — the "downstream alone"
 * side of the F7 differential (§30.7 staleness). Pass a **stale** snapshot (an older upstream schedule)
 * to model the downstream computed against superseded upstream dates, or an **empty** snapshot to model
 * a never-refreshed upstream (N32). The upstream plans are NOT recomputed, so this deliberately skips
 * the programme order.
 */
export function solveTargetAlone(
  fixture: CrossPlanFixture,
  snapshot: Map<string, ComputedDates>,
  opts: CrossPlanSolveOptions = {},
): {
  output: EngineOutput;
  derived: Map<string, DerivedExternalInstant>;
  upstreamMissingCount: number;
} {
  const plan = fixture.plans.find((p) => p.id === fixture.targetPlanId);
  if (!plan) throw new Error(`cross-plan fixture "${fixture.id}" is missing its target plan`);
  return recalcPlan(fixture, plan, snapshot, opts);
}

// ---------------------------------------------------------------------------------------------------
// The fixtures — a Procurement → Construction FS interface and an upstream→two-mids→downstream diamond.
// ---------------------------------------------------------------------------------------------------

/** A bare 24/7 TASK of `durationDays` whole working days. */
function task(id: string, durationDays: number): EngineActivity {
  return { id, durationMinutes: durationDays * 1440, type: 'TASK' };
}

/**
 * **The FS inter-project interface** (the canonical Procurement → Construction hand-off, ADR-0045 §2).
 * Upstream *Procurement* activity `PROC_STEEL` (10 d, data date 2026-01-01 ⇒ inclusive early finish
 * 2026-01-10, which is the instant 2026-01-11 00:00) feeds downstream *Construction* `CONS_ERECT` over
 * an FS+2 cross-plan edge, so the derived external early start is 2 × 1440 minutes later,
 * `2026-01-13T00:00` (§30.5, §30.1-shaped; it read `2026-01-12` until #385, one day early). `CONS_ERECT`
 * also carries a hand-entered M1 external column so the **later-of** composition (§30.5) can be
 * exercised both ways.
 */
export const FS_INTERFACE_FIXTURE: CrossPlanFixture = {
  id: 'fs-interface',
  description:
    'Procurement PROC_STEEL (10d) → Construction CONS_ERECT (5d), FS+2 cross-plan interface.',
  targetPlanId: 'PLAN_CONSTRUCTION',
  coverageTags: ['xplan_fs_interface', 'xplan_later_of_two', 'xplan_ignore_external'],
  plans: [
    {
      id: 'PLAN_PROCUREMENT',
      name: 'Procurement',
      dataDate: '2026-01-01',
      activities: [task('PROC_STEEL', 10)],
    },
    {
      id: 'PLAN_CONSTRUCTION',
      name: 'Construction',
      dataDate: '2026-01-01',
      activities: [task('CONS_ERECT', 5)],
      // A hand-entered M1 external early start EARLIER than the derived 2026-01-13, so the derived bound
      // drives by default (§30.5 later-of); the golden also overrides it to prove the manual column wins.
      m1: { CONS_ERECT: { externalEarlyStart: '2026-01-05', externalLateFinish: null } },
    },
  ],
  edges: [
    {
      id: 'x1',
      type: 'FS',
      lagMinutes: 2 * 1440,
      predecessorPlanId: 'PLAN_PROCUREMENT',
      predecessorActivityId: 'PROC_STEEL',
      successorPlanId: 'PLAN_CONSTRUCTION',
      successorActivityId: 'CONS_ERECT',
      coverageTag: 'xplan_fs_interface',
    },
  ],
};

/**
 * **The diamond fan-in** (ADR-0045 §4 topo order + multi-upstream fold, §30.5). Upstream `U1` (8 d,
 * 2026-01-01 ⇒ EF 2026-01-08, ending 2026-01-09 00:00) feeds two mid plans: `MA1` over FS+0 (⇒ external
 * early start 2026-01-09, 4 d ⇒ EF 2026-01-12) and `MB1` over FS+3 (⇒ 2026-01-12, 6 d ⇒ EF 2026-01-17).
 * Both mids feed downstream `D1` over FS+0, so `D1`'s derived external early start is the **latest** of
 * the two mid bounds — the ends of 2026-01-12 and 2026-01-17, so `2026-01-18T00:00` (§30.5 later-of
 * across incoming edges; every date here read one day earlier until #385). The programme order must be
 * upstream-first: `[UP, MID_A, MID_B, DOWN]`.
 */
export const DIAMOND_FIXTURE: CrossPlanFixture = {
  id: 'diamond-fan-in',
  description:
    'UP U1 (8d) → MID_A MA1 (4d, FS+0) & MID_B MB1 (6d, FS+3) → DOWN D1 (3d), FS+0 fan-in.',
  targetPlanId: 'PLAN_DOWN',
  coverageTags: ['xplan_diamond_fanin', 'xplan_programme_order'],
  plans: [
    { id: 'PLAN_UP', name: 'Upstream', dataDate: '2026-01-01', activities: [task('U1', 8)] },
    { id: 'PLAN_MID_A', name: 'Mid A', dataDate: '2026-01-01', activities: [task('MA1', 4)] },
    { id: 'PLAN_MID_B', name: 'Mid B', dataDate: '2026-01-01', activities: [task('MB1', 6)] },
    { id: 'PLAN_DOWN', name: 'Downstream', dataDate: '2026-01-01', activities: [task('D1', 3)] },
  ],
  edges: [
    {
      id: 'd1',
      type: 'FS',
      lagMinutes: 0,
      predecessorPlanId: 'PLAN_UP',
      predecessorActivityId: 'U1',
      successorPlanId: 'PLAN_MID_A',
      successorActivityId: 'MA1',
      coverageTag: 'xplan_programme_order',
    },
    {
      id: 'd2',
      type: 'FS',
      lagMinutes: 3 * 1440,
      predecessorPlanId: 'PLAN_UP',
      predecessorActivityId: 'U1',
      successorPlanId: 'PLAN_MID_B',
      successorActivityId: 'MB1',
      coverageTag: 'xplan_programme_order',
    },
    {
      id: 'd3',
      type: 'FS',
      lagMinutes: 0,
      predecessorPlanId: 'PLAN_MID_A',
      predecessorActivityId: 'MA1',
      successorPlanId: 'PLAN_DOWN',
      successorActivityId: 'D1',
      coverageTag: 'xplan_diamond_fanin',
    },
    {
      id: 'd4',
      type: 'FS',
      lagMinutes: 0,
      predecessorPlanId: 'PLAN_MID_B',
      predecessorActivityId: 'MB1',
      successorPlanId: 'PLAN_DOWN',
      successorActivityId: 'D1',
      coverageTag: 'xplan_diamond_fanin',
    },
  ],
};

// ---------------------------------------------------------------------------------------------------
// #385 M2-T6 goldens — the calendars the day-boundary defect needed and the two 24/7 fixtures above
// could not show. Every expected date is walked by hand in `cross-plan-conformance.spec.ts`.
// ---------------------------------------------------------------------------------------------------

const weekdayWindows = (open: number, close: number) =>
  Array.from({ length: 7 }, (_, weekday) =>
    weekday < 5 ? [{ startMinute: open, endMinute: close }] : [],
  );

/** Monday to Friday, 00:00–24:00: the organisation stock calendar (#385 E16). A day is 1440. */
export const STANDARD_CALENDAR = buildWorkingTimeCalendar(weekdayWindows(0, 1440), []);
/** Monday to Friday, 08:00–16:00. A day is 480 (FC-4). */
export const EIGHT_HOUR_CALENDAR = buildWorkingTimeCalendar(weekdayWindows(480, 960), []);

/** A task of `days` working days on a calendar whose day is `minutesPerDay`. */
function taskOn(id: string, days: number, minutesPerDay: number): EngineActivity {
  return { id, durationMinutes: days * minutesPerDay, type: 'TASK' };
}

/**
 * **FC-3: a weekend-spanning lag on the Standard calendar.** Upstream `U` is a 5-day task from Mon
 * 2026-01-05, so it finishes Fri 01-09; the FS+2 link is two WORKING days, so the downstream starts
 * Wed 2026-01-14. Today's code added two calendar days to the finish date and got Sun 01-11, rolled
 * to Mon 01-12.
 */
export const FC3_WEEKEND_LAG_FIXTURE: CrossPlanFixture = {
  id: 'fc3-weekend-lag',
  description: 'Standard: U (5d, Mon–Fri) → D (3d), FS+2 across a weekend.',
  targetPlanId: 'PLAN_FC3_DOWN',
  coverageTags: ['xplan_weekend_lag'],
  plans: [
    {
      id: 'PLAN_FC3_UP',
      name: 'FC-3 upstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [taskOn('FC3_U', 5, 1440)],
    },
    {
      id: 'PLAN_FC3_DOWN',
      name: 'FC-3 downstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [taskOn('FC3_D', 3, 1440)],
    },
  ],
  edges: [
    {
      id: 'fc3',
      type: 'FS',
      lagMinutes: 2 * 1440,
      predecessorPlanId: 'PLAN_FC3_UP',
      predecessorActivityId: 'FC3_U',
      successorPlanId: 'PLAN_FC3_DOWN',
      successorActivityId: 'FC3_D',
      coverageTag: 'xplan_weekend_lag',
    },
  ],
};

/**
 * **FC-4: a one-day lag on an eight-hour calendar.** Upstream `U` is a 2-day task from Mon
 * 2026-01-05 08:00, finishing Tue 01-06 16:00. One working day is 480 minutes, so the stored lag
 * is 480 (the migration's encoding) and the downstream starts Thu 2026-01-08. Built with the stored
 * lag as a parameter so the spec can also show the other two outcomes.
 */
export function fc4EightHourFixture(storedLagMinutes: number): CrossPlanFixture {
  return {
    id: 'fc4-eight-hour-lag',
    description: 'Eight-hour: U (2d) → D (2d), FS+1d on the successor plan calendar.',
    targetPlanId: 'PLAN_FC4_DOWN',
    coverageTags: ['xplan_eight_hour_lag'],
    plans: [
      {
        id: 'PLAN_FC4_UP',
        name: 'FC-4 upstream',
        dataDate: '2026-01-05',
        calendar: EIGHT_HOUR_CALENDAR,
        activities: [taskOn('FC4_U', 2, 480)],
      },
      {
        id: 'PLAN_FC4_DOWN',
        name: 'FC-4 downstream',
        dataDate: '2026-01-05',
        calendar: EIGHT_HOUR_CALENDAR,
        activities: [taskOn('FC4_D', 2, 480)],
      },
    ],
    edges: [
      {
        id: 'fc4',
        type: 'FS',
        lagMinutes: storedLagMinutes,
        predecessorPlanId: 'PLAN_FC4_UP',
        predecessorActivityId: 'FC4_U',
        successorPlanId: 'PLAN_FC4_DOWN',
        successorActivityId: 'FC4_D',
        coverageTag: 'xplan_eight_hour_lag',
      },
    ],
  };
}

/**
 * **FC-9: backward FS on the Standard calendar** (US-3). The downstream `S` is a 5-day task pinned
 * `FNLT` Fri 2026-01-23, so its late start is Mon 01-19; a long downstream task keeps that plan's
 * own finish from binding. The upstream holds the linked 5-day `U` and an unlinked 20-day `L`, so
 * `U`'s late finish is set by the link alone: the end of Fri 2026-01-16. Today: Mon 01-19.
 *
 * The programme solves upstream first, so the backward bound is read when the UPSTREAM is
 * recalculated again against the downstream's written dates (the spec's `solveTargetAlone` step).
 */
export const FC9_BACKWARD_FS_FIXTURE: CrossPlanFixture = {
  id: 'fc9-backward-fs',
  description: 'Standard: U (5d) → S (5d, FNLT Fri 01-23), FS+0; the upstream late finish.',
  targetPlanId: 'PLAN_FC9_DOWN',
  coverageTags: ['xplan_backward_fs'],
  plans: [
    {
      id: 'PLAN_FC9_UP',
      name: 'FC-9 upstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [taskOn('FC9_U', 5, 1440), taskOn('FC9_L', 20, 1440)],
    },
    {
      id: 'PLAN_FC9_DOWN',
      name: 'FC-9 downstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [
        { ...taskOn('FC9_S', 5, 1440), constraintType: 'FNLT', constraintDate: '2026-01-23' },
        taskOn('FC9_L2', 30, 1440),
      ],
    },
  ],
  edges: [
    {
      id: 'fc9',
      type: 'FS',
      lagMinutes: 0,
      predecessorPlanId: 'PLAN_FC9_UP',
      predecessorActivityId: 'FC9_U',
      successorPlanId: 'PLAN_FC9_DOWN',
      successorActivityId: 'FC9_S',
      coverageTag: 'xplan_backward_fs',
    },
  ],
};

/**
 * **FC-10: forward FF on the Standard calendar.** Upstream `U` is a 5-day task Mon 2026-01-05 to
 * Fri 01-09; the downstream plan's data date is Mon 2025-12-29, so nothing floors. FF lag 0: a
 * 3-day downstream finishes with `U` and starts Wed 01-07 (today Tue 01-06); a 6-day downstream
 * starts Fri 2026-01-02 (today, and a build that fixes only the day boundary, Mon 01-05).
 */
export function fc10ForwardFfFixture(downstreamDays: 3 | 6): CrossPlanFixture {
  return {
    id: `fc10-forward-ff-${downstreamDays}d`,
    description: `Standard: U (5d) → D (${downstreamDays}d), FF+0; the downstream early start.`,
    targetPlanId: 'PLAN_FC10_DOWN',
    coverageTags: ['xplan_forward_ff'],
    plans: [
      {
        id: 'PLAN_FC10_UP',
        name: 'FC-10 upstream',
        dataDate: '2026-01-05',
        calendar: STANDARD_CALENDAR,
        activities: [taskOn('FC10_U', 5, 1440)],
      },
      {
        id: 'PLAN_FC10_DOWN',
        name: 'FC-10 downstream',
        dataDate: '2025-12-29',
        calendar: STANDARD_CALENDAR,
        activities: [taskOn('FC10_D', downstreamDays, 1440)],
      },
    ],
    edges: [
      {
        id: 'fc10',
        type: 'FF',
        lagMinutes: 0,
        predecessorPlanId: 'PLAN_FC10_UP',
        predecessorActivityId: 'FC10_U',
        successorPlanId: 'PLAN_FC10_DOWN',
        successorActivityId: 'FC10_D',
        coverageTag: 'xplan_forward_ff',
      },
    ],
  };
}

/**
 * **US-2: an elapsed lag.** A `TWENTY_FOUR_HOUR` lag of two days from `U`'s Friday finish (Standard)
 * counts every minute: Sat 01-10 00:00 + 2880 is Mon 01-12 00:00. Today's code also said Monday,
 * by accident (two calendar days from the finish DATE, then a weekend roll).
 */
export const US2_ELAPSED_LAG_FIXTURE: CrossPlanFixture = {
  id: 'us2-elapsed-lag',
  description: 'Standard: U (5d, Mon–Fri) → D (3d), FS+2 on the 24-hour lag calendar.',
  targetPlanId: 'PLAN_US2_DOWN',
  coverageTags: ['xplan_elapsed_lag'],
  plans: [
    {
      id: 'PLAN_US2_UP',
      name: 'US-2 upstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [taskOn('US2_U', 5, 1440)],
    },
    {
      id: 'PLAN_US2_DOWN',
      name: 'US-2 downstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [taskOn('US2_D', 3, 1440)],
    },
  ],
  edges: [
    {
      id: 'us2',
      type: 'FS',
      lagMinutes: 2 * 1440,
      lagCalendar: 'TWENTY_FOUR_HOUR',
      predecessorPlanId: 'PLAN_US2_UP',
      predecessorActivityId: 'US2_U',
      successorPlanId: 'PLAN_US2_DOWN',
      successorActivityId: 'US2_D',
      coverageTag: 'xplan_elapsed_lag',
    },
  ],
};

/**
 * **An LOE upstream never bounds its downstream** (ADR-0035 §21), across plans as in one. The LOE
 * has computed dates, so the only thing keeping it from driving is the skip, and it is not counted
 * as a never-calculated upstream (`upstreamMissingCount === 0`).
 */
export const LOE_UPSTREAM_FIXTURE: CrossPlanFixture = {
  id: 'loe-upstream',
  description: 'Standard: an LOE upstream → D (3d), FS+0; no bound and no N32 count.',
  targetPlanId: 'PLAN_LOE_DOWN',
  coverageTags: ['xplan_loe_upstream'],
  plans: [
    {
      id: 'PLAN_LOE_UP',
      name: 'LOE upstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [{ ...taskOn('LOE_U', 10, 1440), type: 'LEVEL_OF_EFFORT' }],
    },
    {
      id: 'PLAN_LOE_DOWN',
      name: 'LOE downstream',
      dataDate: '2026-01-05',
      calendar: STANDARD_CALENDAR,
      activities: [taskOn('LOE_D', 3, 1440)],
    },
  ],
  edges: [
    {
      id: 'loe',
      type: 'FS',
      lagMinutes: 0,
      predecessorPlanId: 'PLAN_LOE_UP',
      predecessorActivityId: 'LOE_U',
      successorPlanId: 'PLAN_LOE_DOWN',
      successorActivityId: 'LOE_D',
      coverageTag: 'xplan_loe_upstream',
    },
  ],
};

export const CROSS_PLAN_FIXTURES: CrossPlanFixture[] = [
  FS_INTERFACE_FIXTURE,
  DIAMOND_FIXTURE,
  FC3_WEEKEND_LAG_FIXTURE,
  fc4EightHourFixture(480),
  FC9_BACKWARD_FS_FIXTURE,
  fc10ForwardFfFixture(3),
  fc10ForwardFfFixture(6),
  US2_ELAPSED_LAG_FIXTURE,
  LOE_UPSTREAM_FIXTURE,
];

// ---------------------------------------------------------------------------------------------------
// Tier-1 structural coverage gate (ADR-0034 §1) — the cross-plan analogue of `checkCoverage`.
// ---------------------------------------------------------------------------------------------------

/**
 * Every cross-plan capability the F7 conformance slice claims to exercise. The tier-1 structural gate
 * asserts each appears in {@link crossPlanCoverageIndex} (tag → the fixture objects / negative cases that
 * cover it). A missing tag means the slice stopped covering a cross-plan capability the framework
 * promises to benchmark — a reviewed regression (ADR-0034), exactly like the P6 `REQUIRED_COVERAGE_TAGS`.
 * These are SEPARATE from the P6 fixture's tags (its `interproject` tag covers the M1 activity-level
 * external columns, ADR-0043); the live cross-plan axis is a distinct, self-contained fixture.
 */
export const REQUIRED_CROSS_PLAN_TAGS: readonly string[] = [
  // derivation (§30.5)
  'xplan_fs_interface', // an FS Procurement → Construction inter-project interface
  'xplan_diamond_fanin', // multi-upstream fold: the derived bound is the latest of the fan-in
  'xplan_later_of_two', // derived bound composed later-of with the manual M1 column
  'xplan_ignore_external', // the plan-level ignore-external toggle drops the derived bound (§30.4)
  // orchestration (§30.8) + staleness (§30.7)
  'xplan_programme_order', // topological upstream-first plan order (deterministic)
  'xplan_staleness_differential', // downstream-alone (stale upstream) ≠ programme recalc (fresh)
  // negatives (N30–N33)
  'xplan_missing_upstream', // N32: a never-computed upstream contributes no bound, counted
  'xplan_plan_cycle_reject', // N30: a cross-plan edge that would close a plan-level cycle is rejected
  'xplan_same_plan_reject', // N31: a same-plan cross-plan edge is rejected
  'xplan_duplicate_reject', // N33: a duplicate (pred, succ, type) cross-plan edge is rejected
  // the day boundary and the lag (#385 M2-T6): one link, one rule, whichever plan holds the ends
  'xplan_weekend_lag', // FC-3: a lag counts working days across a weekend
  'xplan_eight_hour_lag', // FC-4: a lag day is the lag calendar's day, not 1440 minutes
  'xplan_backward_fs', // FC-9: the upstream finishes before the downstream's late start
  'xplan_forward_ff', // FC-10: an FF duration walks the successor's working days
  'xplan_elapsed_lag', // US-2: a TWENTY_FOUR_HOUR lag counts elapsed time
  'xplan_loe_upstream', // an LOE upstream contributes no bound and no N32 count
];

/**
 * Tags covered by the negative cases (which are not fixture objects). N32 is engine-free here (the
 * derivation counts it); N30/N31/N33 are boundary-owned (the F3 service / partial-unique index) and
 * referenced by the conformance spec, so they are claimed structurally here and asserted at the boundary.
 */
const NEGATIVE_COVERAGE: Record<string, string[]> = {
  xplan_missing_upstream: ['N32'],
  xplan_plan_cycle_reject: ['N30'],
  xplan_same_plan_reject: ['N31'],
  xplan_duplicate_reject: ['N33'],
  xplan_staleness_differential: ['staleness-differential'],
};

/**
 * Assemble the coverage index (tag → covering object ids) from the fixtures' declared tags, their
 * edges' tags, and the negative-case coverage. The tier-1 gate ({@link checkCrossPlanCoverage}) checks
 * every {@link REQUIRED_CROSS_PLAN_TAGS} entry is a key here.
 */
export function crossPlanCoverageIndex(): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  const add = (tag: string, id: string): void => {
    (index[tag] ??= []).push(id);
  };
  for (const fixture of CROSS_PLAN_FIXTURES) {
    for (const tag of fixture.coverageTags) add(tag, fixture.id);
    for (const edge of fixture.edges)
      if (edge.coverageTag) add(edge.coverageTag, `${fixture.id}:${edge.id}`);
  }
  for (const [tag, ids] of Object.entries(NEGATIVE_COVERAGE)) for (const id of ids) add(tag, id);
  return index;
}

export interface CrossPlanCoverageResult {
  ok: boolean;
  /** Required cross-plan tags with no entry in {@link crossPlanCoverageIndex}. */
  missing: string[];
}

/** The tier-1 structural completeness check — every required cross-plan tag must be claimed. */
export function checkCrossPlanCoverage(): CrossPlanCoverageResult {
  const covered = crossPlanCoverageIndex();
  const missing = REQUIRED_CROSS_PLAN_TAGS.filter((tag) => !(tag in covered));
  return { ok: missing.length === 0, missing };
}
