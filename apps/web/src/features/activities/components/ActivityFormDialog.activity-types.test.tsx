import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The M5-epic advanced activity types (ADR-0035 §21) with `VITE_ADVANCED_ACTIVITY_TYPES` forced ON —
 * the Type picker gains **Level of effort**. Proves the option renders, that picking it hides the
 * Duration/Expected-finish inputs (an LOE's duration is span-derived) and shows the explanatory hint,
 * and that a create submits `type: LEVEL_OF_EFFORT` with a zeroed duration. Flag-off behaviour (option
 * absent, a seeded LOE still shown) is covered in `ActivityFormDialog.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_ACTIVITY_TYPES_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const BASE_LOE: ActivitySummary = {
  id: 'loe1',
  planId: 'pl1',
  code: 'LOE1',
  name: 'Supervision',
  description: null,
  type: 'LEVEL_OF_EFFORT',
  durationDays: 0,
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
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
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

describe('ActivityFormDialog — advanced activity types (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...BASE_LOE, id: 'new' });
  });

  it('offers Level of effort in the Type picker', () => {
    renderDialog();
    expect(screen.getByRole('option', { name: 'Level of effort' })).toBeInTheDocument();
  });

  it('hides the Duration and Expected-finish inputs and explains the derived span when LOE is chosen', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'LEVEL_OF_EFFORT' } });
    expect(screen.queryByLabelText('Duration (working days)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expected finish (optional)')).not.toBeInTheDocument();
    expect(screen.getByText(/duration is derived from its span/i)).toBeInTheDocument();
  });

  it('creates a Level-of-effort activity with a zeroed duration', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Supervision' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'LEVEL_OF_EFFORT' } });
    fireEvent.click(screen.getByRole('button', { name: /create|save/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    const body = JSON.parse(init?.body as string);
    expect(body.type).toBe('LEVEL_OF_EFFORT');
    expect(body.durationDays).toBe(0);
  });
});
