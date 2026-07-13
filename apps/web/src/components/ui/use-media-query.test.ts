import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './use-media-query';

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** A controllable matchMedia stub whose `matches` can be flipped and observers notified. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe('useMediaQuery', () => {
  it('returns the fallback when matchMedia is unavailable', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)', true));
    expect(result.current).toBe(true);
  });

  it('reflects the initial match and updates when the query changes', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)', true));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
