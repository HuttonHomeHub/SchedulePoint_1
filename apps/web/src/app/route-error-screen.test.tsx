import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RouteErrorScreen } from './route-error-screen';

const invalidate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
}));

/**
 * `docs/TECH_DEBT.md` #314's second half. The screen's copy instructed a retry it did not offer,
 * on the `_authed` guard path — the commoner of the app's two "Something went wrong" screens, and
 * the one WITHOUT the action its twin has had since day one.
 */
describe('RouteErrorScreen', () => {
  const props = { error: new Error('boom'), reset: vi.fn() };

  it('offers a way out, which is the whole defect', async () => {
    render(<RouteErrorScreen {...props} reset={vi.fn()} />);
    // RED against the previous component, which rendered a heading and a paragraph and nothing else.
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('does not instruct a retry it cannot perform', () => {
    render(<RouteErrorScreen {...props} reset={vi.fn()} />);
    // The old copy read "Please try again" above nothing pressable. Either the words go or the
    // control arrives; this pins that they can never again be separated.
    const body = screen.getByText(/temporary problem/i);
    expect(body).toBeInTheDocument();
    expect(screen.queryByText(/Please try again\./)).not.toBeInTheDocument();
  });

  it('clears the boundary and re-runs the loaders, in that order', () => {
    const reset = vi.fn();
    invalidate.mockClear();
    const order: string[] = [];
    reset.mockImplementation(() => order.push('reset'));
    invalidate.mockImplementation(() => {
      order.push('invalidate');
    });

    render(<RouteErrorScreen {...props} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
    // Invalidating while the boundary is still latched re-runs the loaders behind an error screen
    // that never clears, which looks exactly like the button doing nothing.
    expect(order).toEqual(['reset', 'invalidate']);
  });

  it('recovers without a page load, so unsaved work behind the boundary survives', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    });

    render(<RouteErrorScreen {...props} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // The twin (`components/error-boundary.tsx`) reloads; this one must not, or it trips ADR-0108's
    // beforeunload guard to recover from what is usually a transient failure.
    expect(reload).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
