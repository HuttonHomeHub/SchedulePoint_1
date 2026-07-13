import { clampSize, useResizablePanelPrefs } from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted preferences for the pinned navigator rail (`lg`+): collapsed + width. A thin
 * adapter over the shared {@link useResizablePanelPrefs} primitive (the same implementation the
 * plan workspace's activity panel uses), exposing rail-named accessors (`width`/`setWidth`).
 */
const STORAGE_KEY = 'schedulepoint-nav-rail';

export const RAIL_MIN_WIDTH = 220;
export const RAIL_MAX_WIDTH = 480;
export const RAIL_DEFAULT_WIDTH = 288;

/** Clamp a candidate rail width to the allowed range (also rounds to whole px). */
export function clampRailWidth(width: number): number {
  return clampSize(width, RAIL_MIN_WIDTH, RAIL_MAX_WIDTH);
}

export interface UseRailPrefs {
  collapsed: boolean;
  width: number;
  collapse: () => void;
  expand: () => void;
  setWidth: (width: number) => void;
}

export function useRailPrefs(): UseRailPrefs {
  const prefs = useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: RAIL_MIN_WIDTH,
    max: RAIL_MAX_WIDTH,
    defaultSize: RAIL_DEFAULT_WIDTH,
  });
  return {
    collapsed: prefs.collapsed,
    width: prefs.size,
    collapse: prefs.collapse,
    expand: prefs.expand,
    setWidth: prefs.setSize,
  };
}
