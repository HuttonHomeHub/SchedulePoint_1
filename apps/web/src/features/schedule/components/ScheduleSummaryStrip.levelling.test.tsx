import type { PlanScheduleSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduleSummaryStrip } from './ScheduleSummaryStrip';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

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

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchAllPages: vi.fn() }));

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
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([]);
  });

  it('shows the levelled finish and delayed count once the plan has levelled', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ leveledProjectFinish: '2026-01-20', leveledActivityCount: 2 }),
    );
    renderStrip();
    await waitFor(() => expect(screen.getByText('Levelled finish')).toBeInTheDocument());
    expect(screen.getByText('20 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('Levelled activities')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Levelling moved 2 activities, either to keep resource demand within capacity or because the work before them moved\. The levelled finish is when the plan finishes once levelled\./,
      ),
    ).toBeInTheDocument();
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

  it('measures the window-exceeded float from where the bars are drawn (#413)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({
        leveledProjectFinish: '2026-01-20',
        leveledActivityCount: 1,
        levelingWindowExceededCount: 1,
      }),
    );
    renderStrip();
    const hint = await screen.findByText(/Window exceeded counts/);
    expect(hint).toHaveTextContent('past the float left from where their bars are drawn');
    expect(hint).not.toHaveTextContent('total float');
  });

  it('hides the overlay when the plan has not levelled (levelled finish null)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(summary());
    renderStrip();
    await waitFor(() => expect(screen.getByText('Project finish')).toBeInTheDocument());
    expect(screen.queryByText('Levelled finish')).not.toBeInTheDocument();
    expect(screen.queryByText('Levelled activities')).not.toBeInTheDocument();
  });
  // The M0 case (docs/specs/apply-levelled-dates/m0-measurement.md): a 4-hour lift then a 1-day lift on
  // one crane, Monday-Friday 08:00-16:00. The engine counts the second lift (240 minutes) and its
  // levelled start equals its drawn start, so the lens draws no ghost for it.
  const partDayActivity = {
    id: 'y',
    laneIndex: 1,
    type: 'TASK',
    visualEffectiveStart: '2026-01-05',
    leveledStart: '2026-01-05',
    leveledFinish: '2026-01-05',
  };

  it('says how many levelled activities moved by under a day and have no ghost', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ leveledProjectFinish: '2026-01-20', leveledActivityCount: 1 }),
    );
    vi.mocked(apiFetchAllPages).mockResolvedValue([partDayActivity]);
    renderStrip();
    // In the figure's own <dd>, so it is in the accessible text and not only beside it.
    const qualifier = await screen.findByText('1 under a day, not drawn');
    expect(qualifier.closest('dd')).toHaveTextContent('1 under a day, not drawn');
    expect(screen.getByText(/1 moved by less than a day, so it has no ghost/)).toBeInTheDocument();
  });

  it('adds nothing when every levelled activity has a ghost', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      summary({ leveledProjectFinish: '2026-01-20', leveledActivityCount: 1 }),
    );
    vi.mocked(apiFetchAllPages).mockResolvedValue([
      { ...partDayActivity, leveledStart: '2026-01-06', leveledFinish: '2026-01-06' },
    ]);
    renderStrip();
    await waitFor(() => expect(apiFetchAllPages).toHaveBeenCalled());
    await screen.findByText(
      /Levelling moved 1 activity, either to keep resource demand within capacity or because the work before it moved\./,
    );
    expect(screen.queryByText(/not drawn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no ghost on the diagram/)).not.toBeInTheDocument();
  });
});
