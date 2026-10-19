import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as GuestApi from '../guest-api';
import {
  GuestFetchError,
  type GuestActivity,
  type GuestPlanView as GuestPlanViewDto,
} from '../guest-api';

import { GuestPlanView, GuestUnavailable } from './GuestPlanView';

// Keep the real GuestFetchError + adapters; stub only the three network readers.
vi.mock('../guest-api', async (importOriginal) => ({
  ...(await importOriginal<typeof GuestApi>()),
  fetchGuestPlan: vi.fn(),
  fetchGuestActivities: vi.fn(),
  fetchGuestDependencies: vi.fn(),
}));

// The read-only canvas is heavy (Canvas 2D) and out of scope here — stub it to a marker that
// CAPTURES its `barDateSource` prop (ADR-0163 M2-T2), so a regression that stops passing it, or
// passes the wrong value, is visible from a component test rather than only from a pixel journey.
vi.mock('@/features/tsld', () => ({
  TsldPanel: (props: { barDateSource?: string; showConstraintKey?: boolean }) => (
    <div
      data-testid="tsld-panel"
      data-bar-date-source={String(props.barDateSource)}
      data-show-constraint-key={String(props.showConstraintKey)}
    >
      canvas
    </div>
  ),
}));

const { fetchGuestPlan, fetchGuestActivities, fetchGuestDependencies } =
  await import('../guest-api');

const PLAN: GuestPlanViewDto = {
  id: 'plan-1',
  name: 'Riverside Tower',
  status: 'ACTIVE',
  description: null,
  dataDate: '2026-01-05',
  calendar: null,
  summary: {
    dataDate: '2026-01-05',
    projectFinish: '2026-06-30',
    activityCount: 1,
    criticalCount: 1,
    nearCriticalCount: 0,
  },
};

function activity(over: Partial<GuestActivity> = {}): GuestActivity {
  return {
    id: 'a1',
    code: 'A100',
    name: 'Excavate',
    type: 'TASK',
    durationDays: 5,
    durationMinutes: 2400,
    laneIndex: 0,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    lateStart: '2026-01-05',
    lateFinish: '2026-01-09',
    totalFloat: 0,
    isCritical: true,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    ...over,
  };
}

function renderView(token = 'sp_share_TOKEN') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestPlanView token={token} />
    </QueryClientProvider>,
  );
}

