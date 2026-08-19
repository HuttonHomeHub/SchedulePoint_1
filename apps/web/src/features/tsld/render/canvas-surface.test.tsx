import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CanvasSurfaceProvider,
  useCanvasSurface,
  useRegisterCanvasSurface,
} from './canvas-surface';

import { Surface } from '@/components/ui/surface';

/**
 * **The guarantee the `document.documentElement` fallback gave up** (ADR-0097 Landing E).
 *
 * `useCanvasSurface` falls back to the page when there is no provider, because a hard failure would
 * blank a planner's diagram in any harness that mounts the canvas alone. The cost of that mercy is
 * that a mis-wired seam paints plausible colours and reports nothing — the exact failure mode this
 * landing exists to remove. So the seam is asserted here instead of trusted.
 *
 * Two things are proven, and the second is the one that would actually break:
 *
 * 1. a consumer inside the provider receives the **registered element**, not `documentElement`;
 * 2. it receives it **after mount, via a re-render** — because the element is published as state
 *    rather than as a ref. A ref would leave `TsldPanel`'s two `useMemo`s holding the value from
 *    the first render, which is `null` → the page, forever, while looking entirely correct.
 */
function Consumer(): React.ReactElement {
  const surface = useCanvasSurface();
  return (
    <span data-testid="resolved">
      {surface === document.documentElement ? 'page' : (surface.getAttribute('data-surface') ?? '')}
    </span>
  );
}

function Host(): React.ReactElement {
  const register = useRegisterCanvasSurface();
  return (
    <Surface tone="canvas" ref={register} data-testid="scope">
      <Consumer />
    </Surface>
  );
}

describe('the canvas surface seam', () => {
  it('hands a consumer the scope element, not the page', () => {
    render(
      <CanvasSurfaceProvider>
        <Host />
      </CanvasSurfaceProvider>,
    );
    // Not `toBeTruthy()`: the assertion has to distinguish the scope from the page, because
    // resolving against the page is what the seam exists to stop and it is not an error state.
    expect(screen.getByTestId('resolved')).toHaveTextContent('canvas');
    expect(screen.getByTestId('resolved')).not.toHaveTextContent('page');
  });

  it('reaches a consumer that sits ABOVE the scope element', () => {
    // `TsldPanel` is exactly this shape — it resolves the lens palettes in `useMemo`s and renders
    // the `<Surface>` as its own child. If the element were published as a ref this case would
    // report `page` forever; it is the reason for the `useState`.
    function AboveTheScope(): React.ReactElement {
      const surface = useCanvasSurface();
      const register = useRegisterCanvasSurface();
      return (
        <>
          <span data-testid="above">
            {surface === document.documentElement ? 'page' : 'canvas'}
          </span>
          <Surface tone="canvas" ref={register} />
        </>
      );
    }
    render(
      <CanvasSurfaceProvider>
        <AboveTheScope />
      </CanvasSurfaceProvider>,
    );
    expect(screen.getByTestId('above')).toHaveTextContent('canvas');
  });

  it('falls back to the page outside a provider, rather than throwing', () => {
    // The documented mercy, pinned so it cannot be "tidied" into a throw: a unit harness that
    // mounts the canvas alone must still render.
    render(<Consumer />);
    expect(screen.getByTestId('resolved')).toHaveTextContent('page');
  });
});
