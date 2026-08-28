import type {
  HealthMeasured,
  HealthMetricId,
  HealthMetricResult,
  HealthNotAssessableReason,
  HealthOffender,
  ScheduleHealthReport,
} from '@repo/types';

import { resolveRemainingMinutes } from '../remaining-duration';

import {
  HARD_CONSTRAINT_TYPES,
  HEALTH_METRICS,
  HIGH_DURATION_DAYS,
  HIGH_FLOAT_DAYS,
  MISSING_LOGIC_EXCLUSION_RULE,
  OFFENDER_CAP,
  RESOURCES_NARROWING,
  THRESHOLDS,
} from './thresholds';

/**
 * The pure DCMA 14-point model (health M1). Persisted rows in, a total fourteen-row report out.
 *
 * **The CPM engine is not imported here** — the one shared rule is `resolveRemainingMinutes`, a
 * service-boundary helper (spec §3.1 metric 8), and the working-day arithmetic for CPLI arrives as
 * an injected function the service builds from the plan calendar port (the `variance.ts` pattern,
 * ADR-0025). The engine-free gate (`health-engine-free.structural.spec.ts`) pins the import ban.
 *
 * Every metric returns a row satisfying the verdict discriminator (spec §4.5's table); the private
 * row builders below are the ONLY way a row is made, so an evaluator cannot answer "what does
 * `measured` hold when nothing was measured?" differently from its thirteen siblings.
 */

export interface HealthActivityInput {
  id: string;
  code: string | null;
  name: string;
  type: string;
  status: string;
  constraintType: string | null;
  constraintDate: string | null;
  secondaryConstraintType: string | null;
  secondaryConstraintDate: string | null;
  /** Whole working days on the activity's OWN calendar (M0-T1 confirmed); null = never computed. */
  totalFloat: number | null;
  durationMinutes: number;
  remainingDurationMinutes: number | null;
  percentComplete: number;
  actualStart: string | null;
  actualFinish: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  /** Minutes per authored day on the activity's effective calendar (ADR-0068, attachDayFactors). */
  dayFactorMinutes: number;
  hasAssignment: boolean;
}

export interface HealthDependencyInput {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagMinutes: number;
}

export interface HealthBaselineActivityInput {
  sourceActivityId: string;
  baselineFinish: string | null;
}

export interface HealthBaselineInput {
  id: string;
  name: string;
  capturedAt: string;
  capturedProjectFinish: string | null;
  activities: HealthBaselineActivityInput[];
}

export interface HealthPlanInput {
  id: string;
  name: string;
  /** The data date (`plans.planned_start`), `YYYY-MM-DD` — NOT NULL since ADR-0033 M1. */
  dataDate: string;
  computedAt: string | null;
  schedulingMode: 'EARLY' | 'VISUAL';
}

export interface HealthComputeInput {
  plan: HealthPlanInput;
  /** Active rows only (soft-deletes already excluded by the loader). Summaries INCLUDED here —
   *  the model applies the §3.1 denominator convention itself so a test can pin it. */
  activities: HealthActivityInput[];
  dependencies: HealthDependencyInput[];
  baseline: HealthBaselineInput | null;
  /**
   * Signed working days from one `YYYY-MM-DD` to another on the PLAN's calendar (positive = `to`
   * later). Injected by the service from the calendar port + the plan's day factor — the
   * `variance.ts` shape — so this module stays pure and engine-compute-free.
   */
  workingDaysBetween: (from: string, to: string) => number;
}

/** A metric row under construction — the id/ordinal/name half the builders fill in. */
interface RowShape {
  verdict: 'PASS' | 'FAIL' | 'NOT_ASSESSABLE' | 'INFORMATIONAL';
  reason: HealthNotAssessableReason | null;
  measured: HealthMeasured | null;
  detail: Record<string, unknown> | null;
  offenders: HealthOffender[];
  offenderCount: number;
  offendersTruncated: boolean;
  /** INFORMATIONAL rows must null their threshold; everything else takes the table's. */
  suppressThreshold?: boolean;
}

