import type { PlanScheduleSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduleSummaryStrip } from './ScheduleSummaryStrip';

import { apiFetch } from '@/lib/api/client';

/**
 * The levelled-overlay figures (ADR-0041) with `VITE_RESOURCE_LEVELLING` forced ON — the surface ships
 * dark by default, so this suite pins the flag to prove the levelled finish + counts show once the plan
 * has levelled, and stay hidden when it hasn't. The flag-off / never-levelled behaviour is covered by
 * `ScheduleSummaryStrip.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RESOURCE_LEVELLING_ENABLED: true,
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

describe('ScheduleSummaryStrip — levelled overlay (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows the levelled finish and delayed count once the plan has levelled', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ leveledProjectFinish: '2026-01-20', leveledActivityCount: 2 }),
    );
    renderStrip();
    await waitFor(() => expect(screen.getByText('Levelled finish')).toBeInTheDocument());
    expect(screen.getByText('20 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('Levelled activities')).toBeInTheDocument();
    expect(screen.getByText(/Levelling delayed 2 activities/)).toBeInTheDocument();
  });

  it('surfaces the window-exceeded and over-capacity figures with AT hints when non-zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      // criticalCount/nearCriticalCount pushed off 1 and 2 so the two levelled figures are the only
      // cells reading "1" and "2" (the strip's other counts must not collide with the asserted values).
      summary({
        criticalCount: 9,
        nearCriticalCount: 0,
        leveledProjectFinish: '2026-01-20',
        leveledActivityCount: 3,
        levelingWindowExceededCount: 1,
        selfOverAllocatedCount: 2,
      }),
    );
    renderStrip();
    await waitFor(() => expect(screen.getByText('Window exceeded')).toBeInTheDocument());
    expect(screen.getByText('1')).toHaveAttribute('aria-describedby', 'leveling-window-hint');
    expect(screen.getByText('2')).toHaveAttribute('aria-describedby', 'leveling-self-over-hint');
  });

  it('hides the overlay when the plan has not levelled (levelled finish null)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary());
    renderStrip();
    await waitFor(() => expect(screen.getByText('Project finish')).toBeInTheDocument());
    expect(screen.queryByText('Levelled finish')).not.toBeInTheDocument();
    expect(screen.queryByText('Levelled activities')).not.toBeInTheDocument();
  });
});
