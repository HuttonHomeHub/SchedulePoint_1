import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sheet, SheetHeader } from './sheet';

afterEach(() => vi.restoreAllMocks());

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

  it('anchors to the inline-start edge with the standard cap by default (side="left")', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Project Explorer">
        <p>Drawer body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('left-0');
    expect(dialog).not.toHaveClass('right-0');
    expect(dialog).toHaveClass('w-[min(20rem,85vw)]');
  });

  it('anchors to the inline-end edge with a wider cap when side="right"', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Plan notes" side="right">
        <p>Drawer body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('right-0');
    expect(dialog).not.toHaveClass('left-0');
    expect(dialog).toHaveClass('w-[min(24rem,90vw)]');
  });

  describe('modal (default)', () => {
    it('opens with showModal and paints the inert backdrop', () => {
      const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
      const showSpy = vi.spyOn(HTMLDialogElement.prototype, 'show');
      render(
        <Sheet open onClose={vi.fn()} title="Project Explorer">
          <p>Drawer body</p>
        </Sheet>,
      );
      expect(showModalSpy).toHaveBeenCalled();
      expect(showSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toHaveClass('backdrop:bg-black/50');
    });
  });

  describe('non-modal (modal={false})', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open notes
          </button>
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            title="Plan notes"
            side="right"
            modal={false}
          >
            <SheetHeader
              title="Plan notes"
              onClose={() => setOpen(false)}
              closeLabel="Close plan notes"
            />
            <p>Notes body</p>
          </Sheet>
        </>
      );
    }

    it('opens with show (not showModal) and no backdrop styling', () => {
      const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
      const showSpy = vi.spyOn(HTMLDialogElement.prototype, 'show');
      render(
        <Sheet open onClose={vi.fn()} title="Plan notes" modal={false}>
          <p>Notes body</p>
        </Sheet>,
      );
      expect(showSpy).toHaveBeenCalled();
      expect(showModalSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).not.toHaveClass('backdrop:bg-black/50');
    });

    it('moves focus into the drawer on open and restores it to the opener on close', () => {
      render(<Harness />);
      const opener = screen.getByRole('button', { name: 'Open notes' });
      opener.focus();
      expect(opener).toHaveFocus();

      fireEvent.click(opener);
      // Focus moved into the drawer — its first focusable, the Close button.
      const close = screen.getByRole('button', { name: 'Close plan notes' });
      expect(close).toHaveFocus();

      // Escape closes a non-modal sheet (no native cancel) and restores focus to the opener.
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(opener).toHaveFocus();
      expect(screen.queryByText('Notes body')).not.toBeInTheDocument();
    });
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
