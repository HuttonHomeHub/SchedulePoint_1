import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The activity Cost & Earned-Value inputs (`percentCompleteType` / `physicalPercentComplete` /
 * `budgetedExpense` / `actualExpense`, EV4b / ADR-0042) with `VITE_EARNED_VALUE` forced ON — the surface
 * ships dark by default, so this suite pins the flag to prove the fields render, convert MAJOR-unit money
 * entry to minor units (omitted when blank), reveal the physical %-field only for the PHYSICAL measure,
 * and hide for a type with no cost meaning (a milestone). Flag-off behaviour is covered by
 * `ActivityCreateDialog.test.tsx`.
 *
 * **Two edit-mode cases moved** when `ActivityCreateDialog` lost its edit path
 * (activity-dialog-unification epic): "seeds the fields (minor → major) from the row and round-trips
 * them on save" ported to `ActivityEditorDialog.round-trips.test.tsx` — split across its two write
 * scopes as "seeds the expenses (minor → major) from the row and round-trips them on a Cost save"
 * and "seeds the value measure from the row and round-trips it on a Progress (Measure) save"
 * (`budgetedExpense`/`actualExpense` are Cost, `percentCompleteType`/`physicalPercentComplete` are
 * Measure — one merged save on create, two independent scopes on the editor). "Clears a blank
 * expense to null on edit" is covered by
 * `apps/web/src/features/activities/api/activity-body-builders.structural.test.ts`
 * (`budgetedExpense` is in its `CLEARABLE_KEYS`).
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
  durationMinutes: 2400,
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
  remainingDurationMinutes: null,
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
  // 250000 minor = 2,500.00 major; 100000 minor = 1,000.00 major.
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  physicalPercentComplete: 40,
  budgetedExpense: 250000,
  actualExpense: 100000,
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityCreateDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityCreateDialog orgSlug="acme" planId="pl1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityCreateDialog — Cost & Earned Value (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity carrying the %-complete type and expense (major → minor)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Earn value from'), { target: { value: 'UNITS' } });
    fireEvent.change(screen.getByLabelText('Budgeted expense'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText('Actual expense'), {
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

  it('shows the physical %-field whatever the measure (D10)', () => {
    // It was rendered only for PHYSICAL until M4. `physicalPercentComplete` is a STORED value, and
    // ADR-0060 §6 is the rule: shading implies a value is there, hiding claims there is none — so
    // hiding it from a reader whose measure is Duration says this activity has no physical
    // progress when it may well have some.
    renderDialog();
    expect(screen.getByLabelText('Physical % complete')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Earn value from'), { target: { value: 'PHYSICAL' } });
    expect(screen.getByLabelText('Physical % complete')).toBeInTheDocument();
  });

  it('offers the cost fields to a milestone, which is what a payment milestone is (D9)', () => {
    // They were withheld from every duration-derived type until M4, on the reasoning that a
    // milestone has no duration to cost. A payment milestone is precisely an activity with cost
    // and no duration, and this dialog is the only surface that makes one — so the value could
    // never be entered. The API accepts it, confirmed by running it rather than reading the DTO
    // (`apps/api/test/activities.e2e-spec.ts`).
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.getByLabelText('Earn value from')).toBeInTheDocument();
    expect(screen.getByLabelText('Budgeted expense')).toBeInTheDocument();
  });
});
