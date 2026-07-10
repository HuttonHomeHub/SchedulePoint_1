import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanFormDialog } from './PlanFormDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const PLAN: PlanSummary = {
  id: 'pl1',
  projectId: 'p1',
  name: 'Baseline',
  description: null,
  status: 'ACTIVE',
  plannedStart: '2026-05-01',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof PlanFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanFormDialog orgSlug="acme" projectId="p1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanFormDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(PLAN);
  });

  it('creates a plan with the chosen status and planned start', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kickoff' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    fireEvent.change(screen.getByLabelText(/Planned start/), { target: { value: '2026-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/projects/p1/plans');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Kickoff',
      status: 'ACTIVE',
      plannedStart: '2026-06-15',
    });
  });

  it('seeds status/date in edit mode and PATCHes with the row version', async () => {
    renderDialog({ plan: PLAN });
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE');
    expect(screen.getByLabelText(/Planned start/)).toHaveValue('2026-05-01');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({ version: 4, status: 'ACTIVE' });
  });
});
