import type { ActivitySummary, DependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogicPanel } from './ActivityLogicPanel';

import { apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetchAllPages: vi.fn() };
});

const fetchAllPages = vi.mocked(apiFetchAllPages);

const ACTIVITY = {
  id: 'b1',
  planId: 'pl1',
  code: 'B10',
  name: 'Pour slab',
} as unknown as ActivitySummary;

function link(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    id: 'd1',
    planId: 'pl1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
    successor: { id: 'b1', code: 'B10', name: 'Pour slab' },
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Mounted bare — no `Dialog`, which is the point: the tab hosts the same panel directly. */
function renderPanel(props: Partial<React.ComponentProps<typeof ActivityLogicPanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityLogicPanel orgSlug="acme" planId="pl1" activity={ACTIVITY} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityLogicPanel', () => {
  beforeEach(() => {
    fetchAllPages.mockReset();
  });

  it('renders both directions standalone, outside any dialog', async () => {
    fetchAllPages.mockResolvedValue([link()]);
    renderPanel();
    // Each table shows the OTHER end of its links, so one row names the predecessor and the
    // other names this activity as the successor's counterpart.
    expect(await screen.findByText('Excavate')).toBeInTheDocument();
    expect(screen.getByText('Pour slab')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Predecessors' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Successors' })).toBeInTheDocument();
  });

  it('shows each direction’s loading state while its query is in flight', () => {
    fetchAllPages.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText('Loading predecessors…')).toBeInTheDocument();
    expect(screen.getByText('Loading successors…')).toBeInTheDocument();
  });

  it('shows an empty state per direction', async () => {
    fetchAllPages.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText(/No predecessors/)).toBeInTheDocument();
    expect(screen.getByText(/No successors/)).toBeInTheDocument();
  });

  it('surfaces a load failure rather than an empty list', async () => {
    fetchAllPages.mockRejectedValue(new Error('offline'));
    renderPanel();
    expect(await screen.findByText(/Couldn’t load predecessors/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn’t load successors/)).toBeInTheDocument();
  });

  it('hides write affordances for a reader', async () => {
    fetchAllPages.mockResolvedValue([link()]);
    renderPanel();
    await screen.findByText('Excavate');
    expect(screen.queryByRole('button', { name: 'Add predecessor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove link/ })).not.toBeInTheDocument();
  });

  it('carries its own add/edit/remove affordances for a logic manager — the panel is self-sufficient wherever it is mounted', async () => {
    fetchAllPages.mockResolvedValue([link()]);
    renderPanel({ canManageLogic: true });
    await screen.findByText('Excavate');
    expect(screen.getByRole('button', { name: 'Add predecessor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add successor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit link to Excavate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove link to Pour slab' })).toBeInTheDocument();
  });

  it('issues no request while disabled — a host may mount it before it is showing', async () => {
    fetchAllPages.mockResolvedValue([]);
    renderPanel({ enabled: false });
    // Nothing to wait for on the happy path, so assert the negative after a settle tick.
    await waitFor(() => expect(fetchAllPages).not.toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Predecessors' })).toBeInTheDocument();
  });
});
