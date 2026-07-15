import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddDependencyDialog, type LinkDirection } from './AddDependencyDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

function activity(id: string, name: string): ActivitySummary {
  return {
    id,
    planId: 'pl1',
    code: null,
    name,
    description: null,
    type: 'TASK',
    durationDays: 1,
    constraintType: null,
    constraintDate: null,
    laneIndex: 0,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
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
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const ANCHOR = activity('anchor', 'Pour slab');
const OPTIONS = [activity('a1', 'Excavate'), activity('c1', 'Cure')];

function renderDialog(direction: LinkDirection, options: ActivitySummary[] = OPTIONS) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AddDependencyDialog
        orgSlug="acme"
        planId="pl1"
        anchor={ANCHOR}
        direction={direction}
        options={options}
        open
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('AddDependencyDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({});
  });

  it('adds a predecessor: the chosen activity → the anchor', async () => {
    renderDialog('predecessor');
    fireEvent.change(screen.getByLabelText('Predecessor activity'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText(/Lag \(working days/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/dependencies');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      predecessorId: 'a1',
      successorId: 'anchor',
      type: 'FS',
      lagDays: 2,
      lagCalendar: 'PROJECT_DEFAULT', // the default when the selector isn't touched
    });
  });

  it('sends the chosen 24-hour lag calendar (M3, ADR-0036 §6)', async () => {
    renderDialog('successor');
    fireEvent.change(screen.getByLabelText('Successor activity'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText('Lag calendar'), {
      target: { value: 'TWENTY_FOUR_HOUR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ lagCalendar: 'TWENTY_FOUR_HOUR' });
  });

  it('adds a successor: the anchor → the chosen activity', async () => {
    renderDialog('successor');
    fireEvent.change(screen.getByLabelText('Successor activity'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'SS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ predecessorId: 'anchor', successorId: 'c1', type: 'SS' });
  });

  it('surfaces a server rejection (e.g. a cycle) inline', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new Error('This dependency would create a cycle in the schedule.'),
    );
    renderDialog('successor');
    fireEvent.change(screen.getByLabelText('Successor activity'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));

    await waitFor(() => expect(screen.getByText(/would create a cycle/)).toBeInTheDocument());
  });

  it('shows a way-out empty state when the plan has no other activities', () => {
    renderDialog('predecessor', []);
    expect(screen.getByText(/no other activities to link to/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Predecessor activity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('requires choosing an activity', async () => {
    renderDialog('predecessor');
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    await waitFor(() =>
      expect(screen.getAllByText('Choose an activity.').length).toBeGreaterThan(0),
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
