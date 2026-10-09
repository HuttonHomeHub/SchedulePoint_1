import { CANVAS_MIN_WIDTH } from './use-notes-panel-prefs';

import { SPLITTER_WIDTH } from '@/components/ui/panel-resizer';

/** What the workspace lays a right dock out with, for one dock at one body width. */
export interface DockBounds {
  /** The width to render the dock at. */
  width: number;
  /** The widest a dock can be in this body: the body less the splitter. Unbounded while unmeasured. */
  cap: number;
  /** The smallest the dock may be resized to: the dock's own minimum, lowered to the cap. */
  min: number;
  /** The largest the dock may be resized to: what the resizer's `aria-valuemax` and every resize handler use. */
  max: number;
  /**
   * An open dock here would leave the diagram narrower than {@link CANVAS_MIN_WIDTH}, so the dock takes
   * the whole row and the diagram column is taken out of reach (`inert`) instead of left as a strip
   * nobody can use.
   */
  squeezed: boolean;
  /** Whether a resizer means anything: a squeezed dock is pinned to the row, and a dock whose minimum already fills it has no range. */
  resizable: boolean;
}

/**
 * **One dock's width, resize bounds and squeeze verdict, from the body it sits in**
 * (`docs/specs/retire-single-pane-workspace`, AC-2.2 and AC-2.4).
 *
 * The workspace used to clamp each dock to `max(MIN, bodyWidth - 360)` in four places, which has no
 * upper bound against the body (a 380 px revisions dock overflowed a 320 px body and was clipped by
 * its `overflow-hidden`) and forgets the 1 px splitter (at 767 the revisions dock rendered 407 px and
 * left a 359 px diagram, one under the floor the clamp exists to keep). One function now feeds the
 * rendered width, the resizer's bounds and the resize handler, so the three cannot disagree.
 *
 * - **`bodyWidth` 0 is "not yet measured", not "zero wide".** jsdom has no `ResizeObserver` and the
 *   first render precedes the first observation. An unmeasured body applies no cap and squeezes
 *   nothing, so nothing is made inert by mistake; the CSS `max-w-full` on the dock is the bound until
 *   the observer reports.
 * - **This is a render clamp only.** `stored` is never written back, so a width saved at 1440 is
 *   still there at 1440 after a visit at 640 — the rule `useResizablePanelPrefs` states for its own
 *   read-back. The clamp cannot live in that hook: it never reads a ceiling below the dock's minimum.
 * - **`squeezed` is decided against the dock's MINIMUM**, not its current width: a dock that cannot
 *   get below its minimum and leave 360 px for the diagram will never fit, whatever its stored width.
 *
 * @param stored the planner's saved width, already clamped to `[min, max]` by the prefs hook.
 * @param min the dock's own minimum width.
 * @param max the dock's static maximum (`NOTES_PANEL_MAX_WIDTH`).
 */
export function dockBounds({
  stored,
  min,
  max,
  bodyWidth,
}: {
  stored: number;
  min: number;
  max: number;
  bodyWidth: number;
}): DockBounds {
  if (bodyWidth <= 0) {
    return {
      width: Math.min(Math.max(stored, min), max),
      cap: max,
      min,
      max,
      squeezed: false,
      resizable: true,
    };
  }
  const cap = Math.max(0, bodyWidth - SPLITTER_WIDTH);
  const squeezed = bodyWidth - min - SPLITTER_WIDTH < CANVAS_MIN_WIDTH;
  const lowestMin = Math.min(min, cap);
  // The room left for the dock once the diagram has its floor and the splitter its pixel. Never
  // below the dock's own minimum: a dock that does not fit is `squeezed`, not shrunk.
  const room = Math.max(min, bodyWidth - CANVAS_MIN_WIDTH - SPLITTER_WIDTH);
  const highest = Math.max(lowestMin, Math.min(max, room, cap));
  return {
    width: squeezed ? cap : Math.min(Math.max(stored, lowestMin), highest),
    cap,
    min: lowestMin,
    max: highest,
    squeezed,
    resizable: !squeezed && cap > min && highest > lowestMin,
  };
}
