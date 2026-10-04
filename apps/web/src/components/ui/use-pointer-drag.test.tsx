import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePointerDrag } from './use-pointer-drag';

let frames: FrameRequestCallback[] = [];

function Handle(props: {
  onValue: (n: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
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
});
