import type { ActivityType, ConstraintType, DependencyType } from '@repo/types';

import { schedulingCalendarId } from '../../src/modules/activities/day-factor';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  computeSchedule,
  fullDayWeek,
  type ComputeOptions,
  type EngineOutput,
  type WorkingTimeCalendar,
} from '../../src/modules/schedule/engine';
import type {
  EngineActivity,
  EngineEdge,
  EngineResult,
} from '../../src/modules/schedule/engine/types';
import type {
  HealthActivityInput,
  HealthDependencyInput,
} from '../../src/modules/schedule/health/compute-health';

/**
 * **The differential oracle for the redundant-link advisory** (`docs/specs/redundant-link-advisory/`
 * §4.7, M0-T2).
 *
 * A redundant link is "one whose removal cannot change any date or float, whatever the durations".
 * That sentence is checkable against the real engine, so it is checked rather than argued: this file
 * builds **one** plan description into two inputs — the engine's graph and the rule's view — through
 * the same calendar resolution, runs the engine with a candidate set removed, and reports every
 * per-activity output that moved.
 *
 * **Why one description, two builders.** A harness that built the engine's input and the rule's input
 * by separate routes could agree with itself (ADR-0066's lesson, repeated in `spec-to-engine.ts`): the
 * rule would be proven against a plan the engine never saw. Here the lag-calendar identity the rule
 * keys on and the calendar object the engine walks are derived from the same lookup, so a divergence is
 * the rule's, not the harness's.
 *
 * **It has no rule of its own.** {@link oracleDivergences} takes any candidate link set. The rule under
 * test arrives as an argument; M0 drives it with deliberately unsound predicates to show the oracle can
 * see a divergence at all (a gate that has never been seen to fail is not a gate — ADR-0110 D5).
 */

/** Where an edge's lag is measured (the `lag_calendar` column's vocabulary). */
export type OracleLagCalendar =
  'PROJECT_DEFAULT' | 'TWENTY_FOUR_HOUR' | 'PREDECESSOR' | 'SUCCESSOR';

export interface OracleActivity {
  id: string;
  /** Working minutes. */
  durationMinutes: number;
  type?: ActivityType;
  /** A key into {@link OraclePlan.calendars}; absent or the plan's own key inherits the plan calendar. */
  calendar?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  remainingMinutes?: number;
  constraintType?: ConstraintType | null;
  constraintDate?: string | null;
  secondaryConstraintType?: ConstraintType | null;
  secondaryConstraintDate?: string | null;
  externalEarlyStart?: string | null;
  visualStart?: string | null;
}

export interface OracleLink {
  id: string;
  from: string;
  to: string;
  type: DependencyType;
  lagMinutes: number;
  lagCalendar?: OracleLagCalendar;
}

export interface OraclePlan {
  dataDate: string;
  /** Working-time ports by key; {@link planCalendar} names the plan's own. */
  calendars: Readonly<Record<string, WorkingTimeCalendar>>;
  planCalendar: string;
  progressMode?: ComputeOptions['progressMode'];
  activities: readonly OracleActivity[];
  links: readonly OracleLink[];
}

/**
 * The lag-calendar identity the rule keys on: `24H`, or the id of a calendar. It is the same
 * identity the engine walks (`toEngineEdge`, `schedule.service.ts`): two links share a key exactly when
 * the engine would measure their lags on the same calendar object.
 */
export type LagCalendarKey = string;

/** What the rule will read per activity: the health module's input plus the one new fact. */
export type RuleActivity = HealthActivityInput & { schedulingCalendarId: string };
/** What the rule will read per link: the health module's input plus the lag-calendar identity. */
export type RuleDependency = HealthDependencyInput & { lagCalendarKey: LagCalendarKey };

export interface RuleInput {
  activities: RuleActivity[];
  dependencies: RuleDependency[];
}

export const TWENTY_FOUR_HOUR_KEY: LagCalendarKey = '24H';

