import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HelpActionProvider, useRegisterShortcutsAction, useShortcutsAction } from './help-action';

/**
 * **The seam that lets the account menu open a sheet the shell does not own** (ADR-0091 M7-S5).
 *
 * The properties worth pinning are the two that keep ADR-0029 intact — the shell never learns what
 * a plan is, and a menu item never outlives the surface that offered it — plus the one that decides
 * what a reader sees on a screen with no diagram.
 */

function Consumer(): React.ReactElement {
  const open = useShortcutsAction();
  return open ? <button onClick={open}>Keyboard shortcuts</button> : <span>no action</span>;
}

function Registrar({ open }: { open: () => void }): null {
  useRegisterShortcutsAction(open);
  return null;
}

describe('the shortcuts seam', () => {
  it('offers nothing until a surface registers', () => {
    render(
      <HelpActionProvider>
        <Consumer />
      </HelpActionProvider>,
    );
    expect(screen.getByText('no action')).toBeInTheDocument();
  });

  it('hands the registered callback to the consumer, and calls it', () => {
    const open = vi.fn();
    render(
      <HelpActionProvider>
        <Registrar open={open} />
        <Consumer />
      </HelpActionProvider>,
    );
    screen.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    expect(open).toHaveBeenCalledOnce();
  });

  it('stores the callback rather than calling it', () => {
    // `setState` treats a function argument as an updater. Registering with `setState(fn)` would
    // invoke `fn` immediately — opening the shortcuts sheet the moment a plan mounted — and store
    // its return value. The wrap is what stops that, and it is invisible by reading.
    const open = vi.fn();
    render(
      <HelpActionProvider>
        <Registrar open={open} />
        <Consumer />
      </HelpActionProvider>,
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('withdraws the action when the registering surface unmounts', () => {
    // Otherwise the menu item outlives the plan that offered it and calls into an unmounted
    // workspace — which is what happens on every navigation away from a plan.
    const open = vi.fn();
    const { rerender } = render(
      <HelpActionProvider>
        <Registrar open={open} />
        <Consumer />
      </HelpActionProvider>,
    );
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    rerender(
      <HelpActionProvider>
        <Consumer />
      </HelpActionProvider>,
    );
    expect(screen.getByText('no action')).toBeInTheDocument();
  });

  it('renders nothing and throws nothing outside a provider', () => {
    // The account chip is rendered by tests and stories that mount no band at all. A seam that
    // threw there would make the shell harder to use than the coupling it removed.
    render(<Consumer />);
    expect(screen.getByText('no action')).toBeInTheDocument();
  });
});
