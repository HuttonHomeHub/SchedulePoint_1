import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clampSize, useResizablePanelPrefs } from './use-resizable-panel-prefs';

const OPTS = { storageKey: 'test-panel', min: 100, max: 400, defaultSize: 200 };

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('clampSize', () => {
  it('clamps to the range and rounds', () => {
    expect(clampSize(10, 100, 400)).toBe(100);
    expect(clampSize(9999, 100, 400)).toBe(400);
    expect(clampSize(250.6, 100, 400)).toBe(251);
  });
});

describe('useResizablePanelPrefs', () => {
  it('defaults to expanded at the default size when nothing is stored', () => {
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(result.current.collapsed).toBe(false);
    expect(result.current.size).toBe(200);
  });

  it('collapses, expands, and persists across remounts', () => {
    const first = renderHook(() => useResizablePanelPrefs(OPTS));
    act(() => first.result.current.collapse());
    expect(first.result.current.collapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem('test-panel')!).collapsed).toBe(true);

    const second = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(second.result.current.collapsed).toBe(true);
    act(() => second.result.current.expand());
    expect(second.result.current.collapsed).toBe(false);
  });

  it('clamps size on set and persists it', () => {
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    act(() => result.current.setSize(9999));
    expect(result.current.size).toBe(400);
    act(() => result.current.setSize(0));
    expect(result.current.size).toBe(100);
  });

  it('ignores corrupt stored state and falls back to defaults', () => {
    localStorage.setItem('test-panel', '{ not json');
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(result.current.collapsed).toBe(false);
    expect(result.current.size).toBe(200);
  });

  it('clamps an out-of-range persisted size on read', () => {
    localStorage.setItem('test-panel', JSON.stringify({ collapsed: false, size: 5000 }));
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(result.current.size).toBe(400);
  });

  /**
   * **A bound can change while the panel is mounted, and the size in state has to follow it.**
   *
   * The case above clamps in the `useState` initialiser, which runs once — so before this, a
   * `min` that rose later never reached a size already held. That is not hypothetical: the Gantt's
   * grid floor is derived from what its pinned block needs, and capturing a baseline adds a
   * `vs baseline` column to it. A planner who had dragged the divider narrow was left below a floor
   * the component believed it was enforcing, and the column painted over the chart
   * (`docs/TECH_DEBT.md` #151, found in a browser, not by any unit gate).
   */
  it('follows a bound that changes after mount', () => {
    localStorage.setItem('test-panel', JSON.stringify({ collapsed: false, size: 150 }));
    const { result, rerender } = renderHook(({ min }) => useResizablePanelPrefs({ ...OPTS, min }), {
      initialProps: { min: 100 },
    });
    expect(result.current.size).toBe(150);

    rerender({ min: 220 });
    expect(result.current.size, 'a raised floor must lift the size').toBe(220);

    // And the planner's own width comes BACK when the floor drops again — the stored preference is
    // deliberately untouched, so a panel does not shrink permanently because of a transient bound.
    rerender({ min: 100 });
    expect(result.current.size, 'the stored preference survives the clamp').toBe(150);
    expect(JSON.parse(localStorage.getItem('test-panel')!).size).toBe(150);
  });

  it('resetSize stores the default even when the bounds are stale, and reads back clamped', () => {
    localStorage.setItem('test-panel', JSON.stringify({ collapsed: false, size: 300 }));
    const { result, rerender } = renderHook(({ min }) => useResizablePanelPrefs({ ...OPTS, min }), {
      initialProps: { min: 250 },
    });
    expect(result.current.size).toBe(300);

    // The floor is 250 now, above the default of 200 — the stored value must still be the default,
    // not the default clamped up to the floor that is about to fall away.
    act(() => result.current.resetSize());
    expect(JSON.parse(localStorage.getItem('test-panel')!).size).toBe(200);
    expect(result.current.size, 'read back clamped to the bounds current now').toBe(250);

    rerender({ min: 100 });
    expect(result.current.size, 'the default itself returns once the floor drops').toBe(200);
  });

  describe('ceiling', () => {
    it('bounds the size in use and leaves the stored preference alone', () => {
      localStorage.setItem('test-panel', JSON.stringify({ collapsed: false, size: 380 }));
      const { result, rerender } = renderHook(
        ({ ceiling }) => useResizablePanelPrefs({ ...OPTS, ceiling }),
        { initialProps: { ceiling: 300 } },
      );
      expect(result.current.size).toBe(300);
      expect(result.current.limit).toBe(300);
      // Read at a narrow window, the preference is not rewritten: it must outlive the window.
      expect(JSON.parse(localStorage.getItem('test-panel')!).size).toBe(380);

      rerender({ ceiling: 400 });
      expect(result.current.size, 'the planner width returns when room does').toBe(380);
    });

    it('bounds a set size, and never goes below min', () => {
      const { result } = renderHook(() => useResizablePanelPrefs({ ...OPTS, ceiling: 250 }));
      act(() => result.current.setSize(9999));
      expect(result.current.size).toBe(250);

      const tight = renderHook(() => useResizablePanelPrefs({ ...OPTS, ceiling: 10 }));
      expect(tight.result.current.limit).toBe(100);
    });
  });
});
