import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LayoutResolvedStrip } from './LayoutResolvedStrip';

const MESSAGE = 'Moved “Clad” to lane 2 so it no longer overlaps another activity.';

function renderStrip() {
  const calls: string[] = [];
  const props = {
    message: MESSAGE,
    onUndo: vi.fn(() => calls.push('undo')),
    onDismiss: vi.fn(() => calls.push('dismiss')),
    restoreFocus: vi.fn(() => calls.push('focus')),
  };
  render(<LayoutResolvedStrip {...props} />);
  return { ...props, calls };
}

describe('LayoutResolvedStrip', () => {
  it('shows the sentence it was announced with', () => {
    renderStrip();
    expect(screen.getByTestId('canvas-layout-resolved')).toHaveTextContent(MESSAGE);
  });

  it('is not a live region — the workspace announced the sentence once already', () => {
    renderStrip();
    const strip = screen.getByTestId('canvas-layout-resolved');
    expect(strip).not.toHaveAttribute('role');
    expect(strip).not.toHaveAttribute('aria-live');
  });

  // Both buttons remove the strip that holds them, so focus must be handed on FIRST or it falls to
  // <body> (ADR-0149 D8). Each case was verified red against the reversed order.
  it('hands focus on before Undo removes the strip', () => {
    const { calls, onUndo } = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(calls).toEqual(['focus', 'undo']);
  });

  it('hands focus on before Dismiss removes the strip', () => {
    const { calls, onDismiss } = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(calls).toEqual(['focus', 'dismiss']);
  });
});
