import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SelectionActionsBar, type SelectionActionContext } from './selection-actions';

const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onSteps: vi.fn(),
};

function ctx(over: Partial<SelectionActionContext> = {}): SelectionActionContext {
  return {
    targetName: 'Excavate',
    canEditSchedule: true,
    canReportProgress: true,
    stepsEligible: true,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    onSteps: spies.onSteps,
    ...over,
  };
}

/** A stable anchor ref (the canvas writes this per frame in production). */
const anchorRef = { current: { top: 300, centerX: 500 } };

beforeEach(() => vi.clearAllMocks());

describe('SelectionActionsBar (floating selection actions)', () => {
  it('renders nothing when nothing is selected', () => {
    const { container } = render(
      <SelectionActionsBar anchorRef={{ current: null }} context={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows the object actions for the selected activity, named after it (table vocabulary)', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    // Wording converged with the activities table: Logic / Edit / Delete (not the old verbose labels).
    expect(within(bar).getByRole('button', { name: 'Logic' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Open logic' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Edit activity' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Delete activity' })).not.toBeInTheDocument();
  });

  it('registers only the three base actions when VITE_ENTRY_ROUTES is off (default)', () => {
    // This suite runs with the real (default-off) env, so the entry-route Progress/Resources/Steps
    // items are absent — the bar stays byte-for-byte the prior three-item set.
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    for (const name of ['Report progress', 'Resources', 'Steps']) {
      expect(within(bar).queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(within(bar).getAllByRole('button')).toHaveLength(3);
  });

  it('runs the read action (logic) even in read-only', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logic' }));
    expect(spies.onOpenLogic).toHaveBeenCalledOnce();
  });

  it('pen-gates the mutating actions as a set when editing is not allowed', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: false })} />);
    for (const name of ['Edit', 'Delete']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(btn);
    }
    expect(spies.onEdit).not.toHaveBeenCalled();
    expect(spies.onDelete).not.toHaveBeenCalled();
  });

  it('runs the mutating actions when editing is allowed', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(spies.onEdit).toHaveBeenCalledOnce();
    expect(spies.onDelete).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});
