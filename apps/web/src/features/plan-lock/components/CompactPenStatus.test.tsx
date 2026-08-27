import type { PlanEditLockActor, PlanEditLockStatus } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { PlanPen } from '../api/use-plan-edit-lock';

import { CompactPenStatus } from './CompactPenStatus';

import { PenStatusOutlet, PlanSlotProvider } from '@/components/layout/workspace/plan-slot-host';

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

  /**
   * The split (the one-row header, 2026-08-26): the sentence is a fact and portals to the plan
   * status bar; the badge and every hand-off control stay on the plan's identity row.
   *
   * The cases above are the before/after oracle and are deliberately unedited — with no outlet
   * registered the sentence renders in place, so they describe the pre-split markup. These describe
   * what the split must not lose.
   */
  describe('the sentence is a fact and the controls are actions', () => {
    it('keeps exactly one live region, and it is the sentence', () => {
      render(
        <CompactPenStatus pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
      );

      // Two live regions announcing one state change is the failure a reader with a screen reader
      // meets and a reader with eyes does not, so the count is the assertion.
      const regions = screen.getAllByRole('status');
      expect(regions).toHaveLength(1);
      expect(regions[0]).toHaveAttribute('aria-live', 'polite');
      expect(regions[0]).toHaveAttribute('aria-atomic', 'true');
      expect(regions[0]).toHaveTextContent('No one is editing this plan.');
    });

    it('announces a complete sentence, and does not repeat the badge word', () => {
      render(
        <CompactPenStatus
          pen={makePen({ status: status({ state: 'HELD_BY_ME', holder: JANE }), holdsPen: true })}
        />,
      );

      // Every sentence in `lock-copy.ts` is self-contained, so the region needs nothing added to be
      // complete. An `sr-only` copy of the badge word shipped here for one commit and was wrong
      // twice: the container announces its own contents AND its description on focus return, so the
      // word was read twice — and `e2e-edit/pen-smoke.spec.ts` went red on `getByText('Available')`
      // resolving to two elements, a journey written for something else catching a duplication no
      // unit test had reason to look for. This pins the absence.
      const region = screen.getByRole('status');
      expect(region).toHaveTextContent(/editing this plan/i);
      expect(screen.getAllByText('Editing')).toHaveLength(1);
    });

    /**
     * **Two states keep the sentence painted** (foot-row epic M7, architecture gate B3).
     *
     * The class is the assertion, and it has to be, because `sr-only` is visually hidden and jsdom
     * has no layout: `toBeVisible()` passes for both states. Asserting the class is asserting the
     * mechanism, which is what regressed — the sentence was made `sr-only` unconditionally, leaving
     * a planner whose pen had just been taken with a flipped badge, a bare Dismiss and no words.
     *
     * **Verified red** against the unconditional `sr-only`.
     */
    it('paints the sentence when the pen is taken from the reader, and hides it otherwise', () => {
      const { unmount } = render(
        <CompactPenStatus
          pen={makePen({
            status: status({ state: 'HELD_BY_ME' }),
            lostControl: 'PLAN_EDIT_LOCK_LOST',
          })}
        />,
      );
      expect(screen.getByRole('status')).not.toHaveClass('sr-only');
      unmount();

      // The pinned negative: the common state still pays nothing, which is the whole of M3.
      render(<CompactPenStatus pen={makePen({ status: status({ state: 'FREE' }) })} />);
      expect(screen.getByRole('status')).toHaveClass('sr-only');
    });

    it('paints it for an incoming request, whose actor the badge may not name', () => {
      render(
        <CompactPenStatus
          pen={makePen({
            status: status({ state: 'HELD_BY_ME', requestedBy: JANE }),
            holdsPen: true,
          })}
        />,
      );
      const region = screen.getByRole('status');
      expect(region).not.toHaveClass('sr-only');
      expect(region).toHaveTextContent(/Jane/);
    });

    it('describes the controls container by the sentence, so focus return still says what happened', () => {
      const { container } = render(
        <CompactPenStatus pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
      );

      const controls = container.firstElementChild;
      const describedBy = controls?.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      // Resolved by id, which is what makes it survive the portal: the sentence is in another part
      // of the document once a status bar has adopted it.
      expect(document.getElementById(describedBy!)).toBe(screen.getByRole('status'));
    });

    it('returns focus to the controls, not to the status bar, after an action unmounts its button', async () => {
      // The failure this pins is silent: `usePenLockView`'s `containerRef` also scrolls the surface
      // into view when the pen is lost, so attaching it to the moved sentence throws focus AND the
      // viewport to the other end of the screen after every Start/Stop. A test asserting only
      // "focus is not on `<body>`" passes against that, and so does one run without an outlet —
      // because in the in-place fallback the sentence is nested INSIDE the controls container and
      // "focus is inside the controls" is then true either way. So this case registers a real
      // outlet, which is the only arrangement in which the two answers differ.
      const pen = makePen({ status: status({ state: 'FREE', canAcquire: true }) });
      const withOutlet = (p: PlanPen): React.ReactElement => (
        <PlanSlotProvider>
          <div data-testid="status-bar">
            <PenStatusOutlet />
          </div>
          <div data-testid="identity-row">
            <CompactPenStatus pen={p} />
          </div>
        </PlanSlotProvider>
      );

      const { rerender } = render(withOutlet(pen));

      // The split really happened: the sentence is in the status bar and the button is not.
      expect(screen.getByTestId('status-bar')).toContainElement(screen.getByRole('status'));
      expect(screen.getByTestId('identity-row')).toContainElement(
        screen.getByRole('button', { name: 'Start editing' }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Start editing' }));
      rerender(
        withOutlet(
          makePen({
            ...pen,
            status: status({ state: 'HELD_BY_ME', holder: JANE }),
            holdsPen: true,
          }),
        ),
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('identity-row')).toContainElement(
          document.activeElement as HTMLElement,
        );
      });
      expect(screen.getByTestId('status-bar')).not.toContainElement(
        document.activeElement as HTMLElement,
      );
    });

    it('renders neither half when the pen layer is off', () => {
      const { container } = render(<CompactPenStatus pen={makePen({ penManaged: false })} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <CompactPenStatus pen={makePen({ status: status({ state: 'FREE', canAcquire: true }) })} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
