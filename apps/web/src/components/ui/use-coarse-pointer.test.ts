import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COARSE_POINTER_QUERY, useCoarsePointer } from './use-coarse-pointer';

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** A controllable matchMedia stub that records the query it was asked. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
  });
  return {
    queries,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe('useCoarsePointer', () => {
  it('asks for (pointer: coarse) and follows its answer', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(true);
    expect(media.queries).toContain(COARSE_POINTER_QUERY);
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
  });

  it('flips live when the primary pointer changes', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('is false (a mouse) when matchMedia is absent', () => {
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(false);
  });
});
