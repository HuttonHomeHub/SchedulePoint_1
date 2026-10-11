import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelResizer } from './panel-resizer';

// The polite announcer is what a lost draft is said through; stood in for so the message is observable.
const { announce } = vi.hoisted(() => ({ announce: vi.fn() }));
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

function renderResizer(over: Partial<React.ComponentProps<typeof PanelResizer>> = {}) {
  const onResize = vi.fn();
  const { unmount } = render(
    <PanelResizer
      orientation="vertical"
      size={300}
      min={100}
      max={500}
      label="Resize X"
      sizeLabel="X width"
      onReset={vi.fn()}
      onResize={onResize}
      pointerToSize={(e) => e.clientX}
      {...over}
    />,
  );
  return { onResize, unmount, separator: screen.getByRole('separator', { name: 'Resize X' }) };
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

    it('keeps the mouse strip at 25 px and grows it to --control-h under a finger, centred on the line', () => {
      const { separator } = renderResizer();
      const hit = hitOf(separator);
      expect(hit).toHaveClass('-right-3', '-left-3');
      expect(hit).toHaveClass('pointer-coarse:w-(--control-h)', 'pointer-coarse:left-1/2');
      expect(separator).not.toHaveAttribute('data-coarse-exempt');
    });

    it('a horizontal divider grows its height, centred on the line', () => {
      const { separator } = renderResizer({ orientation: 'horizontal' });
      expect(hitOf(separator)).toHaveClass(
        '-top-3',
        '-bottom-3',
        'pointer-coarse:h-(--control-h)',
        'pointer-coarse:top-1/2',
      );
    });

    it('none stays 25 px and marks itself, so the sweep can count the exception', () => {
      const { separator } = renderResizer({ coarseStrip: 'none' });
      expect(separator).toHaveAttribute('data-coarse-exempt', 'divider');
      expect(hitOf(separator).className).not.toContain('--control-h');
      expect(hitOf(separator)).toHaveClass('-right-3', '-left-3');
    });

    it('the strip stacks above the stage beside it, for a mouse as much as a finger', () => {
      const { separator } = renderResizer();
      expect(hitOf(separator)).toHaveClass('z-10');
    });
  });

  describe('pressing the divider opens a size box (ADR-0188 D1)', () => {
    let frames: FrameRequestCallback[] = [];
    beforeEach(() => {
      announce.mockClear();
      frames = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
      HTMLElement.prototype.setPointerCapture = vi.fn();
      HTMLElement.prototype.releasePointerCapture = vi.fn();
      HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    });
    afterEach(() => vi.unstubAllGlobals());

    const press = (separator: HTMLElement, at = { clientX: 300, clientY: 40 }): void => {
      fireEvent.pointerDown(separator, { pointerId: 1, button: 0, ...at });
      fireEvent.pointerUp(separator, { pointerId: 1, button: 0, ...at });
      // The click a browser fires straight after a press.
      fireEvent.click(separator);
    };
    const field = (): HTMLInputElement =>
      screen.getByRole<HTMLInputElement>('spinbutton', { name: 'X width' });

    it('a press that does not move opens a labelled box holding the size, focused in the field', () => {
      const { separator } = renderResizer();
      expect(screen.queryByRole('dialog')).toBeNull();
      press(separator);
      expect(screen.getByRole('dialog', { name: 'Set X width' })).toBeInTheDocument();
      expect(field()).toHaveValue(300);
      expect(field()).toHaveAttribute('min', '100');
      expect(field()).toHaveAttribute('max', '500');
      expect(field()).toHaveFocus();
      expect(field()).toHaveAccessibleDescription(/100 to 500 pixels/);
    });

    it('takes focus back for the field after a touch tap’s compatibility mousedown focuses the line', () => {
      const { separator } = renderResizer();
      fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 300, clientY: 40 });
      fireEvent.pointerUp(separator, { pointerId: 1, button: 0, clientX: 300, clientY: 40 });
      expect(field()).toHaveFocus();
      // A finger's tap is followed by mouse events, and the mousedown focuses the tab stop it landed on.
      separator.focus();
      expect(separator).toHaveFocus();
      fireEvent.click(separator);
      expect(field()).toHaveFocus();
    });

    it('a drag opens nothing and still resizes', () => {
      const { separator, onResize } = renderResizer();
      fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 300, clientY: 40 });
      fireEvent.pointerMove(separator, { pointerId: 1, clientX: 360, clientY: 40 });
      fireEvent.pointerUp(separator, { pointerId: 1, button: 0, clientX: 360, clientY: 40 });
      // The click the browser fires after a drag must not open the box either.
      fireEvent.click(separator);
      expect(onResize).toHaveBeenLastCalledWith(360);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens from a click with no pointer gesture before it (a screen reader’s click)', () => {
      const { separator } = renderResizer();
      fireEvent.click(separator);
      expect(screen.getByRole('dialog', { name: 'Set X width' })).toBeInTheDocument();
      expect(field()).toHaveFocus();
    });

    it('opens by no key: the arrows, Home and End stay the separator’s own', () => {
      const { separator, onResize } = renderResizer();
      for (const key of ['Enter', ' ']) fireEvent.keyDown(separator, { key });
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.keyDown(separator, { key: 'ArrowRight' });
      expect(onResize).toHaveBeenLastCalledWith(316);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('applies a typed size on Enter, and says it was applied as typed', () => {
      const { separator, onResize } = renderResizer();
      press(separator);
      fireEvent.change(field(), { target: { value: '250' } });
      fireEvent.keyDown(field(), { key: 'Enter' });
      expect(onResize).toHaveBeenLastCalledWith(250);
      expect(screen.getByRole('status')).toHaveTextContent('X width set to 250 px.');
    });

    it('limits a size outside the range and says so, never silently', () => {
      const { separator, onResize } = renderResizer();
      press(separator);
      fireEvent.change(field(), { target: { value: '20' } });
      fireEvent.keyDown(field(), { key: 'Enter' });
      expect(onResize).toHaveBeenLastCalledWith(100);
      expect(screen.getByRole('status')).toHaveTextContent(
        'X width limited to 100 px. Allowed range is 100 to 500 pixels.',
      );
      expect(field()).not.toHaveAttribute('aria-invalid');
    });

    it('an arrow in the field steps the size once: the separator’s keys do not hear it', () => {
      const { separator, onResize } = renderResizer();
      press(separator);
      onResize.mockClear();
      fireEvent.keyDown(field(), { key: 'ArrowUp' });
      expect(onResize).toHaveBeenCalledExactlyOnceWith(316);
    });

    it('Escape closes the box and returns focus to the separator', () => {
      const { separator } = renderResizer();
      press(separator);
      expect(field()).toHaveFocus();
      fireEvent.keyDown(field(), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(separator).toHaveFocus();
    });

    it('Escape discards a draft: the closing blur does not apply it', () => {
      const { separator, onResize } = renderResizer();
      press(separator);
      onResize.mockClear();
      fireEvent.change(field(), { target: { value: '450' } });
      fireEvent.keyDown(field(), { key: 'Escape' });
      expect(onResize).not.toHaveBeenCalled();
    });

    it('a press elsewhere closes it, and pressing the divider again puts it away', () => {
      const { separator } = renderResizer();
      press(separator);
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      press(separator);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      press(separator);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Reset to standard calls onReset and says it was done', () => {
      const onReset = vi.fn();
      const { separator } = renderResizer({ onReset });
      press(separator);
      fireEvent.click(screen.getByRole('button', { name: 'Reset to standard' }));
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent('X width reset to standard.');
    });

    it('a press outside while a size is typed does not apply it, and says it was not applied', () => {
      const { separator, onResize } = renderResizer();
      press(separator);
      onResize.mockClear();
      fireEvent.change(field(), { target: { value: '450' } });
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onResize).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalledExactlyOnceWith('X width: the typed size was not applied.');
    });

    it('says nothing when the box closes with no draft, or by Escape', () => {
      const { separator } = renderResizer();
      press(separator);
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      press(separator);
      fireEvent.change(field(), { target: { value: '450' } });
      fireEvent.keyDown(field(), { key: 'Escape' });
      expect(announce).not.toHaveBeenCalled();
    });

    it('goes with its divider: unmounting while open leaves no box behind', () => {
      const { separator, unmount } = renderResizer();
      press(separator);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      unmount();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
