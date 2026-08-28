import type { HealthMetricResult } from '@repo/types';

import { computeSchedule, type ComputeOptions } from './engine/compute';
import type { EngineActivity, EngineEdge } from './engine/types';
import { HEALTH_METRICS } from './health/thresholds';

/**
 * **DCMA metric 12 — the Critical Path Test, computed for real** (health M6, ADR-0116 D7).
 *
 * The test is DCMA's own: inject an intentionally huge delay into an activity on the critical path
 * and confirm the project finish moves by the same amount. A network whose finish does NOT move in
 * step is masking its logic — a dangling chain, or a hard constraint pinning downstream work where
 * logic should drive it — and a plan like that produces dates that look computed and are not.
 *
 * **This module imports the CPM engine, and the health report's parity sentence must never be
 * copied onto it** (ADR-0116 D7; the spec calls this the single most likely wrong claim in the
 * epic). Its own, weaker argument: it computes **read-only and persists nothing** — both passes run
 * on an in-memory copy of the input graph, no new input kind reaches `computeSchedule`, and the
 * non-mutation e2e proves the claim by reading every engine-owned column back after the call.
 * It lives OUTSIDE `health/` so `health-engine-free.structural.spec.ts` keeps meaning what it says.
 */

/**
 * How much is injected: **600 working days**, the DCMA 14-Point Assessment's own convention for
 * this test — deliberately enormous so the movement (or its absence) is unmistakable against any
 * real plan's noise. Converted to working minutes on the SUBJECT'S scheduling calendar (ADR-0068:
 * a day is a per-calendar quantity), so "600 days" means 600 of the days that activity works.
 */
export const CRITICAL_PATH_TEST_INJECTED_DAYS = 600;

/**
 * The pass tolerance, in working days. An intact network moves the finish by exactly the injected
 * amount when every calendar involved is the same; across calendar boundaries each downstream hop
 * re-snaps its start to its own working window, which can absorb up to a shift each — noise
 * bounded in single days against a 600-day injection. Anything a tolerance this size forgives is
 * window rounding; anything it fails is structure. Travels in `detail` so a reader can reproduce
 * the verdict by hand (G3's rule: the number is never restated client-side).
 */
export const CRITICAL_PATH_TEST_TOLERANCE_DAYS = 5;

/**
 * Which activity is perturbed, deterministically: the **incomplete, critical, work-carrying**
 * activity with the earliest early start (ties broken by id). Earliest, because the front of the
 * critical path exercises the longest downstream chain — the whole point is to watch the injection
 * propagate. Work-carrying excludes summaries (no logic by invariant, ADR-0038), LOE/hammocks
 * (span-derived — their duration is an output), and milestones (zero duration by definition, so
 * "extend its duration" has no meaning on one).
 */
const PERTURBABLE_TYPES = new Set(['TASK', 'RESOURCE_DEPENDENT']);

const METRIC_12 = HEALTH_METRICS.find((m) => m.id === 'CRITICAL_PATH_TEST');
if (!METRIC_12) throw new Error('HEALTH_METRICS lost its CRITICAL_PATH_TEST row');

export interface CriticalPathTestInput {
  activities: readonly EngineActivity[];
  edges: readonly EngineEdge[];
  options: ComputeOptions;
  /** Working minutes per day for the activity's SCHEDULING calendar (ADR-0068), by activity id. */
  dayFactorMinutesOf: (activityId: string) => number;
  /** Display metadata for the offender/detail fields, by activity id. */
  labelOf: (activityId: string) => { code: string | null; name: string };
}

function base(): Omit<
  HealthMetricResult,
  | 'verdict'
  | 'reason'
  | 'measured'
  | 'detail'
  | 'offenderCount'
  | 'offendersTruncated'
  | 'offenders'
> {
  return {
    id: 'CRITICAL_PATH_TEST',
    ordinal: METRIC_12!.ordinal,
    name: METRIC_12!.name,
    // Metric 12 carries no threshold object by contract (a threshold on screen reads as a real
    // threshold); the injection and tolerance ride `detail` instead.
    threshold: null,
  };
}

function notAssessable(reason: HealthMetricResult['reason']): HealthMetricResult {
  return {
    ...base(),
    verdict: 'NOT_ASSESSABLE',
    reason,
    measured: null,
    detail: null,
    offenderCount: 0,
    offendersTruncated: false,
    offenders: [],
  };
}

/**
 * Run the what-if: a control pass, a perturbed pass, and the verdict from how far the project
 * finish moved. Pure — both passes see only the arrays given; the caller owns loading and never
 * hands this function a write path.
 */
