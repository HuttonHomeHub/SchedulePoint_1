import type { ActivityStep, ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stepKeys } from '../api/use-activity-steps';

import { ActivityStepsDialog } from './ActivityStepsDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The per-activity weighted **Steps** editor (M7 rung 5, ADR-0044 §2) with `VITE_ACTIVITY_STEPS` forced
 * ON — the surface ships dark by default, so this suite pins the flag to prove: the rolled-up physical %
 * previews client-side (weighted mean), the override note shows only when steps are present, add/remove
 * rows work, and Save fires the bulk PUT with the parent activity's version. Every input is labelled and
 * keyboard-operable (asserted via role/label queries).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_STEPS_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Pour foundations',
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
  externalDriven: false,
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
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  physicalPercentComplete: 40,
  budgetedExpense: null,
  actualExpense: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function step(overrides: Partial<ActivityStep> = {}): ActivityStep {
  return {
    id: 'st-1',
    activityId: 'a1',
    seq: 1,
    name: 'Rebar',
    weight: 1,
    percentComplete: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(steps: ActivityStep[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(stepKeys.listByActivity('acme', 'a1'), steps);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityStepsDialog orgSlug="acme" planId="pl1" activity={ACTIVITY} open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('ActivityStepsDialog (flag on)', () => {
  beforeEach(() => {
    // A save invalidates the step list, which refetches through this same mock — resolve to an array.
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('previews the rolled-up physical % as the weighted mean of the steps', () => {
    renderDialog([
      step({ id: 'st-1', seq: 1, name: 'Rebar', weight: 3, percentComplete: 100 }),
      step({ id: 'st-2', seq: 2, name: 'Formwork', weight: 1, percentComplete: 0 }),
    ]);
    // Σ(w·p)/Σw = (3·100 + 1·0) / 4 = 75.
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('falls back to the manual physical % when there are no steps', () => {
    renderDialog([]);
    // No steps → the manual physicalPercentComplete (40) drives the preview.
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(
      screen.queryByText(/Steps override the manual physical % complete/i),
    ).not.toBeInTheDocument();
  });

  it('shows the override note once steps are present', () => {
    renderDialog([step()]);
    expect(screen.getByText(/Steps override the manual physical % complete/i)).toBeInTheDocument();
  });

  it('adds a row (a labelled, keyboard-operable input appears) and recomputes the rollup', () => {
    renderDialog([]);
    expect(screen.queryByLabelText('Step 1 name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    const name = screen.getByLabelText('Step 1 name');
    const weight = screen.getByLabelText('Step 1 weight');
    const pct = screen.getByLabelText('Step 1 % complete');
    expect(name).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Rebar' } });
    fireEvent.change(weight, { target: { value: '2' } });
    fireEvent.change(pct, { target: { value: '50' } });
    // Single step at 50% → 50% rollup (weights sum > 0, so it overrides the manual 40%).
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('removes a row', () => {
    renderDialog([
      step({ id: 'st-1', seq: 1, name: 'Rebar' }),
      step({ id: 'st-2', seq: 2, name: 'Formwork' }),
    ]);
    expect(screen.getByLabelText('Step 2 name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }));
    expect(screen.queryByLabelText('Step 2 name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Step 1 name')).toBeInTheDocument();
  });

  it('saves — PUTs the ordered steps plus the parent activity version', async () => {
    renderDialog([step({ id: 'st-1', seq: 1, name: 'Rebar', weight: 2, percentComplete: 25 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Save steps' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1/steps');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({
      version: 3,
      steps: [{ name: 'Rebar', weight: 2, percentComplete: 25 }],
    });
  });

  it('blocks Save with a field error for an out-of-range percent (no PUT)', async () => {
    renderDialog([step()]);
    fireEvent.change(screen.getByLabelText('Step 1 % complete'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save steps' }));

    await waitFor(() =>
      expect(screen.getByText(/Percent complete cannot exceed 100/i)).toBeInTheDocument(),
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('focuses the new step’s name input after Add step (a11y)', async () => {
    renderDialog([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await waitFor(() => expect(screen.getByLabelText('Step 1 name')).toHaveFocus());
  });

  it('restores focus to the previous row’s Remove after removing a step (a11y)', async () => {
    renderDialog([
      step({ id: 'st-1', seq: 1, name: 'Rebar' }),
      step({ id: 'st-2', seq: 2, name: 'Formwork' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove step 1' })).toHaveFocus(),
    );
  });

  it('moves focus to Add step when the first (only) row is removed (a11y)', async () => {
    renderDialog([step({ id: 'st-1', seq: 1, name: 'Rebar' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add step' })).toHaveFocus());
  });

  it('reorders a row with Move up', () => {
    renderDialog([
      step({ id: 'st-1', seq: 1, name: 'Rebar' }),
      step({ id: 'st-2', seq: 2, name: 'Formwork' }),
    ]);
    const list = screen.getByRole('list');
    const rowsBefore = within(list).getAllByRole('listitem');
    // Formwork (row 2) starts second.
    expect(within(rowsBefore[1]!).getByLabelText('Step 2 name')).toHaveValue('Formwork');

    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 up' }));

    const rowsAfter = within(list).getAllByRole('listitem');
    // After the move Formwork is first; the field labels renumber to the new positions.
    expect(within(rowsAfter[0]!).getByLabelText('Step 1 name')).toHaveValue('Formwork');
    expect(within(rowsAfter[1]!).getByLabelText('Step 2 name')).toHaveValue('Rebar');
  });
});
