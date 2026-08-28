import type { HealthMetricResult, ScheduleHealthReport } from '@repo/types';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScheduleHealthPrintDocument } from './HealthPrintDocument';

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

const METRIC_IDS = [
  'MISSING_LOGIC',
  'LEADS',
  'LAGS',
  'RELATIONSHIP_TYPES',
  'HARD_CONSTRAINTS',
  'HIGH_FLOAT',
  'NEGATIVE_FLOAT',
  'HIGH_DURATION',
  'INVALID_DATES',
  'RESOURCES',
  'MISSED_ACTIVITIES',
  'CRITICAL_PATH_TEST',
  'CPLI',
  'BEI',
] as const;

function report(overrides: Partial<ScheduleHealthReport> = {}): ScheduleHealthReport {
  return {
    planId: 'p',
    planName: 'Riverside programme',
    dataDate: '2026-01-05',
    computedAt: '2026-01-05T08:00:00.000Z',
    schedulingMode: 'EARLY',
    activityCount: 10,
    relationshipCount: 12,
    baseline: null,
    summary: { passed: 12, failed: 1, notAssessable: 1, informational: 0 },
    offenderCap: 50,
    metrics: METRIC_IDS.map((id, i) =>
      metric({ id, ordinal: i + 1, name: id.toLowerCase().replaceAll('_', ' ') }),
    ),
    ...overrides,
  };
}

describe('ScheduleHealthPrintDocument (health M4)', () => {
  it('prints all fourteen rows — never a scroll position', () => {
    const { container } = render(<ScheduleHealthPrintDocument report={report()} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(14);
  });

  it('never lets a reason CODE reach paper — sentences only', () => {
    const r = report();
    r.metrics[13] = metric({
      id: 'BEI',
      ordinal: 14,
      name: 'Baseline Execution Index',
      verdict: 'NOT_ASSESSABLE',
      reason: 'NO_ACTIVE_BASELINE',
      measured: null,
      detail: null,
    });
    const { container } = render(<ScheduleHealthPrintDocument report={r} />);
    const text = container.textContent ?? '';
    // The defect the plan names: a code reaching paper. Grep the printed tree for every reason
    // literal shape (SCREAMING_SNAKE longer than one word).
    expect(text).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
    expect(text).toContain('No active baseline exists to compare against.');
  });

  it('prints each failing metric’s offender list, and a truncated one says so with the payload cap', () => {
    const r = report();
    r.metrics[0] = metric({
      verdict: 'FAIL',
      measured: { count: 60, denominator: 100, percent: 60, ratio: null },
      offenderCount: 412,
      offendersTruncated: true,
      offenders: Array.from({ length: 50 }, (_, i) => ({
        kind: 'ACTIVITY' as const,
        id: `a${i}`,
        code: `A${i}`,
        name: `Task ${i}`,
        note: 'no predecessor',
        activityId: `a${i}`,
      })),
    });
    const { container } = render(<ScheduleHealthPrintDocument report={r} />);
    const text = container.textContent ?? '';
    // ADR-0100's rule, and it matters more here: paper has no "load more", so a list that simply
    // stops at the cap is indistinguishable from a complete one.
    expect(text).toContain('Showing the first 50 of 412 — open the plan for the full list.');
    expect(text).toContain('A0 Task 0 — no predecessor');
  });

  it('the header carries the plan identity and the footer the narrowing + conflict explainer', () => {
    const { container } = render(<ScheduleHealthPrintDocument report={report()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Riverside programme');
    expect(text).toContain('data date 2026-01-05');
    expect(text).toContain('baseline: none');
    expect(text).toContain('resource-assignment existence only');
    expect(text).toContain('separate from the issues a recalculation finds');
  });
});
