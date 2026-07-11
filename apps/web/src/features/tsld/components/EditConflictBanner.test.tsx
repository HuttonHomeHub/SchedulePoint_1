import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditConflictBanner } from './EditConflictBanner';

describe('EditConflictBanner', () => {
  it('announces the message via role=alert', () => {
    render(<EditConflictBanner message="This plan changed" onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('This plan changed');
  });

  it('dismisses', () => {
    const onDismiss = vi.fn();
    render(<EditConflictBanner message="x" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers Refresh only when a handler is given', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<EditConflictBanner message="x" onDismiss={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    rerender(<EditConflictBanner message="x" onDismiss={vi.fn()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
