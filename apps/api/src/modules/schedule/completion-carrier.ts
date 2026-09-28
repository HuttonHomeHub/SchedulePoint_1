import type { ActivityType } from '@repo/types';

import type { EngineActivity, EngineResult } from './engine/types';
import type { WorkingTimeCalendar } from './engine/working-time-calendar';

/**
 * **The completion carrier, and how far it moved** — extracted from `critical-path-test.ts` so that
 * more than one caller can ask the same question and get the same answer.
 *
 * ADR-0116 M6 established these rules and paid for one of them with a defect; they lived inline
 * inside `runCriticalPathTest`, which meant the *only* ways for a second caller to obey the
 * instruction "reuse that rule, do not restate it" were to extract them or to disobey it. This file
 * is the extraction. It is behaviour-preserving: `critical-path-test.spec.ts` was green before the
 * move and is the before/after oracle (the ADR-0078 barrel-preserving argument — a refactor changes
 * no assertion).
 *
 * **Both functions below read the levelled overlay when it is there** (`docs/TECH_DEBT.md` #248):
 * they take whatever {@link EngineResult} they are handed, and a result that has been through
 * {@link levelIfEnabled} carries `leveledFinish(Offset)` for its participants. Neither function runs
 * the levelling pass itself — that is the caller's job, once, via `levelIfEnabled` — these only decide
 * which of the two finishes on an already-merged row is the one a planner would see.
 */

/**
 * Which activity types can meaningfully carry an injected duration.
 *
 * Excludes summaries (no logic by invariant, ADR-0038), LOE/hammocks (span-derived — their duration
 * is an **output**) and milestones (zero duration by definition, so "extend its duration" has no
 * meaning on one). A change applied to any of these is **silently inert**: the schedule does not
 * move and nothing reports that the perturbation did nothing.
 */
export const PERTURBABLE_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'TASK',
  'RESOURCE_DEPENDENT',
]);

/** True when a duration change applied to this type can actually move the schedule. */
export function isPerturbableType(type: ActivityType): boolean {
  return PERTURBABLE_TYPES.has(type);
}

/**
 * **The finish a caller that has already run {@link levelIfEnabled} should read** (`docs/TECH_DEBT.md`
 * #248) — the levelled overlay when this row is a levelling participant (`leveledFinishOffset` is
 * non-null only then), the pure network finish otherwise. On a `computeSchedule` result with no
 * overlay merged on — `leveledFinishOffset` is always `undefined` there — this is exactly
 * `earlyFinishOffset`, so a caller that never levels sees no change at all.
 */
function effectiveFinishOffset(r: EngineResult): number {
  return r.leveledFinishOffset ?? r.earlyFinishOffset;
}

/**
 * The date twin of {@link effectiveFinishOffset}, for the working-time delta AND for reporting.
 * Exported (`docs/TECH_DEBT.md` #248): a caller's `detail` payload must show the SAME date this
 * module measured the movement from, or the "everything injected rides `detail` so the verdict is
 * reproducible by hand" promise (the route's own `@ApiOperation`) breaks silently on a levelled
 * plan — a reader recomputing by hand from the printed network finish would get the movement the
 * pre-#248 route reported, not the one the response's own verdict is based on.
 */
export function effectiveFinish(r: EngineResult): string {
  return r.leveledFinish ?? r.earlyFinish;
}

/**
 * The **completion carrier**: the control run's latest-finishing NON-SUMMARY activity, on the
 * **displayed** schedule — the levelled overlay where the plan levels, the pure network finish
 * where it does not ({@link effectiveFinishOffset}).
 *
 * **Not the max-over-all project finish**, and that distinction is the whole reason this function
 * exists. `projectFinish` is the max early finish, and a perturbed activity's own finish grows
 * unconditionally — so measuring the max passes a network whose downstream logic absorbed the delay
 * entirely. The first fixture written against ADR-0116 M6 proved exactly that: a MANDATORY pin
 * masking the whole chain read as PASS.
 *
 * **Reading the levelled finish here, and not only in the movement measurement, is deliberate**
 * (#248's engine remedy): levelling can delay a DIFFERENT activity past what was the network's
 * latest finish, so a carrier chosen on `earlyFinishOffset` alone could pick an activity that is no
 * longer the one that finishes last once the plan is actually levelled — the activity the product
 * shows finishing last, and the completion a levelled plan's what-if should be judging.
 *
 * Summaries are excluded because their dates are a rollup over their children (`compute.ts:544`),
 * so a summary can never be the thing that finished last in any sense a planner means. That
 * exclusion has a second consequence worth knowing: because the carrier is chosen from non-summary
 * rows only, **a WBS reparent can never move it** — which is what makes `WBS_PARENT` a non-replayable
 * change class for attribution.
 *
 * Ties break by id, so the choice is deterministic across runs.
 */
export function selectCompletionCarrier(
  activities: readonly EngineActivity[],
  results: readonly EngineResult[],
): EngineResult | undefined {
  const summaryIds = new Set(activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.id));
  return results
    .filter((r) => !summaryIds.has(r.activityId))
    .sort(
      (x, y) =>
        effectiveFinishOffset(y) - effectiveFinishOffset(x) ||
        x.activityId.localeCompare(y.activityId),
    )[0];
}

/**
 * How far the carrier moved, in days, measured on an **explicitly supplied** calendar.
 *
 * **Reads the levelled finish when the caller has one, the network finish otherwise**
 * ({@link effectiveFinish}) — the same rule {@link selectCompletionCarrier} applies to *which*
 * activity is the carrier, applied here to *how far* it moved. A caller that hands this two
 * `computeSchedule` results (no overlay merged on) measures exactly what it always measured; one
 * that has run both its control and its perturbed pass through `levelIfEnabled` measures the two
 * dates the product actually shows.
 *
 * **The calendar is a required parameter and must not be defaulted**, because the right answer
 * differs by caller and picking one silently gives the other caller the wrong semantics:
 *
 * - **DCMA metric 12** perturbs exactly ONE activity, so it measures on that **subject's** calendar.
 *   Measuring on the plan frame under-reads precisely when the subject works a wider week than the
 *   plan (a 24/7 subject in a 5-day plan propagates 600 elapsed days as ~428 plan-frame days), and a
 *   false FAIL from frame mismatch is the one wrong answer that test must never give.
 * - **Revision-compare attribution** perturbs a whole change CLASS — potentially a dozen activities
 *   across four calendars — so "the subject's calendar" does not exist. It measures on the
 *   **carrier's** own calendar, which is the thing whose movement is being reported. That is a NEW
 *   rule rather than an inherited one, and it is argued here rather than assumed.
 */
export function measureCarrierMovementDays(params: {
  readonly carrier: EngineResult;
  readonly carrierPerturbed: EngineResult;
  readonly calendar: WorkingTimeCalendar;
  readonly dayFactorMinutes: number;
}): number {
  const { carrier, carrierPerturbed, calendar, dayFactorMinutes } = params;
  const deltaMinutes = calendar.workingTimeBetween(
    effectiveFinish(carrier),
    effectiveFinish(carrierPerturbed),
  );
  return Math.round((deltaMinutes / dayFactorMinutes) * 10) / 10;
}