export function runCriticalPathTest(input: CriticalPathTestInput): HealthMetricResult {
  const { activities, edges, options, dayFactorMinutesOf, labelOf } = input;

  const nonSummary = activities.filter((a) => a.type !== 'WBS_SUMMARY');
  if (nonSummary.length === 0) return notAssessable('EMPTY_PLAN');

  const control = computeSchedule(activities, edges, options);

  const complete = new Set(activities.filter((a) => a.actualFinish != null).map((a) => a.id));
  if (nonSummary.every((a) => complete.has(a.id))) {
    return notAssessable('NO_INCOMPLETE_ACTIVITIES');
  }

  const activityById = new Map(activities.map((a) => [a.id, a]));
  const eligible = control.results
    .filter((r) => {
      const a = activityById.get(r.activityId);
      return (
        a !== undefined && r.isCritical && !complete.has(a.id) && PERTURBABLE_TYPES.has(a.type)
      );
    })
    // The front of the critical path, deterministically: earliest early start, ties by id.
    .sort(
      (x, y) => x.earlyStartOffset - y.earlyStartOffset || x.activityId.localeCompare(y.activityId),
    );
  const subjectResult = eligible[0];
  if (subjectResult === undefined) return notAssessable('NO_CRITICAL_PATH');

  const subject = activityById.get(subjectResult.activityId)!;
  const dayFactor = dayFactorMinutesOf(subject.id);
  const injectedMinutes = CRITICAL_PATH_TEST_INJECTED_DAYS * dayFactor;

  // Perturb a COPY: the subject's duration grows by the injection, and its resolved remaining
  // grows with it when present (an in-progress subject schedules on remaining, not duration).
  const perturbedActivities = activities.map((a) =>
    a.id === subject.id
      ? {
          ...a,
          durationMinutes: a.durationMinutes + injectedMinutes,
          ...(a.remainingMinutes !== undefined
            ? { remainingMinutes: a.remainingMinutes + injectedMinutes }
            : {}),
        }
      : a,
  );
  const perturbed = computeSchedule(perturbedActivities, edges, options);

  // **What must move is the COMPLETION CARRIER — the control run's latest-finishing activity —
  // not the max-over-all project finish.** The summary's `projectFinish` is max early finish, and
  // the injected subject's OWN finish grows by 600 days unconditionally, so measuring the max
  // would pass a network whose downstream logic absorbed everything: the first fixture written
  // against this module proved exactly that (a MANDATORY pin masking the chain read as PASS).
  // DCMA's question is "does the project completion move", and the completion is the thing that
  // finished last BEFORE the injection. When the subject IS the carrier — a single chain ending
  // at the subject — its own movement legitimately is the completion moving.
  const summaryIds = new Set(activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.id));
  const carrier = control.results
    .filter((r) => !summaryIds.has(r.activityId))
    .sort(
      (x, y) =>
        y.earlyFinishOffset - x.earlyFinishOffset || x.activityId.localeCompare(y.activityId),
    )[0];
  if (carrier === undefined) return notAssessable('EMPTY_PLAN');
  const carrierPerturbed = perturbed.results.find((r) => r.activityId === carrier.activityId);
  if (carrierPerturbed === undefined) return notAssessable('EMPTY_PLAN');

  // The movement, measured in the INJECTION'S OWN unit: working time between the carrier's two
  // finish dates on the SUBJECT'S scheduling calendar, over that calendar's day factor. Measuring
  // on the plan frame instead would under-read exactly when the subject works a wider week than
  // the plan (a 24/7 subject in a 5-day plan propagates 600 elapsed-calendar days ≈ 428
  // plan-frame days), and a false FAIL from frame mismatch is the one wrong answer this test must
  // never give.
  const subjectCalendar = subject.calendar ?? options.calendar;
  const deltaMinutes = subjectCalendar.workingTimeBetween(
    carrier.earlyFinish,
    carrierPerturbed.earlyFinish,
  );
  const deltaDays = Math.round((deltaMinutes / dayFactor) * 10) / 10;

  const moved = deltaDays >= CRITICAL_PATH_TEST_INJECTED_DAYS - CRITICAL_PATH_TEST_TOLERANCE_DAYS;
  const label = labelOf(subject.id);
  const carrierLabel = labelOf(carrier.activityId);
  const detail = {
    injectedDays: CRITICAL_PATH_TEST_INJECTED_DAYS,
    deltaDays,
    toleranceDays: CRITICAL_PATH_TEST_TOLERANCE_DAYS,
    perturbedActivityId: subject.id,
    perturbedActivityCode: label.code,
    perturbedActivityName: label.name,
    completionActivityId: carrier.activityId,
    completionActivityName: carrierLabel.name,
    controlCompletionFinish: carrier.earlyFinish,
    perturbedCompletionFinish: carrierPerturbed.earlyFinish,
  };
  const measured = {
    count: null,
    denominator: null,
    percent: null,
    ratio: Math.round((deltaDays / CRITICAL_PATH_TEST_INJECTED_DAYS) * 10_000) / 10_000,
  };

  if (moved) {
    return {
      ...base(),
      verdict: 'PASS',
      reason: null,
      measured,
      detail,
      offenderCount: 0,
      offendersTruncated: false,
      offenders: [],
    };
  }
  return {
    ...base(),
    verdict: 'FAIL',
    reason: null,
    measured,
    detail,
    offenderCount: 1,
    offendersTruncated: false,
    offenders: [
      {
        kind: 'ACTIVITY',
        id: subject.id,
        code: label.code,
        name: label.name,
        note: `finish moved ${deltaDays} of ${CRITICAL_PATH_TEST_INJECTED_DAYS} d injected`,
        activityId: subject.id,
      },
    ],
  };
}
