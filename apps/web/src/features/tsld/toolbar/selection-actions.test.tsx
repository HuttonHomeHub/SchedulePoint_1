import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SelectionActionsBar, type SelectionActionContext } from './selection-actions';

const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

function ctx(over: Partial<SelectionActionContext> = {}): SelectionActionContext {
  return {
    targetName: 'Excavate',
    canEditSchedule: true,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
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

  it('shows the object actions for the selected activity, named after it', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    expect(within(bar).getByRole('button', { name: 'Open logic' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Edit activity' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete activity' })).toBeInTheDocument();
    // "Set constraint" was dropped (redundant with Edit; no dedicated quick-constraint editor).
    expect(within(bar).queryByRole('button', { name: 'Set constraint' })).not.toBeInTheDocument();
  });

  it('runs the read action (open logic) even in read-only', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open logic' }));
    expect(spies.onOpenLogic).toHaveBeenCalledOnce();
  });

  it('pen-gates the mutating actions as a set when editing is not allowed', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: false })} />);
    for (const name of ['Edit activity', 'Delete activity']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(btn);
    }
    expect(spies.onEdit).not.toHaveBeenCalled();
    expect(spies.onDelete).not.toHaveBeenCalled();
  });

  it('runs the mutating actions when editing is allowed', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete activity' }));
    expect(spies.onEdit).toHaveBeenCalledOnce();
    expect(spies.onDelete).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});
