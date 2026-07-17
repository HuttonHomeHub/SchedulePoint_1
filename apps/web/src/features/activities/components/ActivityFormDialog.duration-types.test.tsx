import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The duration-type picker (ADR-0040, M7 rung 4) with `VITE_DURATION_TYPES` forced ON — the surface
 * ships dark by default, so this suite pins the flag to prove the picker renders, persists, round-trips
 * a seeded value, and is hidden for a type with no entered duration (a milestone). (The flag-off
 * behaviour — picker hidden, seeded value still round-trips — is covered by `ActivityFormDialog.test.tsx`.)
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DURATION_TYPES_ENABLED: true,
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
  durationType: 'FIXED_UNITS',
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

describe('ActivityFormDialog — duration type (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity carrying the chosen duration type', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Duration type'), { target: { value: 'FIXED_UNITS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      durationType: 'FIXED_UNITS',
    });
  });

  it('seeds the duration type from the row and round-trips it on save', async () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('Duration type')).toHaveValue('FIXED_UNITS');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      version: 4,
      durationType: 'FIXED_UNITS',
    });
  });

  it('hides the picker for a milestone (no entered duration / units)', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText('Duration type')).not.toBeInTheDocument();
  });
});
