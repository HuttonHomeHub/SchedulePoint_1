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
  it.each(['vertical', 'horizontal'] as const)(
    'a %s divider takes the touch gesture itself (touch-action: none), or the browser cancels the drag',
    (orientation) => {
      const { separator } = renderResizer({ orientation });
      // jsdom computes no real `touch-action`, so this pins the class on the element that owns the pointer
      // handlers; the Gantt journey reads the computed value in Chromium.
      expect(separator).toHaveClass('touch-none');
    },
  );

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

  describe('the coarse grab strip (ADR-0188 D3)', () => {
    const hitOf = (separator: HTMLElement): HTMLElement => {
      const hit = separator.querySelector<HTMLElement>('[data-resizer-hit]');
      if (!hit) throw new Error('the separator has no hit strip');
      return hit;
    };

    it('keeps the mouse strip at 25 px and grows it to --control-h under a finger, centred by default', () => {
      const { separator } = renderResizer();
      const hit = hitOf(separator);
      expect(hit).toHaveClass('-right-3', '-left-3');
      expect(hit).toHaveClass('pointer-coarse:w-(--control-h)', 'pointer-coarse:left-1/2');
      expect(separator).not.toHaveAttribute('data-coarse-exempt');
    });

    it('a horizontal divider grows its height, centred by default', () => {
      const { separator } = renderResizer({ orientation: 'horizontal' });
      expect(hitOf(separator)).toHaveClass(
        '-top-3',
        '-bottom-3',
        'pointer-coarse:h-(--control-h)',
        'pointer-coarse:top-1/2',
      );
    });

    it.each([
      [false, 'pointer-coarse:-left-3'],
      [true, 'pointer-coarse:-right-3'],
    ])(
      'outward keeps 12 px on the panel side and grows away from it (reverseKeys %s)',
      (reverseKeys, edge) => {
        const { separator } = renderResizer({ coarseStrip: 'outward', reverseKeys });
        const hit = hitOf(separator);
        expect(hit).toHaveClass(edge, 'pointer-coarse:w-(--control-h)');
        expect(hit).not.toHaveClass('pointer-coarse:left-1/2');
      },
    );

    it('none stays 25 px and marks itself, so the sweep can count the exception', () => {
      const { separator } = renderResizer({ coarseStrip: 'none' });
      expect(separator).toHaveAttribute('data-coarse-exempt', 'divider');
      expect(hitOf(separator).className).not.toContain('--control-h');
      expect(hitOf(separator)).toHaveClass('-right-3', '-left-3');
    });

    it('the strip stacks above the stage it grows into, but only under a coarse pointer', () => {
      const { separator } = renderResizer({ coarseStrip: 'outward' });
      const hit = hitOf(separator);
      expect(hit).toHaveClass('pointer-coarse:z-10');
      expect(hit).not.toHaveClass('z-10');
    });
  });
});
