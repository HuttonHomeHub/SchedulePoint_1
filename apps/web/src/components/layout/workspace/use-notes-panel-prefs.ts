import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted width preference for the plan workspace's **docked notes panel** (entry-route win 1) — the
 * right-side sibling of the {@link useActivityPanelPrefs} bottom panel and the Project Explorer rail.
 * A thin adapter over the shared {@link useResizablePanelPrefs} so all three panels share one
 * clamp/persist behaviour. Open/closed is not stored here — it is the ephemeral `model.notesOpen` the
 * Comments toolbar toggle drives; this only remembers how wide the dock was dragged.
 *
 * The *effective* maximum is additionally clamped at render against the live workspace width (reserving
 * {@link CANVAS_MIN_WIDTH} for the canvas), since the static max can exceed the available room.
 */
const STORAGE_KEY = 'schedulepoint-notes-panel';

/** Smallest useful dock width (px). */
export const NOTES_PANEL_MIN_WIDTH = 280;
/** Static upper bound; the live max also reserves the canvas. */
export const NOTES_PANEL_MAX_WIDTH = 640;
export const NOTES_PANEL_DEFAULT_WIDTH = 360;
/** Width always kept for the canvas to the left, so the dock can never crush it. */
export const CANVAS_MIN_WIDTH = 360;

export function useNotesPanelPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: NOTES_PANEL_MIN_WIDTH,
    max: NOTES_PANEL_MAX_WIDTH,
    defaultSize: NOTES_PANEL_DEFAULT_WIDTH,
  });
}
