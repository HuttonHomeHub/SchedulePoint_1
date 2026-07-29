import type { ActivityStep, ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stepKeys } from '../api/use-activity-steps';

import { WeightedStepsPanel } from './ActivityProgressPanels';

import { apiFetch } from '@/lib/api/client';

/**
 * The **editor's** steps panel — the Progress tab's third scope (ADR-0060 §4), which is a different
 * component from the legacy `ActivityStepsDialog` its suite covers. That split is why this gap
 * survived a review: the dialog's Save has always been its own button, so a defect in the panel's
 * `ScopeSaveBar` wiring is invisible from there.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_STEPS_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY = {
  id: 'a1',
  planId: 'pl1',
  name: 'Pour foundations',
  code: 'A100',
  type: 'TASK',
  durationDays: 5,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  physicalPercentComplete: 40,
  version: 3,
} as ActivitySummary;

const STEP: ActivityStep = {
  id: 'st-1',
  activityId: 'a1',
  seq: 1,
  name: 'Rebar',
  weight: 2,
  percentComplete: 25,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(stepKeys.listByActivity('acme', 'a1'), [STEP]);
  return render(
    <QueryClientProvider client={queryClient}>
      <WeightedStepsPanel
        orgSlug="acme"
        planId="pl1"
        activity={ACTIVITY}
        gate={{ writable: true, reason: null, readable: true }}
        open
        announce={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('WeightedStepsPanel', () => {
  beforeEach(() => {
    // The save invalidates the step list, which refetches through this same mock.
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('confirms a successful save in the bar, not only to a screen reader', async () => {
    // This panel was the one `ScopeSaveBar` caller that never passed `saved`: after a save the
    // helper text went from "Unsaved changes in this section." to blank and the button greyed —
    // pixel-identical to a panel nobody had touched, in a dialog that deliberately stays open.
    renderPanel();
    fireEvent.change(screen.getByLabelText('Step 1 % complete'), { target: { value: '50' } });
    expect(screen.getByText('Unsaved changes in this section.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save steps' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shades Save with the scope’s reason rather than disabling it silently', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(stepKeys.listByActivity('acme', 'a1'), [STEP]);
    render(
      <QueryClientProvider client={queryClient}>
        <WeightedStepsPanel
          orgSlug="acme"
          planId="pl1"
          activity={ACTIVITY}
          gate={{
            writable: false,
            reason: 'Start editing to change this activity.',
            readable: true,
          }}
          open
          announce={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const save = screen.getByRole('button', { name: 'Save steps' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    const reasonId = save.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent(
      'Start editing to change this activity.',
    );
  });
});
