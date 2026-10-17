import type {
  HealthAdvisoryResult,
  HealthMetricResult,
  RedundantLinksAdvisory,
  ScheduleHealthReport,
  ZeroDurationTasksAdvisory,
} from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  advisoryCaveat,
  advisorySummary,
  advisoryUnjudgedSentence,
  buildHealthRows,
  HEALTH_ADVISORY_FOOTER,
  healthAnnouncement,
  mergeCriticalPathResult,
  offenderAnnouncement,
  offenderJumpDescription,
  zeroDurationSummary,
} from './health-rows';

/** A report factory: every number in these fixtures is deliberately NOT a DCMA default, so an
 *  assertion passing proves the label came from the payload and not from a constant (G3). */
function metric(overrides: Partial<HealthMetricResult>): HealthMetricResult {
  return {
    id: 'MISSING_LOGIC',
    ordinal: 1,
    name: 'Missing logic',
    verdict: 'PASS',
    reason: null,
    measured: { count: 0, denominator: 10, percent: 0, ratio: null },
    threshold: { kind: 'MAX_PERCENT', value: 7 },
    detail: null,
    offenderCount: 0,
    offendersTruncated: false,
    offenders: [],
    ...overrides,
  };
}

function report(metrics: HealthMetricResult[]): ScheduleHealthReport {
  return {
    planId: 'p',
    planName: 'Plan',
    dataDate: '2026-01-01',
    computedAt: '2026-01-01T08:00:00.000Z',
    activityCount: 10,
    relationshipCount: 12,
    baseline: null,
    summary: { passed: 1, failed: 2, notAssessable: 3, informational: 1 },
    offenderCap: 50,
    advisories: [],
    metrics,
  };
}

describe('buildHealthRows', () => {
  it('formats each threshold kind from the payload value alone', () => {
    const rows = buildHealthRows(
      report([
        metric({ threshold: { kind: 'MAX_PERCENT', value: 7 } }),
        metric({ threshold: { kind: 'MAX_COUNT', value: 0 } }),
        metric({ threshold: { kind: 'MIN_PERCENT', value: 91 } }),
        metric({ threshold: { kind: 'MIN_RATIO', value: 0.97 } }),
        metric({ threshold: null }),
      ]),
    );
    expect(rows.map((r) => r.thresholdLabel)).toEqual(['≤ 7 %', '= 0', '≥ 91 %', '≥ 0.97', null]);
  });

  it('formats percent, count and ratio measurements by shape', () => {
    const rows = buildHealthRows(
      report([
        metric({ measured: { count: 3, denominator: 12, percent: 25, ratio: null } }),
        metric({ measured: { count: 4, denominator: null, percent: null, ratio: null } }),
        metric({ measured: { count: null, denominator: null, percent: null, ratio: 0.9312 } }),
        metric({ measured: null, verdict: 'NOT_ASSESSABLE', reason: 'EMPTY_PLAN' }),
      ]),
    );
    expect(rows.map((r) => r.measuredLabel)).toEqual(['3 of 12 (25 %)', '4', '0.9312', null]);
  });

  it('gives every NOT_ASSESSABLE reason a sentence, and only those rows a sentence', () => {
    const rows = buildHealthRows(
      report([
        metric({ verdict: 'NOT_ASSESSABLE', reason: 'PLAN_NOT_SCHEDULED', measured: null }),
        metric({ verdict: 'FAIL' }),
      ]),
    );
    expect(rows[0]!.reasonSentence).toContain('never been calculated');
    expect(rows[0]!.remedy).toBe('RECALCULATE');
    expect(rows[1]!.reasonSentence).toBeNull();
    expect(rows[1]!.remedy).toBeNull();
  });

  it('maps the baseline-shaped reasons to the baseline remedy', () => {
    const rows = buildHealthRows(
      report([
        metric({ verdict: 'NOT_ASSESSABLE', reason: 'NO_ACTIVE_BASELINE', measured: null }),
        metric({ verdict: 'NOT_ASSESSABLE', reason: 'NO_TARGET_FINISH', measured: null }),
        metric({ verdict: 'NOT_ASSESSABLE', reason: 'NOTHING_DUE', measured: null }),
      ]),
    );
    expect(rows.map((r) => r.remedy)).toEqual(['CAPTURE_BASELINE', 'CAPTURE_BASELINE', null]);
  });

  it('verdicts carry a word, never colour alone', () => {
    const rows = buildHealthRows(
      report([
        metric({ verdict: 'PASS' }),
        metric({ verdict: 'FAIL' }),
        metric({ verdict: 'NOT_ASSESSABLE', reason: 'EMPTY_PLAN', measured: null }),
        metric({ verdict: 'INFORMATIONAL', threshold: null }),
      ]),
    );
    expect(rows.map((r) => r.verdictLabel)).toEqual(['Pass', 'Fail', 'Not assessed', 'Info']);
  });

  /**
   * #206's sixth finding: the narrowing sentence was keyed on the metric id, so it printed the
   * scope that was true the day it was written whatever the payload said. These three pin the
   * relationship instead — the sentence is a function of `detail.narrowing`, and the first case
   * alone cannot prove that, because it passes equally against a hardcoded string.
   */
  function resourcesRow(detail: Record<string, unknown> | null): string | null {
    const rows = buildHealthRows(
      report([
        metric({
          id: 'RESOURCES',
          ordinal: 10,
          name: 'Resources',
          verdict: 'INFORMATIONAL',
          threshold: null,
          measured: { count: 6, denominator: 10, percent: 60, ratio: null },
          detail,
        }),
      ]),
    );
    return rows[0]?.caveatSentence ?? null;
  }

  it("names metric 10's narrowing from the payload's token", () => {
    expect(resourcesRow({ narrowing: 'RESOURCE_ASSIGNMENT_ONLY' })).toBe(
      'Reads resource-assignment existence only — not workload or over-allocation.',
    );
  });

  it('states that the scope is narrowed — and names the token — when the panel has no wording for it', () => {
    const sentence = resourcesRow({ narrowing: 'ASSIGNMENT_AND_UNITS' });
    expect(sentence).toContain('ASSIGNMENT_AND_UNITS');
    // The decisive half: it must NOT still be claiming the narrowing it was written against.
    expect(sentence).not.toContain('resource-assignment existence only');
  });

  it('claims no narrowing at all when the payload names none', () => {
    expect(resourcesRow(null)).toBeNull();
    expect(resourcesRow({})).toBeNull();
  });
});

