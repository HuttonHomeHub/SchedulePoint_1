import type { PlanEditLockActor, PlanEditLockStatus } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlanPen } from '../api/use-plan-edit-lock';

import { EditLockBanner } from './EditLockBanner';

const ME = 'user-me';
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

describe('EditLockBanner', () => {
  it('renders nothing when the pen layer is off', () => {
    const { container } = render(<EditLockBanner pen={makePen({ penManaged: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading placeholder (not silence) while status is resolving', () => {
    render(<EditLockBanner pen={makePen({ status: undefined })} />);
    expect(screen.getByText(/checking who’s editing/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the "Available" badge (not "Read-only") next to a Start CTA', () => {
    render(
      <EditLockBanner pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
    );
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
  });

  it('is a polite live region', () => {
    render(
      <EditLockBanner pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('offers Start editing on a free plan and calls startEditing', () => {
    const pen = makePen({ status: status({ state: 'FREE', canAcquire: true }) });
    render(<EditLockBanner pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }));
    expect(pen.startEditing).toHaveBeenCalled();
  });

  it('shows no Start button to a reader on a free plan', () => {
    render(
      <EditLockBanner pen={makePen({ status: status({ state: 'FREE', canAcquire: false }) })} />,
    );
    expect(screen.queryByRole('button', { name: 'Start editing' })).not.toBeInTheDocument();
  });

  it('offers Stop editing while holding and calls stopEditing', () => {
    const pen = makePen({ status: status({ state: 'HELD_BY_ME', holder: JANE }), holdsPen: true });
    render(<EditLockBanner pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop editing' }));
    expect(pen.stopEditing).toHaveBeenCalled();
  });

  it('shows who holds the pen (read-only) to a Viewer, no buttons', () => {
    render(
      <EditLockBanner
        pen={makePen({ status: status({ state: 'HELD_BY_OTHER', holder: JANE }) })}
      />,
    );
    expect(screen.getByText(/Jane is editing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Request control when held by another and calls requestControl', () => {
    const pen = makePen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true }),
    });
    render(<EditLockBanner pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request control' }));
    expect(pen.requestControl).toHaveBeenCalled();
  });

  it('offers Take over now once the server allows it', () => {
    const pen = makePen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true, canTakeOver: true }),
    });
    render(<EditLockBanner pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take over now' }));
    expect(pen.takeOver).toHaveBeenCalled();
  });

  it('admin Take over confirms through a dialog before calling takeOver', () => {
    const pen = makePen({
      status: status({
        state: 'HELD_BY_OTHER',
        holder: JANE,
        canRequest: true,
        canTakeOver: true,
        canOverride: true,
      }),
    });
    render(<EditLockBanner pen={pen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(pen.takeOver).not.toHaveBeenCalled(); // opens confirm first
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Take over' }));
    expect(pen.takeOver).toHaveBeenCalled();
  });

  it('shows the distinct lost-control banner and dismisses it', () => {
    const pen = makePen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE }),
      lostControl: 'PLAN_EDIT_LOCK_LOST',
    });
    render(<EditLockBanner pen={pen} />);
    expect(screen.getByText(/taken over/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(pen.dismissLost).toHaveBeenCalled();
  });

  it('lets the holder locally dismiss an incoming request with Keep editing', () => {
    const pen = makePen({
      status: status({ state: 'HELD_BY_ME', requestedBy: JANE }),
      holdsPen: true,
    });
    render(<EditLockBanner pen={pen} currentUserId={ME} />);
    expect(screen.getByText(/Jane is asking to edit/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    // Prompt gone; falls back to the plain holding row (Stop editing).
    expect(screen.queryByText(/asking to edit/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop editing' })).toBeInTheDocument();
  });
});
