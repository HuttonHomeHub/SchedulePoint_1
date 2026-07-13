import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionActionsBar, type SelectionActionContext } from './selection-actions';

const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onSetConstraint: vi.fn(),
  onDelete: vi.fn(),
};

function ctx(over: Partial<SelectionActionContext> = {}): SelectionActionContext {
  return {
    targetName: 'Excavate',
    canEditSchedule: true,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onSetConstraint: spies.onSetConstraint,
    onDelete: spies.onDelete,
    ...over,
  };
}

const anchor = { top: 300, centerX: 500 };

beforeEach(() => vi.clearAllMocks());

describe('SelectionActionsBar (floating selection actions)', () => {
  it('renders nothing when nothing is selected', () => {
    const { container } = render(<SelectionActionsBar anchor={null} ctx={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows the object actions for the selected activity, named after it', () => {
    render(<SelectionActionsBar anchor={anchor} ctx={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    expect(within(bar).getByRole('button', { name: 'Open logic' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Edit activity' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Set constraint' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete activity' })).toBeInTheDocument();
  });

  it('runs the read action (open logic) even in read-only', () => {
    render(<SelectionActionsBar anchor={anchor} ctx={ctx({ canEditSchedule: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open logic' }));
    expect(spies.onOpenLogic).toHaveBeenCalledOnce();
  });

  it('pen-gates the mutating actions as a set when editing is not allowed', () => {
    render(<SelectionActionsBar anchor={anchor} ctx={ctx({ canEditSchedule: false })} />);
    for (const name of ['Edit activity', 'Set constraint', 'Delete activity']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(btn);
    }
    expect(spies.onEdit).not.toHaveBeenCalled();
    expect(spies.onDelete).not.toHaveBeenCalled();
    expect(spies.onSetConstraint).not.toHaveBeenCalled();
  });

  it('runs the mutating actions when editing is allowed', () => {
    render(<SelectionActionsBar anchor={anchor} ctx={ctx({ canEditSchedule: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete activity' }));
    expect(spies.onEdit).toHaveBeenCalledOnce();
    expect(spies.onDelete).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    render(<SelectionActionsBar anchor={anchor} ctx={ctx()} />);
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});
