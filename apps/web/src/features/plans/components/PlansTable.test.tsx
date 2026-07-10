import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { planKeys } from '../api/use-plans';

import { PlansTable } from './PlansTable';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  }) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

const PLANS: PlanSummary[] = [
  {
    id: 'pl1',
    projectId: 'p1',
    name: 'Baseline',
    description: null,
    status: 'ACTIVE',
    plannedStart: '2026-05-01',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderTable(canWrite: boolean, data: PlanSummary[] = PLANS) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(planKeys.listByProject('acme', 'p1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <PlansTable orgSlug="acme" projectId="p1" canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

describe('PlansTable', () => {
  it('renders a plan with status, a formatted planned start, and writer actions', () => {
    renderTable(true);
    expect(screen.getByRole('link', { name: 'Baseline' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('01 May 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Baseline' })).toBeInTheDocument();
  });

  it('hides write actions for non-writers', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: 'Edit Baseline' })).not.toBeInTheDocument();
  });

  it('shows an empty planned start as an em dash', () => {
    renderTable(true, [{ ...PLANS[0]!, plannedStart: null }]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an empty state when there are no plans', () => {
    renderTable(true, []);
    expect(screen.getByText(/No plans yet/)).toBeInTheDocument();
  });
});