describe('healthAnnouncement', () => {
  it('says the summary once, in words, leading with failures — ALL FOUR counts', () => {
    expect(healthAnnouncement(report([]))).toBe(
      'Health check: 2 failed, 1 passed, 3 not assessed, 1 informational.',
    );
  });

  it('states a zero rather than dropping the clause — the visible summary states all four, and a live region that silently drops one hands a screen-reader user a different report (M5 ux finding)', () => {
    const r = report([]);
    r.summary = { passed: 14, failed: 0, notAssessable: 0, informational: 0 };
    expect(healthAnnouncement(r)).toBe(
      'Health check: 0 failed, 14 passed, 0 not assessed, 0 informational.',
    );
  });
  // ADR-0162 D1: the advisory joins the ONE settled announcement, after the DCMA summary, so the live
  // region never tells a screen-reader user a different report from the one on screen (ADR-0116 M5).
  const withZero = (offenderCount: number): ScheduleHealthReport => ({
    ...report([]),
    advisories: [
      {
        id: 'ZERO_DURATION_TASKS',
        name: 'Zero-duration tasks',
        measured: { count: offenderCount, denominator: 10, percent: null, ratio: null },
        offenderCount,
        offendersTruncated: false,
        offenders: [],
        detail: { resourced: 0 },
      },
    ],
  });

  it('ends with the zero-duration advisory, counted from offenderCount', () => {
    expect(healthAnnouncement(withZero(3))).toBe(
      'Health check: 2 failed, 1 passed, 3 not assessed, 1 informational. Beyond the DCMA assessment: 3 zero-duration tasks.',
    );
  });

  it('says "1 zero-duration task" at one', () => {
    expect(healthAnnouncement(withZero(1))).toMatch(
      / Beyond the DCMA assessment: 1 zero-duration task\.$/,
    );
  });

  it('states a zero rather than dropping the clause', () => {
    expect(healthAnnouncement(withZero(0))).toMatch(
      / Beyond the DCMA assessment: no zero-duration tasks\.$/,
    );
  });

  it('appends nothing when the API predates `advisories` (spec E32)', () => {
    const { advisories: _dropped, ...legacy } = withZero(3);
    expect(healthAnnouncement(legacy as unknown as ScheduleHealthReport)).toBe(
      'Health check: 2 failed, 1 passed, 3 not assessed, 1 informational.',
    );
  });
});

