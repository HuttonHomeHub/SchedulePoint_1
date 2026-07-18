import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The activity External dates section (`externalEarlyStart` / `externalLateFinish`, ADR-0043 / ADR-0035
 * §30) with `VITE_INTER_PROJECT_DATES` forced ON — the surface ships dark by default, so this suite pins
 * the flag to prove the two date inputs render + submit, the client-side N26 rule rejects an inverted
 * window, and a stored value seeds + round-trips. The flag-off (section hidden) behaviour is covered by
 * `ActivityFormDialog.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  INTER_PROJECT_DATES_ENABLED: true,
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
  externalEarlyStart: '2026-02-01',
  externalLateFinish: '2026-03-01',
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
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
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

describe('ActivityFormDialog — External dates (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity carrying both external dates', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Procure valves' } });
    fireEvent.change(screen.getByLabelText('External early start (optional)'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByLabelText('External late finish (optional)'), {
      target: { value: '2026-03-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Procure valves',
      externalEarlyStart: '2026-02-01',
      externalLateFinish: '2026-03-01',
    });
  });

  it('omits both external dates on create when the fields are left blank', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'No external dates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body).not.toHaveProperty('externalEarlyStart');
    expect(body).not.toHaveProperty('externalLateFinish');
  });

  it('rejects an inverted window client-side (N26) and does not submit', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Inverted' } });
    fireEvent.change(screen.getByLabelText('External early start (optional)'), {
      target: { value: '2026-03-01' },
    });
    fireEvent.change(screen.getByLabelText('External late finish (optional)'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    // The message renders both in the field error and the form-error summary at the top.
    const errors = await screen.findAllByText(
      'External late finish can’t be before the external early start.',
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('seeds both dates from the row and round-trips them on save', async () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('External early start (optional)')).toHaveValue('2026-02-01');
    expect(screen.getByLabelText('External late finish (optional)')).toHaveValue('2026-03-01');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      externalEarlyStart: '2026-02-01',
      externalLateFinish: '2026-03-01',
      version: 4,
    });
  });

  it('clears an external date to null when the field is emptied on edit', async () => {
    renderDialog({ activity: ACTIVITY });
    fireEvent.change(screen.getByLabelText('External late finish (optional)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      externalEarlyStart: '2026-02-01',
      externalLateFinish: null,
      version: 4,
    });
  });
});
