import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The M2 editing gate reads a build-time flag; force it on for these tests.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, TSLD_EDITING_ENABLED: true };
});

// Capture live-region announcements so we can assert on (or the absence of) status messages.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import { TsldPanel } from './TsldPanel';

beforeEach(() => announceSpy.mockClear());

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

  it('repositions a bar by dragging its body in select mode → onReposition', async () => {
    const onReposition = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    const utils = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
      />,
    );
    const canvas = utils.container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    // Default (select) mode: grab the bar body (day 0 at lane 0 sits near x≈60) and drag right.
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'a1' })),
    );
    // A landed move announces success to the live region.
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('Moved')));
  });

  it('on a rejected reposition (stale version) shows the conflict banner and does not announce a move', async () => {
    const onReposition = vi.fn().mockResolvedValue({
      applied: false,
      conflict: 'This plan changed — your move wasn’t applied.',
    });
    const utils = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
      />,
    );
    const canvas = utils.container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 110, clientY: 54, pointerId: 1 });

    // The conflict is surfaced in the alert banner…
    expect(await screen.findByRole('alert')).toHaveTextContent('wasn’t applied');
    // …and the live region never claims the (rejected) move landed (WCAG 4.1.3).
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringContaining('Moved'));
  });

  it('selects (does not reposition) when a bar body is pressed without moving', async () => {
    const onReposition = vi.fn();
    const utils = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
      />,
    );
    const canvas = utils.container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    // Press and release on the bar body without moving → select, never a reposition.
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
    await waitFor(() =>
      expect(utils.container.querySelector('[role="option"][aria-selected="true"]')).not.toBeNull(),
    );
    expect(onReposition).not.toHaveBeenCalled();
  });

  it('a vertical body drag is a lane-only reposition (laneIndex only, no startDay, so no recalc)', async () => {
    const onReposition = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    const utils = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
      />,
    );
    const canvas = utils.container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    // Grab the lane-0 bar and drag straight down one row (LANE_HEIGHT = 28, fixed — no y zoom).
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 82, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 82, pointerId: 1 });
    await waitFor(() => expect(onReposition).toHaveBeenCalled());
    // Only the lane axis is reported — no startDay ⇒ the route takes the no-recalc lane path.
    expect(onReposition.mock.calls[0]?.[0]).toEqual({ activityId: 'a1', laneIndex: 1 });
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('lane 2')),
    );
  });

  it('nudges a bar one lane with Alt+↓ in the listbox (keyboard equivalent, lane-only)', async () => {
    const onReposition = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
      />,
    );
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // select the first activity
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true }); // Alt+↓ → nudge one lane down
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledWith({ activityId: 'a1', laneIndex: 1 }),
    );
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('lane 2')),
    );
  });

  it('draws a dependency by dragging from a bar edge to another bar → onLink (FS by default)', async () => {
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    const succ = activity({
      id: 'a2',
      name: 'Pour',
      laneIndex: 1,
      earlyStart: '2026-01-06',
      earlyFinish: '2026-01-08',
    });
    const utils = render(
      <TsldPanel
        activities={[activity(), succ]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onLink={onLink}
      />,
    );
    const canvas = utils.container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    // Grab a1's finish handle (right end ≈ x78) and release over a2's body (lane 1 ≈ y82).
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 82, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 130, clientY: 82, pointerId: 1 });
    await waitFor(() =>
      expect(onLink).toHaveBeenCalledWith({ predecessorId: 'a1', successorId: 'a2', type: 'FS' }),
    );
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('Linked')),
    );
  });

  it('picks SS when Shift is held during the link drag', async () => {
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    const succ = activity({
      id: 'a2',
      laneIndex: 1,
      earlyStart: '2026-01-06',
      earlyFinish: '2026-01-08',
    });
    const utils = render(
      <TsldPanel
        activities={[activity(), succ]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onLink={onLink}
      />,
    );
    const canvas = utils.container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1, shiftKey: true });
    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 82, pointerId: 1, shiftKey: true });
    fireEvent.pointerUp(canvas, { clientX: 130, clientY: 82, pointerId: 1, shiftKey: true });
    await waitFor(() =>
      expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'SS' })),
    );
  });

  it('on a cycle/duplicate rejection shows the banner and does not announce a link', async () => {
    const onLink = vi
      .fn()
      .mockResolvedValue({ applied: false, conflict: 'That link would create a cycle.' });
    const succ = activity({
      id: 'a2',
      laneIndex: 1,
      earlyStart: '2026-01-06',
      earlyFinish: '2026-01-08',
    });
    const utils = render(
      <TsldPanel
        activities={[activity(), succ]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onLink={onLink}
      />,
    );
    const canvas = utils.container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 82, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 130, clientY: 82, pointerId: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent('create a cycle');
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringContaining('Linked'));
  });

  it('opens the logic editor for the focused activity on Enter (keyboard link equivalent)', () => {
    const onOpenLogic = vi.fn();
    render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onLink={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
        onOpenLogic={onOpenLogic}
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox); // selects the first activity
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onOpenLogic).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('with no onLink wired, a handle grab downgrades to reposition (no dangling rubber-band)', async () => {
    const onReposition = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    const utils = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
        // deliberately no onLink → canLink is false
      />,
    );
    const canvas = utils.container.querySelector('canvas')!;
    // Grab a1's finish handle (x≈78) and drag: without a link handler it must reposition, not link.
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'a1' })),
    );
  });

  it('the conflict banner offers a Refresh that refetches and clears the banner', async () => {
    const onRefresh = vi.fn();
    const onLink = vi
      .fn()
      .mockResolvedValue({ applied: false, conflict: 'That link already exists.' });
    const succ = activity({
      id: 'a2',
      laneIndex: 1,
      earlyStart: '2026-01-06',
      earlyFinish: '2026-01-08',
    });
    const utils = render(
      <TsldPanel
        activities={[activity(), succ]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onLink={onLink}
        onRefresh={onRefresh}
      />,
    );
    const canvas = utils.container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 82, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 130, clientY: 82, pointerId: 1 });
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  // Two activities overlapping in time, both stacked in lane 0 → the packer moves the second to lane 1.
  const overlappingPair = (): ReturnType<typeof activity>[] => [
    activity(),
    activity({ id: 'a2', name: 'Pour', earlyStart: '2026-01-02', earlyFinish: '2026-01-04' }),
  ];

  it('auto-arranges lanes: toolbar → confirm dialog → onAutoArrange with the minimal packed changes', async () => {
    const onAutoArrange = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(
      <TsldPanel
        activities={overlappingPair()}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onAutoArrange={onAutoArrange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange lanes' }));
    // A confirm dialog guards the no-undo bulk reorder.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('can’t be undone');
    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    // Only the overlapping second bar moves — the minimal diff.
    await waitFor(() => expect(onAutoArrange).toHaveBeenCalledWith([{ id: 'a2', laneIndex: 1 }]));
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('auto-arranged')),
    );
  });

  it('on an all-or-nothing 409 shows the auto-arrange conflict banner', async () => {
    const onAutoArrange = vi.fn().mockResolvedValue({
      applied: false,
      conflict:
        'The plan changed since you opened it, so auto-arrange wasn’t applied. Refresh and try again.',
    });
    render(
      <TsldPanel
        activities={overlappingPair()}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onAutoArrange={onAutoArrange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange lanes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Auto-arrange' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('auto-arrange wasn’t applied');
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringContaining('auto-arranged'));
  });

  it('when lanes are already packed, the toolbar action says so immediately (no dialog, no batch call)', async () => {
    const onAutoArrange = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(
      <TsldPanel
        activities={[activity()]} // a single bar is already optimally in lane 0
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onAutoArrange={onAutoArrange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange lanes' }));
    // Nothing to pack → announce immediately, never open the confirm dialog or call the batch.
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('already arranged')),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onAutoArrange).not.toHaveBeenCalled();
  });
});
