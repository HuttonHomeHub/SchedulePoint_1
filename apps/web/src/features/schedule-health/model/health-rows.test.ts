import type { HealthMetricResult, ScheduleHealthReport } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { buildHealthRows, healthAnnouncement, mergeCriticalPathResult } from './health-rows';

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
    schedulingMode: 'EARLY',
    activityCount: 10,
    relationshipCount: 12,
    baseline: null,
    summary: { passed: 1, failed: 2, notAssessable: 3, informational: 1 },
    offenderCap: 50,
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
