import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useTsldCanvasUiState } from './use-tsld-canvas-ui-state';

/**
 * The canvas UI state feeds the `<Toolbar>`'s resolve → partition → measure → ResizeObserver cycle,
 * so its object identity must be **stable across unrelated re-renders** — otherwise every parent
 * re-render (an activity-panel drag, the 15s pen poll) needlessly churns the toolbar (perf review,
 * ADR-0031). These guard that: same values → same reference; a real change → a new reference.
 */
describe('useTsldCanvasUiState', () => {
  it('returns a stable reference when nothing changed', () => {
    const { result, rerender } = renderHook(() => useTsldCanvasUiState());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns a new reference only when a value actually changes', () => {
    const { result } = renderHook(() => useTsldCanvasUiState());
    const before = result.current;
    act(() => result.current.toggleView('labels'));
    expect(result.current).not.toBe(before);
    // Stable again once the value settles.
    const after = result.current;
    renderHook(() => useTsldCanvasUiState()); // unrelated render elsewhere
    expect(result.current).toBe(after);
  });
});
