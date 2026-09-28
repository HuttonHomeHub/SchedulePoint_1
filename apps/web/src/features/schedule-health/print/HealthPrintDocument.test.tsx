import type { HealthAdvisoryResult, HealthMetricResult, ScheduleHealthReport } from '@repo/types';
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

/** ADR-0162 D1's one advisory, with `count` offenders of whom `resourced` hold an assignment. */
function zeroAdvisory(count: number, resourced = 0): HealthAdvisoryResult {
  return {
    id: 'ZERO_DURATION_TASKS',
    name: 'Zero-duration tasks',
    measured: { count, denominator: 10, percent: count * 10, ratio: null },
    offenderCount: count,
    offendersTruncated: false,
    offenders: Array.from({ length: count }, (_, i) => ({
      kind: 'ACTIVITY' as const,
      id: `z${i}`,
      code: `Z${i}`,
      name: `Handover ${i}`,
      note: i < resourced ? '1 resource assignment' : 'no resource assignment',
      activityId: `z${i}`,
    })),
    detail: { resourced },
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
    activityCount: 10,
    relationshipCount: 12,
    baseline: null,
    summary: { passed: 12, failed: 1, notAssessable: 1, informational: 0 },
    offenderCap: 50,
    advisories: [],
    metrics: METRIC_IDS.map((id, i) =>
      metric({ id, ordinal: i + 1, name: id.toLowerCase().replaceAll('_', ' ') }),
    ),
    ...overrides,
  };
}

describe('ScheduleHealthPrintDocument (health M4)', () => {
  it('carries the same scope notes the panel shows — derived, never restated', () => {
    const metrics = report().metrics.map((m) =>
      m.id === 'RESOURCES'
        ? metric({
            id: 'RESOURCES',
            ordinal: 10,
            name: 'Resources',
            verdict: 'INFORMATIONAL',
            threshold: null,
            measured: { count: 6, denominator: 10, percent: 60, ratio: null },
            detail: { narrowing: 'RESOURCE_ASSIGNMENT_ONLY' },
          })
        : m,
    );
    const { container } = render(<ScheduleHealthPrintDocument report={report({ metrics })} />);
    expect(container.textContent).toContain('Scope notes');
    expect(container.textContent).toContain(
      'Reads resource-assignment existence only — not workload or over-allocation.',
    );
  });

  it('prints no Scope notes heading when no row carries one — an empty section is a claim of its own', () => {
    const { container } = render(<ScheduleHealthPrintDocument report={report()} />);
    expect(container.textContent).not.toContain('Scope notes');
  });

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

  describe('Beyond the DCMA assessment (ADR-0162 D1)', () => {
    it('prints after the fourteen rows, with its footer and offender list, outside the table', () => {
      const { container } = render(
        <ScheduleHealthPrintDocument report={report({ advisories: [zeroAdvisory(3, 1)] })} />,
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(14);
      const text = container.textContent ?? '';
      expect(text).toContain('Beyond the DCMA assessment');
      expect(text).toContain(
        'Zero-duration tasks: 3 zero-duration tasks out of 10 activities; 1 has resource assignments',
      );
      expect(text).toContain('Zero-duration tasks — 3 findings');
      expect(text).toContain('Z0 Handover 0 — 1 resource assignment');
      expect(text).toContain(
        'Found from stored durations, whether or not the plan has been calculated, and not part of the DCMA assessment above.',
      );
      const table = container.querySelector('table');
      const heading = [...container.querySelectorAll('h2')].find(
        (h) => h.textContent === 'Beyond the DCMA assessment',
      );
      expect(heading).toBeDefined();
      expect(table?.contains(heading ?? null)).toBe(false);
      expect(
        table!.compareDocumentPosition(heading!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('states the cap on paper exactly as the metrics do (spec E33)', () => {
      const a = { ...zeroAdvisory(50), offenderCount: 120, offendersTruncated: true };
      const { container } = render(
        <ScheduleHealthPrintDocument report={report({ advisories: [a] })} />,
      );
      expect(container.textContent).toContain(
        'Showing the first 50 of 120 — open the plan for the full list.',
      );
    });

    it('prints "None" at zero, and no section at all for an API that predates the field', () => {
      const zero = render(
        <ScheduleHealthPrintDocument report={report({ advisories: [zeroAdvisory(0)] })} />,
      );
      expect(zero.container.textContent).toContain('Zero-duration tasks: None');
      zero.unmount();
      const { advisories: _dropped, ...legacy } = report();
      const { container } = render(
        <ScheduleHealthPrintDocument report={legacy as unknown as ScheduleHealthReport} />,
      );
      expect(container.textContent).not.toContain('Beyond the DCMA assessment');
    });

    it("the print document's lists carry explicit roles (ADR-0122)", () => {
      const r = report({ advisories: [zeroAdvisory(1)] });
      r.metrics[13] = metric({
        id: 'BEI',
        ordinal: 14,
        name: 'Baseline Execution Index',
        verdict: 'NOT_ASSESSABLE',
        reason: 'NO_ACTIVE_BASELINE',
        measured: null,
      });
      // A scope note too, so every list the document can print is present (an absent list passes).
      r.metrics[9] = metric({
        id: 'RESOURCES',
        ordinal: 10,
        name: 'Resources',
        verdict: 'INFORMATIONAL',
        threshold: null,
        detail: { narrowing: 'RESOURCE_ASSIGNMENT_ONLY' },
      });
      const { container } = render(<ScheduleHealthPrintDocument report={r} />);
      expect(container.textContent).toContain('Scope notes');
      expect(container.textContent).toContain('Not assessed, and why');
      for (const ul of container.querySelectorAll('ul')) {
        expect(ul.getAttribute('role')).toBe('list');
        for (const li of ul.querySelectorAll(':scope > li')) {
          expect(li.getAttribute('role')).toBe('listitem');
        }
      }
      expect(container.querySelectorAll('ul').length).toBeGreaterThanOrEqual(4);
    });
  });
});
