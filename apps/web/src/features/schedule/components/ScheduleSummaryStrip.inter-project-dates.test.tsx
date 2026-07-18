import type { PlanScheduleSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduleSummaryStrip } from './ScheduleSummaryStrip';

import { apiFetch } from '@/lib/api/client';

/**
 * The externally-driven count chip (`externalDrivenCount`, ADR-0043) with `VITE_INTER_PROJECT_DATES`
 * forced ON — the surface ships dark by default, so this suite pins the flag to prove the chip shows
 * once a recalc had external bounds drive activities, and stays hidden when the count is zero. The
 * flag-off behaviour is covered by `ScheduleSummaryStrip.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  INTER_PROJECT_DATES_ENABLED: true,
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

describe('ScheduleSummaryStrip — externally-driven count (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows the externally-driven chip and AT hint when the count is above zero', async () => {
    // criticalCount/nearCriticalCount pushed off 3 so the chip is the only cell reading "3".
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ criticalCount: 9, nearCriticalCount: 0, externalDrivenCount: 3 }),
    );
    renderStrip();
    await waitFor(() => expect(screen.getByText('Externally driven')).toBeInTheDocument());
    expect(screen.getByText('3')).toHaveAttribute('aria-describedby', 'external-driven-hint');
  });

  it('hides the externally-driven chip when the count is zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary());
    renderStrip();
    await waitFor(() => expect(screen.getByText('Project finish')).toBeInTheDocument());
    expect(screen.queryByText('Externally driven')).not.toBeInTheDocument();
  });
});
