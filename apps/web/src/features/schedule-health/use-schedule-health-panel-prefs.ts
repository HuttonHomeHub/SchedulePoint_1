import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted width preference for the docked **Health check** panel — a sibling of the notes and
 * Float-paths docks on the same shared {@link useResizablePanelPrefs}, with its own storage key
 * (a planner who drags the report wide has not asked for the comments column to follow).
 *
 * The MIN is derived from this panel's own widest fixed line, not copied from a neighbour
 * (M2-T2 step 8): a metric row leads with its longest name, "Critical Path Length Index"
 * (26 characters ≈ 182 px at the panel's text-sm), plus the verdict word ("Not assessed",
 * ≈ 82 px with its icon), the row gap and the disclosure chevron (≈ 40 px), inside the panel's
 * 2 × 12 px padding — ≈ 330 px before the name would truncate against the verdict. 340 keeps a
 * margin; the measured/threshold pair sits on its own line below the name, so it never competes.
 * Verified against the rendered row by the journey's probe (`e2e-health-check`).
 */
const STORAGE_KEY = 'schedulepoint-health-panel';

export const HEALTH_PANEL_MIN_WIDTH = 340;
export const HEALTH_PANEL_MAX_WIDTH = 640;
export const HEALTH_PANEL_DEFAULT_WIDTH = 400;

export function useScheduleHealthPanelPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: HEALTH_PANEL_MIN_WIDTH,
    max: HEALTH_PANEL_MAX_WIDTH,
    defaultSize: HEALTH_PANEL_DEFAULT_WIDTH,
  });
}
