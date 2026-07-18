import type { ActivitySummary, CrossPlanDependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CrossPlanLinksSection } from './CrossPlanLinksSection';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

const ANCHOR = { id: 'anchor', name: 'Pour slab' } as unknown as ActivitySummary;

function link(overrides: Partial<CrossPlanDependencySummary> = {}): CrossPlanDependencySummary {
  return {
    id: 'link-1',
    predecessorPlanId: 'up-plan',
    successorPlanId: 'pl1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'up-act', code: 'A-1', name: 'Deliver steel' },
    successor: { id: 'anchor', code: null, name: 'Pour slab' },
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Route the mocked apiFetch by path so the links list, delete, and picker queries all resolve. */
function mockApi(links: CrossPlanDependencySummary[]): void {
  vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
    if (path.includes('/activities/anchor/cross-plan-dependencies')) {
      return Promise.resolve(links);
    }
    if (init?.method === 'DELETE') return Promise.resolve(undefined);
    // Picker cascade queries (clients/projects/plans/activities) — empty is fine for these tests.
    return Promise.resolve([]);
  });
}

function renderSection(props: { canManageLogic?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <CrossPlanLinksSection
          orgSlug="acme"
          planId="pl1"
          activity={ANCHOR}
          canManageLogic={props.canManageLogic ?? true}
          enabled
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('CrossPlanLinksSection', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows the empty state when the activity has no cross-plan links', async () => {
    mockApi([]);
    renderSection();
    await waitFor(() =>
      expect(screen.getByText(/isn’t tied to any activity in another plan/i)).toBeInTheDocument(),
    );
  });

  it('lists an incoming link as “Driven by” its upstream activity', async () => {
    mockApi([link()]);
    renderSection();
    await waitFor(() => expect(screen.getByText('Deliver steel')).toBeInTheDocument());
    expect(screen.getByText('Driven by')).toBeInTheDocument();
    expect(screen.getByText('Finish → Start')).toBeInTheDocument();
  });

  it('lists an outgoing link as “Drives” its downstream activity', async () => {
    mockApi([
      link({
        id: 'link-2',
        predecessor: { id: 'anchor', code: null, name: 'Pour slab' },
        successor: { id: 'down-act', code: 'B-2', name: 'Backfill' },
        predecessorPlanId: 'pl1',
        successorPlanId: 'down-plan',
      }),
    ]);
    renderSection();
    await waitFor(() => expect(screen.getByText('Backfill')).toBeInTheDocument());
    expect(screen.getByText('Drives')).toBeInTheDocument();
  });

  it('removes a link after confirmation and announces it', async () => {
    mockApi([link()]);
    renderSection();
    await waitFor(() => expect(screen.getByText('Deliver steel')).toBeInTheDocument());

    fireEvent.click(
      screen.getByRole('button', { name: /Remove cross-plan link to Deliver steel/ }),
    );
    // Confirm dialog — the exact-name "Remove" button (the row's is "Remove cross-plan link to …").
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/organizations/acme/cross-plan-dependencies/link-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Cross-plan link removed.'),
    );
  });

  it('hides the add and remove controls for a read-only member', async () => {
    mockApi([link()]);
    renderSection({ canManageLogic: false });
    await waitFor(() => expect(screen.getByText('Deliver steel')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Add cross-plan link' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove cross-plan link/ }),
    ).not.toBeInTheDocument();
  });

  it('surfaces an error state if the links fail to load', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    renderSection();
    await waitFor(() =>
      expect(screen.getByText(/Couldn’t load cross-plan links/i)).toBeInTheDocument(),
    );
  });
});
