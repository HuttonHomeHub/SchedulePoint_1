import { daysBetween, screenXOfDay, type Size, type Viewport } from './render-model';

/**
 * The pure, renderer-agnostic **WBS band geometry** (ADR-0063). It projects the plan's WBS groups —
 * real `WBS_SUMMARY` rollups and the one derived "Unassigned" bucket — onto the **same time axis**
 * the scene and the ruler use, so the band's bars can never drift from the diagram columns beneath
 * them.
 *
 * No canvas, no DOM, no React, and **no schedule arithmetic**: a real summary's dates arrive
 * already computed by the engine, and the derived bucket's span was already reduced by
 * `features/wbs/model/wbs-groups.ts`. This module only decides where a span lands in pixels.
 *
 * The load-bearing property is the ADR-0049 one, restated: a bar's left edge is
 * `screenXOfDay(daysBetween(dataDate, start), view)` — **the very expression the scene uses**,
 * imported verbatim rather than re-derived. Alignment is definitional, not approximated. A test
 * asserts a band bar's left edge equals the scene's for the same viewport and the same date.
 */

/** How many nesting levels the band renders, stacked (ADR-0063 §3). Depth 0 is the outermost. */
export const WBS_BAND_MAX_DEPTH = 2;

/** One stacked sub-row's height, in CSS px. */
export const WBS_BAND_ROW_HEIGHT = 16;

/** Vertical gap between stacked sub-rows, in CSS px. */
export const WBS_BAND_ROW_GAP = 2;

/** Padding above the first sub-row and below the last, in CSS px. */
export const WBS_BAND_PAD_Y = 4;

/** Minimum bar width so a one-day group is still visible at a coarse zoom. */
const MIN_BAR_WIDTH_PX = 2;

/** A group to place on the band. `depth` 0 is outermost; `id` is `null` for the derived bucket. */
export interface WbsBandGroup {
  /** The summary's activity id, or `null` for the derived "Unassigned" bucket — which has none,
   * because it is not in the database. Callers use `null` to refuse selection (ADR-0063 §7). */
  id: string | null;
  label: string;
  depth: number;
  start: string | null;
  finish: string | null;
}

/** A placed band bar in band-canvas-local coordinates. */
export interface WbsBandBar {
  id: string | null;
  label: string;
  depth: number;
  x: number;
  w: number;
  y: number;
  h: number;
}

/**
 * The band's height for a given rendered depth — `0` when nothing is rendered, so the canvas
 * reserves nothing and `measure()` subtracts nothing (the flag-off parity path, ADR-0063 §"the
 * inactive path subtracts 0").
 *
 * Takes the number of **rendered** depths rather than the plan's actual nesting, so the band's
 * height is bounded by {@link WBS_BAND_MAX_DEPTH} and cannot grow as a planner nests deeper — the
 * whole point of the cap.
 */
export function wbsBandHeight(renderedDepths: number): number {
  const depths = Math.min(Math.max(renderedDepths, 0), WBS_BAND_MAX_DEPTH + 1);
  if (depths === 0) return 0;
  return WBS_BAND_PAD_Y * 2 + depths * WBS_BAND_ROW_HEIGHT + (depths - 1) * WBS_BAND_ROW_GAP;
}

/**
 * How many stacked sub-rows the given groups need — the count of **distinct depths present**, not
 * the deepest depth plus one. A plan whose only summaries sit at depth 2 (because its depth-0 and
 * depth-1 parents were filtered out) should not be given three sub-rows, two of them empty.
 *
 * Groups deeper than {@link WBS_BAND_MAX_DEPTH} are excluded here as they are in
 * {@link wbsBandBars}, so the two cannot disagree about how tall the band needs to be.
 */
export function wbsBandDepths(groups: readonly WbsBandGroup[]): number {
  const depths = new Set<number>();
  for (const group of groups) {
    if (group.depth >= 0 && group.depth <= WBS_BAND_MAX_DEPTH) depths.add(group.depth);
  }
  return depths.size;
}

