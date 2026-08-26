import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  PenStatusHost,
  PenStatusOutlet,
  PlanFactsHost,
  PlanFactsOutlet,
  PlanSlotProvider,
} from './plan-slot-host';

/**
 * The named plan-slot registry — the mechanism `plan-facts-host.tsx` used to hold alone, now
 * serving the facts and the pen's live-region sentence under two names.
 *
 * Two of these cases exist because the obvious implementations are wrong in ways nothing else would
 * report: a subject that silently renders in **both** places, and a clearing rule that empties the
 * host on a swap it should survive.
 */
describe('plan slot registry', () => {
  it('renders in place when no outlet is registered', () => {
    render(
      <PlanSlotProvider>
        <PenStatusHost>
          <span data-testid="subject">sentence</span>
        </PenStatusHost>
      </PlanSlotProvider>,
    );

    expect(screen.getByTestId('subject')).toBeInTheDocument();
  });

  it('renders in place with no provider at all — the unit-test and non-workspace path', () => {
    render(
      <PenStatusHost>
        <span data-testid="subject">sentence</span>
      </PenStatusHost>,
    );

    expect(screen.getByTestId('subject')).toBeInTheDocument();
  });

  it('portals into the outlet, and renders the subject exactly once', () => {
    render(
      <PlanSlotProvider>
        <div data-testid="outlet-parent">
          <PenStatusOutlet />
        </div>
        <PenStatusHost>
          <span data-testid="subject">sentence</span>
        </PenStatusHost>
      </PlanSlotProvider>,
    );

    // **Exactly once is the assertion, not "is present".** A host that portalled AND kept its
    // in-place copy would satisfy a `getByTestId` on a lenient query and put two live regions in
    // the document, which is the one failure a reader with a screen reader would notice and a
    // reader with eyes would not.
    expect(screen.getAllByTestId('subject')).toHaveLength(1);
    expect(screen.getByTestId('outlet-parent')).toContainElement(screen.getByTestId('subject'));
  });

  it('keeps the names independent — a facts outlet does not host the pen', () => {
    render(
      <PlanSlotProvider>
        <div data-testid="facts-parent">
          <PlanFactsOutlet />
        </div>
        <PenStatusHost>
          <span data-testid="pen">sentence</span>
        </PenStatusHost>
        <PlanFactsHost>
          <span data-testid="facts">facts</span>
        </PlanFactsHost>
      </PlanSlotProvider>,
    );

    expect(screen.getByTestId('facts-parent')).toContainElement(screen.getByTestId('facts'));
    expect(screen.getByTestId('facts-parent')).not.toContainElement(screen.getByTestId('pen'));
  });

  it('clears by node identity: a departing outlet that is not the registered one leaves it alone', () => {
    // Two outlets for one name, mounted in turn — the activities row's collapsed and expanded
    // hosts. React does not promise to unmount the outgoing one before mounting the incoming one,
    // so the second outlet can register before the first unregisters. A registry that cleared on
    // any teardown would empty the host on that ordering and the subject would vanish.
    function Swapper(): React.ReactElement {
      const [both, setBoth] = useState(true);
      return (
        <PlanSlotProvider>
          <button type="button" onClick={() => setBoth(false)}>
            drop the first
          </button>
          {both ? (
            <div data-testid="first">
              <PlanFactsOutlet />
            </div>
          ) : null}
          <div data-testid="second">
            <PlanFactsOutlet />
          </div>
          <PlanFactsHost>
            <span data-testid="subject">facts</span>
          </PlanFactsHost>
        </PlanSlotProvider>
      );
    }

    render(<Swapper />);

    // The LAST outlet to register wins, so the subject starts in `second`.
    expect(screen.getByTestId('second')).toContainElement(screen.getByTestId('subject'));

    // **`fireEvent`, not `node.click()`.** A bare DOM click is not wrapped in `act`, so the
    // state update it queues has not flushed when the assertions below run — and every one of them
    // then describes the state BEFORE the interaction, which is a passing test of nothing. This
    // case was written that way first and passed against a registry deliberately broken to clear on
    // any teardown.
    fireEvent.click(screen.getByRole('button', { name: 'drop the first' }));

    // The first outlet unmounting must not clear a registration it does not own.
    expect(screen.getAllByTestId('subject')).toHaveLength(1);
    expect(screen.getByTestId('second')).toContainElement(screen.getByTestId('subject'));
  });
});