function calendarOf(plan: OraclePlan, key: string | null | undefined): WorkingTimeCalendar {
  const resolved = plan.calendars[key ?? plan.planCalendar];
  if (resolved === undefined) throw new Error(`Unknown calendar "${String(key)}"`);
  return resolved;
}

/** The engine's own rule: an activity on the plan calendar passes `undefined` (the inherit sentinel). */
function portFor(
  plan: OraclePlan,
  key: string | null | undefined,
): WorkingTimeCalendar | undefined {
  return key == null || key === plan.planCalendar ? undefined : calendarOf(plan, key);
}

function schedulingKey(plan: OraclePlan, a: OracleActivity): string {
  // No driving resource in this harness, so the "driver → own → plan" rule reduces to own → plan; the
  // real resolver is called rather than restated so the two cannot drift (#86).
  const id = schedulingCalendarId({
    type: a.type ?? 'TASK',
    drivingCalendarId: null,
    activityCalendarId: a.calendar ?? null,
    planCalendarId: plan.planCalendar,
  });
  if (id === null) throw new Error('A plan always has a calendar');
  return id;
}

/** The engine's half: activities and edges as `schedule.service` would hand them over. */
export function buildEngineGraph(
  plan: OraclePlan,
  removedLinkIds: ReadonlySet<string> = new Set(),
): { activities: EngineActivity[]; edges: EngineEdge[]; options: ComputeOptions } {
  const byId = new Map(plan.activities.map((a) => [a.id, a] as const));
  const activities: EngineActivity[] = plan.activities.map((a) => {
    const calendar = portFor(plan, a.calendar);
    return {
      id: a.id,
      durationMinutes: a.durationMinutes,
      type: a.type ?? 'TASK',
      ...(calendar ? { calendar } : {}),
      constraintType: a.constraintType ?? null,
      constraintDate: a.constraintDate ?? null,
      secondaryConstraintType: a.secondaryConstraintType ?? null,
      secondaryConstraintDate: a.secondaryConstraintDate ?? null,
      externalEarlyStart: a.externalEarlyStart ?? null,
      visualStart: a.visualStart ?? null,
      actualStart: a.actualStart ?? null,
      actualFinish: a.actualFinish ?? null,
      ...(a.remainingMinutes === undefined ? {} : { remainingMinutes: a.remainingMinutes }),
    };
  });
  const edges: EngineEdge[] = plan.links
    .filter((l) => !removedLinkIds.has(l.id))
    .map((l) => {
      const pred = byId.get(l.from);
      const succ = byId.get(l.to);
      if (pred === undefined || succ === undefined) throw new Error(`Link ${l.id} has no endpoint`);
      const lagCalendar =
        l.lagCalendar === 'TWENTY_FOUR_HOUR'
          ? allMinutesWorkCalendar
          : l.lagCalendar === 'PREDECESSOR'
            ? portFor(plan, pred.calendar)
            : l.lagCalendar === 'SUCCESSOR'
              ? portFor(plan, succ.calendar)
              : undefined;
      return {
        id: l.id,
        predecessorId: l.from,
        successorId: l.to,
        type: l.type,
        lagMinutes: l.lagMinutes,
        ...(lagCalendar ? { lagCalendar } : {}),
      };
    });
  return {
    activities,
    edges,
    options: {
      dataDate: plan.dataDate,
      calendar: calendarOf(plan, plan.planCalendar),
      ...(plan.progressMode === undefined ? {} : { progressMode: plan.progressMode }),
    },
  };
}