const pct = (count: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.round((count / denominator) * 1000) / 10;

const ratio4 = (value: number): number => Math.round(value * 10_000) / 10_000;

function measuredPercent(count: number, denominator: number): HealthMeasured {
  return { count, denominator, percent: pct(count, denominator), ratio: null };
}

function measuredCount(count: number): HealthMeasured {
  return { count, denominator: null, percent: null, ratio: null };
}

function measuredRatio(value: number): HealthMeasured {
  return { count: null, denominator: null, percent: null, ratio: ratio4(value) };
}

/** Cap a full offender list, reporting the TRUE total (ADR-0100's rule). */
function capped(
  offenders: HealthOffender[],
): Pick<RowShape, 'offenders' | 'offenderCount' | 'offendersTruncated'> {
  return {
    offenders: offenders.slice(0, OFFENDER_CAP),
    offenderCount: offenders.length,
    offendersTruncated: offenders.length > OFFENDER_CAP,
  };
}

function notAssessable(reason: HealthNotAssessableReason): RowShape {
  return {
    verdict: 'NOT_ASSESSABLE',
    reason,
    measured: null,
    detail: null,
    offenders: [],
    offenderCount: 0,
    offendersTruncated: false,
  };
}

function judged(
  measured: HealthMeasured,
  passed: boolean,
  offenders: HealthOffender[],
  detail: Record<string, unknown> | null = null,
): RowShape {
  return {
    verdict: passed ? 'PASS' : 'FAIL',
    reason: null,
    measured,
    detail,
    // A passing row carries no offenders by contract — an empty list, not a capped one.
    ...(passed
      ? { offenders: [], offenderCount: 0, offendersTruncated: false }
      : capped(offenders)),
  };
}

function informational(
  measured: HealthMeasured,
  offenders: HealthOffender[],
  detail: Record<string, unknown> | null,
): RowShape {
  return {
    verdict: 'INFORMATIONAL',
    reason: null,
    measured,
    detail,
    suppressThreshold: true,
    ...capped(offenders),
  };
}

const activityOffender = (a: HealthActivityInput, note: string): HealthOffender => ({
  kind: 'ACTIVITY',
  id: a.id,
  code: a.code,
  name: a.name,
  note,
  activityId: a.id,
});

export function computeHealthReport(input: HealthComputeInput): ScheduleHealthReport {
  const { plan, dependencies, baseline, workingDaysBetween } = input;

  // The §3.1 denominator convention: active non-summary activities. Summaries are excluded
  // because ADR-0038 makes "a summary carries no logic" a service invariant — counting them would
  // fail metric 1 on every well-built plan by construction.
  const summaries = input.activities.filter((a) => a.type === 'WBS_SUMMARY');
  const acts = input.activities.filter((a) => a.type !== 'WBS_SUMMARY');
  const byId = new Map(acts.map((a) => [a.id, a]));
  const scheduled = plan.computedAt !== null;
  const isComplete = (a: HealthActivityInput): boolean => a.status === 'COMPLETE';
  const isMilestone = (a: HealthActivityInput): boolean =>
    a.type === 'START_MILESTONE' || a.type === 'FINISH_MILESTONE';

  // A relationship offender names both endpoints from the in-memory map — never a second query
  // (backend-performance review; the getEarnedValue snapshot-map shape). The jump seam selects the
  // SUCCESSOR: it is the activity whose schedule the relationship shapes.
  const relOffender = (d: HealthDependencyInput, note: string): HealthOffender => {
    const pred = byId.get(d.predecessorId);
    const succ = byId.get(d.successorId);
    const label = (a: HealthActivityInput | undefined): string =>
      a ? (a.code ?? a.name) : 'unknown';
    return {
      kind: 'RELATIONSHIP',
      id: d.id,
      code: null,
      name: `${label(pred)} → ${label(succ)}`,
      note,
      activityId: d.successorId,
    };
  };

  // Adjacency, built once and shared (metrics 1 and 4 both read it).
  const hasPred = new Set<string>();
  const hasSucc = new Set<string>();
  for (const d of dependencies) {
    hasSucc.add(d.predecessorId);
    hasPred.add(d.successorId);
  }

  const rows: Record<HealthMetricId, RowShape> = {
    MISSING_LOGIC: metricMissingLogic(),
    LEADS: metricLeads(),
    LAGS: metricLags(),
    RELATIONSHIP_TYPES: metricRelationshipTypes(),
    HARD_CONSTRAINTS: metricHardConstraints(),
    HIGH_FLOAT: metricHighFloat(),
    NEGATIVE_FLOAT: metricNegativeFloat(),
    HIGH_DURATION: metricHighDuration(),
    INVALID_DATES: metricInvalidDates(),
    RESOURCES: metricResources(),
    MISSED_ACTIVITIES: metricMissedActivities(),
    CRITICAL_PATH_TEST: notAssessable('REQUIRES_WHAT_IF_ANALYSIS'),
    CPLI: metricCpli(),
    BEI: metricBei(),
  };

  const metrics: HealthMetricResult[] = HEALTH_METRICS.map(({ id, ordinal, name }) => {
    const row = rows[id];
    return {
      id,
      ordinal,
      name,
      verdict: row.verdict,
      reason: row.reason,
      measured: row.measured,
      threshold: row.suppressThreshold ? null : THRESHOLDS[id],
      detail: row.detail,
      offenderCount: row.offenderCount,
      offendersTruncated: row.offendersTruncated,
      offenders: row.offenders,
    };
  });

  const summary = {
    passed: metrics.filter((m) => m.verdict === 'PASS').length,
    failed: metrics.filter((m) => m.verdict === 'FAIL').length,
    notAssessable: metrics.filter((m) => m.verdict === 'NOT_ASSESSABLE').length,
    informational: metrics.filter((m) => m.verdict === 'INFORMATIONAL').length,
  };

  return {
    planId: plan.id,
    planName: plan.name,
    dataDate: plan.dataDate,
    computedAt: plan.computedAt,
    schedulingMode: plan.schedulingMode,
    activityCount: acts.length,
    relationshipCount: dependencies.length,
    baseline: baseline
      ? { id: baseline.id, name: baseline.name, capturedAt: baseline.capturedAt }
      : null,
    summary,
    offenderCap: OFFENDER_CAP,
    metrics,
  };

  // --- Metric 1 — missing logic -----------------------------------------------------------------
  function metricMissingLogic(): RowShape {
    if (acts.length === 0) return notAssessable('EMPTY_PLAN');
    // The CQ-3 typed rule: a START_MILESTONE may open the network and a FINISH_MILESTONE may close
    // it. A TASK with no predecessor is never excused, however early it sorts — the rejected
    // positional rule, asserted by a unit case rather than left as a paragraph.
    const excused: string[] = [];
    const offenders: HealthOffender[] = [];
    let missingPred = 0;
    let missingSucc = 0;
    for (const a of acts) {
      const noPred = !hasPred.has(a.id);
      const noSucc = !hasSucc.has(a.id);
      const predExcused = noPred && a.type === 'START_MILESTONE';
      const succExcused = noSucc && a.type === 'FINISH_MILESTONE';
      if (predExcused || succExcused) excused.push(a.id);
      const predMissing = noPred && !predExcused;
      const succMissing = noSucc && !succExcused;
      if (predMissing) missingPred += 1;
      if (succMissing) missingSucc += 1;
      if (predMissing || succMissing) {
        const notes = [
          ...(predMissing ? ['no predecessor'] : []),
          ...(succMissing ? ['no successor'] : []),
        ];
        offenders.push(activityOffender(a, notes.join(', ')));
      }
    }
    const count = offenders.length;
    const measured = measuredPercent(count, acts.length);
    return judged(measured, (measured.percent ?? 0) <= 5, offenders, {
      missingPredecessor: missingPred,
      missingSuccessor: missingSucc,
      excludedSummaries: summaries.length,
      exclusionRule: MISSING_LOGIC_EXCLUSION_RULE,
      excludedActivityIds: excused,
    });
  }

  // --- Metric 2 — leads (negative lag) ----------------------------------------------------------
  function metricLeads(): RowShape {
    if (dependencies.length === 0) return notAssessable('NO_RELATIONSHIPS');
    // MINUTES, never the rounded lagDays — a 2-hour lead rounds to lagDays 0 (ADR-0070).
    const leads = dependencies.filter((d) => d.lagMinutes < 0);
    const offenders = leads.map((d) => relOffender(d, `lead of ${d.lagMinutes} min (${d.type})`));
    return judged(measuredCount(leads.length), leads.length === 0, offenders);
  }

  // --- Metric 3 — lags --------------------------------------------------------------------------
  function metricLags(): RowShape {
    if (dependencies.length === 0) return notAssessable('NO_RELATIONSHIPS');
    const lags = dependencies.filter((d) => d.lagMinutes > 0);
    const measured = measuredPercent(lags.length, dependencies.length);
    const offenders = lags.map((d) => relOffender(d, `lag of ${d.lagMinutes} min (${d.type})`));
    return judged(measured, (measured.percent ?? 0) <= 5, offenders);
  }

  // --- Metric 4 — relationship types ------------------------------------------------------------
  function metricRelationshipTypes(): RowShape {
    if (dependencies.length === 0) return notAssessable('NO_RELATIONSHIPS');
    const byType = { FS: 0, SS: 0, FF: 0, SF: 0 } as Record<string, number>;
    for (const d of dependencies) byType[d.type] = (byType[d.type] ?? 0) + 1;
    const fs = byType.FS ?? 0;
    const measured = measuredPercent(fs, dependencies.length);
    // Offenders are the non-FS relationships; SF is named in the note because the playbook records
    // it as "the least-used type and the easiest to get silently wrong".
    const offenders = dependencies
      .filter((d) => d.type !== 'FS')
      .map((d) =>
        relOffender(d, d.type === 'SF' ? `${d.type} (rare — check it is intended)` : d.type),
      );
    return judged(measured, (measured.percent ?? 0) >= 90, offenders, {
      breakdown: { fs: byType.FS ?? 0, ss: byType.SS ?? 0, ff: byType.FF ?? 0, sf: byType.SF ?? 0 },
    });
  }

  // --- Metric 5 — hard constraints --------------------------------------------------------------
  function metricHardConstraints(): RowShape {
    if (acts.length === 0) return notAssessable('EMPTY_PLAN');
    // An activity carrying two hard constraints counts ONCE; the secondary slot counts (ADR-0035
    // §10 — an FNLT hidden there is exactly as hard).
    const offenders: HealthOffender[] = [];
    for (const a of acts) {
      const hard = [a.constraintType, a.secondaryConstraintType].filter(
        (t): t is string => t !== null && HARD_CONSTRAINT_TYPES.has(t),
      );
      if (hard.length > 0) offenders.push(activityOffender(a, hard.join(' + ')));
    }
    const measured = measuredPercent(offenders.length, acts.length);
    return judged(measured, (measured.percent ?? 0) <= 5, offenders);
  }

  // --- Metric 6 — high float --------------------------------------------------------------------
  function metricHighFloat(): RowShape {
    if (acts.length === 0) return notAssessable('EMPTY_PLAN');
    if (!scheduled) return notAssessable('PLAN_NOT_SCHEDULED');
    // total_float is already whole working days on the activity's own calendar — direct integer
    // comparison, no conversion (M0-T1's confirmed claim). Complete activities excluded: a
    // finished activity's float is not a planning risk.
    const incomplete = acts.filter((a) => !isComplete(a));
    if (incomplete.length === 0) return notAssessable('NO_INCOMPLETE_ACTIVITIES');
    const high = incomplete.filter((a) => (a.totalFloat ?? 0) > HIGH_FLOAT_DAYS);
    const measured = measuredPercent(high.length, incomplete.length);
    const offenders = high.map((a) => activityOffender(a, `float ${a.totalFloat} d`));
    return judged(measured, (measured.percent ?? 0) <= 5, offenders);
  }

  // --- Metric 7 — negative float ----------------------------------------------------------------
  function metricNegativeFloat(): RowShape {
    if (acts.length === 0) return notAssessable('EMPTY_PLAN');
    if (!scheduled) return notAssessable('PLAN_NOT_SCHEDULED');
    const negative = acts.filter((a) => (a.totalFloat ?? 0) < 0);
    const offenders = negative.map((a) => activityOffender(a, `float ${a.totalFloat} d`));
    return judged(measuredCount(negative.length), negative.length === 0, offenders);
  }

  // --- Metric 8 — high duration -----------------------------------------------------------------
  function metricHighDuration(): RowShape {
    if (acts.length === 0) return notAssessable('EMPTY_PLAN');
    // DCMA measures REMAINING duration on incomplete work. The engine's own rule is reused, not
    // rewritten (resolveRemainingMinutes — the ADR-0065 argument); it is undefined for a
    // not-started activity, whose remaining work IS its full duration. Milestones excluded
    // (duration 0 by construction).
    const considered = acts.filter(
      (a) => !isComplete(a) && !isMilestone(a) && a.durationMinutes > 0,
    );
    if (considered.length === 0) return notAssessable('NO_INCOMPLETE_ACTIVITIES');
    const high = considered.filter((a) => {
      const remaining = resolveRemainingMinutes(a) ?? a.durationMinutes;
      // Each activity's OWN day factor (ADR-0068) — never a constant, never a per-row lookup.
      return remaining / a.dayFactorMinutes > HIGH_DURATION_DAYS;
    });
    const measured = measuredPercent(high.length, considered.length);
    const offenders = high.map((a) => {
      const remaining = resolveRemainingMinutes(a) ?? a.durationMinutes;
      return activityOffender(a, `remaining ${Math.round(remaining / a.dayFactorMinutes)} d`);
    });
    return judged(measured, (measured.percent ?? 0) <= 5, offenders);
  }

  // --- Metric 9 — invalid dates -----------------------------------------------------------------
  function metricInvalidDates(): RowShape {
    if (acts.length === 0) return notAssessable('EMPTY_PLAN');
    // Two sub-checks with different causes and different fixes, reported separately. The forecast
    // half needs a computed schedule; the actual half does not — so a never-calculated plan still
    // judges its actuals, with the un-assessed half stated in the detail rather than silently
    // folded into a zero (the spec's "(forecast half only)" branch).
    const actualAfter = acts.filter(
      (a) =>
        (a.actualStart !== null && a.actualStart > plan.dataDate) ||
        (a.actualFinish !== null && a.actualFinish > plan.dataDate),
    );
    const forecastBefore = scheduled
      ? acts.filter((a) => !isComplete(a) && a.earlyStart !== null && a.earlyStart < plan.dataDate)
      : [];
    const offenders = [
      ...forecastBefore.map((a) =>
        activityOffender(a, `forecast start ${a.earlyStart} before data date`),
      ),
      ...actualAfter.map((a) => activityOffender(a, 'actual date after the data date')),
    ];
    const count = offenders.length;
    return judged(measuredCount(count), count === 0, offenders, {
      forecastBeforeDataDate: scheduled ? forecastBefore.length : null,
      actualAfterDataDate: actualAfter.length,
      forecastAssessed: scheduled,
    });
  }

  // --- Metric 10 — resources (informational, narrowed) ------------------------------------------
  function metricResources(): RowShape {
    const considered = acts.filter((a) => !isMilestone(a) && a.durationMinutes > 0);
    if (considered.length === 0) return notAssessable('EMPTY_PLAN');
    // Assignment EXISTENCE only — the cost half is excluded so the report cannot vary by
    // `cost:read` (spec §3.2), and the narrowing is named in the payload.
    const unassigned = considered.filter((a) => !a.hasAssignment);
    const measured = measuredPercent(unassigned.length, considered.length);
    const offenders = unassigned.map((a) => activityOffender(a, 'no resource assignment'));
    return informational(measured, offenders, { narrowing: RESOURCES_NARROWING });
  }

  // --- Metric 11 — missed activities ------------------------------------------------------------
  function metricMissedActivities(): RowShape {
    if (baseline === null) return notAssessable('NO_ACTIVE_BASELINE');
    if (!scheduled) return notAssessable('PLAN_NOT_SCHEDULED');
    const snapshot = new Map(
      baseline.activities.map((b) => [b.sourceActivityId, b.baselineFinish]),
    );
    // Denominator: activities present in the snapshot AND baselined to finish by the data date.
    // Activities absent from the snapshot are excluded and COUNTED — a stale baseline is itself
    // the finding.
    let notInBaseline = 0;
    const due: { a: HealthActivityInput; baselineFinish: string }[] = [];
    for (const a of acts) {
      const bf = snapshot.get(a.id);
      if (bf === undefined) {
        notInBaseline += 1;
        continue;
      }
      if (bf !== null && bf <= plan.dataDate) due.push({ a, baselineFinish: bf });
    }
    if (due.length === 0) return notAssessable('NOTHING_DUE');
    const missed = due.filter(({ a, baselineFinish }) => {
      const finish = a.actualFinish ?? a.earlyFinish;
      return finish !== null && finish > baselineFinish;
    });
    const measured = measuredPercent(missed.length, due.length);
    const offenders = missed.map(({ a, baselineFinish }) =>
      activityOffender(
        a,
        `${a.actualFinish ? 'finished' : 'forecast'} ${a.actualFinish ?? a.earlyFinish} vs baseline ${baselineFinish}`,
      ),
    );
    return judged(measured, (measured.percent ?? 0) <= 5, offenders, {
      dueCount: due.length,
      notInBaselineCount: notInBaseline,
    });
  }

  // --- Metric 13 — Critical Path Length Index ---------------------------------------------------
  function metricCpli(): RowShape {
    if (!scheduled) return notAssessable('PLAN_NOT_SCHEDULED');
    const finishes = acts.map((a) => a.earlyFinish).filter((d): d is string => d !== null);
    if (finishes.length === 0) return notAssessable('PLAN_NOT_SCHEDULED');
    const projectFinish = finishes.reduce((max, d) => (d > max ? d : max));
    // The target, in the documented order: the active baseline's captured project finish, else the
    // EARLIEST hard finish constraint on a FINISH_MILESTONE (the tightest commitment). A target is
    // NEVER invented — the single most tempting dishonesty in the feature.
    let target: string | null = baseline?.capturedProjectFinish ?? null;
    let targetSource: 'ACTIVE_BASELINE' | 'FINISH_MILESTONE_CONSTRAINT' | null = target
      ? 'ACTIVE_BASELINE'
      : null;
    let targetMilestoneId: string | null = null;
    if (target === null) {
      const finishTargets = acts
        .filter((a) => a.type === 'FINISH_MILESTONE')
        .flatMap((a) =>
          [
            { type: a.constraintType, date: a.constraintDate, id: a.id },
            { type: a.secondaryConstraintType, date: a.secondaryConstraintDate, id: a.id },
          ].filter(
            (c): c is { type: string; date: string; id: string } =>
              c.type !== null &&
              c.date !== null &&
              ['FNLT', 'MFO', 'MANDATORY_FINISH'].includes(c.type),
          ),
        );
      if (finishTargets.length > 0) {
        const earliest = finishTargets.reduce((min, c) => (c.date < min.date ? c : min));
        target = earliest.date;
        targetSource = 'FINISH_MILESTONE_CONSTRAINT';
        targetMilestoneId = earliest.id;
      }
    }
    if (target === null) return notAssessable('NO_TARGET_FINISH');
    const cpl = workingDaysBetween(plan.dataDate, projectFinish);
    if (cpl <= 0) return notAssessable('NOTHING_REMAINING');
    const floatToTarget = workingDaysBetween(projectFinish, target);
    const cpli = (cpl + floatToTarget) / cpl;
    return judged(measuredRatio(cpli), ratio4(cpli) >= 0.95, [], {
      targetSource,
      targetFinish: target,
      ...(targetMilestoneId === null ? {} : { targetMilestoneId }),
      projectFinish,
      criticalPathLengthDays: cpl,
      totalFloatToTargetDays: floatToTarget,
    });
  }

  // --- Metric 14 — Baseline Execution Index -----------------------------------------------------
  function metricBei(): RowShape {
    if (baseline === null) return notAssessable('NO_ACTIVE_BASELINE');
    const snapshot = new Map(
      baseline.activities.map((b) => [b.sourceActivityId, b.baselineFinish]),
    );
    const due = acts.filter((a) => {
      const bf = snapshot.get(a.id);
      return bf !== undefined && bf !== null && bf <= plan.dataDate;
    });
    // The zero denominator is guarded explicitly: nothing due yet is a fact, never Infinity.
    if (due.length === 0) return notAssessable('NOTHING_DUE');
    const completed = acts.filter((a) => a.actualFinish !== null);
    const bei = completed.length / due.length;
    const offenders = due
      .filter((a) => a.actualFinish === null)
      .map((a) => activityOffender(a, 'baselined to be complete by the data date'));
    return judged(measuredRatio(bei), ratio4(bei) >= 0.95, offenders, {
      completedCount: completed.length,
      dueCount: due.length,
    });
  }
}
