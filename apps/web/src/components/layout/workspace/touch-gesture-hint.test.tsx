import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TouchGestureHint } from './touch-gesture-hint';

describe('TouchGestureHint', () => {
  it('says what to do and that a tap still presses', () => {
    render(<TouchGestureHint onOpenGestures={vi.fn()} onDismiss={vi.fn()} />);
    expect(
      screen.getByText('Press and hold an icon button to see its name. A tap still presses it.'),
    ).toBeInTheDocument();
  });

  it('is a standing condition, so it carries no live-region role', () => {
    render(<TouchGestureHint onOpenGestures={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens the sheet without dismissing itself', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<TouchGestureHint onOpenGestures={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Touch gestures' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses, then hands focus back, in that order', () => {
    const calls: string[] = [];
    render(
      <TouchGestureHint
        onOpenGestures={vi.fn()}
        onDismiss={() => calls.push('dismiss')}
        restoreFocus={() => calls.push('restore')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this tip' }));
    expect(calls).toEqual(['dismiss', 'restore']);
  });
});
