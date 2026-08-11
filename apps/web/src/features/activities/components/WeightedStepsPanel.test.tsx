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

/**
 * M0.5 — how this panel reports its problems (`ActivityProgressPanels.tsx:554`).
 *
 * Updated **here, at M0.5** rather than at M4: this file is the suite for the panel that holds the
 * seventh `FormProblemCount` call site, so M4-T3's bar is "unchanged by M4", not "unchanged".
 *
 * The rule, from `FormProblemCount`'s docblock and ADR-0077 §9: a field's problem belongs to the
 * field; the alert belongs to the form. One problem is silent, because `handleSubmit` has already
 * moved focus to the control carrying it. Two or more earn a count.
 *
 * **The second half of that rule does not arrive on this panel, and the case below pins the gap
 * rather than the rule.** This is the one call site whose form is a `useFieldArray`: every step's
 * error is nested under `steps.<i>.<field>`, so the top-level `errors` object holds a single
 * `steps` entry — an array, carrying no `message` of its own. `FormProblemCount` counts entries
 * that carry a message, so it counts zero here whatever the reader typed.
 *
 * Two things follow, and both matter for reading this file later. It is **not a regression**:
 * `FormErrorSummary`, the component M0.5 replaced, read `Object.values(errors)` the same way and was
 * equally silent, so the swap changed nothing observable on this panel. And it is **not fixed here**,
 * because M0.5 is forbidden production changes; the case is named as a gap so that a later fix
 * flips a named assertion instead of quietly making a passing test wrong.
 */
describe('WeightedStepsPanel — how problems are reported', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('states one step’s problem once, beside that step’s field', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Step 1 name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save steps' }));

    expect(await screen.findAllByText('Step name is required.')).toHaveLength(1);
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('GAP: says nothing at two problems either, because a step’s error is not the form’s', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 1 name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Step 2 name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save steps' }));

    // Each row still states its own problem beside its own control — the half of the rule that does
    // arrive, and the half a keyboard user reaches by the focus `handleSubmit` has already moved.
    expect(await screen.findAllByText('Step name is required.')).toHaveLength(2);
    // …and nothing tells a reader standing on row 2 that row 1 is wrong too. Asserted, not assumed:
    // this is the state a fix has to change, and it is the reason the gap is legible at all.
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
