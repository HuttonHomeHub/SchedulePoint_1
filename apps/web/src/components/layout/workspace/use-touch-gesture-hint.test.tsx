import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTouchGestureHint } from './use-touch-gesture-hint';

const KEY = 'schedulepoint-hints';

/** A `pointerdown` carrying a `pointerType`, which jsdom's `Event` does not model. */
function press(pointerType: string): Event {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

describe('useTouchGestureHint', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => vi.restoreAllMocks());

  it.each(['mouse', 'pen'])('is not due after a %s press', (pointerType) => {
    const { result } = renderHook(() => useTouchGestureHint());
    press(pointerType);
    expect(result.current.due).toBe(false);
  });

  it('is due after the first touch press', () => {
    const { result } = renderHook(() => useTouchGestureHint());
    expect(result.current.due).toBe(false);
    press('touch');
    expect(result.current.due).toBe(true);
  });

  it('observes the press without consuming it', () => {
    renderHook(() => useTouchGestureHint());
    expect(press('touch').defaultPrevented).toBe(false);
  });

  it('removes its listener after the first touch', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    renderHook(() => useTouchGestureHint());
    press('touch');
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  });

  it('attaches nothing when the tip was already dismissed', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'touch-gestures': true }));
    const add = vi.spyOn(document, 'addEventListener');
    const { result } = renderHook(() => useTouchGestureHint());
    expect(add).not.toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    press('touch');
    expect(result.current.due).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useTouchGestureHint());
    unmount();
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  });

  it('dismiss persists and withdraws the tip', () => {
    const { result } = renderHook(() => useTouchGestureHint());
    press('touch');
    act(() => result.current.dismiss());
    expect(result.current.due).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({ 'touch-gestures': true });
  });

  it('is not marked seen merely for having appeared', () => {
    renderHook(() => useTouchGestureHint());
    press('touch');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
