import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanFactsHost, PlanFactsOutlet, PlanFactsProvider } from './plan-facts-host';

/**
 * The facts host, tested against the **four** cases `canvas-dock.test.tsx` established — including
 * the two rules that were written there, shipped wrong, and rejected. They are re-asserted rather
 * than assumed to be inherited: this is a second registry with the same shape, and "it is a copy of
 * something correct" is the argument that lets a copy drift (ADR-0062).
 */
describe('PlanFactsHost', () => {
  it('renders in place when no outlet has registered — the narrow-layout fallback', () => {
    // Below `md` the activities handle row is NOT MOUNTED (measured: `m0-measurement.md`). This is
    // the case that keeps the plan's facts on the narrowest screens, so it is asserted first.
    render(
      <PlanFactsProvider>
        <PlanFactsHost>
          <span>Activities 5</span>
        </PlanFactsHost>
      </PlanFactsProvider>,
    );
    expect(screen.getByText('Activities 5')).toBeInTheDocument();
  });

  it('portals into the outlet when one is registered', () => {
    render(
      <PlanFactsProvider>
        <div data-testid="row">
          <PlanFactsOutlet />
        </div>
        <PlanFactsHost>
          <span>Activities 5</span>
        </PlanFactsHost>
      </PlanFactsProvider>,
    );
    const row = screen.getByTestId('row');
    expect(row).toContainElement(screen.getByText('Activities 5'));
  });

  it('keeps the facts when an outgoing outlet unregisters AFTER the incoming one registered', () => {
    // **The bare-`null` failure, in the only order that exposes it.** A keyed swap unmounts the old
    // outlet BEFORE mounting the new one, so `unregister` then `register` lands correct under
    // either rule — a test written that way passes against the wrong code and pins nothing. This
    // was verified: with `unregister` replaced by a bare `setElement(null)`, the keyed-swap version
    // of this case stayed green.
    //
    // The order that discriminates is the reverse, and it is the real one: the collapsed handle and
    // the expanded panel header live in different subtrees, so the incoming outlet can register
    // before the outgoing one's cleanup runs. Both are mounted here, then the first is removed.
    // Identity keeps the live outlet; a bare `null` discards it and the facts fall back in place,
    // vanishing from the row the planner is reading them in.
    function Tree({ withFirst }: { withFirst: boolean }): React.ReactElement {
      return (
        <PlanFactsProvider>
          {withFirst ? (
            <div data-testid="a">
              <PlanFactsOutlet />
            </div>
          ) : null}
          <div data-testid="b">
            <PlanFactsOutlet />
          </div>
          <PlanFactsHost>
            <span>Activities 5</span>
          </PlanFactsHost>
        </PlanFactsProvider>
      );
    }
    const { rerender } = render(<Tree withFirst />);
    // With both mounted the later registration wins, so the facts are in `b`.
    expect(screen.getByTestId('b')).toContainElement(screen.getByText('Activities 5'));
    rerender(<Tree withFirst={false} />);
    expect(screen.getByTestId('b')).toContainElement(screen.getByText('Activities 5'));
  });

  it('falls back to rendering in place when the last outlet unmounts', () => {
    // **The `isConnected` failure, inverted.** React runs a ref cleanup BEFORE detaching the node,
    // so a guard that keeps a still-connected element keeps one that is about to leave the
    // document — and the facts portal somewhere present in no accessibility tree, which is worse
    // than absent because nothing on screen looks wrong. Identity is what tells the two apart.
    function Tree({ withOutlet }: { withOutlet: boolean }): React.ReactElement {
      return (
        <PlanFactsProvider>
          {withOutlet ? <PlanFactsOutlet /> : null}
          <PlanFactsHost>
            <span>Activities 5</span>
          </PlanFactsHost>
        </PlanFactsProvider>
      );
    }
    const { rerender } = render(<Tree withOutlet />);
    expect(screen.getByText('Activities 5')).toBeInTheDocument();
    rerender(<Tree withOutlet={false} />);
    // Present, and in the document rather than in a detached node.
    const facts = screen.getByText('Activities 5');
    expect(facts).toBeInTheDocument();
    expect(facts.isConnected).toBe(true);
  });
});
