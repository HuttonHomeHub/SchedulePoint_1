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
