import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNow } from './use-now';

function setHidden(hidden: boolean) {
  void act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('starts at 0 and bumps once per step while visible', () => {
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current).toBe(0);
    void act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(1);
    void act(() => vi.advanceTimersByTime(60_000 * 2));
    expect(result.current).toBe(3);
  });

  it('pauses entirely while the tab is hidden — no ticks accrue', () => {
    const { result } = renderHook(() => useNow(60_000));
    setHidden(true);
    void act(() => vi.advanceTimersByTime(60_000 * 5));
    // Hiding itself does not bump (only becoming visible re-syncs), and no interval fires while hidden.
    expect(result.current).toBe(0);
  });

  it('re-syncs immediately on becoming visible again, then resumes ticking', () => {
    const { result } = renderHook(() => useNow(60_000));
    setHidden(true);
    void act(() => vi.advanceTimersByTime(60_000 * 5));
    expect(result.current).toBe(0);

    setHidden(false);
    // The immediate re-sync on visibilitychange, independent of the interval firing.
    expect(result.current).toBe(1);

    void act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(2);
  });

  it('clears its interval and listener on unmount (no leak)', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useNow(60_000));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });
});
