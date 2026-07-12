import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldToolbar } from './TsldToolbar';

describe('TsldToolbar', () => {
  it('reflects the active tool via aria-pressed', () => {
    render(<TsldToolbar mode="add-activity" onModeChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add activity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('switches tool on click', () => {
    const onModeChange = vi.fn();
    render(<TsldToolbar mode="select" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(onModeChange).toHaveBeenCalledWith('add-activity');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(onModeChange).toHaveBeenCalledWith('select');
  });

  it('offers auto-arrange only when the handler is wired', () => {
    const { rerender } = render(<TsldToolbar mode="select" onModeChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Auto-arrange/ })).not.toBeInTheDocument();
    rerender(<TsldToolbar mode="select" onModeChange={vi.fn()} onAutoArrange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Auto-arrange/ })).toBeInTheDocument();
  });
});
