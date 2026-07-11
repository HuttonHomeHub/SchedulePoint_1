import type { PlanEditLockActor } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LockAction } from '../lib/lock-view';

import { EditLockControls } from './EditLockControls';

const JANE: PlanEditLockActor = { id: 'j', name: 'Jane Doe', email: 'jane@x.com' };

function handlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRequest: vi.fn(),
    onTakeOver: vi.fn(),
    onOverride: vi.fn(),
    onHandover: vi.fn(),
    onKeep: vi.fn(),
    onDismiss: vi.fn(),
  };
}

function renderControls(
  actions: LockAction[],
  extra: Partial<Parameters<typeof EditLockControls>[0]> = {},
) {
  const h = handlers();
  render(<EditLockControls actions={actions} holder={JANE} isPending={false} {...h} {...extra} />);
  return h;
}

describe('EditLockControls', () => {
  it('renders nothing when there are no actions', () => {
    const { container } = render(
      <EditLockControls actions={[]} holder={null} isPending={false} {...handlers()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['start', 'Start editing', 'onStart'],
    ['stop', 'Stop editing', 'onStop'],
    ['request', 'Request control', 'onRequest'],
    ['takeover', 'Take over now', 'onTakeOver'],
    ['handover', 'Hand over', 'onHandover'],
    ['keep', 'Keep editing', 'onKeep'],
    ['dismiss', 'Dismiss', 'onDismiss'],
  ] as const)('maps the %s action to its button and handler', (action, label, handler) => {
    const h = renderControls([action]);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(h[handler]).toHaveBeenCalled();
  });

  it('renders the "waiting" action as a disabled Take over now (no handler)', () => {
    renderControls(['waiting']);
    expect(screen.getByRole('button', { name: 'Take over now' })).toBeDisabled();
  });

  it('confirms the admin override through a dialog before calling onOverride', () => {
    const h = renderControls(['override']);
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(h.onOverride).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Take over' }));
    expect(h.onOverride).toHaveBeenCalledTimes(1);
  });

  it('disables the actionable buttons while a mutation is pending', () => {
    renderControls(['start'], { isPending: true });
    expect(screen.getByRole('button', { name: 'Start editing' })).toBeDisabled();
  });
});
