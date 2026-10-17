import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import { apiFetch } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';

/**
 * The activity **Cost accrual** select (M7 rung 5, ADR-0044 §32 / ADR-0035 §32) with `VITE_COST_ACCRUAL`
 * forced ON (and `VITE_EARNED_VALUE` left OFF, to prove the picker renders on its own flag). The surface
 * ships dark by default, so this suite pins the flag to prove: the select renders inside the "Cost &
 * earned value" fieldset with Start / Uniform / End, always sends `accrualType`, and hides for a type
 * with no cost meaning (a milestone). Flag-off (hidden) is asserted at the end.
 *
 * **The seed+round-trip case moved.** `ActivityCreateDialog` lost its edit path in the
 * activity-dialog-unification epic (create-only now, no `activity` prop), so "seeds accrualType from
 * the row and round-trips it on save" ported to `ActivityEditorDialog.round-trips.test.tsx` — "seeds
 * accrualType from the row and round-trips it on a Cost save".
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  COST_ACCRUAL_ENABLED: true,
  EARNED_VALUE_ENABLED: false,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY: ActivitySummary = anActivity({
  planId: 'pl1',
  name: 'Crane mobilisation',
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  accrualType: 'START', // seeded from the row — a mobilisation charge, all at the start
  budgetedExpense: 4500000,
  version: 3,
});

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityCreateDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityCreateDialog orgSlug="acme" planId="pl1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityCreateDialog — Cost accrual (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('renders the Cost accrual select (Start / Uniform / End), defaulting to Uniform on create', () => {
    renderDialog();
    const select = screen.getByLabelText('Cost accrual');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('UNIFORM');
    expect(screen.getByRole('option', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Uniform' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'End' })).toBeInTheDocument();
  });

  it('sends the chosen accrualType on create', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Retention release' } });
    fireEvent.change(screen.getByLabelText('Cost accrual'), { target: { value: 'END' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Retention release',
      accrualType: 'END',
    });
  });

  it('offers the accrual select to a milestone, which can carry a cost (D9)', () => {
    // A payment milestone has a cost and no duration, so WHEN that cost is recognised is a real
    // question for it. Withheld until M4 for the same reason the expense fields were.
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.getByLabelText('Cost accrual')).toBeInTheDocument();
  });
});
