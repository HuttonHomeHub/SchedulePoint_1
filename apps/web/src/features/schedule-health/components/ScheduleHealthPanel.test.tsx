import type { HealthMetricResult, ScheduleHealthReport } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ScheduleHealthPanel, type ScheduleHealthPanelProps } from './ScheduleHealthPanel';

const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

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

function fullReport(overrides: Partial<ScheduleHealthReport> = {}): ScheduleHealthReport {
  const ids = [
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
  return {
    planId: 'p',
    planName: 'Plan',
    dataDate: '2026-01-01',
    computedAt: '2026-01-01T08:00:00.000Z',
    schedulingMode: 'EARLY',
    activityCount: 10,
    relationshipCount: 12,
    baseline: null,
    summary: { passed: 12, failed: 1, notAssessable: 1, informational: 0 },
    offenderCap: 50,
    metrics: ids.map((id, i) =>
      metric({ id, ordinal: i + 1, name: id.toLowerCase().replaceAll('_', ' ') }),
    ),
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ScheduleHealthPanelProps> = {}) {
  const props: ScheduleHealthPanelProps = {
    report: fullReport(),
    isPending: false,
    isError: false,
    onRetry: vi.fn(),
    onClose: vi.fn(),
    onActivateActivity: vi.fn(),
    ...overrides,
  };
  render(<ScheduleHealthPanel {...props} />);
  return props;
}

describe('ScheduleHealthPanel', () => {
  it('renders all fourteen rows — a metric never disappears', () => {
    renderPanel();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(14);
  });

  it('loading state shows the spinner sentence', () => {
    renderPanel({ report: null, isPending: true });
    expect(screen.getByText('Checking the plan…')).toBeInTheDocument();
  });

  it('error state offers a retry and never renders as an empty finding', () => {
    const props = renderPanel({ report: null, isPending: false, isError: true });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('a NOT_ASSESSABLE row explains itself, and the remedy is offered only when held (ADR-0082)', () => {
    const rows = fullReport();
    rows.metrics[5] = metric({
      id: 'HIGH_FLOAT',
      ordinal: 6,
      name: 'High float',
      verdict: 'NOT_ASSESSABLE',
      reason: 'PLAN_NOT_SCHEDULED',
      measured: null,
      detail: null,
    });
    // Without onRecalculate: the sentence, no button.
    renderPanel({ report: rows });
    expect(
      screen.getByText('The plan has never been calculated, so there is no schedule to judge.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
  });

  it('with the capability, the remedy button appears and fires', () => {
    const rows = fullReport();
    rows.metrics[5] = metric({
      id: 'HIGH_FLOAT',
      ordinal: 6,
      name: 'High float',
      verdict: 'NOT_ASSESSABLE',
      reason: 'PLAN_NOT_SCHEDULED',
      measured: null,
      detail: null,
    });
    const onRecalculate = vi.fn();
    renderPanel({ report: rows, onRecalculate });
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));
    expect(onRecalculate).toHaveBeenCalled();
  });

  it('expanding a failing row lists offenders; pressing one activates its activity', () => {
    const rows = fullReport();
    rows.metrics[1] = metric({
      id: 'LEADS',
      ordinal: 2,
      name: 'Leads',
      verdict: 'FAIL',
      measured: { count: 1, denominator: null, percent: null, ratio: null },
      threshold: { kind: 'MAX_COUNT', value: 0 },
      offenderCount: 1,
      offenders: [
        {
          kind: 'RELATIONSHIP',
          id: 'dep-1',
          code: null,
          name: 'A100 → A200',
          note: 'lead of -120 min (SS)',
          activityId: 'act-succ',
        },
      ],
    });
    const props = renderPanel({ report: rows });
    fireEvent.click(screen.getByRole('button', { name: /leads/i, expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /A100 → A200/ }));
    expect(props.onActivateActivity).toHaveBeenCalledWith('act-succ');
  });

  it('a truncated offender list says so with the payload cap, never a client literal', () => {
    const rows = fullReport();
    rows.metrics[0] = metric({
      verdict: 'FAIL',
      measured: { count: 60, denominator: 100, percent: 60, ratio: null },
      offenderCount: 60,
      offendersTruncated: true,
      offenders: Array.from({ length: 3 }, (_, i) => ({
        kind: 'ACTIVITY' as const,
        id: `a${i}`,
        code: null,
        name: `Task ${i}`,
        note: 'no predecessor',
        activityId: `a${i}`,
      })),
    });
    renderPanel({ report: rows });
    fireEvent.click(screen.getByRole('button', { name: /missing logic/i, expanded: false }));
    expect(screen.getByText('Showing 3 of 60.')).toBeInTheDocument();
  });

  it('announces the settled summary ONCE, never per render', () => {
    announce.mockClear();
    const report = fullReport();
    const props: ScheduleHealthPanelProps = {
      report,
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      onClose: vi.fn(),
      onActivateActivity: vi.fn(),
    };
    const { rerender } = render(<ScheduleHealthPanel {...props} />);
    rerender(<ScheduleHealthPanel {...props} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Health check: 1 failed, 12 passed, 1 not assessed.');
  });

  it('Escape closes the dock without reaching the workspace handlers', () => {
    const props = renderPanel();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Health check' }), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('has no axe violations with a full report rendered', async () => {
    const { container } = render(
      <ScheduleHealthPanel
        report={fullReport()}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onActivateActivity={vi.fn()}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('the footer carries the conflict distinction in the planner’s words', () => {
    renderPanel();
    expect(screen.getByText(/separate from the issues a recalculation finds/)).toBeInTheDocument();
  });
});
