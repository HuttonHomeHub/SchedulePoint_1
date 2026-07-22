import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
