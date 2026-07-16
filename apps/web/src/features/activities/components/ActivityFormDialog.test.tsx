import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import { apiFetch } from '@/lib/api/client';

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
  calendarId: null,
  laneIndex: 0,
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
  isCritical: false,
  isNearCritical: false,
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
});
