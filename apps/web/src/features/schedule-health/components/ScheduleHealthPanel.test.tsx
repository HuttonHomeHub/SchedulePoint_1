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

  it('error state is the shared NoticeStrip with role="alert", matching the Float-paths dock', () => {
    // A bespoke role="status" div was the M5 ux/component finding: the sibling dock renders the
    // same failure through NoticeStrip as an alert, and two near-identical panels must not
    // report one kind of failure two ways.
    const props = renderPanel({ report: null, isPending: false, isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('The health check could not be read.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('states its own provenance on screen — computed-at, scheduling mode and baseline', () => {
    // The spec's D9: computedAt is on the face of EVERY rendering, screen and paper. The M5 ux
    // review found the printout more honest than the live panel.
    renderPanel({
      report: fullReport({
        schedulingMode: 'VISUAL',
        baseline: { id: 'b1', name: 'BL-June', capturedAt: '2026-06-01T00:00:00.000Z' },
      }),
    });
    const provenance = screen.getByText(/Calculated 2026-01-01/);
    expect(provenance).toHaveTextContent('data date 2026-01-01');
    expect(provenance).toHaveTextContent('Visual scheduling');
    expect(provenance).toHaveTextContent('baseline: BL-June');
  });

  it('a NOT_ASSESSABLE row without the capability explains the ROLE route, never silence (ADR-0082)', () => {
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
    // Without onRecalculate: the reason sentence AND the role sentence, no button — a Viewer must
    // be able to tell "nobody has recalculated" from "I am not allowed to" (M5 ux finding).
    renderPanel({ report: rows });
    expect(
      screen.getByText('The plan has never been calculated, so there is no schedule to judge.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Recalculating needs a role that can edit the schedule — ask a Planner.'),
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
    // All FOUR counts, always — the visible summary states all four, and a live region that
    // silently drops one hands a screen-reader user a different report (M5 ux finding).
    expect(announce).toHaveBeenCalledWith(
      'Health check: 1 failed, 12 passed, 1 not assessed, 0 informational.',
    );
  });

  it('Escape closes the dock without reaching the workspace handlers', () => {
    const props = renderPanel();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Health check' }), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('says why offenders may render dimmed when a lens filter is on — and does not when off', () => {
    const rows = fullReport();
    rows.metrics[0] = metric({
      verdict: 'FAIL',
      measured: { count: 1, denominator: 10, percent: 10, ratio: null },
      offenderCount: 1,
      offenders: [
        {
          kind: 'ACTIVITY',
          id: 'a1',
          code: null,
          name: 'Task 1',
          note: 'no predecessor',
          activityId: 'a1',
        },
      ],
    });
    renderPanel({ report: rows, filterActive: true });
    // Panel-level, ONCE — not repeated verbatim under every expanded row (M5 ux finding). The
    // jump deliberately does NOT clear the lens; the sentence says why a bar may look dimmed.
    expect(screen.getAllByText('A filter is on — some offenders will appear dimmed.')).toHaveLength(
      1,
    );
  });

  it('links each disclosure to its measured/threshold sentence via aria-describedby', () => {
    // The spec's own a11y requirement: threshold and measurement ride the accessible name OR a
    // describedby sibling — a Tab-sweeping screen-reader user otherwise hears only "name,
    // verdict" (M5 accessibility blocker B1; WCAG 1.3.1/4.1.2).
    const rows = fullReport();
    rows.metrics[0] = metric({
      verdict: 'FAIL',
      measured: { count: 4, denominator: 10, percent: 40, ratio: null },
      offenderCount: 1,
      offenders: [
        {
          kind: 'ACTIVITY',
          id: 'a1',
          code: null,
          name: 'T1',
          note: 'no predecessor',
          activityId: 'a1',
        },
      ],
    });
    renderPanel({ report: rows });
    const button = screen.getByRole('button', { name: /missing logic/i });
    expect(button).toHaveAccessibleDescription('4 of 10 (40 %) · judged against ≤ 7 %');
  });

  it('metric 10 carries its narrowing caveat on screen, not only on paper', () => {
    const rows = fullReport();
    rows.metrics[9] = metric({
      id: 'RESOURCES',
      ordinal: 10,
      name: 'Resources',
      verdict: 'INFORMATIONAL',
      threshold: null,
      measured: { count: 6, denominator: 10, percent: 60, ratio: null },
      detail: { narrowing: 'RESOURCE_ASSIGNMENT_ONLY' },
    });
    renderPanel({ report: rows });
    expect(
      screen.getByText(
        'Reads resource-assignment existence only — not workload or over-allocation.',
      ),
    ).toBeInTheDocument();
  });

  it('withholds the Print action until a report exists — no lit-but-inert button', () => {
    renderPanel({ report: null, isPending: true });
    expect(screen.queryByRole('button', { name: 'Print report' })).not.toBeInTheDocument();
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

  it('has no axe violations in the states a real plan produces — mixed verdicts, a row expanded, a remedy offered', async () => {
    // The all-PASS fixture exercises only the non-interactive branch; a defect would live in the
    // disclosure button, the expanded offender list, the reason/remedy block or the fail/muted
    // tones — none of which the first scan ever rendered (M5 accessibility blocker B2).
    const rows = fullReport();
    rows.metrics[0] = metric({
      verdict: 'FAIL',
      measured: { count: 4, denominator: 10, percent: 40, ratio: null },
      offenderCount: 60,
      offendersTruncated: true,
      offenders: [
        {
          kind: 'ACTIVITY',
          id: 'a1',
          code: 'A1',
          name: 'T1',
          note: 'no predecessor',
          activityId: 'a1',
        },
      ],
    });
    rows.metrics[5] = metric({
      id: 'HIGH_FLOAT',
      ordinal: 6,
      name: 'High float',
      verdict: 'NOT_ASSESSABLE',
      reason: 'PLAN_NOT_SCHEDULED',
      measured: null,
      detail: null,
    });
    rows.metrics[9] = metric({
      id: 'RESOURCES',
      ordinal: 10,
      name: 'Resources',
      verdict: 'INFORMATIONAL',
      threshold: null,
      measured: { count: 6, denominator: 10, percent: 60, ratio: null },
      detail: { narrowing: 'RESOURCE_ASSIGNMENT_ONLY' },
    });
    const { container } = render(
      <ScheduleHealthPanel
        report={fullReport({
          metrics: rows.metrics,
          summary: { passed: 11, failed: 1, notAssessable: 1, informational: 1 },
        })}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onRecalculate={vi.fn()}
        onActivateActivity={vi.fn()}
        filterActive
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /missing logic/i, expanded: false }));
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations in the error state', async () => {
    const { container } = render(
      <ScheduleHealthPanel
        report={null}
        isPending={false}
        isError
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

  it('row 12 offers Run critical path test when the host supplies the seam, and fires it', () => {
    const run = vi.fn();
    renderPanel({
      criticalPathTest: { run, isPending: false, isError: false, result: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run critical path test' }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('the running state keeps the button in the tree (never native disabled) and guards the press', () => {
    const run = vi.fn();
    renderPanel({
      criticalPathTest: { run, isPending: true, isError: false, result: null },
    });
    const button = screen.getByRole('button', { name: 'Running…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it('a settled result merges over row 12, recounts the summary and announces the verdict once', () => {
    announce.mockClear();
    const result = metric({
      id: 'CRITICAL_PATH_TEST',
      ordinal: 12,
      name: 'critical path test',
      verdict: 'PASS',
      reason: null,
      threshold: null,
      measured: { count: null, denominator: null, percent: null, ratio: 1 },
      detail: {
        injectedDays: 600,
        deltaDays: 600,
        toleranceDays: 5,
        perturbedActivityName: 'Piling',
      },
    });
    const props: ScheduleHealthPanelProps = {
      report: fullReport({
        summary: { passed: 13, failed: 0, notAssessable: 1, informational: 0 },
      }),
      isPending: false,
      isError: false,
      onRetry: vi.fn(),
      onClose: vi.fn(),
      onActivateActivity: vi.fn(),
      criticalPathTest: { run: vi.fn(), isPending: false, isError: false, result },
    };
    const { rerender } = render(<ScheduleHealthPanel {...props} />);
    rerender(<ScheduleHealthPanel {...props} />);
    // The visible summary recounts from the MERGED rows (all 14 fixture rows are PASS + the
    // merged PASS = 14 passed) — merged rows and counts can never disagree.
    expect(screen.getByText(/14 passed/)).toBeInTheDocument();
    // The hand-checkable caveat renders from payload numbers alone.
    expect(
      screen.getByText('Injected 600 d at Piling; completion moved 600 d.'),
    ).toBeInTheDocument();
    // Spoken once, not per render.
    const spoken = announce.mock.calls.filter(([m]) => String(m).startsWith('Critical path test'));
    expect(spoken).toEqual([
      ['Critical path test passed — the completion moved with the injection.'],
    ]);
  });
});
