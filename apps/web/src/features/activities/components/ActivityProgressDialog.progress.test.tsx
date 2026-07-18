import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityProgressDialog } from './ActivityProgressDialog';

import { apiFetchEnvelope } from '@/lib/api/client';

/**
 * The M2 progress-ingestion inputs (ADR-0035) — remaining duration + suspend/resume — with
 * `VITE_PROGRESS_INGESTION` forced ON. The feature ships dark by default, so this suite pins the flag
 * to prove the inputs render, persist a remaining/suspend/resume, round-trip a seeded value, and reject
 * a resume before its suspend. (Flag-off behaviour — inputs hidden, seeded values still round-trip — is
 * covered by `ActivityProgressDialog.test.tsx`.)
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PROGRESS_INGESTION_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetchEnvelope: vi.fn() }));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: null,
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
  status: 'IN_PROGRESS',
  percentComplete: 40,
  actualStart: '2026-05-01',
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
  accrualType: 'UNIFORM',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(activity: ActivitySummary = ACTIVITY) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityProgressDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={vi.fn()}
        activity={activity}
      />
    </QueryClientProvider>,
  );
}

describe('ActivityProgressDialog — progress ingestion (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope).mockReset().mockResolvedValue({ data: ACTIVITY });
  });

  it('sends an explicit remaining duration and suspend/resume dates', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Remaining duration/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Suspend date/), { target: { value: '2026-05-10' } });
    fireEvent.change(screen.getByLabelText(/Resume date/), { target: { value: '2026-05-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => expect(apiFetchEnvelope).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetchEnvelope).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      remainingDurationDays: 3,
      suspendDate: '2026-05-10',
      resumeDate: '2026-05-20',
      version: 3,
    });
  });

  it('sends null for a blank remaining (derive from percent) and blank suspend/resume', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => expect(apiFetchEnvelope).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetchEnvelope).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      remainingDurationDays: null,
      suspendDate: null,
      resumeDate: null,
    });
  });

  it('round-trips a seeded remaining/suspend/resume unchanged', async () => {
    renderDialog({
      ...ACTIVITY,
      remainingDurationDays: 2,
      suspendDate: '2026-05-08',
      resumeDate: '2026-05-12',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => expect(apiFetchEnvelope).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetchEnvelope).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      remainingDurationDays: 2,
      suspendDate: '2026-05-08',
      resumeDate: '2026-05-12',
    });
  });

  it('rejects a resume before its suspend without calling the API', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Suspend date/), { target: { value: '2026-05-20' } });
    fireEvent.change(screen.getByLabelText(/Resume date/), { target: { value: '2026-05-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() =>
      expect(screen.getAllByText(/Resume cannot be before the suspend/).length).toBeGreaterThan(0),
    );
    expect(apiFetchEnvelope).not.toHaveBeenCalled();
  });
});
