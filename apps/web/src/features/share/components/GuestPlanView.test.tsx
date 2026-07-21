import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

// The read-only canvas is heavy (Canvas 2D) and out of scope here — stub it to a marker.
vi.mock('@/features/tsld', () => ({
  TsldPanel: () => <div data-testid="tsld-panel">canvas</div>,
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

  it('shows a loading state while the plan resolves', () => {
    vi.mocked(fetchGuestPlan).mockReturnValue(new Promise(() => {})); // never resolves
    renderView();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
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
