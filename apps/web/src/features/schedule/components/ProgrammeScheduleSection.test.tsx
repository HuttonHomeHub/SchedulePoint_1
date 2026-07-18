import type { PlanScheduleSummary, ProgrammeScheduleResult } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeScheduleSection } from './ProgrammeScheduleSection';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

function summary(over: Partial<PlanScheduleSummary> = {}): PlanScheduleSummary {
  return {
    dataDate: '2026-01-01',
    projectFinish: '2026-01-05',
    activityCount: 2,
    criticalCount: 1,
    nearCriticalCount: 0,
    constraintViolationCount: 0,
    constraintWarningCount: 0,
    loeNoSpanCount: 0,
    resourceDriverMissingCount: 0,
    leveledActivityCount: 0,
    levelingWindowExceededCount: 0,
    selfOverAllocatedCount: 0,
    leveledProjectFinish: null,
    externalDrivenCount: 0,
    ...over,
  };
}

const RESULT: ProgrammeScheduleResult = {
  plans: [
    { planId: 'pl2', summary: summary({ projectFinish: '2026-02-01', criticalCount: 3 }) },
    { planId: 'pl1', summary: summary({ projectFinish: '2026-03-01', criticalCount: 1 }) },
  ],
  programme: { planCount: 2, crossPlanUpstreamMissingCount: 0 },
};

function mockApi(sum: PlanScheduleSummary, recalc?: () => Promise<unknown>): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.endsWith('/schedule/recalculate-programme')) {
      return recalc ? recalc() : Promise.resolve(RESULT);
    }
    if (path.endsWith('/schedule/summary')) return Promise.resolve(sum);
    return Promise.resolve(undefined);
  });
}

function renderSection(canRecalc = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <ProgrammeScheduleSection orgSlug="acme" planId="pl1" canRecalc={canRecalc} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('ProgrammeScheduleSection', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('renders nothing for a plan with no cross-plan edges (scheduleStale absent)', async () => {
    mockApi(summary()); // no scheduleStale field
    renderSection();
    // Give the summary query a tick to resolve, then assert the surface never appears.
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Programme scheduling' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recalculate programme/ })).not.toBeInTheDocument();
  });

  it('shows the recalculate control for a plan that has cross-plan edges', async () => {
    mockApi(summary({ scheduleStale: false, staleUpstreamPlanIds: [] }));
    renderSection();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Recalculate programme' })).toBeInTheDocument(),
    );
    // Not stale → no stale banner.
    expect(screen.queryByText(/Upstream plans changed/)).not.toBeInTheDocument();
  });

  it('shows the stale banner as a status when an upstream plan is newer', async () => {
    mockApi(summary({ scheduleStale: true, staleUpstreamPlanIds: ['pl2'] }));
    renderSection();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Upstream plans changed');
    expect(status).toHaveTextContent(/1 upstream plan was recalculated more recently/);
  });

  it('recalculates the programme and shows the per-plan result, upstream-first', async () => {
    mockApi(summary({ scheduleStale: true, staleUpstreamPlanIds: ['pl2'] }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Recalculate programme' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/plans/pl1/schedule/recalculate-programme',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Upstream plan 1')).toBeInTheDocument();
    expect(screen.getByText('This plan')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Programme recalculated: 2 plans.'),
    );
  });

  it('surfaces the missing-upstream (N32) warning when the programme reports one', async () => {
    mockApi(summary({ scheduleStale: false, staleUpstreamPlanIds: [] }), () =>
      Promise.resolve({
        plans: RESULT.plans,
        programme: { planCount: 2, crossPlanUpstreamMissingCount: 1 },
      } satisfies ProgrammeScheduleResult),
    );
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Recalculate programme' }));
    expect(
      await screen.findByText(/pointed at an upstream activity that has never been calculated/),
    ).toBeInTheDocument();
  });

  it('shows the 423 blocked-plans path with a link per blocked plan', async () => {
    mockApi(summary({ scheduleStale: true, staleUpstreamPlanIds: ['pl2'] }), () =>
      Promise.reject(
        new ApiFetchError(423, {
          code: 'PLAN_EDIT_LOCK_REQUIRED',
          message: 'blocked',
          details: { reason: 'PROGRAMME_PLANS_LOCKED', blockedPlanIds: ['pl2', 'pl3'] },
        }),
      ),
    );
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Recalculate programme' }));

    expect(await screen.findByText('Some plans are being edited')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Open blocked plan' });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/orgs/acme/plans/pl2');
  });

  it('shows the 422 too-large path with the actionable message', async () => {
    mockApi(summary({ scheduleStale: false, staleUpstreamPlanIds: [] }), () =>
      Promise.reject(
        new ApiFetchError(422, {
          code: 'VALIDATION_FAILED',
          message: 'This programme spans 60 interdependent plans, above the 50-plan limit.',
          details: { reason: 'PROGRAMME_TOO_LARGE', planCount: 60 },
        }),
      ),
    );
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Recalculate programme' }));
    expect(await screen.findByText(/above the 50-plan limit/)).toBeInTheDocument();
  });

  it('hides the recalculate control for a member who can’t calculate', async () => {
    mockApi(summary({ scheduleStale: true, staleUpstreamPlanIds: ['pl2'] }));
    renderSection(false);
    // The stale banner still shows (informational), but no action button.
    expect(await screen.findByRole('status')).toHaveTextContent('Upstream plans changed');
    expect(screen.queryByRole('button', { name: 'Recalculate programme' })).not.toBeInTheDocument();
  });
});
