import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreatePlanButton } from './CreatePlanButton';

import { apiFetch } from '@/lib/api/client';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

describe('CreatePlanButton', () => {
  beforeEach(() => {
    navigate.mockReset();
    vi.mocked(apiFetch).mockReset();
  });

  it('opens the plan it created, as the Explorer does', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'pl9', name: 'Fit-out' });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CreatePlanButton orgSlug="acme" projectId="p1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New plan' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fit-out' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/orgs/$orgSlug/plans/$planId',
        params: { orgSlug: 'acme', planId: 'pl9' },
      }),
    );
  });
});
