import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders the title/description and fires confirm and cancel', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete client"
        description="Delete “Acme”?"
        confirmLabel="Delete"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Delete client' })).toBeInTheDocument();
    expect(screen.getByText('Delete “Acme”?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('announces an error and shows the pending label', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete"
        error="Something went wrong."
        pending
        pendingLabel="Deleting…"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    const confirm = screen.getByRole('button', { name: 'Deleting…' });
    // `aria-disabled` (not native `disabled`) so the button keeps focus while busy.
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });
});
