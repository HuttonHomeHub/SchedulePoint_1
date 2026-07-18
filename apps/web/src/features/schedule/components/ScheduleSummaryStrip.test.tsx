import type { PlanScheduleSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduleSummaryStrip } from './ScheduleSummaryStrip';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

function renderStrip() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScheduleSummaryStrip orgSlug="acme" planId="pl1" />
    </QueryClientProvider>,
  );
}

const summary = (overrides: Partial<PlanScheduleSummary> = {}): PlanScheduleSummary => ({
  dataDate: '2026-01-01',
  projectFinish: '2026-01-13',
  activityCount: 5,
  criticalCount: 4,
  nearCriticalCount: 1,
  constraintViolationCount: 0,
  constraintWarningCount: 0,
  loeNoSpanCount: 0,
  resourceDriverMissingCount: 0,
  leveledActivityCount: 0,
  levelingWindowExceededCount: 0,
  selfOverAllocatedCount: 0,
  leveledProjectFinish: null,
  externalDrivenCount: 0,
  ...overrides,
});

describe('ScheduleSummaryStrip', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows the computed figures once loaded', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary());
    renderStrip();
    await waitFor(() => expect(screen.getByText('13 Jan 2026')).toBeInTheDocument());
    expect(screen.getByText('01 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('Data date')).toBeInTheDocument();
    expect(screen.getByText('Project finish')).toBeInTheDocument();
  });

  it('shows the constraint-conflicts figure with an explanation wired for AT when non-zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary({ constraintViolationCount: 2 }));
    renderStrip();
    await waitFor(() => expect(screen.getByText('Constraint conflicts')).toBeInTheDocument());
    const note = screen.getByText(/a mandatory constraint forces a date earlier than/i);
    // The figure's value is described by the explanatory note (the id link is real, not a typo).
    expect(note).toHaveAttribute('id', 'constraint-violations-hint');
    expect(screen.getByText('2')).toHaveAttribute('aria-describedby', 'constraint-violations-hint');
  });

  it('shows the constraint-warnings figure with an explanation wired for AT when non-zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary({ constraintWarningCount: 3 }));
    renderStrip();
    await waitFor(() => expect(screen.getByText('Constraint warnings')).toBeInTheDocument());
    const note = screen.getByText(/Start-no-earlier-than constraints — or external early starts/i);
    expect(note).toHaveAttribute('id', 'constraint-warnings-hint');
    expect(screen.getByText('3')).toHaveAttribute('aria-describedby', 'constraint-warnings-hint');
  });

  it('omits the constraint figures and notes when zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ constraintViolationCount: 0, constraintWarningCount: 0 }),
    );
    renderStrip();
    await waitFor(() => expect(screen.getByText('Critical')).toBeInTheDocument());
    expect(screen.queryByText('Constraint conflicts')).not.toBeInTheDocument();
    expect(screen.queryByText('Constraint warnings')).not.toBeInTheDocument();
    expect(screen.queryByText(/forces a date earlier than/i)).not.toBeInTheDocument();
  });

  it('shows a "not yet calculated" state with the data date when never computed', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary({ projectFinish: null }));
    renderStrip();
    await waitFor(() =>
      expect(screen.getByText(/Schedule not yet calculated/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Data date 01 Jan 2026/)).toBeInTheDocument();
  });

  it('prompts to set a start date when the plan has none', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ dataDate: null, projectFinish: null, activityCount: 0, criticalCount: 0 }),
    );
    renderStrip();
    await waitFor(() => expect(screen.getByText(/Set the plan’s start date/)).toBeInTheDocument());
  });

  it('surfaces a load error', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    renderStrip();
    await waitFor(() =>
      expect(screen.getByText(/Couldn’t load the schedule summary/)).toBeInTheDocument(),
    );
  });
});
