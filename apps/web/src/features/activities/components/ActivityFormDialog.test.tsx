import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

// This is the BASE form suite — the M4/M5 flag surfaces (advanced constraints, per-activity calendar,
// advanced activity types) are on by default, so pin them off here; their flag-on behaviour lives in the
// dedicated `.advanced-constraints.test.tsx` / `.calendar.test.tsx` / `.activity-types.test.tsx` suites.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: false,
  ACTIVITY_CALENDAR_ENABLED: false,
  ADVANCED_ACTIVITY_TYPES_ENABLED: false,
}));

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

describe('ActivityFormDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates a task with name, type and duration', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      type: 'TASK',
      durationDays: 10,
    });
  });

  it('hides duration for a milestone and sends 0', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kickoff' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText(/Duration/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ type: 'START_MILESTONE', durationDays: 0 });
  });

  it('does not offer advanced activity types (Level of effort) while the flag is off', () => {
    // This suite pins VITE_ADVANCED_ACTIVITY_TYPES off (it defaults on), so the picker shows only the
    // three fully-supported types — no Level of effort (or Hammock).
    renderDialog();
    expect(screen.queryByRole('option', { name: 'Level of effort' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hammock' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Task' })).toBeInTheDocument();
  });

  it('still shows a seeded Level-of-effort value when editing with the flag off (honest selector)', () => {
    // Editing an LOE activity while the flag is off keeps its own type visible and selected rather than
    // silently coercing it — the same honest-selector rule the parked-constraint case follows.
    renderDialog({ activity: { ...ACTIVITY, type: 'LEVEL_OF_EFFORT', durationDays: 0 } });
    expect(screen.getByLabelText('Type')).toHaveValue('LEVEL_OF_EFFORT');
    expect(screen.getByRole('option', { name: 'Level of effort' })).toBeInTheDocument();
  });

  it('round-trips a seeded WBS parentId on a no-op save with the flag off', async () => {
    // The WBS parent picker is hidden (flag off), but the dialog seeds parentId from the row so editing
    // something else must never silently un-nest the activity — same rule as the calendar/constraint seeds.
    renderDialog({ activity: { ...ACTIVITY, parentId: 'wbs-parent-1' } });
    expect(screen.queryByLabelText('WBS summary (optional)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body.parentId).toBe('wbs-parent-1');
    expect(body.version).toBe(4);
  });

  it('reveals the date once a constraint is chosen and sends the pair', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slab' } });
    expect(screen.queryByLabelText('Constraint date')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Constraint (optional)'), { target: { value: 'SNET' } });
    fireEvent.change(screen.getByLabelText('Constraint date'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ constraintType: 'SNET', constraintDate: '2026-06-01' });
  });

  it('offers only the six honoured constraint types (no parked MANDATORY_*)', () => {
    renderDialog();
    const select = screen.getByLabelText('Constraint (optional)');
    const values = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO']);
    expect(values).not.toContain('MANDATORY_START');
    expect(values).not.toContain('MANDATORY_FINISH');
    // The field explains itself (G3).
    expect(
      screen.getByText(/Only constraints the scheduler applies exactly as named/),
    ).toBeInTheDocument();
  });

  it('shows a legacy parked value honestly and round-trips it on a no-op save (no silent coercion)', async () => {
    const parked: ActivitySummary = {
      ...ACTIVITY,
      constraintType: 'MANDATORY_START',
      constraintDate: '2026-05-01',
      calendarId: null,
    };
    renderDialog({ activity: parked });
    const select = screen.getByLabelText('Constraint (optional)');
    // The current value is shown as an honest, pre-selected option (not silently changed to MSO).
    expect(select).toHaveValue('MANDATORY_START');
    expect(
      within(select).getByRole('option', { name: 'Mandatory start — applied as Must start on' }),
    ).toBeInTheDocument();
    // Save without touching the constraint → the stored value round-trips unchanged.
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string)).toMatchObject({
      version: 4,
      constraintType: 'MANDATORY_START',
      constraintDate: '2026-05-01',
    });
  });

  it('drops the parked option once the planner switches to a honoured type', () => {
    const parked: ActivitySummary = {
      ...ACTIVITY,
      constraintType: 'MANDATORY_FINISH',
      constraintDate: '2026-05-01',
      calendarId: null,
    };
    renderDialog({ activity: parked });
    const select = screen.getByLabelText('Constraint (optional)');
    expect(within(select).getAllByRole('option')).toHaveLength(8); // None + 6 + the parked one
    fireEvent.change(select, { target: { value: 'FNLT' } });
    // The honest legacy option disappears — the planner can't re-pick a parked type.
    expect(within(select).getAllByRole('option')).toHaveLength(7); // None + 6
    expect(
      within(select).queryByRole('option', { name: /Mandatory finish/ }),
    ).not.toBeInTheDocument();
  });

  it('seeds edit mode and clears the constraint by sending nulls with the version', async () => {
    renderDialog({ activity: ACTIVITY });
    expect(screen.getByLabelText('Name')).toHaveValue('Excavate');
    expect(screen.getByLabelText('Constraint (optional)')).toHaveValue('SNET');
    // Remove the constraint.
    fireEvent.change(screen.getByLabelText('Constraint (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      version: 4,
      constraintType: null,
      constraintDate: null,
    });
  });

  it('round-trips seeded advanced-constraint values on a no-op save with the flag off', async () => {
    // The advanced fields (secondary constraint, ALAP, expected finish) aren't rendered while
    // VITE_ADVANCED_CONSTRAINTS is off (the default here), but the dialog still seeds them from the
    // row, so editing something else must never silently clear a stored value.
    renderDialog({
      activity: {
        ...ACTIVITY,
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-06-01',
        scheduleAsLateAsPossible: true,
        expectedFinish: '2026-05-20',
      },
    });
    // The advanced controls are hidden with the flag off.
    expect(screen.queryByLabelText('Secondary constraint')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Schedule as late as possible')).not.toBeInTheDocument();
    // Change only the name and save — the seeded advanced values must ride through unchanged.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavate deeper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      version: 4,
      secondaryConstraintType: 'FNLT',
      secondaryConstraintDate: '2026-06-01',
      scheduleAsLateAsPossible: true,
      expectedFinish: '2026-05-20',
    });
  });
});
