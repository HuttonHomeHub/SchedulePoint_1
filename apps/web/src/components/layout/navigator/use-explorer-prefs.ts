import { useSyncExternalStore } from 'react';

import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted width and fold state for the **docked Project Explorer** (workspace redesign M3-T1) —
 * a thin adapter over the shared {@link useResizablePanelPrefs}, so the Explorer, the context
 * drawer and the activity panel share one clamp/persist behaviour.
 *
 * **200–420, default 276.** The lower bound is 24 px below the context drawer's, and deliberately:
 * that panel's 224 was set by what an *activity editor* needs to stay readable, and this one holds
 * a tree of names, which degrades gracefully by truncating rather than by wrapping a form. The
 * default is 276 rather than 300 because the Explorer is beside the diagram all day and the
 * drawer is not — 24 px of canvas, every session.
 *
 * **A separate storage key from the drawer's**, so a reader who had widened the drawer does not
 * inherit that width on a different panel at the other edge. There is no migration from the old
 * key: the Explorer was not a resizable column before this, so there is nothing to carry over.
 */
const STORAGE_KEY = 'schedulepoint-explorer';

export const EXPLORER_MIN_WIDTH = 200;
export const EXPLORER_MAX_WIDTH = 420;
export const EXPLORER_DEFAULT_WIDTH = 276;

/**
 * **The stage never drops below 720 px** (ADR-0179, `docs/specs/minimum-viewport/m0-measurement.md`
 * §1). The 420 maximum was set when the stage had no floor: at the 1024 design floor it left 603 px,
 * and with a dock open the diagram was 262 px wide. At the 276 default the stage is 748, which is
 * the width the Gantt's 584 px pinned grid (#437) and a 400 px dock were both judged at, so the
 * floor sits just under it: a planner can still widen the Explorer by 27 px at 1024, and at
 * 1141 px and up the 420 maximum is reached unchanged.
 */
export const STAGE_MIN_WIDTH = 720;

/** The splitter beside the panel is `w-px` (`panel-resizer.tsx`) and comes out of the stage too. */
const SPLITTER_WIDTH = 1;

/** The Explorer's widest allowed width in a window this wide. Pure, so the bound is testable. */
export function explorerCeiling(viewportWidth: number): number {
  return Math.max(
    EXPLORER_MIN_WIDTH,
    Math.min(EXPLORER_MAX_WIDTH, viewportWidth - STAGE_MIN_WIDTH - SPLITTER_WIDTH),
  );
}

function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

const readViewportWidth = (): number => window.innerWidth;

export type ExplorerPrefs = UseResizablePanelPrefs;

export function useExplorerPrefs(): ExplorerPrefs {
  const viewportWidth = useSyncExternalStore(subscribeToResize, readViewportWidth);
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: EXPLORER_MIN_WIDTH,
    max: EXPLORER_MAX_WIDTH,
    defaultSize: EXPLORER_DEFAULT_WIDTH,
    // Clamps the width in use, never the stored preference (see `ceiling`).
    ceiling: explorerCeiling(viewportWidth),
  });
}