/** The rule's half: stored-row shapes, with the lag-calendar identity resolved the engine's way. */
export function buildRuleInput(plan: OraclePlan): RuleInput {
  const byId = new Map(plan.activities.map((a) => [a.id, a] as const));
  const activities: RuleActivity[] = plan.activities.map((a) => {
    const status =
      a.actualFinish != null ? 'COMPLETE' : a.actualStart != null ? 'IN_PROGRESS' : 'NOT_STARTED';
    return {
      id: a.id,
      code: a.id,
      name: a.id,
      type: a.type ?? 'TASK',
      status,
      constraintType: a.constraintType ?? null,
      constraintDate: a.constraintDate ?? null,
      secondaryConstraintType: a.secondaryConstraintType ?? null,
      secondaryConstraintDate: a.secondaryConstraintDate ?? null,
      totalFloat: null,
      durationMinutes: a.durationMinutes,
      remainingDurationMinutes: a.remainingMinutes ?? null,
      percentComplete: 0,
      actualStart: a.actualStart ?? null,
      actualFinish: a.actualFinish ?? null,
      earlyStart: null,
      earlyFinish: null,
      dayFactorMinutes: 480,
      hasAssignment: false,
      assignmentCount: 0,
      schedulingCalendarId: schedulingKey(plan, a),
    };
  });
  const dependencies: RuleDependency[] = plan.links.map((l) => {
    const pred = byId.get(l.from);
    const succ = byId.get(l.to);
    if (pred === undefined || succ === undefined) throw new Error(`Link ${l.id} has no endpoint`);
    const lagCalendarKey =
      l.lagCalendar === 'TWENTY_FOUR_HOUR'
        ? TWENTY_FOUR_HOUR_KEY
        : l.lagCalendar === 'PREDECESSOR'
          ? schedulingKey(plan, pred)
          : l.lagCalendar === 'SUCCESSOR'
            ? schedulingKey(plan, succ)
            : plan.planCalendar;
    return {
      id: l.id,
      predecessorId: l.from,
      successorId: l.to,
      type: l.type,
      lagMinutes: l.lagMinutes,
      lagCalendarKey,
    };
  });
  return { activities, dependencies };
}

/**
 * Every engine-owned per-activity output the recalculation persists, plus the visual pass and the
 * remaining float. **`isDriving` is excluded by design** (spec E12): a link that ties with a longer
 * chain reads Driving and is still removable, so a change there is not a divergence.
 */
export const COMPARED_RESULT_FIELDS = [
  'earlyStart',
  'earlyFinish',
  'lateStart',
  'lateFinish',
  'earlyStartOffset',
  'earlyFinishOffset',
  'lateStartOffset',
  'lateFinishOffset',
  'placedStartOffset',
  'placedFinishOffset',
  'passOnStartInstant',
  'passOnFinishInstant',
  'totalFloat',
  'freeFloat',
  'isCritical',
  'isNearCritical',
  'constraintViolated',
  'externalDriven',
  'loeNoSpan',
  'visualEffectiveStart',
  'visualEffectiveFinish',
  'visualConflict',
  'visualDriftMinutes',
  'visualConflictReason',
  'remainingFloatMinutes',
] as const satisfies readonly (keyof EngineResult)[];

export const COMPARED_SUMMARY_FIELDS = [
  'projectFinish',
  'projectFinishOffset',
  'criticalCount',
  'nearCriticalCount',
  'constraintViolationCount',
] as const;

export interface Divergence {
  /** `alone:<linkId>` or `all`. */
  scope: string;
  /** An activity id, or `summary`. */
  subject: string;
  field: string;
  before: unknown;
  after: unknown;
}

function compare(
  scope: string,
  before: EngineOutput,
  after: EngineOutput,
  into: Divergence[],
): void {
  const afterById = new Map(after.results.map((r) => [r.activityId, r] as const));
  for (const b of before.results) {
    const a = afterById.get(b.activityId);
    if (a === undefined) {
      into.push({ scope, subject: b.activityId, field: 'present', before: true, after: false });
      continue;
    }
    for (const field of COMPARED_RESULT_FIELDS) {
      // `-0` and `0` are the same float; `Object.is` would call them different.
      const x = b[field] ?? null;
      const y = a[field] ?? null;
      if (x !== y && !(x === 0 && y === 0)) {
        into.push({ scope, subject: b.activityId, field, before: x, after: y });
      }
    }
  }
  for (const field of COMPARED_SUMMARY_FIELDS) {
    const x = before.summary[field] ?? null;
    const y = after.summary[field] ?? null;
    if (x !== y) into.push({ scope, subject: 'summary', field, before: x, after: y });
  }
}

