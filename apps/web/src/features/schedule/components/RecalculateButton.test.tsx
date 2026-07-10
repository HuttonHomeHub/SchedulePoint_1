import type { PlanScheduleSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecalculateButton } from './RecalculateButton';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

const SUMMARY: PlanScheduleSummary = {
  dataDate: '2026-01-01',
  projectFinish: '2026-01-05',
  activityCount: 2,
  criticalCount: 2,
  nearCriticalCount: 0,
  parkedConstraintCount: 0,
};

function renderButton(canCalculate = true) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <RecalculateButton orgSlug="acme" planId="pl1" canCalculate={canCalculate} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('RecalculateButton', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('renders nothing for a reader', () => {
    renderButton(false);
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
  });

  it('POSTs to the recalculate endpoint and announces success', async () => {
    vi.mocked(apiFetch).mockResolvedValue(SUMMARY);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/schedule/recalculate');
    expect(init?.method).toBe('POST');
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Schedule recalculated.'),
    );
  });

  it('surfaces a friendly inline prompt when the plan has no start date (422)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'VALIDATION_FAILED',
        message: 'Set the plan’s start date before calculating the schedule.',
        details: { reason: 'PLAN_START_REQUIRED' },
      }),
    );
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Set the plan’s start date/),
    );
    // The prompt is programmatically associated with the button.
    const button = screen.getByRole('button', { name: 'Recalculate' });
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  });

  it('shows a visible inline error (not just an announcement) for other failures', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(500, { code: 'INTERNAL_ERROR', message: 'boom' }),
    );
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t recalculate/),
    );
  });
});
