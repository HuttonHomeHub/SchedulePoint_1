import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateBaselineDialog } from './CreateBaselineDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateBaselineDialog orgSlug="acme" planId="plan-1" open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CreateBaselineDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('captures a baseline with the entered name', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Contract Baseline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture baseline' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1/baselines');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Contract Baseline' });
  });

  it('validates that a name is required (no request sent)', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Capture baseline' }));
    // Shown in both the error summary and inline on the field.
    expect((await screen.findAllByText('Name is required.')).length).toBeGreaterThan(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces a "recalculate first" hint on a never-calculated plan (422)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'VALIDATION_FAILED',
        message: 'Recalculate the schedule before capturing a baseline.',
        details: { reason: 'SCHEDULE_NOT_CALCULATED' },
      }),
    );
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Base' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture baseline' }));
    expect(
      await screen.findByText(/Recalculate the schedule before capturing/),
    ).toBeInTheDocument();
  });

  it('surfaces a duplicate-name message (409)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'A baseline with this name already exists for this plan.',
        details: { reason: 'DUPLICATE_BASELINE' },
      }),
    );
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Contract' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture baseline' }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });
});
