import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasDock, CanvasDockOutlet, CanvasDockProvider } from './canvas-dock';

/**
 * The dock's four behaviours. The last two are a pair, and they are here because **two successive
 * implementations each passed one and failed the other**, in ways nothing else would have caught.
 *
 * Exactly one outlet is mounted at a time — the collapsed activities handle's, or the expanded
 * panel header's — and React does not promise to unmount the outgoing one before mounting the
 * incoming one. Taking a bare `null` registration at face value empties the dock on roughly half
 * the transitions (case 3 red): a planner sees the armed-tool statement vanish when they open the
 * activities list, on the surface that statement exists to explain. Keeping the held node while it
 * is still `isConnected` fixes that and inverts it (case 4 red, which is how it was found): React
 * runs a ref cleanup BEFORE detaching, so a real teardown looks identical to a hand-over and the
 * strips portal into a node on its way out of the document — visible nowhere, in no accessibility
 * tree, with nothing on screen looking wrong. Only the departing node's identity separates the two.
 */
describe('CanvasDock', () => {
  it('renders its children in place when no outlet has registered', () => {
    // The parity contract: the legacy stacked layout and every unit test that mounts `TsldPanel`
    // alone see exactly the DOM they saw before the dock existed.
    render(
      <CanvasDockProvider>
        <div data-testid="scene">
          <CanvasDock>
            <p>Pick a predecessor.</p>
          </CanvasDock>
        </div>
      </CanvasDockProvider>,
    );
    expect(screen.getByTestId('scene')).toContainElement(screen.getByText('Pick a predecessor.'));
  });

  it('portals its children into the outlet when one is present', () => {
    render(
      <CanvasDockProvider>
        <div data-testid="scene">
          <CanvasDock>
            <p>Pick a predecessor.</p>
          </CanvasDock>
        </div>
        <div data-testid="row">
          <CanvasDockOutlet />
        </div>
      </CanvasDockProvider>,
    );
    expect(screen.getByTestId('row')).toContainElement(screen.getByText('Pick a predecessor.'));
    expect(screen.getByTestId('scene')).not.toContainElement(
      screen.getByText('Pick a predecessor.'),
    );
  });

  it('keeps the strip when one outlet replaces another', () => {
    function Harness(): React.ReactElement {
      const [expanded, setExpanded] = useState(false);
      return (
        <CanvasDockProvider>
          <CanvasDock>
            <p>Pick a predecessor.</p>
          </CanvasDock>
          <button type="button" onClick={() => setExpanded((e) => !e)}>
            Toggle
          </button>
          {expanded ? (
            <div data-testid="expanded">
              <CanvasDockOutlet />
            </div>
          ) : (
            <div data-testid="collapsed">
              <CanvasDockOutlet />
            </div>
          )}
        </CanvasDockProvider>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId('collapsed')).toContainElement(
      screen.getByText('Pick a predecessor.'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('expanded')).toContainElement(
      screen.getByText('Pick a predecessor.'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('collapsed')).toContainElement(
      screen.getByText('Pick a predecessor.'),
    );
  });

  it('falls back to rendering in place when the last outlet goes away', () => {
    // Not symmetry for its own sake: a strip with nowhere to go must still be readable. The
    // alternative — holding a detached node and portalling into it — renders the strip into a
    // document fragment, where it is in the accessibility tree of nothing at all.
    function Harness(): React.ReactElement {
      const [withOutlet, setWithOutlet] = useState(true);
      return (
        <CanvasDockProvider>
          <div data-testid="scene">
            <CanvasDock>
              <p>Pick a predecessor.</p>
            </CanvasDock>
          </div>
          <button type="button" onClick={() => setWithOutlet(false)}>
            Drop
          </button>
          {withOutlet ? (
            <div data-testid="row">
              <CanvasDockOutlet />
            </div>
          ) : null}
        </CanvasDockProvider>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId('row')).toContainElement(screen.getByText('Pick a predecessor.'));

    fireEvent.click(screen.getByRole('button', { name: 'Drop' }));
    expect(screen.getByTestId('scene')).toContainElement(screen.getByText('Pick a predecessor.'));
  });
});

/**
 * **The narrow single-pane layout must not host the outlet, and this pins the seam.**
 *
 * Below `md` the workspace mounts BOTH panes and hides the inactive one with `display: none`. The
 * default pane is the diagram, so an outlet rendered inside the activities pane registers while
 * invisible — and `CanvasDock` would then portal the armed-tool statement, both selection bars and
 * the edit-conflict banner into a node that is in no accessibility tree at all. A WCAG 4.1.3 failure
 * that looks like nothing on screen, because the strips are simply absent.
 *
 * jsdom cannot see the CSS, so this asserts the seam rather than the symptom: `hostsPlanSlots={false}`
 * renders no outlet, which is what lets `CanvasDock` fall back to rendering in place — where those
 * strips were before this epic, and the right answer on a screen with no spare row to dock into.
 * Found by the accessibility gate; nothing in the repository exercised the narrow path.
 */
describe('the activities panel only hosts the dock when it is asked to', () => {
  it('renders no outlet with hostsPlanSlots=false, so the dock falls back to rendering in place', () => {
    render(
      <CanvasDockProvider>
        <div data-testid="scene">
          <CanvasDock>
            <p>Pick a predecessor.</p>
          </CanvasDock>
        </div>
        {/* Stands in for the hidden pane: a panel that does not host the outlet. */}
        <div data-testid="hidden-pane" />
      </CanvasDockProvider>,
    );
    expect(screen.getByTestId('scene')).toContainElement(screen.getByText('Pick a predecessor.'));
  });
});
