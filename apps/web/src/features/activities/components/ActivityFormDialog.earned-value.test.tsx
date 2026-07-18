import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The activity Cost & Earned-Value inputs (`percentCompleteType` / `physicalPercentComplete` /
 * `budgetedExpense` / `actualExpense`, EV4b / ADR-0042) with `VITE_EARNED_VALUE` forced ON — the surface
 * ships dark by default, so this suite pins the flag to prove the fields render, convert MAJOR-unit money
 * entry to minor units (omitted when blank), reveal the physical %-field only for the PHYSICAL measure,
 * seed + round-trip stored values, and hide for a type with no cost meaning (a milestone). Flag-off
 * behaviour is covered by `ActivityFormDialog.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EARNED_VALUE_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
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
  // 250000 minor = 2,500.00 major; 100000 minor = 1,000.00 major.
  percentCompleteType: 'PHYSICAL',
  physicalPercentComplete: 40,
  budgetedExpense: 250000,
  actualExpense: 100000,
  version: 4,
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

describe('ActivityFormDialog — Cost & Earned Value (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity carrying the %-complete type and expense (major → minor)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('% complete type'), { target: { value: 'UNITS' } });
    fireEvent.change(screen.getByLabelText('Budgeted expense (optional)'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText('Actual expense (optional)'), {
      target: { value: '250.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      percentCompleteType: 'UNITS',
      budgetedExpense: 100000,
      actualExpense: 25050,
    });
  });

  it('always sends percentCompleteType but omits blank expense on create', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'No cost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ percentCompleteType: 'DURATION' });
    expect(body).not.toHaveProperty('budgetedExpense');
    expect(body).not.toHaveProperty('actualExpense');
  });

  it('shows the physical %-field only for the PHYSICAL measure', () => {
    renderDialog();
    // Default DURATION — no physical field.
    expect(screen.queryByLabelText('Physical % complete (optional)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('% complete type'), { target: { value: 'PHYSICAL' } });
    expect(screen.getByLabelText('Physical % complete (optional)')).toBeInTheDocument();
  });

  it('seeds the fields (minor → major) from the row and round-trips them on save', async () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('% complete type')).toHaveValue('PHYSICAL');
    expect(screen.getByLabelText('Physical % complete (optional)')).toHaveValue(40);
    expect(screen.getByLabelText('Budgeted expense (optional)')).toHaveValue(2500);
    expect(screen.getByLabelText('Actual expense (optional)')).toHaveValue(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      percentCompleteType: 'PHYSICAL',
      physicalPercentComplete: 40,
      budgetedExpense: 250000,
      actualExpense: 100000,
      version: 4,
    });
  });

  it('clears a blank expense to null on edit', async () => {
    renderDialog({ activity: ACTIVITY });
    fireEvent.change(screen.getByLabelText('Budgeted expense (optional)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ budgetedExpense: null, version: 4 });
  });

  it('hides the cost fields for a milestone (no cost meaning)', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText('% complete type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Budgeted expense (optional)')).not.toBeInTheDocument();
  });
});
