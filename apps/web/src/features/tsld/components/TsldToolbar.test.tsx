import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldToolbar } from './TsldToolbar';

describe('TsldToolbar', () => {
  it('reflects the active tool via aria-pressed', () => {
    render(<TsldToolbar mode="add-activity" onModeChange={vi.fn()} onFit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add activity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('switches tool on click', () => {
    const onModeChange = vi.fn();
    render(<TsldToolbar mode="select" onModeChange={onModeChange} onFit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(onModeChange).toHaveBeenCalledWith('add-activity');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(onModeChange).toHaveBeenCalledWith('select');
  });

  it('fits on demand and disables Fit when asked', () => {
    const onFit = vi.fn();
    const { rerender } = render(<TsldToolbar mode="select" onModeChange={vi.fn()} onFit={onFit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    expect(onFit).toHaveBeenCalledTimes(1);
    rerender(<TsldToolbar mode="select" onModeChange={vi.fn()} onFit={onFit} fitDisabled />);
    expect(screen.getByRole('button', { name: 'Fit to plan' })).toBeDisabled();
  });
});
