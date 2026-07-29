import type { PlanScheduleSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduleSummaryStrip } from './ScheduleSummaryStrip';

import { apiFetch } from '@/lib/api/client';

/**
 * The missing-driver count chip (`resourceDriverMissingCount`, ADR-0035 §23) with
 * `VITE_ADVANCED_ACTIVITY_TYPES` forced ON — the plan-level companion to the row badge.
 *
 * The count has been in `PlanScheduleSummary` and returned by the API since M7.2 without a single
 * consumer, so a plan could carry resource-dependent activities scheduled on the wrong calendar and
 * report nothing anywhere. Zero stays hidden, matching every other engine-count chip: a permanent
 * "0" trains people to ignore the row.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_ACTIVITY_TYPES_ENABLED: true,
}));

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

describe('ScheduleSummaryStrip — missing-driver count (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows the missing-driver chip and its hint when the count is above zero', async () => {
    // criticalCount/nearCriticalCount moved off 2 so the chip is the only cell reading "2".
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ criticalCount: 9, nearCriticalCount: 0, resourceDriverMissingCount: 2 }),
    );
    renderStrip();

    await waitFor(() => expect(screen.getByText('Missing a driver')).toBeInTheDocument());
    expect(screen.getByText('2')).toHaveAttribute(
      'aria-describedby',
      'resource-driver-missing-hint',
    );
    // The hint has to say what happened to the dates, not merely that something is missing.
    expect(screen.getByText(/scheduled on their own or the plan’s calendar/i)).toBeInTheDocument();
  });

  it('hides the chip when no activity is missing a driver', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary());
    renderStrip();

    await waitFor(() => expect(screen.getByText('Project finish')).toBeInTheDocument());
    expect(screen.queryByText('Missing a driver')).not.toBeInTheDocument();
  });
});