describe('mergeCriticalPathResult (health M6)', () => {
  const cptResult = (verdict: 'PASS' | 'FAIL') =>
    metric({
      id: 'CRITICAL_PATH_TEST',
      ordinal: 12,
      name: 'Critical Path Test',
      verdict,
      reason: null,
      threshold: null,
      measured: {
        count: null,
        denominator: null,
        percent: null,
        ratio: verdict === 'PASS' ? 1 : 0,
      },
      detail: {
        injectedDays: 600,
        deltaDays: verdict === 'PASS' ? 600 : 0,
        toleranceDays: 5,
        perturbedActivityName: 'Groundworks',
      },
    });

  it('replaces row 12 and RECOUNTS the summary — merged rows and counts can never disagree', () => {
    const r = report([
      metric({ id: 'MISSING_LOGIC', ordinal: 1, verdict: 'FAIL' }),
      metric({
        id: 'CRITICAL_PATH_TEST',
        ordinal: 12,
        verdict: 'NOT_ASSESSABLE',
        reason: 'REQUIRES_WHAT_IF_ANALYSIS',
        measured: null,
        threshold: null,
      }),
    ]);
    r.summary = { passed: 0, failed: 1, notAssessable: 1, informational: 0 };
    const merged = mergeCriticalPathResult(r, cptResult('PASS'));
    expect(merged.metrics.find((m) => m.id === 'CRITICAL_PATH_TEST')?.verdict).toBe('PASS');
    expect(merged.summary).toEqual({ passed: 1, failed: 1, notAssessable: 0, informational: 0 });
    // No result = the identical report object semantics (nothing to merge).
    expect(mergeCriticalPathResult(r, null)).toBe(r);
  });

  it('the computed row carries a hand-checkable caveat sentence built ONLY from payload numbers', () => {
    const rows = buildHealthRows(report([cptResult('FAIL')]));
    const row = rows.find((r) => r.metric.id === 'CRITICAL_PATH_TEST');
    expect(row?.caveatSentence).toBe('Injected 600 d at Groundworks; completion moved 0 d.');
  });
});

describe('zeroDurationSummary (ADR-0162 D1)', () => {
  const advisory = (count: number, resourced: number, denominator: number | null = 40) => ({
    id: 'ZERO_DURATION_TASKS' as const,
    name: 'Zero-duration tasks',
    measured: { count, denominator, percent: null, ratio: null },
    offenderCount: count,
    offendersTruncated: false,
    offenders: [],
    detail: { resourced },
  });

  it('states the count, what it is out of, and the resourced figure', () => {
    expect(zeroDurationSummary(advisory(3, 1))).toBe(
      '3 zero-duration tasks out of 40 activities; 1 has resource assignments',
    );
    expect(zeroDurationSummary(advisory(3, 2))).toBe(
      '3 zero-duration tasks out of 40 activities; 2 have resource assignments',
    );
    expect(zeroDurationSummary(advisory(1, 0))).toBe(
      '1 zero-duration task out of 40 activities; none has resource assignments',
    );
  });

  it('reads "None" at zero rather than disappearing', () => {
    expect(zeroDurationSummary(advisory(0, 0))).toBe('None');
  });
});

