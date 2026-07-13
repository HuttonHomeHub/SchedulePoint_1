import type { PlanEditLockActor, PlanEditLockStatus } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';

import type { PlanPen } from '../api/use-plan-edit-lock';

import { CompactPenStatus } from './CompactPenStatus';

const JANE: PlanEditLockActor = { id: 'user-jane', name: 'Jane Doe', email: 'jane@x.com' };

function status(overrides: Partial<PlanEditLockStatus>): PlanEditLockStatus {
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
    ...overrides,
  };
}

function makePen(overrides: Partial<PlanPen> = {}): PlanPen {
  return {
    penManaged: true,
    status: undefined,
    holdsPen: false,
    isPending: false,
    lostControl: null,
    dismissLost: vi.fn(),
    startEditing: vi.fn(),
    stopEditing: vi.fn(),
    requestControl: vi.fn(),
    handoff: vi.fn(),
    takeOver: vi.fn(),
    onWriteRejected: vi.fn(() => ({ kind: 'passthrough' as const })),
    ...overrides,
  };
}

describe('CompactPenStatus (ADR-0031 — compact pen surface)', () => {
  it('renders nothing when the pen layer is off', () => {
    const { container } = render(<CompactPenStatus pen={makePen({ penManaged: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a polite live region so transitions are announced (WCAG 4.1.3)', () => {
    render(
      <CompactPenStatus pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('offers Start editing on a free plan and calls startEditing (parity with the banner)', () => {
    const pen = makePen({ status: status({ state: 'FREE', canAcquire: true }) });
    render(<CompactPenStatus pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }));
    expect(pen.startEditing).toHaveBeenCalledOnce();
  });

  it('offers Stop editing while holding and calls stopEditing', () => {
    const pen = makePen({ status: status({ state: 'HELD_BY_ME', holder: JANE }), holdsPen: true });
    render(<CompactPenStatus pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop editing' }));
    expect(pen.stopEditing).toHaveBeenCalledOnce();
  });

  it('keeps the full hand-off reachable: Request control on a peer-held plan', () => {
    const pen = makePen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true }),
    });
    render(<CompactPenStatus pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request control' }));
    expect(pen.requestControl).toHaveBeenCalledOnce();
  });

  it('shows a terse loading chip while status resolves', () => {
    render(<CompactPenStatus pen={makePen({ status: undefined })} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <CompactPenStatus pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
