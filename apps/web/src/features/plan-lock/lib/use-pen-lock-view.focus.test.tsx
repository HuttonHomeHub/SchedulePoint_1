import type { PlanEditLockStatus } from '@repo/types';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlanPen } from '../api/use-plan-edit-lock';
import { EditLockControls } from '../components/EditLockControls';

import { usePenLockView } from './use-pen-lock-view';

/**
 * The focus hand-back when a colleague's act removes the control the reader was on (#588, ADR-0135
 * D2/D3 by containment), and the holder's "Keep editing" dismissal resetting once the request is gone.
 * jsdom has real focus, so `document.activeElement` is the fact asserted.
 */

const ME = { id: 'me', name: 'Me', email: 'me@x.com' };
const BEN = { id: 'ben', name: 'Ben Lee', email: 'ben@x.com' };
const ALEX = { id: 'alex', name: 'Alexandra Smith', email: 'a@x.com' };

function status(over: Partial<PlanEditLockStatus>): PlanEditLockStatus {
  return {
    planId: 'p1',
    state: 'FREE',
    holder: null,
    expiresAt: null,
    heartbeatAt: null,
    requestedBy: null,
    graceEndsAt: null,
    canAcquire: false,
    canRequest: false,
    canTakeOver: false,
    canOverride: false,
    ...over,
  };
}

const CALLBACKS = {
  dismissLost: vi.fn(),
  startEditing: vi.fn(),
  stopEditing: vi.fn(),
  requestControl: vi.fn(),
  cancelRequest: vi.fn(),
  handoff: vi.fn(),
  takeOver: vi.fn(),
  onWriteRejected: vi.fn(),
};

function pen(s: PlanEditLockStatus): PlanPen {
  return {
    status: s,
    holdsPen: s.state === 'HELD_BY_ME',
    isPending: false,
    autoAcquiring: false,
    lostControl: null,
    ...CALLBACKS,
  };
}

function Harness({ p, outside }: { p: PlanPen; outside?: boolean }) {
  const { view, containerRef, controlsProps } = usePenLockView(p, 'me', 1_700_000_000_000);
  return (
    <>
      <button type="button">elsewhere</button>
      <div ref={containerRef} tabIndex={-1} data-testid="pen">
        <span role="status">{view?.message}</span>
        {outside ? null : <EditLockControls {...controlsProps} />}
      </div>
    </>
  );
}

const waiting = status({
  state: 'HELD_BY_OTHER',
  holder: ALEX,
  canRequest: true,
  requestedBy: ME,
});
const holding = status({ state: 'HELD_BY_ME', holder: ME });

describe('usePenLockView focus and dismissal (#588)', () => {
  it('focus on Cancel request, then a colleague hands over: focus lands on the container', () => {
    const { rerender } = render(<Harness p={pen(waiting)} />);
    act(() => screen.getByRole('button', { name: 'Cancel request' }).focus());
    rerender(<Harness p={pen(holding)} />);
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('pen'));
  });

  it('focus elsewhere in the workspace is left alone when the control goes', () => {
    const { rerender } = render(<Harness p={pen(waiting)} />);
    act(() => screen.getByRole('button', { name: 'elsewhere' }).focus());
    rerender(<Harness p={pen(holding)} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'elsewhere' }));
  });

  it('the holder who kept editing past Ben sees Ben ask again after the request was withdrawn', () => {
    const asking = status({ state: 'HELD_BY_ME', holder: ME, requestedBy: BEN });
    const { rerender } = render(<Harness p={pen(asking)} />);
    act(() => screen.getByRole('button', { name: 'Keep editing' }).click());
    expect(screen.queryByRole('button', { name: 'Hand over' })).toBeNull();
    rerender(<Harness p={pen(holding)} />);
    rerender(<Harness p={pen(asking)} />);
    expect(screen.getByRole('button', { name: 'Hand over' })).toBeVisible();
  });
});
