import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The M5-epic advanced activity types (ADR-0035 §21/§24) with `VITE_ADVANCED_ACTIVITY_TYPES` forced ON —
 * the Type picker gains **Level of effort** and **WBS summary**. Proves the options render, that picking
 * one hides the Duration/Expected-finish inputs (their duration is derived) and shows the explanatory
 * hint, that the WBS parent picker offers the plan's summaries, and that a create submits the derived
 * type with a zeroed duration (and the chosen `parentId`). Flag-off behaviour (options absent, a seeded
 * value still shown) is covered in `ActivityFormDialog.test.tsx`.
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
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
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

  // A plan WBS summary passed as a parent option (route-composed like the calendars list).
  const SUMMARY: ActivitySummary = {
    ...BASE_LOE,
    id: 'wbs1',
    code: 'TT.4',
    name: 'Superstructure',
    type: 'WBS_SUMMARY',
  };

  it('offers WBS summary in the Type picker', () => {
    renderDialog();
    expect(screen.getByRole('option', { name: 'WBS summary' })).toBeInTheDocument();
  });

  it('hides the Duration input and explains the roll-up when WBS summary is chosen', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'WBS_SUMMARY' } });
    expect(screen.queryByLabelText('Duration (working days)')).not.toBeInTheDocument();
    expect(
      screen.getByText(/dates roll up from the activities grouped under it/i),
    ).toBeInTheDocument();
  });

  it('offers the plan’s summaries in the WBS parent picker (excluding the edited activity)', () => {
    renderDialog({ planActivities: [SUMMARY] });
    const parent = screen.getByLabelText('WBS summary (optional)');
    expect(parent).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'TT.4 · Superstructure' })).toBeInTheDocument();
    // The "None (top-level)" default is always present.
    expect(screen.getByRole('option', { name: 'None (top-level)' })).toBeInTheDocument();
  });

  it('guides the planner to create a summary when the plan has resolved with none', () => {
    renderDialog({ planActivities: [] });
    expect(screen.getByText(/There are no WBS summaries in this plan yet/i)).toBeInTheDocument();
  });

  it('does NOT assert an empty state while the plan activities are still loading', () => {
    // Loading and empty are distinct (UX_STANDARDS): the "no summaries yet" guidance must not show
    // while the list is pending, when the app doesn't yet know whether the plan has any.
    renderDialog({ planActivities: [], planActivitiesLoading: true });
    expect(
      screen.queryByText(/There are no WBS summaries in this plan yet/i),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('WBS summary (optional)')).toBeDisabled();
  });

  it('surfaces an honest error (not a false empty) when the plan activities fail to load', () => {
    renderDialog({ planActivities: [], planActivitiesError: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t load the plan’s activities/i);
    // The misleading "no summaries yet — create one" guidance must NOT show on a load failure.
    expect(
      screen.queryByText(/There are no WBS summaries in this plan yet/i),
    ).not.toBeInTheDocument();
  });

  it('creates an activity nested under the chosen WBS summary', async () => {
    renderDialog({ planActivities: [SUMMARY] });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour columns' } });
    fireEvent.change(screen.getByLabelText('WBS summary (optional)'), {
      target: { value: 'wbs1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create|save/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body.parentId).toBe('wbs1');
  });

  it('does not parent an activity to itself in edit mode', () => {
    // Editing the summary itself: it must not appear as its own parent option.
    renderDialog({ activity: SUMMARY, planActivities: [SUMMARY] });
    expect(screen.queryByRole('option', { name: 'TT.4 · Superstructure' })).not.toBeInTheDocument();
  });
});
