import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted width preference for the docked **Compare revisions** panel — a sibling of the notes,
 * Float-paths and health docks on the same shared {@link useResizablePanelPrefs}, with its own
 * storage key (a planner who drags a comparison wide has not asked for the comments column to
 * follow).
 *
 * The MIN is DERIVED from this panel's own widest fixed line rather than copied from a neighbour,
 * which is the health panel's rule and the reason its own docblock gives for not copying one.
 * The binding line here is the side-picker row: two `Select`s side by side at `@sm`, each needing
 * room for a real baseline name ("Contract Baseline — Rev C" ≈ 180 px at the panel's text-sm) plus
 * the native select's own chevron and 2 × 12 px padding — ≈ 400 px before the two would collide.
 * Below the container query they stack, so an undershoot degrades to one column rather than
 * overflowing. 380 keeps them side by side on a comfortable dock and lets a narrow one stack.
 *
 * **The figure is derived from that arithmetic, not measured in a browser**, and no journey probe
 * asserts it — stated because the health panel's equivalent sentence once claimed a probe existed
 * and did not (ADR-0076 Class 3, caught at that epic's gate pass).
 */
const STORAGE_KEY = 'schedulepoint-revision-compare-panel';

export const REVISION_PANEL_MIN_WIDTH = 380;
export const REVISION_PANEL_MAX_WIDTH = 640;
export const REVISION_PANEL_DEFAULT_WIDTH = 420;

export function useRevisionComparePanelPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: REVISION_PANEL_MIN_WIDTH,
    max: REVISION_PANEL_MAX_WIDTH,
    defaultSize: REVISION_PANEL_DEFAULT_WIDTH,
  });
}
