import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePromotionStage } from './use-promotion-stage';

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/**
 * A `matchMedia` for a viewport of `px` pixels at a 16 px root, answering the `min-width` rem queries
 * the way a browser does, and `(pointer: coarse)` from `coarse`. Returns a way to change either.
 */
function stubViewport(initialPx: number, initialCoarse = false) {
  let px = initialPx;
  let coarse = initialCoarse;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      const rem = /min-width:\s*([\d.]+)rem/.exec(query)?.[1];
      if (rem !== undefined) return px >= Number(rem) * 16;
      return query.includes('pointer: coarse') ? coarse : false;
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return {
    set(next: { px?: number; coarse?: boolean }) {
      px = next.px ?? px;
      coarse = next.coarse ?? coarse;
      listeners.forEach((cb) => cb());
    },
  };
}

describe('usePromotionStage', () => {
  it.each([
    [1024, 0],
    [1279, 0],
    [1280, 1],
    [1439, 1],
    [1440, 2],
    [1911, 2],
    [1912, 3],
    [2559, 3],
    [2560, 4],
    [3840, 4],
  ])('a %i px viewport has reached stage %i', (px, stage) => {
    stubViewport(px);
    const { result } = renderHook(() => usePromotionStage());
    expect(result.current.stage).toBe(stage);
  });

  it('reports the pointer set that applies, and follows a keyboard cover being attached', () => {
    const viewport = stubViewport(1440, true);
    const { result } = renderHook(() => usePromotionStage());
    expect(result.current).toEqual({ stage: 2, pointer: 'coarse' });
    act(() => viewport.set({ coarse: false }));
    expect(result.current).toEqual({ stage: 2, pointer: 'fine' });
  });

  it('follows the window as it widens and narrows (the E-1 and E-2 trigger)', () => {
    const viewport = stubViewport(1280);
    const { result } = renderHook(() => usePromotionStage());
    expect(result.current.stage).toBe(1);
    act(() => viewport.set({ px: 2560 }));
    expect(result.current.stage).toBe(4);
    act(() => viewport.set({ px: 1100 }));
    expect(result.current.stage).toBe(0);
  });

  it('a raised default font size moves the thresholds with the text: rem, not pixels', () => {
    // At a 32 px root a 2560 px window is 80 rem: the first stage, not the last. The stub scales its
    // rem the way a browser's media query does.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: Number(/min-width:\s*([\d.]+)rem/.exec(query)?.[1] ?? 0) * 32 <= 2560,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { result } = renderHook(() => usePromotionStage());
    expect(result.current.stage).toBe(1);
  });

  it('is stage 0 and fine where there is no matchMedia at all (every jsdom test)', () => {
    const { result } = renderHook(() => usePromotionStage());
    expect(result.current).toEqual({ stage: 0, pointer: 'fine' });
  });
});
