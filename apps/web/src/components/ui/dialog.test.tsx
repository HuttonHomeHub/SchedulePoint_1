import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';

describe('Dialog', () => {
  it('calls onClose when its own close button is used', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Share links">
        <p>Body</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * **The close is the icon button its `Sheet` sibling has always been** (ADR-0118 M4).
   *
   * It shipped as `size="sm"` around a raw `✕` character, which under a coarse pointer measured
   * **36 × 44** — the height from `--control-h`, the width from `px-3` plus one glyph, so it
   * cleared the house rule on exactly one axis. Found by the F3b dialog measurement, which is the
   * M0 falsification condition that had gone unanswered because its first probe queried for an
   * open dialog without opening one.
   *
   * Asserted here because the change had **no test at any level** — the case above queries by role
   * and name and passes against either version, and the measurement harness is not in CI. The
   * accessible name is asserted alongside the icon deliberately: `aria-hidden` on the `X` is what
   * keeps the name from becoming "Close dialog X", and jsdom is where that is checkable.
   */
  it('closes with an icon button whose glyph is out of the accessible name', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Share links">
        <p>Body</p>
      </Dialog>,
    );
    const close = screen.getByRole('button', { name: 'Close dialog' });
    // `size-10`: the ordinary icon button, 40 px fine and 44 px coarse through `--control-h`.
    expect(close.className).toContain('size-10');
    // A Lucide icon, not a text glyph — and hidden from the name computation.
    const glyph = close.querySelector('svg');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(close.textContent?.trim()).toBe('');
  });

  /**
   * The nested-dialog regression (TECH_DEBT #50). `close` does not bubble, but React
   * listens at the root in the capture phase, and capture reaches every ancestor on the
   * way down — so a nested dialog's close used to tear down its parent as well. The two
   * real flows this broke are the share-link revoke and the baseline delete; the fix is
   * in the primitive, so the test is too.
   */
  it('ignores a close that came from a nested dialog', () => {
    const onOuterClose = vi.fn();

    function Host(): React.ReactElement {
      const [confirming, setConfirming] = useState(true);
      return (
        <Dialog open onClose={onOuterClose} title="Share links">
          <ConfirmDialog
            open={confirming}
            onClose={() => setConfirming(false)}
            onConfirm={() => setConfirming(false)}
            title="Revoke share link"
            confirmLabel="Revoke"
          />
        </Dialog>
      );
    }

    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(
      screen.queryByRole('alertdialog', { name: 'Revoke share link' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Share links' })).toBeInTheDocument();
    expect(onOuterClose).not.toHaveBeenCalled();
  });
});
