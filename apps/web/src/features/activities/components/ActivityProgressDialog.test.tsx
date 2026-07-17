import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityProgressDialog } from './ActivityProgressDialog';

import { apiFetchEnvelope } from '@/lib/api/client';

// Progress ingestion is default-on now; this suite covers the flag-OFF editor (percent + actual
// dates only), so pin it off. The flag-ON inputs live in `ActivityProgressDialog.progress.test.tsx`.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PROGRESS_INGESTION_ENABLED: false,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchEnvelope: vi.fn() }));

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
  percentCompleteType: 'DURATION',
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

describe('ActivityProgressDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope).mockReset().mockResolvedValue({ data: ACTIVITY });
  });

  it('PATCHes the progress endpoint with the percentage, date and version', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(/Actual start/), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => expect(apiFetchEnvelope).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetchEnvelope).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1/progress');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      percentComplete: 40,
      actualStart: '2026-05-01',
      actualFinish: null,
      version: 3,
    });
  });

  it('previews the status derived from the numbers', () => {
    renderDialog();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '40' } });
    expect(screen.getByText('In progress')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '100' } });
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('rejects a finish before the start without calling the API', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Actual start/), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText(/Actual finish/), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() =>
      expect(screen.getAllByText(/Finish cannot be before the start/).length).toBeGreaterThan(0),
    );
    expect(apiFetchEnvelope).not.toHaveBeenCalled();
  });

  it('hides the progress-ingestion inputs when the flag is off but round-trips a seeded value', async () => {
    // Flag off (this file mocks no env): the remaining/suspend/resume inputs never render, yet a
    // stored value seeded from the row still round-trips through a save unchanged (ADR-0035).
    renderDialog({
      ...ACTIVITY,
      remainingDurationDays: 2,
      suspendDate: '2026-05-08',
      resumeDate: '2026-05-12',
    });
    expect(screen.queryByLabelText(/Remaining duration/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Suspend date/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    await waitFor(() => expect(apiFetchEnvelope).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(apiFetchEnvelope).mock.calls[0]![1]?.body as string)).toMatchObject(
      {
        remainingDurationDays: 2,
        suspendDate: '2026-05-08',
        resumeDate: '2026-05-12',
      },
    );
  });
});
