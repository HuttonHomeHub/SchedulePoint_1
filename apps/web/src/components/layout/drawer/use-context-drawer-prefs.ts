import {
  useResizablePanelPrefs,
  type UseResizablePanelPrefs,
} from '@/components/ui/use-resizable-panel-prefs';

/**
 * Persisted width preference for the **context drawer** — the app's single trailing panel
 * (ADR-0099 D2, plan.md F1). A thin adapter over the shared {@link useResizablePanelPrefs}, so the
 * drawer, the Project Explorer rail and the activity panel all share one clamp/persist behaviour.
 *
 * **224–420, default 300, and the lower bound is a finding rather than a preference.** The design
 * brief said a fixed 224 px; `Tabs orientation="vertical"`'s rail is `w-52` = **208 px**, which is
 * 93 % of that before any content, and `DESIGN_SYSTEM.md` records the activity editor taking the
 * 896 px `xl` dialog *because* a narrow single column was tried and rejected. So the drawer is
 * resizable and its tabs are a horizontal strip (plan.md §A3). `FieldGrid` pairs stack at the
 * narrow end: accepted and stated, not discovered later.
 *
 * Open/closed is not stored here — that is the drawer's own persisted state, because a reader who
 * closes it means it, and a width is a different question from whether the panel is there at all.
 */
const STORAGE_KEY = 'schedulepoint-context-drawer';

export const CONTEXT_DRAWER_MIN_WIDTH = 224;
export const CONTEXT_DRAWER_MAX_WIDTH = 420;
export const CONTEXT_DRAWER_DEFAULT_WIDTH = 300;

export function useContextDrawerPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: CONTEXT_DRAWER_MIN_WIDTH,
    max: CONTEXT_DRAWER_MAX_WIDTH,
    defaultSize: CONTEXT_DRAWER_DEFAULT_WIDTH,
  });
}
