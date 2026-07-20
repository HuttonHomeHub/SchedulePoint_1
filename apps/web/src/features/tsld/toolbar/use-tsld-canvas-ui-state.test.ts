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

  it('drives the lens view state (filter query / attrs / colour mode / baseline overlay)', () => {
    const { result } = renderHook(() => useTsldCanvasUiState());
    // Defaults are the "no lens active" identity.
    expect(result.current.lensState).toEqual({
      filterQuery: '',
      filterAttrs: new Set(),
      colourMode: 'criticality',
      baselineOverlay: false,
    });

    act(() => result.current.setFilterQuery('concrete'));
    expect(result.current.lensState.filterQuery).toBe('concrete');

    act(() => result.current.toggleFilterAttr('critical'));
    expect(result.current.lensState.filterAttrs.has('critical')).toBe(true);
    act(() => result.current.toggleFilterAttr('critical'));
    expect(result.current.lensState.filterAttrs.has('critical')).toBe(false);

    act(() => result.current.setColourMode('totalFloat'));
    expect(result.current.lensState.colourMode).toBe('totalFloat');

    act(() => result.current.toggleBaselineOverlay());
    expect(result.current.lensState.baselineOverlay).toBe(true);
  });

  it('drives the canvas nav view state (isolate / conflict cursor / snap / select signal)', () => {
    const { result } = renderHook(() => useTsldCanvasUiState());
    // Defaults are the "no nav active" identity.
    expect(result.current.navState).toEqual({
      isolateActive: false,
      isolateMode: 'full',
      conflictCursorId: null,
      snapToGrid: false,
      selectSignal: null,
    });

    // Toggling isolate flips only `isolateActive`.
    act(() => result.current.toggleIsolate());
    expect(result.current.navState.isolateActive).toBe(true);
    act(() => result.current.toggleIsolate());
    expect(result.current.navState.isolateActive).toBe(false);

    // Picking a mode ARMS isolate on (a pick always means "isolate now"), mirroring setCreateType.
    act(() => result.current.setIsolateMode('driving'));
    expect(result.current.navState.isolateMode).toBe('driving');
    expect(result.current.navState.isolateActive).toBe(true);

    // The conflict cursor is remembered verbatim.
    act(() => result.current.setConflictCursorId('a1'));
    expect(result.current.navState.conflictCursorId).toBe('a1');

    // Snap is a session toggle.
    act(() => result.current.toggleSnapToGrid());
    expect(result.current.navState.snapToGrid).toBe(true);

    // Each select request bumps a monotonic nonce so a repeat jump to the same id still fires.
    act(() => result.current.requestSelectActivity('a2'));
    const first = result.current.navState.selectSignal;
    expect(first).toEqual({ id: 'a2', nonce: 1 });
    act(() => result.current.requestSelectActivity('a2'));
    expect(result.current.navState.selectSignal).toEqual({ id: 'a2', nonce: 2 });
  });
});
