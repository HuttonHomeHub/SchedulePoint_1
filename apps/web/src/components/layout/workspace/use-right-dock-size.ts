import { useCallback } from 'react';

import { dockBounds, type DockBounds } from './dock-bounds';
import { NOTES_PANEL_MAX_WIDTH } from './use-notes-panel-prefs';

import type { UseResizablePanelPrefs } from '@/components/ui/use-resizable-panel-prefs';

/**
 * **One right dock's rendered bounds and its resize handler, from its prefs** — the wiring the four
 * docks (notes, float paths, health, revisions) each wrote out by hand in `plan-workspace-toolbar.tsx`
 * (`docs/TECH_DEBT.md` #249). The maths already lived in {@link dockBounds}; what was copied was the
 * glue around it: bounds from the stored width, and a resize handler that never stores past the
 * bound the resizer was shown.
 *
 * Every right dock shares one static ceiling, `NOTES_PANEL_MAX_WIDTH`, so it is not a parameter:
 * a dock that wanted another would be a reason to open this up, not to bypass it.
 *
 * @param prefs the dock's resizable-panel prefs (its own storage key).
 * @param min the dock's own minimum width.
 * @param bodyWidth the workspace body's measured width; 0 until the first observation.
 */
export function useRightDockSize(
  prefs: UseResizablePanelPrefs,
  min: number,
  bodyWidth: number,
): { bounds: DockBounds; onResize: (next: number) => void } {
  const bounds = dockBounds({
    stored: prefs.size,
    min,
    max: NOTES_PANEL_MAX_WIDTH,
    bodyWidth,
  });
  const max = bounds.max;
  const onResize = useCallback((next: number) => prefs.setSize(Math.min(next, max)), [prefs, max]);
  return { bounds, onResize };
}
