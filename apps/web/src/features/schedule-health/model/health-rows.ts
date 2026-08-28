import type {
  HealthMetricResult,
  HealthNotAssessableReason,
  ScheduleHealthReport,
} from '@repo/types';

/**
 * Pure view-model derivation for the health panel (M2-T1) — no React, no fetch, so the row logic
 * is testable without a DOM.
 *
 * **G3 lives here**: every number a row prints comes from the payload — the threshold's value, the
 * measured count/percent/ratio, the offender cap. This module contains no threshold literal, and
 * `schedule-health-vocabulary.structural.test.ts` (its G3 case) fails the build if one appears
 * anywhere in the feature. What IS authored here is prose: the verdict words, the reason
 * sentences, and the comparison glyph each `ThresholdKind` implies.
 */

export interface HealthRowView {
  metric: HealthMetricResult;
  /** The verdict as a WORD — never colour alone (WCAG 1.4.1). */
  verdictLabel: string;
  /** A tone token name the component maps to an icon + colour pair. */
  tone: 'pass' | 'fail' | 'muted' | 'info';
  /** "≤ 5 %", "= 0", "≥ 0.95" — the payload's threshold, formatted; null when the row has none. */
  thresholdLabel: string | null;
  /** "41 of 512 (8 %)", "4", "0.9312" — the payload's measurement, formatted; null when absent. */
  measuredLabel: string | null;
  /** The NOT_ASSESSABLE reason as a sentence; null on every other verdict. */
  reasonSentence: string | null;
  /** Which remedy route fixes a not-assessable row, when one exists. */
  remedy: 'RECALCULATE' | 'CAPTURE_BASELINE' | null;
  /**
   * A scope caveat the row must carry on screen, not only on paper — metric 10's narrowing. The
   * payload's `detail.narrowing` says WHAT the metric reads; without the sentence a planner
   * believes the row measures workload or over-allocation (the M5 ux finding: the printout
   * explained it and the live panel did not).
   */
  caveatSentence: string | null;
}

/**
 * What a reader WITHOUT the remedy capability is told instead of a button. ADR-0082's
 * discriminator: a route shut by ROLE is explained, never omitted — omission would leave a Viewer
 * unable to tell "nobody captured a baseline" from "I am not allowed to fix this", and the two
 * calls to action differ (ask a Planner vs. do nothing).
 */
export const REMEDY_ROLE_SENTENCES: Record<'RECALCULATE' | 'CAPTURE_BASELINE', string> = {
  RECALCULATE: 'Recalculating needs a role that can edit the schedule — ask a Planner.',
  CAPTURE_BASELINE: 'Capturing a baseline needs a Planner or Org Admin.',
};

/**
 * The reason sentences. `REQUIRES_WHAT_IF_ANALYSIS` names what the check IS so the row teaches
 * rather than shrugs; `NO_TARGET_FINISH` states the rule the evaluator obeyed (a target is never
 * invented) because the absence is the finding.
 */
const REASON_SENTENCES: Record<HealthNotAssessableReason, string> = {
  EMPTY_PLAN: 'The plan has no activities to judge.',
  NO_RELATIONSHIPS: 'The plan has no relationships yet.',
  PLAN_NOT_SCHEDULED: 'The plan has never been calculated, so there is no schedule to judge.',
  NO_ACTIVE_BASELINE: 'No active baseline exists to compare against.',
  NO_TARGET_FINISH:
    'No target finish exists — no active baseline and no hard finish constraint on a finish milestone. A target is never invented.',
  NOTHING_DUE: 'Nothing was baselined to finish by the data date yet.',
  NO_INCOMPLETE_ACTIVITIES: 'Every activity is complete — there is no remaining work to judge.',
  NOTHING_REMAINING:
    'The schedule finishes on or before the data date — there is no remaining path to index.',
  REQUIRES_WHAT_IF_ANALYSIS:
    'The critical-path integrity test perturbs a critical activity and confirms completion moves with it. Run it from this row.',
  NO_CRITICAL_PATH:
    'No incomplete critical activity exists to perturb — a plan can legitimately have no critical path.',
};

/** Which remedy each reason has, when the product offers one the reader can act on. */
const REASON_REMEDIES: Partial<
  Record<HealthNotAssessableReason, 'RECALCULATE' | 'CAPTURE_BASELINE'>
> = {
  PLAN_NOT_SCHEDULED: 'RECALCULATE',
  NO_ACTIVE_BASELINE: 'CAPTURE_BASELINE',
  NO_TARGET_FINISH: 'CAPTURE_BASELINE',
};

