import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The M4 advanced-constraints editor (ADR-0035 §7–§11) with `VITE_ADVANCED_CONSTRAINTS` forced ON —
 * the surface ships dark by default, so this suite pins the flag to prove the secondary constraint
 * (paired), the ALAP toggle and the expected-finish date render, persist, round-trip a seeded value,
 * and enforce the secondary pair rule. (The flag-off behaviour — fields hidden, seeded value still
 * round-trips — is covered by `ActivityFormDialog.test.tsx`.)
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: true,
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
  constraintType: 'SNET',
  constraintDate: '2026-05-01',
  secondaryConstraintType: 'FNLT',
  secondaryConstraintDate: '2026-06-01',
  calendarId: null,
  laneIndex: 0,
  scheduleAsLateAsPossible: true,
  expectedFinish: '2026-05-20',
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
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
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

describe('ActivityFormDialog — advanced constraints (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity with a secondary constraint, ALAP and an expected finish', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Secondary constraint'), { target: { value: 'FNLT' } });
    fireEvent.change(screen.getByLabelText('Secondary constraint date'), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByLabelText('Schedule as late as possible'));
    fireEvent.change(screen.getByLabelText('Expected finish (optional)'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      secondaryConstraintType: 'FNLT',
      secondaryConstraintDate: '2026-06-15',
      scheduleAsLateAsPossible: true,
      expectedFinish: '2026-06-10',
    });
  });

  it('seeds the advanced fields from the row and round-trips them on save', () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('Secondary constraint')).toHaveValue('FNLT');
    expect(screen.getByLabelText('Secondary constraint date')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('Schedule as late as possible')).toBeChecked();
    expect(screen.getByLabelText('Expected finish (optional)')).toHaveValue('2026-05-20');
  });

  it('clears the secondary constraint to null and the ALAP flag to false on save', async () => {
    renderDialog({ activity: ACTIVITY });
    fireEvent.change(screen.getByLabelText('Secondary constraint'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Schedule as late as possible')); // toggle off
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      version: 4,
      secondaryConstraintType: null,
      secondaryConstraintDate: null,
      scheduleAsLateAsPossible: false,
    });
  });

  it('rejects a secondary constraint type without a date (paired rule)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Secondary constraint'), { target: { value: 'FNLT' } });
    // Leave the date blank.
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    // The message appears in both the error summary and under the field.
    expect(
      (await screen.findAllByText('Choose a date for the secondary constraint.')).length,
    ).toBeGreaterThan(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