describe('GuestPlanView', () => {
  beforeEach(() => {
    vi.mocked(fetchGuestPlan).mockReset();
    vi.mocked(fetchGuestActivities).mockReset();
    vi.mocked(fetchGuestDependencies).mockReset();
  });

  it('shows its frame and one sentence while the plan resolves', () => {
    vi.mocked(fetchGuestPlan).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderView();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the shared plan…');
    // One landmark, neither live nor busy: the old frame was an `aria-live` main around a spinner's
    // own status, two live regions for one sentence.
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(container.querySelector('[aria-live], [aria-busy]')).toBeNull();
    expect(container.querySelector('svg.animate-spin')).toBeNull();
  });

  it('draws the same pending DOM for every token, so loading says nothing about the token', () => {
    // ADR-0051 §5: until the plan read answers, a live token and a dead one are indistinguishable.
    vi.mocked(fetchGuestPlan).mockReturnValue(new Promise(() => {}));
    const live = renderView('sp_share_LIVE_TOKEN_1').container.innerHTML;
    const dead = renderView('sp_share_DEAD_TOKEN_2').container.innerHTML;
    expect(dead).toBe(live);
    expect(live).not.toContain('LIVE_TOKEN');
  });

  it('shows the uniform "no longer available" message on any 404', async () => {
    vi.mocked(fetchGuestPlan).mockRejectedValue(new GuestFetchError(404));
    renderView();
    expect(await screen.findByText('This share link is no longer available.')).toBeInTheDocument();
  });

  it('shows a soft rate-limit message on a 429 (distinct from the uniform 404 copy)', async () => {
    vi.mocked(fetchGuestPlan).mockRejectedValue(new GuestFetchError(429));
    renderView();
    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
    expect(screen.queryByText('This share link is no longer available.')).not.toBeInTheDocument();
  });

  it('renders the read-only plan (header + canvas) when the token resolves', async () => {
    vi.mocked(fetchGuestPlan).mockResolvedValue(PLAN);
    vi.mocked(fetchGuestActivities).mockResolvedValue([activity()]);
    vi.mocked(fetchGuestDependencies).mockResolvedValue([]);
    renderView();

    expect(await screen.findByRole('heading', { name: 'Riverside Tower' })).toBeInTheDocument();
    expect(screen.getByText('Read-only shared view')).toBeInTheDocument();
    expect(screen.getByTestId('tsld-panel')).toBeInTheDocument();
  });

  /**
   * ADR-0163: the guest view has no Late overlay, so `barDateSourceFor(false)` always resolves to
   * `'visual'` — the plan as the planner laid it out (ADR-0148). This is what makes the placed span
   * `#356`'s API widening carries actually reach the canvas rather than being ignored by a host that
   * still passes nothing (M1's fields alone are not the fix — the census in
   * `guest-bar-basis.structural.test.ts` covers the same seam at the file-scan level).
   */
  it('draws on the PLACED basis: passes barDateSource="visual" to TsldPanel', async () => {
    vi.mocked(fetchGuestPlan).mockResolvedValue(PLAN);
    vi.mocked(fetchGuestActivities).mockResolvedValue([activity()]);
    vi.mocked(fetchGuestDependencies).mockResolvedValue([]);
    renderView();

    const panel = await screen.findByTestId('tsld-panel');
    expect(panel.dataset.barDateSource).toBe('visual');
  });

  it('tells the panel it is the guest view, so the legend keys no constraint pin', async () => {
    vi.mocked(fetchGuestPlan).mockResolvedValue(PLAN);
    vi.mocked(fetchGuestActivities).mockResolvedValue([activity()]);
    vi.mocked(fetchGuestDependencies).mockResolvedValue([]);
    renderView();

    expect((await screen.findByTestId('tsld-panel')).dataset.showConstraintKey).toBe('false');
  });

  it('names the header dates "Plan dates" and lists the data date and project finish', async () => {
    vi.mocked(fetchGuestPlan).mockResolvedValue(PLAN);
    vi.mocked(fetchGuestActivities).mockResolvedValue([activity()]);
    vi.mocked(fetchGuestDependencies).mockResolvedValue([]);
    renderView();

    const dates = await screen.findByLabelText('Plan dates');
    expect(within(dates).getByText('Data date')).toBeInTheDocument();
    expect(within(dates).getByText('Project finish')).toBeInTheDocument();
  });

  it('renders no dates list at all when the plan has neither date', async () => {
    vi.mocked(fetchGuestPlan).mockResolvedValue({
      ...PLAN,
      dataDate: null,
      summary: { ...PLAN.summary, dataDate: null, projectFinish: null },
    });
    vi.mocked(fetchGuestActivities).mockResolvedValue([activity()]);
    vi.mocked(fetchGuestDependencies).mockResolvedValue([]);
    renderView();

    await screen.findByRole('heading', { name: 'Riverside Tower' });
    expect(screen.queryByLabelText('Plan dates')).not.toBeInTheDocument();
  });

  it('shows an empty state for a plan with no activities (no canvas)', async () => {
    vi.mocked(fetchGuestPlan).mockResolvedValue({
      ...PLAN,
      summary: { ...PLAN.summary, activityCount: 0 },
    });
    vi.mocked(fetchGuestActivities).mockResolvedValue([]);
    vi.mocked(fetchGuestDependencies).mockResolvedValue([]);
    renderView();

    expect(await screen.findByText(/no activities yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('tsld-panel')).not.toBeInTheDocument();
  });

  it('GuestUnavailable renders the uniform message (the route no-token fallback)', () => {
    render(<GuestUnavailable />);
    expect(screen.getByText('This share link is no longer available.')).toBeInTheDocument();
    expect(fetchGuestPlan).not.toHaveBeenCalled();
  });
});
