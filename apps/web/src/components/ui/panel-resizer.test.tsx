import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PanelResizer } from './panel-resizer';

function renderResizer(over: Partial<React.ComponentProps<typeof PanelResizer>> = {}) {
  const onResize = vi.fn();
  render(
    <PanelResizer
      orientation="vertical"
      size={300}
      min={100}
      max={500}
      label="Resize X"
      onResize={onResize}
      pointerToSize={(e) => e.clientX}
      {...over}
    />,
  );
  return { onResize, separator: screen.getByRole('separator', { name: 'Resize X' }) };
}

describe('PanelResizer', () => {
  it('a vertical splitter exposes width and grows/shrinks with Right/Left, jumps with Home/End', () => {
    const { separator, onResize } = renderResizer();
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    expect(separator).toHaveAttribute('aria-valuemin', '100');
    expect(separator).toHaveAttribute('aria-valuemax', '500');
    expect(separator).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(284);
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(separator, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(500);
  });

  it('a horizontal splitter grows with Up / shrinks with Down and ignores Left/Right', () => {
    const { separator, onResize } = renderResizer({ orientation: 'horizontal' });
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(onResize).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(onResize).toHaveBeenLastCalledWith(284);
    onResize.mockClear();
    // The cross-axis arrows do nothing for a horizontal divider.
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('reverseKeys inverts the vertical grow/shrink sense (end-anchored, e.g. the right notes dock)', () => {
    const { separator, onResize } = renderResizer({ reverseKeys: true });
    // Left now GROWS (an end-anchored panel widens as the divider moves left), Right shrinks.
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(284);
    // Home/End still jump to the bounds regardless of the reversed sense.
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(separator, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(500);
  });

  it('ignores unrelated keys', () => {
    const { separator, onResize } = renderResizer();
    fireEvent.keyDown(separator, { key: 'a' });
    expect(onResize).not.toHaveBeenCalled();
  });
});
