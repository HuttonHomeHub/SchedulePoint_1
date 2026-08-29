import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { usePopoverPanel } from './use-popover-panel';

/**
 * The behaviours fix-slice M-C ADDED to the shared panel (#203, #196a's third copy). The
 * pre-existing contract is pinned by `ToolbarPopover.test.tsx`, which passed untouched through the
 * adoption — that suite is the oracle, this one covers only what is new.
 *
 * jsdom cannot see the real outcomes here (no layout, no top layer, no native Escape-closes-dialog
 * default action), so each case asserts the MECHANISM — `defaultPrevented`, the style properties,
 * the chosen portal parent — stated rather than implied, per #196's precedent.
 */
function Host({ label = 'Panel' }: { label?: string }): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popover = usePopoverPanel({ triggerRef });
  return (
    <>
      <button ref={triggerRef} onClick={() => popover.openPanel()}>
        Open
      </button>
      {popover.panel(
        label,
        <div>
          <p>Row one</p>
        </div>,
      )}
    </>
  );
}

describe('usePopoverPanel (M-C additions)', () => {
  it('Escape prevents the default action as well as stopping propagation (#196a)', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Panel' })).toBeInTheDocument();

    // A capture-phase document listener handles the key. `fireEvent` returns
    // `!event.defaultPrevented`, which is exactly the fact a modal <dialog>'s own Escape default
    // is checked against after the dispatch finishes — and it flushes the state update, unlike a
    // raw `dispatchEvent` (the first version of this case read the right flag and then asserted
    // against an unflushed tree).
    const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notPrevented).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Panel' })).not.toBeInTheDocument();
  });

  it('caps its height to the viewport with its own scroll (#203a)', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('dialog', { name: 'Panel' });
    // jsdom's rects are all zero, so the estimate branch positions the panel; what must hold in
    // every branch is that a height ceiling exists and the panel scrolls inside it.
    expect(panel.style.maxHeight).not.toBe('');
    expect(panel).toHaveClass('overflow-y-auto');
  });

  it('portals into the topmost open modal dialog when one is open (latent, sheet.tsx reasoning)', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('dialog', { name: 'Panel' });
    expect(dialog.contains(panel)).toBe(true);
    dialog.remove();
  });
});
