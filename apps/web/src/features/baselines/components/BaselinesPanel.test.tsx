import type { BaselineSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { baselineKeys } from '../api/use-baselines';

import { BaselinesPanel } from './BaselinesPanel';

import type * as ApiClient from '@/lib/api/client';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const BASELINES: BaselineSummary[] = [
  {
    id: 'b-active',
    planId: 'plan-1',
    name: 'Contract Baseline',
    isActive: true,
    capturedAt: '2026-01-05T09:00:00Z',
    dataDate: '2026-01-05',
    capturedProjectFinish: '2026-03-01',
    activityCount: 12,
    version: 1,
    createdAt: '2026-01-05T09:00:00Z',
    updatedAt: '2026-01-05T09:00:00Z',
  },
  {
    id: 'b-old',
    planId: 'plan-1',
    name: 'Revised Baseline',
    isActive: false,
    capturedAt: '2026-02-01T09:00:00Z',
    dataDate: '2026-01-05',
    capturedProjectFinish: '2026-03-10',
    activityCount: 12,
    version: 1,
    createdAt: '2026-02-01T09:00:00Z',
    updatedAt: '2026-02-01T09:00:00Z',
  },
];

function renderPanel(canManage: boolean, data: BaselineSummary[] = BASELINES) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(baselineKeys.listByPlan('acme', 'plan-1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <BaselinesPanel orgSlug="acme" planId="plan-1" canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe('BaselinesPanel', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
  });

  it('lists baselines, marks the active one, and offers write actions to managers', () => {
    renderPanel(true);
    expect(screen.getByText('Contract Baseline')).toBeInTheDocument();
    // The active baseline carries an "Active" badge (a span, distinct from the button).
    expect(screen.getByText('Active', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capture baseline' })).toBeInTheDocument();
    // The inactive baseline can be activated; the active one shows a disabled "Active".
    expect(screen.getByRole('button', { name: 'Activate Revised Baseline' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Contract Baseline is active' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Revised Baseline' })).toBeInTheDocument();
  });

  it('hides all write actions from a non-manager', () => {
    renderPanel(false);
    expect(screen.getByText('Contract Baseline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Capture baseline' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Activate Revised Baseline' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete Revised Baseline' }),
    ).not.toBeInTheDocument();
  });

  it('activates an inactive baseline', async () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole('button', { name: 'Activate Revised Baseline' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1/baselines/b-old/activate');
    expect(init?.method).toBe('POST');
  });

  it('confirms before deleting, warning when the active baseline is removed', () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Contract Baseline' }));
    expect(screen.getByRole('heading', { name: 'Delete baseline' })).toBeInTheDocument();
    expect(screen.getByText(/Variance will be hidden/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no baselines', () => {
    renderPanel(true, []);
    expect(screen.getByText(/No baselines yet/)).toBeInTheDocument();
  });
});
