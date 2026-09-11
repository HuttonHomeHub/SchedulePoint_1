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

  /**
   * **The close is the full `icon` size for every consumer, and nothing can opt out**
   * (`docs/TECH_DEBT.md` #278).
   *
   * It used to default to `icon-sm` — `size-7`, 28 px on both pointers — under ADR-0118 D1's second
   * named exception, which is for a control inside a container whose height is fixed elsewhere. A
   * dense tree row is such a container; a `px-4 py-2` panel header is not, and the four consumers
   * taking the default were the four right docks rather than the rail the docblock called the
   * exception.
   *
   * This asserts the **class**, which is unusual here and is the point: the size is the whole
   * subject, and `size-10` carries `pointer-coarse:size-(--control-h)` with it — the 44 px the
   * house rule asks for. Asserting the rendered box instead would prove nothing, because jsdom has
   * no layout. **Verified red** against the pre-#278 component, which rendered `size-7`.
   *
   * The second case is the pinned counter-case, and without it the first passes equally against a
   * component that hard-codes the size and ignores its caller — which is not what shipped either,
   * since the caller can no longer ask.
   */
  it('renders its Close at the `icon` size, not the dense-row exception', () => {
    render(<SheetHeader title="Plan notes" onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close Plan notes' });
    expect(close.className).toContain('size-10');
    expect(close.className).not.toContain('size-7');
  });

  it('takes no size prop — every consumer gets the same close', () => {
    // `closeButtonSize` had exactly one caller, passing the value all five consumers wanted, so it
    // was deleted rather than defaulted the other way. This pins that there is nothing to pass: a
    // stray extra prop would be a TypeScript error, so the assertion a runtime test can make is
    // that two headers rendered by different callers agree.
    const { unmount } = render(<SheetHeader title="Plan notes" onClose={vi.fn()} />);
    const inPanel = screen.getByRole('button', { name: 'Close Plan notes' }).className;
    unmount();
    render(<SheetHeader title="Project Explorer" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Close Project Explorer' }).className).toBe(inPanel);
  });
});
