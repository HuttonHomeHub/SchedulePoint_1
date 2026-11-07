import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTouchGestureHint } from './use-touch-gesture-hint';

const KEY = 'schedulepoint-hints';

/** A pointer event carrying a `pointerType`, which jsdom's `Event` does not model. */
function fire(type: 'pointerdown' | 'pointerup', pointerType: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

const flushFrame = () =>
  act(() => {
    vi.runAllTimers();
  });

/** A finger's whole touch: down, up, then the frame the hook waits for. */
function touch(): void {
  fire('pointerdown', 'touch');
  fire('pointerup', 'touch');
  flushFrame();
}

describe('useTouchGestureHint', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['mouse', 'pen'])('is not due after a %s press', (pointerType) => {
    const { result } = renderHook(() => useTouchGestureHint());
    fire('pointerdown', pointerType);
    fire('pointerup', pointerType);
    flushFrame();
    expect(result.current.due).toBe(false);
  });

  it('is due after the first touch completes', () => {
    const { result } = renderHook(() => useTouchGestureHint());
    expect(result.current.due).toBe(false);
    touch();
    expect(result.current.due).toBe(true);
  });

  it('is not due while the finger is still down, so the strip never moves the press it answers', () => {
    const { result } = renderHook(() => useTouchGestureHint());
    fire('pointerdown', 'touch');
    flushFrame();
    expect(result.current.due).toBe(false);
  });

  it('waits a frame after the lift', () => {
    const { result } = renderHook(() => useTouchGestureHint());
    fire('pointerdown', 'touch');
    fire('pointerup', 'touch');
    expect(result.current.due).toBe(false);
    flushFrame();
    expect(result.current.due).toBe(true);
  });

  it('observes the touch without consuming it', () => {
    renderHook(() => useTouchGestureHint());
    expect(fire('pointerdown', 'touch').defaultPrevented).toBe(false);
    expect(fire('pointerup', 'touch').defaultPrevented).toBe(false);
  });

  it('removes its listener after the first touch', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    renderHook(() => useTouchGestureHint());
    touch();
    expect(remove).toHaveBeenCalledWith('pointerup', expect.any(Function), true);
  });

  it('attaches nothing when the tip was already dismissed', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'touch-gestures': true }));
    const add = vi.spyOn(document, 'addEventListener');
    const { result } = renderHook(() => useTouchGestureHint());
    expect(add).not.toHaveBeenCalledWith('pointerup', expect.any(Function), true);
    touch();
    expect(result.current.due).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useTouchGestureHint());
    unmount();
    expect(remove).toHaveBeenCalledWith('pointerup', expect.any(Function), true);
  });

  it('dismiss persists and withdraws the tip', () => {
    const { result } = renderHook(() => useTouchGestureHint());
    touch();
    act(() => result.current.dismiss());
    expect(result.current.due).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({ 'touch-gestures': true });
  });

  it('is not marked seen merely for having appeared', () => {
    renderHook(() => useTouchGestureHint());
    touch();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
