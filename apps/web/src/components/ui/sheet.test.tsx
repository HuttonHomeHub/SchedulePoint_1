import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';
import { Sheet, SheetHeader } from './sheet';

describe('Sheet', () => {
  it('renders its content and takes its accessible name from the title when open', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.getByText('Drawer body')).toBeInTheDocument();
  });

  it('does not render its content when closed', () => {
    render(
      <Sheet open={false} onClose={vi.fn()} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    expect(screen.queryByText('Drawer body')).not.toBeInTheDocument();
  });

  it('opens modally (showModal) with an inert backdrop', () => {
    const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    render(
      <Sheet open onClose={vi.fn()} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    expect(showModalSpy).toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveClass('backdrop:bg-black/50');
    showModalSpy.mockRestore();
  });

  it('calls onClose when the native dialog is dismissed (Esc → cancel)', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    fireEvent(screen.getByRole('dialog'), new Event('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * `confirmBeforeClose` (TECH_DEBT #197 item 1): the mechanism is asserted rather than the visual
   * outcome, because jsdom's `<dialog>` never natively closes on `cancel` anyway — what keeps a
   * real browser's sheet on screen is exactly `defaultPrevented`, so that is the observable fact.
   */
  it('confirmBeforeClose cancels the native close so the host decides, and still calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Editor drawer" confirmBeforeClose>
        <p>Drawer body</p>
      </Sheet>,
    );
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('without confirmBeforeClose the native cancel proceeds unchanged', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), cancel);
    expect(cancel.defaultPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('anchors to the inline-start edge by default (side="left")', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('left-0');
    expect(dialog).not.toHaveClass('right-0');
  });

  it('anchors to the inline-end edge when side="right"', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Plan notes" side="right">
        <p>Drawer body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('right-0');
    expect(dialog).not.toHaveClass('left-0');
  });

  /**
   * The same nested-close defect `Dialog` was fixed for (TECH_DEBT #50), pinned here
   * because `Sheet` is a second, structurally identical native-`<dialog>` primitive that
   * did not receive the guard at the time.
   *
   * No consumer nests a dialog inside a `Sheet` today — the Project Explorer drawer
   * renders its dialogs as siblings of `{children}` — so this guards a latent bug, not a
   * live one. That is the point: the avoidance is a convention, and `Sheet` is a
   * general-purpose drawer, so the next feature to put a confirmation inside one would
   * otherwise reintroduce exactly the bug just removed from `Dialog`.
   */
  it('ignores a close that came from a nested dialog', () => {
    const onSheetClose = vi.fn();

    function Host(): React.ReactElement {
      const [confirming, setConfirming] = useState(true);
      return (
        <Sheet open onClose={onSheetClose} title="Project Explorer">
          <ConfirmDialog
            open={confirming}
            onClose={() => setConfirming(false)}
            onConfirm={() => setConfirming(false)}
            title="Delete client"
            confirmLabel="Delete"
          />
        </Sheet>
      );
    }

    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByRole('alertdialog', { name: 'Delete client' })).not.toBeInTheDocument();
    expect(onSheetClose).not.toHaveBeenCalled();
  });
});

describe('SheetHeader', () => {
  it('renders the title and a Close button with the given accessible name', () => {
    const onClose = vi.fn();
    render(<SheetHeader title="Plan notes" onClose={onClose} closeLabel="Close plan notes" />);
    expect(screen.getByText('Plan notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close plan notes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the Close button when no onClose is given', () => {
    render(<SheetHeader title="Plan notes" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