/**
 * Remove each candidate link alone, and then all of them together, recompute, and report every
 * compared output that moved. An empty result is the soundness claim holding on this plan.
 *
 * Both halves matter (spec §2.2, "simultaneous removal is safe"): a witness for one flagged link can
 * run through another flagged link, so removing them one at a time proves less than removing them all.
 */
export function oracleDivergences(
  plan: OraclePlan,
  candidateLinkIds: readonly string[],
): Divergence[] {
  const run = (removed: ReadonlySet<string>): EngineOutput => {
    const { activities, edges, options } = buildEngineGraph(plan, removed);
    return computeSchedule(activities, edges, options);
  };
  const baseline = run(new Set());
  const found: Divergence[] = [];
  for (const id of candidateLinkIds) compare(`alone:${id}`, baseline, run(new Set([id])), found);
  if (candidateLinkIds.length > 1) {
    compare('all', baseline, run(new Set(candidateLinkIds)), found);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------------------------

const ALL_DAY = [{ startMinute: 0, endMinute: 1440 }] as const;

/** Mon–Fri, full days: the plan calendar of most cases. Weekdays are indexed Monday = 0. */
export const MON_FRI: WorkingTimeCalendar = buildWorkingTimeCalendar(
  fullDayWeek([0, 1, 2, 3, 4]),
  [],
);

/** Mon–Sat, full days. */
export const MON_SAT: WorkingTimeCalendar = buildWorkingTimeCalendar(
  fullDayWeek([0, 1, 2, 3, 4, 5]),
  [],
);

/** Mon–Fri 08:00–17:00 with Saturday 08:00–12:00: a half-day Saturday. */
export const HALF_SAT: WorkingTimeCalendar = buildWorkingTimeCalendar(
  [
    ...Array.from({ length: 5 }, () => [{ startMinute: 480, endMinute: 1020 }]),
    [{ startMinute: 480, endMinute: 720 }],
    [],
  ],
  [],
);

/** Mon–Fri 08:00–17:00. */
export const OFFICE: WorkingTimeCalendar = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, (_, d) => (d < 5 ? [{ startMinute: 480, endMinute: 1020 }] : [])),
  [],
);

/** Four ten-hour days, Tuesday to Friday. */
export const FOUR_TENS: WorkingTimeCalendar = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, (_, d) =>
    d >= 1 && d <= 4 ? [{ startMinute: 420, endMinute: 1020 }] : [],
  ),
  [],
);

/** Seven days a week, round the clock. */
export const ROUND_THE_CLOCK: WorkingTimeCalendar = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, () => [...ALL_DAY]),
  [],
);

export const CALENDAR_SHAPES: Readonly<Record<string, WorkingTimeCalendar>> = {
  MON_FRI,
  MON_SAT,
  HALF_SAT,
  OFFICE,
  FOUR_TENS,
  ROUND_THE_CLOCK,
};

// ---------------------------------------------------------------------------------------------
// A seeded generator (no property-testing dependency: `apps/api` has none, and none is added)
// ---------------------------------------------------------------------------------------------

/** Mulberry32: a small, well-known, deterministic 32-bit generator. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LINK_TYPES: readonly DependencyType[] = ['FS', 'FS', 'FS', 'SS', 'FF', 'SF'];
const LAG_SOURCES: readonly OracleLagCalendar[] = [
  'PROJECT_DEFAULT',
  'PROJECT_DEFAULT',
  'TWENTY_FOUR_HOUR',
  'PREDECESSOR',
  'SUCCESSOR',
];
const CALENDAR_KEYS = Object.keys(CALENDAR_SHAPES);
const PIN_TYPES: readonly ConstraintType[] = [
  'SNET',
  'SNLT',
  'FNET',
  'FNLT',
  'MSO',
  'MFO',
  'MANDATORY_START',
  'MANDATORY_FINISH',
];

/** Add whole days to a `YYYY-MM-DD`, in UTC. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface GeneratorOptions {
  /** Plans to generate; each is returned as `draws` plans differing only in durations. */
  seed: number;
  /** Activity count range, inclusive. */
  minActivities?: number;
  maxActivities?: number;
}