/**
 * Place the band's bars for the current viewport.
 *
 * Three things are excluded, each for its own reason:
 *
 * - **Deeper than the cap** — it keeps today's treatment in the scene (ADR-0063 §3), so it is not
 *   lost: a depth-3 summary is still an ordinary bar in the diagram and still an option in the
 *   parallel listbox. (An earlier draft of this comment claimed the band carried an accessible
 *   description saying the cap exists; it never did, and asserting a UX property that has not
 *   shipped is the drift ADR-0058 exists to stop. If that description is wanted, build it — do not
 *   describe it here.)
 * - **No span** — a group whose members are all uncalculated has no dates. Drawing a bar at an
 *   invented position would state a schedule the engine has not produced.
 * - **Entirely off-surface** — the viewport cull, mirroring the scene's.
 *
 * `y` is derived from the group's depth against the *rendered* depth order, so a band showing only
 * depth-2 groups puts them in its first sub-row rather than leaving two empty ones above.
 */
export function wbsBandBars(
  groups: readonly WbsBandGroup[],
  dataDate: string,
  view: Viewport,
  size: Size,
): WbsBandBar[] {
  const rendered = groups.filter((g) => g.depth >= 0 && g.depth <= WBS_BAND_MAX_DEPTH);
  // The sub-row a depth occupies: the depths actually present, in order. See `wbsBandDepths`.
  const rowOfDepth = new Map<number, number>();
  for (const depth of [...new Set(rendered.map((g) => g.depth))].sort((a, b) => a - b)) {
    rowOfDepth.set(depth, rowOfDepth.size);
  }

  const bars: WbsBandBar[] = [];
  for (const group of rendered) {
    if (group.start === null || group.finish === null) continue;
    const x1 = screenXOfDay(daysBetween(dataDate, group.start), view);
    // Inclusive finish (ADR-0023): the bar covers the finish day, so it ends at the START of the
    // following day — the same convention the scene's bars use.
    const x2 = screenXOfDay(daysBetween(dataDate, group.finish) + 1, view);
    if (x2 <= 0 || x1 >= size.width) continue;
    const row = rowOfDepth.get(group.depth) ?? 0;
    bars.push({
      id: group.id,
      label: group.label,
      depth: group.depth,
      x: x1,
      w: Math.max(MIN_BAR_WIDTH_PX, x2 - x1),
      y: WBS_BAND_PAD_Y + row * (WBS_BAND_ROW_HEIGHT + WBS_BAND_ROW_GAP),
      h: WBS_BAND_ROW_HEIGHT,
    });
  }
  return bars;
}

/**
 * The band bar at a band-local point, or `null`. Later bars win, matching the paint order, so a
 * deeper bar drawn over a shallower one is the one you hit.
 *
 * A bar with a `null` id is still returned; **refusing to select it is the caller's job**, because
 * the caller is the one that knows selection means "hand this activity id to the host". Returning
 * it lets the hit-test stay a pure geometric question, and lets a future affordance (a tooltip,
 * say) act on the bucket without re-deriving the geometry.
 */
export function wbsBandHitTest(
  bars: readonly WbsBandBar[],
  x: number,
  y: number,
): WbsBandBar | null {
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    const bar = bars[i]!;
    if (x >= bar.x && x < bar.x + bar.w && y >= bar.y && y < bar.y + bar.h) return bar;
  }
  return null;
}

/**
 * Where a band bar sits in **viewport** coordinates, given the SCENE canvas's own box.
 *
 * This exists because of the defect the M6 review found: the floating selection bar anchors to the
 * selected activity's rect, and a summary is not in the scene when the band is on — so the anchor
 * went `null`, the bar hid itself with `visibility: hidden`, and Dissolve/Edit/Delete left both the
 * screen and the tab order for exactly the objects the band exists to show.
 *
 * The arithmetic is the load-bearing part and the reason this is a function rather than three lines
 * inlined in the render loop: the band canvas is pinned at the ruler and the scene starts a band's
 * height BELOW it, so a band bar's viewport top is the scene box's top **minus** the band height,
 * plus the bar's own `y`. Getting that sign wrong puts the actions bar a band's height out of
 * place, which looks like nothing at all until someone notices it overlapping the ruler.
 *
 * Returns `null` when the bar is culled off the surface horizontally, matching the scene path's
 * own on-surface test — a bar scrolled out of view has no anchor to offer.
 */
export function wbsBandBarAnchor(
  bar: Pick<WbsBandBar, 'x' | 'w' | 'y'>,
  wbsBandHeightPx: number,
  box: { top: number; left: number },
  surfaceWidth: number,
): { top: number; centerX: number } | null {
  if (bar.x + bar.w <= 0 || bar.x >= surfaceWidth) return null;
  return {
    top: box.top - wbsBandHeightPx + bar.y,
    centerX: box.left + bar.x + bar.w / 2,
  };
}
