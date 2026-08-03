import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted width preference for the plan workspace's **docked Float paths panel** (audit F4) — a
 * sibling of the notes dock's {@link useNotesPanelPrefs}, on the same shared
 * {@link useResizablePanelPrefs} so the rail, the activity panel, the notes dock and this one share
 * one clamp/persist behaviour rather than four.
 *
 * Its own storage key, deliberately: a planner who drags the analysis wide to read long chain names
 * has not asked for the comments column to be that wide too.
 *
 * Open/closed is not stored here — that is the ephemeral panel state the toolbar item drives.
 */
const STORAGE_KEY = 'schedulepoint-float-paths-panel';

/** Smallest useful width (px) — a chain row's code, name and date without wrapping every line. */
export const FLOAT_PATHS_PANEL_MIN_WIDTH = 300;
export const FLOAT_PATHS_PANEL_MAX_WIDTH = 640;
export const FLOAT_PATHS_PANEL_DEFAULT_WIDTH = 380;

export function useFloatPathsPanelPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: FLOAT_PATHS_PANEL_MIN_WIDTH,
    max: FLOAT_PATHS_PANEL_MAX_WIDTH,
    defaultSize: FLOAT_PATHS_PANEL_DEFAULT_WIDTH,
  });
}
