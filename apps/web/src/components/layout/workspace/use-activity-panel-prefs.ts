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

/**
 * The activities panel's fixed parts, in px, **each the larger of the two pointers' readings** so one
 * constant is safe on both (`docs/specs/short-screen-vertical-budget/m0-measurement.md` §1, taken
 * 2026-10-08 in the container's Chromium — layout only). One constant rather than a fine/coarse
 * pair because the Surface reports `pointer: fine` with its cover attached (ADR-0118 D7), so a
 * pointer-keyed size would under-reserve on the one touch device the product owner uses.
 *
 * `TABLE_HEAD_PX` and `ROW_PX` are keyed on the stage's **width**, not the pointer: at 1024–1280
 * wide the cells wrap and the head reads 57 and a row 57 (61 on a coarse pointer, where the row's ⋯
 * grows to 44); at 1912 wide they read 37 and 45 (61 coarse). The constants are sized for the
 * narrow, coarse case, which is where a short body exists at all, so they over-reserve on a wide
 * screen. ROW_PX 57->61 when the activities row's ⋯ grows to 44 on touch (dense-row-touch-targets M1). The M-A journey asserts each real part is `<=` its constant on both pointers.
 */
export const PANEL_HEADER_PX = 60;
export const PANEL_FOOT_PX = 55;
export const PANEL_BODY_PAD_PX = 16;
export const TABLE_HEAD_PX = 57;
export const ROW_PX = 61;

/**
 * Smallest open height: every fixed part plus ONE row. The old 140 was smaller than the panel's own
 * header, foot and table head, so a panel dragged to its minimum showed no rows on any screen
 * (`docs/TECH_DEBT.md` #468). Derived, so the number cannot drift from the parts it is made of.
 */
export const PANEL_MIN_OPEN =
  PANEL_HEADER_PX + PANEL_FOOT_PX + PANEL_BODY_PAD_PX + TABLE_HEAD_PX + ROW_PX;
/**
 * The height at which the panel shows the table's own floor of three rows ("the header and about
 * three rows", `data-table.tsx`). A workspace body that cannot give the panel this much beside the
 * canvas's minimum is a short body ({@link isShortBody}).
 */
export const PANEL_USEFUL_MIN = PANEL_MIN_OPEN + 2 * ROW_PX;
/** How far a body must recover past the line before a swapped panel gives the diagram back. */
export const SHORT_BODY_HYSTERESIS_PX = 24;

/** Static upper bound (a very tall panel is rarely useful); the live max also reserves the canvas. */
export const PANEL_MAX_HEIGHT = 720;
export const PANEL_DEFAULT_HEIGHT = 280;
/** Height always kept for the canvas above, so the panel can never crush it to nothing. */
export const CANVAS_MIN_HEIGHT = 240;
/**
 * Height kept for the canvas ROW while a right dock is open (workspace visual polish item 8's
 * accepted-cost fix, 2026-08-28). Since the dock-pushes-canvas-only restructure, an open dock's
 * height IS the canvas row's height — so without this, expanding the activities panel squeezed an
 * open Health/Float-paths/Notes panel down to the 240 px canvas floor, a scrolling review panel
 * in a box shorter than the content it exists to walk (the ux gate's blocking finding). The cost
 * runs the other way now and is stated: while a dock is open the activities panel's effective max
 * is correspondingly lower, and a taller persisted height is render-clamped for the duration —
 * `panel.size` itself is never overwritten, so closing the dock restores the panel exactly.
 *
 * **This guards the panel's clamp and nothing else, and at the 1024 × 600 floor it is not met**:
 * the dock is 314 px tall there (`docs/specs/minimum-viewport/m4-measurement.md`) and the whole
 * workspace body is 365 px (fine) / 329 px (coarse) (`docs/specs/short-screen-vertical-budget/
 * m0-measurement.md`), so the split cannot give a dock and an expanded panel their minimums at once.
 * On a short body ({@link isShortBody}) they are mutually exclusive instead: Expand closes the dock.
 */
export const DOCK_MIN_HEIGHT = 360;

/**
 * Whether the workspace body is too short to split between the diagram and a useful panel, so an
 * expanded panel takes the whole body and the diagram is hidden (`docs/specs/short-screen-vertical-budget`).
 *
 * `reserve` is the height the diagram row must keep ({@link CANVAS_MIN_HEIGHT}, or
 * {@link DOCK_MIN_HEIGHT} while a right dock is open). `wasShort` adds {@link SHORT_BODY_HYSTERESIS_PX}
 * so a drag-resize does not flicker the swap across the line. An unmeasured body (`0`: first paint,
 * jsdom) is never short, so those renders keep today's layout.
 */
export function isShortBody(bodyHeight: number, reserve: number, wasShort: boolean): boolean {
  return (
    bodyHeight > 0 &&
    bodyHeight - reserve < PANEL_USEFUL_MIN + (wasShort ? SHORT_BODY_HYSTERESIS_PX : 0)
  );
}

export function useActivityPanelPrefs(): UseResizablePanelPrefs {
  return useResizablePanelPrefs({
    storageKey: STORAGE_KEY,
    min: PANEL_MIN_OPEN,
    max: PANEL_MAX_HEIGHT,
    defaultSize: PANEL_DEFAULT_HEIGHT,
  });
}