/**
 * One random plan: an acyclic network over a random plan calendar and random per-activity calendars,
 * all four link types, the four lag-calendar sources, leads, pins, progress and levels of effort.
 * Acyclic by construction (links run from a lower index to a higher one).
 */
export function generatePlan(seed: number, options: Partial<GeneratorOptions> = {}): OraclePlan {
  const rand = seededRandom(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  const dataDate = '2026-01-05';
  const n = int(options.minActivities ?? 3, options.maxActivities ?? 9);
  const planCalendar = pick(CALENDAR_KEYS);
  const activities: OracleActivity[] = Array.from({ length: n }, (_, i) => {
    const a: OracleActivity = {
      id: `T${String(i)}`,
      durationMinutes: pick([0, 60, 240, 480, 1440, 2880, 4320]),
      calendar: rand() < 0.35 ? pick(CALENDAR_KEYS) : null,
    };
    const roll = rand();
    if (roll < 0.06) a.type = 'LEVEL_OF_EFFORT';
    else if (roll < 0.1) a.type = 'START_MILESTONE';
    if (a.type === 'START_MILESTONE' || a.type === 'LEVEL_OF_EFFORT') a.durationMinutes = 0;
    if (rand() < 0.15) {
      a.constraintType = pick(PIN_TYPES);
      a.constraintDate = addDays(dataDate, int(0, 20));
      if (rand() < 0.3) {
        a.secondaryConstraintType = pick(['SNLT', 'FNLT'] as const);
        a.secondaryConstraintDate = addDays(dataDate, int(8, 40));
      }
    }
    if (rand() < 0.12 && a.type !== 'LEVEL_OF_EFFORT') {
      const startedAgo = int(0, 6);
      a.actualStart = addDays(dataDate, -startedAgo);
      if (rand() < 0.4 && a.durationMinutes > 0)
        a.actualFinish = addDays(dataDate, -int(0, startedAgo));
      else if (a.durationMinutes > 0) a.remainingMinutes = Math.floor(a.durationMinutes / 2);
    }
    return a;
  });
  const links: OracleLink[] = [];
  const target = int(n - 1, n * 2);
  for (let k = 0; k < target; k += 1) {
    const to = int(1, n - 1);
    const from = int(0, to - 1);
    links.push({
      id: `L${String(k)}`,
      from: `T${String(from)}`,
      to: `T${String(to)}`,
      type: pick(LINK_TYPES),
      lagMinutes: rand() < 0.5 ? 0 : pick([-480, -60, 60, 480, 960, 1440, 4320]),
      lagCalendar: pick(LAG_SOURCES),
    });
  }
  // Same pair and same type is illegal (unique on pair + type), so the generator never makes one.
  const seen = new Set<string>();
  const unique = links.filter((l) => {
    const key = `${l.from}>${l.to}:${l.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    dataDate,
    calendars: CALENDAR_SHAPES,
    planCalendar,
    progressMode: pick(['RETAINED_LOGIC', 'PROGRESS_OVERRIDE', 'ACTUAL_DATES'] as const),
    activities,
    links: unique,
  };
}

/** The same network and calendars with every duration re-drawn (the oracle's "duration draws"). */
export function redrawDurations(plan: OraclePlan, seed: number): OraclePlan {
  const rand = seededRandom(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  return {
    ...plan,
    activities: plan.activities.map((a) =>
      a.type === 'LEVEL_OF_EFFORT' || a.type === 'START_MILESTONE'
        ? a
        : {
            ...a,
            durationMinutes: pick([0, 60, 240, 480, 1440, 2880, 4320]),
            ...(a.remainingMinutes === undefined ? {} : { remainingMinutes: 0 }),
          },
    ),
  };
}
