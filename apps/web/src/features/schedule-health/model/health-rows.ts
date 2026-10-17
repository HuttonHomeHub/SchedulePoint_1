import type {
  HealthAdvisoryResult,
  HealthMetricResult,
  HealthNotAssessableReason,
  RedundantLinksAdvisory,
  ScheduleHealthReport,
  ZeroDurationTasksAdvisory,
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

/**
 * Metric 10's narrowing sentences, keyed by the token the PAYLOAD carries in `detail.narrowing`
 * (the server's `RESOURCES_NARROWING`). This is G3's division one step out from numbers: the
 * payload owns the FACT of which narrowing was applied, this module owns the WORDS for it.
 *
 * Keying on the token rather than on `metric.id` is the whole point. A sentence keyed on the id
 * alone keeps printing whatever narrowing was true the day it was written — change the server's
 * rule and the panel states the old scope, confidently, with nothing failing anywhere. That is the
 * absence-a-reader-cannot-detect shape, arriving in the one sentence whose job is to stop a planner
 * believing this row measures workload.
 */
const RESOURCE_NARROWING_SENTENCES: Record<string, string> = {
  RESOURCE_ASSIGNMENT_ONLY:
    'Reads resource-assignment existence only — not workload or over-allocation.',
};

/** The scope caveat a row carries on screen; every NUMBER in it comes from the payload (G3). */
function caveatFor(metric: HealthMetricResult): string | null {
  if (metric.id === 'RESOURCES' && metric.verdict === 'INFORMATIONAL') {
    const narrowing = metric.detail?.['narrowing'];
    // No token ⇒ no claim. The server names one on every INFORMATIONAL metric-10 row
    // (`compute-health.definition.spec.ts` pins it), so silence here means the server stopped
    // saying — and inventing a scope sentence is worse than omitting one.
    if (typeof narrowing !== 'string') return null;
    // An unrecognised token still says something true: the scope IS narrowed. What it excludes is
    // not ours to guess, so the token is named rather than described.
    return RESOURCE_NARROWING_SENTENCES[narrowing] ?? `Reads a narrowed scope only — ${narrowing}.`;
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
  const headline = `Health check: ${s.failed} failed, ${s.passed} passed, ${s.notAssessable} not assessed, ${s.informational} informational.`;
  const advisories = healthAdvisoriesOf(report);
  // Every advisory, always, in the payload's order: the visible section lists them all, and a live
  // region that names only the first hands a screen-reader user a different report (ADR-0116 M5).
  return advisories === null || advisories.length === 0
    ? headline
    : `${headline} Beyond the DCMA assessment: ${advisories.map(advisoryPhrase).join(', ')}.`;
}

/**
 * The report's advisories (ADR-0162 D1), read **defensively**: `@repo/types` declares the field
 * required because the server always sends it, but a new bundle can meet an API released before it
 * (spec E32), and then the field is absent at runtime. Absent is `null`, and every consumer renders
 * nothing for it — never a failure and never an invented "none".
 */
export function healthAdvisoriesOf(
  report: ScheduleHealthReport,
): readonly HealthAdvisoryResult[] | null {
  const advisories: readonly HealthAdvisoryResult[] | undefined = report.advisories;
  return advisories ?? null;
}

/**
 * The one sentence that closes the "Beyond the DCMA assessment" section, on screen and on paper
 * (ADR-0162 D1): what the findings are read from, and that they are not part of the assessment above
 * it. It names stored activities and links, not durations alone, because it is true of every
 * advisory — "found from stored durations" was false for a finding about links.
 */
export const HEALTH_ADVISORY_FOOTER =
  "Found from the plan's stored activities and links, whether or not the plan has been calculated, and not part of the DCMA assessment above.";

/**
 * The advisory row's summary line, per advisory id. An id this bundle does not know — an API newer
 * than the web — is rendered as its count and nothing else: its name travels in the payload, but
 * what its figures MEAN does not, and a sentence invented for it would be a claim nobody made.
 */
export function advisorySummary(advisory: HealthAdvisoryResult): string {
  const { offenderCount } = advisory;
  switch (advisory.id) {
    case 'ZERO_DURATION_TASKS':
      return zeroDurationSummary(advisory);
    case 'REDUNDANT_LINKS':
      return redundantLinksSummary(advisory);
    default:
      return offenderCount === 0 ? 'None' : String(offenderCount);
  }
}

/**
 * The scope sentence a row with findings carries, keyed on the token the PAYLOAD names in
 * `detail.rule` (the `detail.narrowing` precedent): the server owns which rule ran, this module owns
 * the words. An unrecognised token is named rather than described.
 */
const REDUNDANT_RULE_SENTENCES: Record<string, string> = {
  DOMINATED_UNDER_ANY_DURATION:
    "Each is already implied by a longer chain of links. Deleting it would not change any activity's dates or float, whatever the durations — though it may start to matter if that chain changes.",
};

export function advisoryCaveat(advisory: HealthAdvisoryResult): string | null {
  if (advisory.id !== 'REDUNDANT_LINKS') return null;
  const rule: unknown = advisory.detail.rule;
  if (typeof rule !== 'string') return null;
  return (
    REDUNDANT_RULE_SENTENCES[rule] ?? `Judged by a rule this page does not describe — ${rule}.`
  );
}

/**
 * What the check could not judge (ADR-0127: an overlay counts what it does not know). When the work
 * cap was reached the count covers every link left unchecked, so that sentence replaces the first
 * rather than adding a second number for the same links.
 */
export function advisoryUnjudgedSentence(advisory: HealthAdvisoryResult): string | null {
  if (advisory.id !== 'REDUNDANT_LINKS') return null;
  const { unjudged, searchCapped } = advisory.detail;
  if (typeof unjudged !== 'number' || unjudged <= 0) return null;
  const links = unjudged === 1 ? '1 link was' : `${String(unjudged)} links were`;
  return searchCapped === true
    ? `The check stopped early on a plan this size; ${links} not checked.`
    : `${unjudged === 1 ? '1 link' : `${String(unjudged)} links`} into started or pinned work, or touching a level of effort, ${unjudged === 1 ? 'was' : 'were'} not checked.`;
}

/**
 * The zero-duration advisory's summary line: the count, the activities it is out of, and how many of
 * the offenders hold a resource assignment — "3 zero-duration tasks out of 40 activities; 1 has
 * resource assignments". At zero the row reads "None" (US-1): present and saying so, never absent.
 */
export function zeroDurationSummary(advisory: ZeroDurationTasksAdvisory): string {
  const count = advisory.offenderCount;
  if (count === 0) return 'None';
  const denominator = advisory.measured.denominator;
  const outOf =
    denominator === null
      ? ''
      : ` out of ${String(denominator)} ${denominator === 1 ? 'activity' : 'activities'}`;
  const r = advisory.detail.resourced;
  const resourced =
    r === 0
      ? 'none has resource assignments'
      : `${String(r)} ${r === 1 ? 'has' : 'have'} resource assignments`;
  return `${zeroDurationPhrase(count)}${outOf}; ${resourced}`;
}

/** "N redundant links out of M relationships"; the denominator is the plan's live links. */
export function redundantLinksSummary(advisory: RedundantLinksAdvisory): string {
  const count = advisory.offenderCount;
  if (count === 0) return 'None';
  const denominator = advisory.measured.denominator;
  const outOf =
    denominator === null
      ? ''
      : ` out of ${String(denominator)} ${denominator === 1 ? 'relationship' : 'relationships'}`;
  return `${redundantLinksPhrase(count)}${outOf}`;
}

/** "no zero-duration tasks" / "1 zero-duration task" / "3 zero-duration tasks". */
export function zeroDurationPhrase(count: number): string {
  if (count === 0) return 'no zero-duration tasks';
  return count === 1 ? '1 zero-duration task' : `${String(count)} zero-duration tasks`;
}

/** "no redundant links" / "1 redundant link" / "4 redundant links". */
export function redundantLinksPhrase(count: number): string {
  if (count === 0) return 'no redundant links';
  return count === 1 ? '1 redundant link' : `${String(count)} redundant links`;
}

/** One advisory's clause in the announcement; an unknown id is its name and count, no more. */
function advisoryPhrase(advisory: HealthAdvisoryResult): string {
  const { name, offenderCount } = advisory;
  switch (advisory.id) {
    case 'ZERO_DURATION_TASKS':
      return zeroDurationPhrase(advisory.offenderCount);
    case 'REDUNDANT_LINKS':
      return redundantLinksPhrase(advisory.offenderCount);
    default:
      return `${name}: ${String(offenderCount)}`;
  }
}
