import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { dockBounds } from './dock-bounds';
import { NOTES_PANEL_MAX_WIDTH } from './use-notes-panel-prefs';
import { useRightDockSize } from './use-right-dock-size';

import type { UseResizablePanelPrefs } from '@/components/ui/use-resizable-panel-prefs';

/** Only `size` and `setSize` are read; the rest of the prefs surface is irrelevant to the hook. */
function prefs(size: number, setSize = vi.fn()): UseResizablePanelPrefs {
  return { size, setSize } as unknown as UseResizablePanelPrefs;
}

describe('useRightDockSize', () => {
  it.each([0, 320, 767, 1024, 1440])(
    'returns exactly what dockBounds returns for the shared ceiling at body %i',
    (bodyWidth) => {
      const { result } = renderHook(() => useRightDockSize(prefs(420), 380, bodyWidth));
      expect(result.current.bounds).toEqual(
        dockBounds({ stored: 420, min: 380, max: NOTES_PANEL_MAX_WIDTH, bodyWidth }),
      );
    },
  );

  it('stores a resize no wider than the bound the resizer was shown', () => {
    const setSize = vi.fn();
    const { result } = renderHook(() => useRightDockSize(prefs(420, setSize), 280, 700));
    const { max } = result.current.bounds;
    expect(max).toBeLessThan(NOTES_PANEL_MAX_WIDTH);

    result.current.onResize(max + 200);
    expect(setSize).toHaveBeenLastCalledWith(max);
    result.current.onResize(300);
    expect(setSize).toHaveBeenLastCalledWith(300);
  });

  it('keeps one handler while neither the prefs nor the bound change', () => {
    const p = prefs(420);
    const { result, rerender } = renderHook(() => useRightDockSize(p, 280, 1024));
    const first = result.current.onResize;
    rerender();
    expect(result.current.onResize).toBe(first);
  });
});
