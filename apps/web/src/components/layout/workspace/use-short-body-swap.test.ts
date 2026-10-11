import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_MIN_HEIGHT,
  PANEL_USEFUL_MIN,
  SHORT_BODY_HYSTERESIS_PX,
} from './use-activity-panel-prefs';
import { useShortBodySwap } from './use-short-body-swap';

/**
 * The swap's own rules (`docs/TECH_DEBT.md` #469): the hysteresis and the tool put-away. The
 * toolbar-level behaviour (what a command does while swapped) is `plan-workspace-toolbar.test.tsx`'s.
 */
const LINE = CANVAS_MIN_HEIGHT + PANEL_USEFUL_MIN;

function setup(initial: { bodyHeight: number; collapsed: boolean; mode?: string }) {
  const setMode = vi.fn();
  const setCollapsed = vi.fn();
  const setInteracted = vi.fn();
  const hook = renderHook(
    (p: { bodyHeight: number; collapsed: boolean }) =>
      useShortBodySwap({
        ...p,
        setCollapsed,
        setInteracted,
        canvasUi: { mode: (initial.mode ?? 'select') as 'select', setMode },
        anyRightDockActive: false,
      }),
    { initialProps: { bodyHeight: initial.bodyHeight, collapsed: initial.collapsed } },
  );
  return { ...hook, setMode, setCollapsed, setInteracted };
}

describe('useShortBodySwap', () => {
  it('swaps only when the panel is expanded and the body is short', () => {
    const { result, rerender } = setup({ bodyHeight: LINE - 1, collapsed: true });
    expect(result.current.swapped).toBe(false);
    rerender({ bodyHeight: LINE - 1, collapsed: false });
    expect(result.current.swapped).toBe(true);
    rerender({ bodyHeight: LINE + 200, collapsed: false });
    expect(result.current.swapped).toBe(false);
  });

  it('never calls an unmeasured body short', () => {
    const { result } = setup({ bodyHeight: 0, collapsed: false });
    expect(result.current.swapped).toBe(false);
  });

  it('holds the swap until the body recovers past the hysteresis, not merely the line', () => {
    const { result, rerender } = setup({ bodyHeight: LINE - 1, collapsed: false });
    expect(result.current.swapped).toBe(true);
    rerender({ bodyHeight: LINE + SHORT_BODY_HYSTERESIS_PX - 1, collapsed: false });
    expect(result.current.swapped).toBe(true);
    rerender({ bodyHeight: LINE + SHORT_BODY_HYSTERESIS_PX, collapsed: false });
    expect(result.current.swapped).toBe(false);
  });

  it('puts an armed tool away on entering the swap, once, and clears the note when it ends', () => {
    const { result, rerender, setMode } = setup({
      bodyHeight: LINE + 200,
      collapsed: false,
      mode: 'add',
    });
    expect(result.current.toolPutAway).toBe(false);
    expect(setMode).not.toHaveBeenCalled();

    rerender({ bodyHeight: LINE - 1, collapsed: false });
    expect(result.current.toolPutAway).toBe(true);
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith('select');

    rerender({ bodyHeight: LINE + 200, collapsed: false });
    expect(result.current.toolPutAway).toBe(false);
  });

  it('leaves a tool alone when none is armed', () => {
    const { result, setMode } = setup({ bodyHeight: LINE - 1, collapsed: false });
    expect(result.current.swapped).toBe(true);
    expect(result.current.toolPutAway).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
  });

  it('collapses quietly: interacted is cleared when focus is not inside the panel', () => {
    const { result, setCollapsed, setInteracted } = setup({
      bodyHeight: LINE - 1,
      collapsed: false,
    });
    result.current.collapseQuietly();
    expect(setInteracted).toHaveBeenCalledWith(false);
    expect(setCollapsed).toHaveBeenCalledWith(true);
  });
});