const VERDICT_LABELS = {
  PASS: 'Pass',
  FAIL: 'Fail',
  NOT_ASSESSABLE: 'Not assessed',
  INFORMATIONAL: 'Info',
} as const;

const VERDICT_TONES = {
  PASS: 'pass',
  FAIL: 'fail',
  NOT_ASSESSABLE: 'muted',
  INFORMATIONAL: 'info',
} as const;

/** The comparison glyph a `ThresholdKind` implies — the VALUE always comes from the payload. */
function formatThreshold(threshold: HealthMetricResult['threshold']): string | null {
  if (threshold === null) return null;
  switch (threshold.kind) {
    case 'MAX_PERCENT':
      return `≤ ${threshold.value} %`;
    case 'MAX_COUNT':
      return `= ${threshold.value}`;
    case 'MIN_PERCENT':
      return `≥ ${threshold.value} %`;
    case 'MIN_RATIO':
      return `≥ ${threshold.value}`;
  }
}

function formatMeasured(measured: HealthMetricResult['measured']): string | null {
  if (measured === null) return null;
  if (measured.ratio !== null) return measured.ratio.toString();
  if (measured.percent !== null && measured.denominator !== null)
    return `${measured.count} of ${measured.denominator} (${measured.percent} %)`;
  return measured.count === null ? null : measured.count.toString();
}

export function buildHealthRows(report: ScheduleHealthReport): HealthRowView[] {
  return report.metrics.map((metric) => ({
    metric,
    verdictLabel: VERDICT_LABELS[metric.verdict],
    tone: VERDICT_TONES[metric.verdict],
    thresholdLabel: formatThreshold(metric.threshold),
    measuredLabel: formatMeasured(metric.measured),
    reasonSentence: metric.reason === null ? null : REASON_SENTENCES[metric.reason],
    remedy: metric.reason === null ? null : (REASON_REMEDIES[metric.reason] ?? null),
    caveatSentence: caveatFor(metric),
  }));
}

/** The scope caveat a row carries on screen; every NUMBER in it comes from the payload (G3). */
function caveatFor(metric: HealthMetricResult): string | null {
  if (metric.id === 'RESOURCES' && metric.verdict === 'INFORMATIONAL') {
    return 'Reads resource-assignment existence only — not workload or over-allocation.';
  }
  // The computed what-if (M6): say what was injected and what moved, so the verdict is
  // reproducible by hand from the sentence alone.
  if (metric.id === 'CRITICAL_PATH_TEST' && metric.detail !== null) {
    const d = metric.detail;
    return `Injected ${String(d['injectedDays'])} d at ${String(d['perturbedActivityName'])}; completion moved ${String(d['deltaDays'])} d.`;
  }
  return null;
}

/**
 * The report with the on-demand metric-12 result merged over its placeholder row (health M6).
 * The summary buckets are RECOUNTED from the merged rows — the four counts are derived from the
 * metrics, and a merged row whose verdict changed with a summary that still counts the placeholder
 * is the two-numbers-disagreeing defect this epic exists to remove, reproduced inside one panel.
 */
export function mergeCriticalPathResult(
  report: ScheduleHealthReport,
  result: HealthMetricResult | null,
): ScheduleHealthReport {
  if (result === null) return report;
  const metrics = report.metrics.map((m) => (m.id === 'CRITICAL_PATH_TEST' ? result : m));
  return {
    ...report,
    metrics,
    summary: {
      passed: metrics.filter((m) => m.verdict === 'PASS').length,
      failed: metrics.filter((m) => m.verdict === 'FAIL').length,
      notAssessable: metrics.filter((m) => m.verdict === 'NOT_ASSESSABLE').length,
      informational: metrics.filter((m) => m.verdict === 'INFORMATIONAL').length,
    },
  };
}

/**
 * The headline announced once when the report settles (never per render — the ADR-0079
 * stale-debounce lesson): the summary counts, in words. **All four counts, always** — the visible
 * summary states all four, and a live region that silently drops one hands a screen-reader user a
 * different report from the sighted one (the M5 ux finding; the ADR-0073 C1 "two empty states, one
 * channel" shape).
 */
export function healthAnnouncement(report: ScheduleHealthReport): string {
  const s = report.summary;
  return `Health check: ${s.failed} failed, ${s.passed} passed, ${s.notAssessable} not assessed, ${s.informational} informational.`;
}
