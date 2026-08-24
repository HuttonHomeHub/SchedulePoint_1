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

export type ExplorerPrefs = UseResizablePanelPrefs;

export function useExplorerPrefs(): ExplorerPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: EXPLORER_MIN_WIDTH,
    max: EXPLORER_MAX_WIDTH,
    defaultSize: EXPLORER_DEFAULT_WIDTH,
  });
}
