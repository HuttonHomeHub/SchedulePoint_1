import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRESS_SLOP_PX, usePointerDrag } from './use-pointer-drag';

let frames: FrameRequestCallback[] = [];

function Handle(props: {
  onValue: (n: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onPress?: () => void;
}): React.ReactElement {
  const handlers = usePointerDrag<HTMLDivElement>({
    toValue: (e) => e.clientX,
    ...props,
  });
  return <div data-testid="h" {...handlers} />;
}

describe('usePointerDrag', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('coalesces moves to one value per frame', () => {
    const onValue = vi.fn();
    render(<Handle onValue={onValue} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 5 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 9 });
    expect(frames).toHaveLength(1);
    expect(onValue).not.toHaveBeenCalled();
    act(() => frames[0]!(0));
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenLastCalledWith(9);
  });

  it('applies the last value immediately on release, then reports the end once', () => {
    const onValue = vi.fn();
    const onEnd = vi.fn();
    render(<Handle onValue={onValue} onEnd={onEnd} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 40 });
    fireEvent.pointerUp(h, { pointerId: 1 });
    expect(onValue).toHaveBeenCalledWith(40);
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(h, { pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('flushes on pointercancel like a release', () => {
    const onValue = vi.fn();
    render(<Handle onValue={onValue} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 12 });
    fireEvent.pointerCancel(h, { pointerId: 1 });
    expect(onValue).toHaveBeenCalledWith(12);
  });

  it('ignores moves when no press began', () => {
    const onValue = vi.fn();
    render(<Handle onValue={onValue} />);
    fireEvent.pointerMove(screen.getByTestId('h'), { pointerId: 1, clientX: 12 });
    expect(frames).toHaveLength(0);
  });

  it('captures the pointer and calls onStart on press', () => {
    const onStart = vi.fn();
    render(<Handle onValue={vi.fn()} onStart={onStart} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerId: 7 });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('cancels a queued frame on unmount', () => {
    const { unmount } = render(<Handle onValue={vi.fn()} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 3 });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('reports the end on pointercancel', () => {
    const onEnd = vi.fn();
    render(<Handle onValue={vi.fn()} onEnd={onEnd} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerCancel(h, { pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('applies a queued value once on release and cancels its frame', () => {
    const onValue = vi.fn();
    render(<Handle onValue={onValue} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 21 });
    fireEvent.pointerUp(h, { pointerId: 1 });
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    // The stale frame firing late must not apply the value a second time.
    act(() => frames[0]!(0));
    expect(onValue).toHaveBeenCalledTimes(1);
  });

  it('ignores a move after release', () => {
    const onValue = vi.fn();
    render(<Handle onValue={onValue} />);
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerUp(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 50 });
    expect(frames).toHaveLength(0);
    expect(onValue).not.toHaveBeenCalled();
  });

  it('does not call onEnd when unmounted mid-drag', () => {
    const onEnd = vi.fn();
    const { unmount } = render(<Handle onValue={vi.fn()} onEnd={onEnd} />);
    fireEvent.pointerDown(screen.getByTestId('h'), { pointerId: 1 });
    unmount();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('drags normally under StrictMode', () => {
    const onValue = vi.fn();
    const onEnd = vi.fn();
    render(
      <StrictMode>
        <Handle onValue={onValue} onEnd={onEnd} />
      </StrictMode>,
    );
    const h = screen.getByTestId('h');
    fireEvent.pointerDown(h, { pointerId: 1 });
    fireEvent.pointerMove(h, { pointerId: 1, clientX: 8 });
    fireEvent.pointerUp(h, { pointerId: 1 });
    expect(onValue).toHaveBeenCalledWith(8);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  describe('a press that never became a drag (ADR-0188 D1)', () => {
    it('fires onPress on a release that did not move, after onEnd', () => {
      const order: string[] = [];
      render(
        <Handle
          onValue={vi.fn()}
          onEnd={() => order.push('end')}
          onPress={() => order.push('press')}
        />,
      );
      const h = screen.getByTestId('h');
      fireEvent.pointerDown(h, { pointerId: 1, clientX: 100, clientY: 50 });
      fireEvent.pointerUp(h, { pointerId: 1, clientX: 100, clientY: 50 });
      expect(order).toEqual(['end', 'press']);
    });

    it('treats movement under the slop as a press and applies no value for it', () => {
      const onValue = vi.fn();
      const onPress = vi.fn();
      render(<Handle onValue={onValue} onPress={onPress} />);
      const h = screen.getByTestId('h');
      fireEvent.pointerDown(h, { pointerId: 1, clientX: 100, clientY: 50 });
      fireEvent.pointerMove(h, { pointerId: 1, clientX: 102, clientY: 51 });
      fireEvent.pointerUp(h, { pointerId: 1, clientX: 102, clientY: 51 });
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onValue).not.toHaveBeenCalled();
      expect(frames).toHaveLength(0);
    });

    it('is a drag once the pointer passes the slop: values apply and no press fires', () => {
      const onValue = vi.fn();
      const onPress = vi.fn();
      render(<Handle onValue={onValue} onPress={onPress} />);
      const h = screen.getByTestId('h');
      fireEvent.pointerDown(h, { pointerId: 1, clientX: 100, clientY: 50 });
      fireEvent.pointerMove(h, { pointerId: 1, clientX: 100 + PRESS_SLOP_PX, clientY: 50 });
      fireEvent.pointerMove(h, { pointerId: 1, clientX: 140, clientY: 50 });
      fireEvent.pointerUp(h, { pointerId: 1, clientX: 140, clientY: 50 });
      expect(onValue).toHaveBeenLastCalledWith(140);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('stays a drag if the pointer returns to where it started', () => {
      const onPress = vi.fn();
      render(<Handle onValue={vi.fn()} onPress={onPress} />);
      const h = screen.getByTestId('h');
      fireEvent.pointerDown(h, { pointerId: 1, clientX: 100, clientY: 50 });
      fireEvent.pointerMove(h, { pointerId: 1, clientX: 160, clientY: 50 });
      fireEvent.pointerMove(h, { pointerId: 1, clientX: 100, clientY: 50 });
      fireEvent.pointerUp(h, { pointerId: 1, clientX: 100, clientY: 50 });
      expect(onPress).not.toHaveBeenCalled();
    });

    it('does not press on a cancel, or for a secondary button', () => {
      const onPress = vi.fn();
      render(<Handle onValue={vi.fn()} onPress={onPress} />);
      const h = screen.getByTestId('h');
      fireEvent.pointerDown(h, { pointerId: 1, clientX: 5, clientY: 5 });
      fireEvent.pointerCancel(h, { pointerId: 1 });
      fireEvent.pointerDown(h, { pointerId: 2, clientX: 5, clientY: 5, button: 2 });
      fireEvent.pointerUp(h, { pointerId: 2, clientX: 5, clientY: 5, button: 2 });
      expect(onPress).not.toHaveBeenCalled();
    });

    it('changes nothing for a handle that listens for no press: a tiny move still applies', () => {
      const onValue = vi.fn();
      render(<Handle onValue={onValue} />);
      const h = screen.getByTestId('h');
      fireEvent.pointerDown(h, { pointerId: 1, clientX: 100, clientY: 50 });
      fireEvent.pointerMove(h, { pointerId: 1, clientX: 101, clientY: 50 });
      fireEvent.pointerUp(h, { pointerId: 1, clientX: 101, clientY: 50 });
      expect(onValue).toHaveBeenCalledWith(101);
    });
  });
});
