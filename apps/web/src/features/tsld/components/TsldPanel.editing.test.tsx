import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The M2 editing gate reads a build-time flag; force it on for these tests.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, TSLD_EDITING_ENABLED: true };
});

import { TsldPanel } from './TsldPanel';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    laneIndex: 0,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    isCritical: true,
    isNearCritical: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NO_DEPS: DependencySummary[] = [];

function renderEditable(onCreate = vi.fn().mockResolvedValue({ recalcConflict: null })) {
  const utils = render(
    <TsldPanel
      activities={[activity()]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      onCreate={onCreate}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { ...utils, canvas, onCreate };
}

describe('TsldPanel editing (M2, flag on)', () => {
  it('shows the editing toolbar with a Select / Add activity tool', () => {
    renderEditable();
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add activity' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('creates via drag in add-activity mode: gesture → name popover → onCreate', async () => {
    const { canvas, onCreate } = renderEditable();
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));

    // Drag on the canvas to draw a bar, then release.
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 50, pointerId: 1 });

    // The name popover opens; name it and commit.
    const input = await screen.findByLabelText('New activity name');
    fireEvent.change(input, { target: { value: 'Pour slab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pour slab' })),
    );
  });

  it('on a recalc conflict keeps the created row: closes the popover and shows the banner', async () => {
    const onCreate = vi.fn().mockResolvedValue({ recalcConflict: 'Recalculating elsewhere.' });
    const { canvas } = renderEditable(onCreate);
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.change(await screen.findByLabelText('New activity name'), {
      target: { value: 'Pour slab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Popover closes (row persisted → never re-POSTs) and the conflict shows in the banner.
    await waitFor(() =>
      expect(screen.queryByLabelText('New activity name')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Recalculating elsewhere.');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('on a create failure keeps the popover open with the inline error (no re-POST yet)', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('That name is taken'));
    const { canvas } = renderEditable(onCreate);
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.change(await screen.findByLabelText('New activity name'), {
      target: { value: 'Excavate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('That name is taken')).toBeInTheDocument();
    expect(screen.getByLabelText('New activity name')).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('cancels the create popover without calling onCreate', async () => {
    const { canvas, onCreate } = renderEditable();
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 50, pointerId: 1 });

    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    expect(screen.queryByLabelText('New activity name')).not.toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
