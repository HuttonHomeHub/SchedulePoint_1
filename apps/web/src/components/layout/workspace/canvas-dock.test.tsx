import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
describe('CanvasDockOutlet', () => {
  it('asks for room only when it holds a strip, so a narrow row wraps it instead of squeezing it', () => {
    const { container } = render(
      <CanvasDockProvider>
        <CanvasDockOutlet />
      </CanvasDockProvider>,
    );
    // **Verified red** by the journey, not here: jsdom has no layout. Without the floor the outlet's
    // zero basis lets the facts take the line and the selection bar paints over them at 700 px.
    expect(container.firstElementChild).toHaveClass('not-empty:min-w-72', 'flex-1');
  });
});

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
 * **The marker and the class that reads it are written in two files and must name the same attribute.**
 * A Tailwind class has to be a literal, so no shared constant can carry the name; renaming one side
 * would leave the selection bar without its floor and nothing else would notice (the journeys only see
 * the result on a finger-sized window).
 */
describe('the data-dock-wide marker', () => {
  const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

  it('is set by the selection bar and read by the outlet class under the same name', () => {
    const outlet = read('src/components/layout/workspace/canvas-dock.tsx');
    const bar = read('src/features/plan-actions/selection-actions.tsx');
    expect(outlet).toMatch(/has-\[\[data-dock-wide\]\]:min-w-/);
    expect(bar).toMatch(/\n\s+data-dock-wide=""/);
  });
});
