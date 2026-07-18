import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The activity **Cost accrual** select (M7 rung 5, ADR-0044 §32 / ADR-0035 §32) with `VITE_COST_ACCRUAL`
 * forced ON (and `VITE_EARNED_VALUE` left OFF, to prove the picker renders on its own flag). The surface
 * ships dark by default, so this suite pins the flag to prove: the select renders inside the "Cost &
 * earned value" fieldset with Start / Uniform / End, always sends `accrualType`, seeds + round-trips a
 * stored value, and hides for a type with no cost meaning (a milestone). Flag-off (hidden) is asserted
 * at the end.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  COST_ACCRUAL_ENABLED: true,
  EARNED_VALUE_ENABLED: false,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Crane mobilisation',
  description: null,
  type: 'TASK',
  durationDays: 5,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: null,
  laneIndex: 0,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  remainingDurationDays: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  constraintViolated: false,
  loeNoSpan: false,
  resourceDriverMissing: false,
  externalEarlyStart: null,
  externalLateFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  levelingPriority: null,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'DURATION',
  accrualType: 'START', // seeded from the row — a mobilisation charge, all at the start
  physicalPercentComplete: null,
  budgetedExpense: 4500000,
  actualExpense: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityFormDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityFormDialog orgSlug="acme" planId="pl1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityFormDialog — Cost accrual (flag on)', () => {
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

  it('seeds accrualType from the row and round-trips it on save', async () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('Cost accrual')).toHaveValue('START');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ accrualType: 'START', version: 3 });
  });

  it('hides the accrual select for a milestone (no cost meaning)', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText('Cost accrual')).not.toBeInTheDocument();
  });
});
