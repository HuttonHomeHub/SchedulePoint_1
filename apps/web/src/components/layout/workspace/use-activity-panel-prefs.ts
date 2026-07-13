import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted preferences for the plan workspace's bottom activity panel (ADR-0030): collapsed +
 * height. A thin adapter over the shared {@link useResizablePanelPrefs} — the same primitive the
 * Project Explorer rail uses — so the two panels share one clamp/persist/reset behaviour.
 *
 * The *effective* maximum is additionally clamped at render against the live workspace height
 * (reserving {@link CANVAS_MIN_HEIGHT} for the canvas), since the static `PANEL_MAX_HEIGHT` can
 * exceed the available room on short viewports.
 */
const STORAGE_KEY = 'schedulepoint-activity-panel';

/** Smallest open height — below this the panel should be collapsed to its handle instead. */
export const PANEL_MIN_OPEN = 140;
/** Static upper bound (a very tall panel is rarely useful); the live max also reserves the canvas. */
export const PANEL_MAX_HEIGHT = 720;
export const PANEL_DEFAULT_HEIGHT = 280;
/** Height always kept for the canvas above, so the panel can never crush it to nothing. */
export const CANVAS_MIN_HEIGHT = 240;

export function useActivityPanelPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: PANEL_MIN_OPEN,
    max: PANEL_MAX_HEIGHT,
    defaultSize: PANEL_DEFAULT_HEIGHT,
  });
}