describe('advisories read per id (redundant-link-advisory M1)', () => {
  const redundant = (
    count: number,
    detail: Partial<RedundantLinksAdvisory['detail']> = {},
    denominator: number | null = 12,
  ): RedundantLinksAdvisory => ({
    id: 'REDUNDANT_LINKS',
    name: 'Redundant links',
    measured: { count, denominator, percent: null, ratio: null },
    offenderCount: count,
    offendersTruncated: false,
    offenders: [],
    detail: { rule: 'DOMINATED_UNDER_ANY_DURATION', unjudged: 0, searchCapped: false, ...detail },
  });
  const zero = (count: number): ZeroDurationTasksAdvisory => ({
    id: 'ZERO_DURATION_TASKS',
    name: 'Zero-duration tasks',
    measured: { count, denominator: 10, percent: null, ratio: null },
    offenderCount: count,
    offendersTruncated: false,
    offenders: [],
    detail: { resourced: 0 },
  });
  const unknown = {
    ...zero(2),
    id: 'FUTURE_ADVISORY',
    name: 'Something newer',
    detail: { novel: true },
  } as unknown as HealthAdvisoryResult;

  it('summarises each id with its own figures', () => {
    expect(advisorySummary(redundant(4))).toBe('4 redundant links out of 12 relationships');
    expect(advisorySummary(redundant(1, {}, 1))).toBe('1 redundant link out of 1 relationship');
    expect(advisorySummary(redundant(0))).toBe('None');
    expect(advisorySummary(zero(3))).toBe(
      '3 zero-duration tasks out of 10 activities; none has resource assignments',
    );
  });

  it('an unknown id has no summary paragraph of its own: its name and count are already on the row', () => {
    expect(advisorySummary(unknown)).toBeNull();
    expect(advisoryCaveat(unknown)).toBeNull();
    expect(advisoryUnjudgedSentence(unknown)).toBeNull();
  });

  it('keys the caveat on the rule token, and names a token it does not know', () => {
    expect(advisoryCaveat(redundant(1))).toMatch(
      /^Each is already implied by other links in the plan/,
    );
    // True of a parallel-link witness too, where there is no chain.
    expect(advisoryCaveat(redundant(1))).not.toMatch(/chain/);
    expect(advisoryCaveat(redundant(1))).not.toMatch(/never drives/i);
    const novel = redundant(1, { rule: 'SOMETHING_ELSE' as never });
    expect(advisoryCaveat(novel)).toBe(
      'Judged by a rule this page does not describe — SOMETHING_ELSE.',
    );
    expect(advisoryCaveat(zero(1))).toBeNull();
  });

  it('states what could not be judged without naming a cause it cannot know', () => {
    expect(advisoryUnjudgedSentence(redundant(0))).toBeNull();
    expect(advisoryUnjudgedSentence(redundant(1, { unjudged: 1 }))).toBe(
      '1 link could not be judged (for example a link into started or pinned work, or to a level of effort).',
    );
    expect(advisoryUnjudgedSentence(redundant(1, { unjudged: 3 }))).toBe(
      '3 links could not be judged (for example a link into started or pinned work, or to a level of effort).',
    );
    // An unknown endpoint or a stored cycle is also in that count, so the cause is an example, never the claim.
    expect(advisoryUnjudgedSentence(redundant(1, { unjudged: 3 }))).not.toMatch(/were not checked/);
    expect(advisoryUnjudgedSentence(redundant(1, { unjudged: 7, searchCapped: true }))).toBe(
      'The check stopped early on a plan this size; 7 links could not be judged.',
    );
  });

  it('the announcement lists every advisory, at zero, one and many, and an unknown by name', () => {
    const withAds = (advisories: HealthAdvisoryResult[]): ScheduleHealthReport => ({
      ...report([]),
      advisories,
    });
    expect(healthAnnouncement(withAds([zero(0), redundant(4)]))).toMatch(
      / Beyond the DCMA assessment: no zero-duration tasks, 4 redundant links\.$/,
    );
    expect(healthAnnouncement(withAds([zero(1), redundant(1)]))).toMatch(
      / 1 zero-duration task, 1 redundant link\.$/,
    );
    expect(healthAnnouncement(withAds([zero(0), redundant(0)]))).toMatch(
      / no zero-duration tasks, no redundant links\.$/,
    );
    // "No redundant links" must not claim more than the check knew.
    expect(healthAnnouncement(withAds([zero(0), redundant(0, { unjudged: 3 })]))).toMatch(
      / no zero-duration tasks, no redundant links \(3 could not be judged\)\.$/,
    );
    expect(healthAnnouncement(withAds([zero(0), unknown]))).toMatch(
      / no zero-duration tasks, Something newer: 2\.$/,
    );
  });

  it('the footer is true of a finding about links', () => {
    expect(HEALTH_ADVISORY_FOOTER).not.toMatch(/durations/);
    expect(HEALTH_ADVISORY_FOOTER).toContain('not part of the DCMA assessment above');
  });
});

describe('what pressing an offender selects, said (a11y review 2026-10-17)', () => {
  const relationship = {
    kind: 'RELATIONSHIP' as const,
    id: 'l1',
    code: null,
    name: 'Survey → Permit',
    note: 'FS; already implied through Design',
    activityId: 'permit',
  };
  const activityOffender = {
    kind: 'ACTIVITY' as const,
    id: 'a1',
    code: 'A1',
    name: 'Loose end',
    note: 'no successor',
    activityId: 'a1',
  };

  it('names the activity that IS selected, and which end of the link it is', () => {
    expect(offenderAnnouncement(relationship)).toBe(
      'Permit selected in the plan, the later end of Survey → Permit.',
    );
    expect(offenderAnnouncement(relationship)).not.toMatch(/^Survey → Permit selected/);
  });

  it('keeps an activity offender’s sentence as it was', () => {
    expect(offenderAnnouncement(activityOffender)).toBe('Loose end selected in the plan.');
    expect(offenderJumpDescription(activityOffender)).toBeNull();
  });

  it('describes the button of a relationship by what it selects', () => {
    expect(offenderJumpDescription(relationship)).toBe(
      'Selects Permit in the plan, the later end of this link. A link itself cannot be selected.',
    );
  });

  it('takes the successor after the LAST arrow, and falls back if a label has none', () => {
    expect(offenderAnnouncement({ ...relationship, name: 'A → B → C' })).toMatch(/^C selected/);
    expect(offenderAnnouncement({ ...relationship, name: 'unknown' })).toBe(
      'unknown selected in the plan.',
    );
  });
});
