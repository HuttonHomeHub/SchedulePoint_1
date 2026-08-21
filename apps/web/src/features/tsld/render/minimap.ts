import type { Ctx2D } from './ctx-2d';
import { screenXOfDay, worldExtent, type RenderActivity, type Viewport } from './geometry';
import { daysBetween } from './working-time';

/**
 * **The minimap's pure render core** (minimap epic M1-T2; ADR reference filed at M1-T5).
 *
 * The minimap is an invariant plan picture: it is rebuilt only when the scene changes
 * (activity data, box resize, theme) and NEVER per frame — everything that moves between
 * scene changes (the viewport rectangle, the selection marker, the Today vertical) is DOM,
 * beside the bitmap, not in it. That split is the whole design: a selection change and
 * midnight both move marks that the rebuild triggers never fire for, so putting either in
 * the bitmap re-introduces the staleness defect ADR-0056 F6a fixed on the main canvas, one
 * layer down.
 *
 * **What this deliberately is not:**
 *
 * - **Not a second `paintScene`.** The minimap's `pxPerDay` for a multi-year plan in a
 *   200 px box sits below `MIN_PX_PER_DAY`; whole-plan `paintScene` is the dearest measured
 *   case in the product; and `TsldScene` has ~30 optional fields, so every future scene
 *   layer would land in the minimap silently. This module needs six inputs.
 * - **Not `cull()` + `activityRect()`.** Measured: at a whole-plan viewport into a 200×120
 *   box, `cull()` returns **255 of 2,160** bars — the rest fall outside vertically, because
 *   `Viewport` can pan Y but never compress lane spacing
 *   (`docs/specs/tsld-minimap/input-performance.md` §5). The obvious reuse is a
 *   correctness bug; this number is recorded here so nobody "simplifies" it back.
 * - **Not the painter's culled-id set.** The culled set is what is ON screen; the
 *   minimap's subject is the whole plan.
 *
 * **The axis asymmetry is deliberate and load-bearing**
 * (`minimap-axes.structural.test.ts`): **x goes through {@link screenXOfDay}** — the one
 * day→px transform, so the minimap cannot disagree with the scene about where a day is —
 * while **y deliberately does NOT go through `screenYOfLane`**, which hardcodes
 * `LANE_HEIGHT` (28 px): the minimap's whole point on the lane axis is to compress it, so
 * `y = laneIndex × boxHeight / (maxLane + 1)`.
 *
 * **Layers omitted, each with its reason** (the scene painter draws ~15; this draws 3):
 * gridlines/month bands/non-working wash+hatch (time texture — unreadable below 1 px/day and
 * the box is about shape, not dates); **dependency edges above all** (3,200 links in a
 * 200 px box is a smear that hides the bars the reader came for); labels + date labels
 * (nothing legible at this scale); float/drift tails and lens overlays (analysis marks that
 * need a readable bar to hang off); selection ring (moves without a scene change — DOM
 * overlay, M2); Today line (moves at midnight — DOM overlay, M2); drag ghosts and the
 * cursor guideline (per-frame interaction state); the WBS band and the resource strip
 * (chrome of the scene surface, not plan shape). The **data-date vertical stays**: the data
 * date is plan data and changes only with the scene, which is exactly the bitmap's dirty rule.
 *
 * The bitmap itself is a plain detached canvas owned by the caller (the
 * `nonWorkingHatchTile` precedent — not the `OffscreenCanvas` API, which this codebase does
 * not use), and **the blit is not in here**: `Ctx2D` has no `drawImage`, so this module
 * stays pure and `Ctx2D`-typed — which is what earns it the counting-stub gate
 * (`minimap-budget.test.ts`) — and the per-frame blit happens in the host against the real
 * context.
 */

/** The minimap's pixel box (content size, CSS px). Fixed 200×120 by product decision (Q3). */
export interface MinimapBox {
  readonly width: number;
  readonly height: number;
}

/**
 * The colours the bitmap needs — read from the scene's resolved palette (AC-6.4: the
 * minimap resolves no palette of its own; the host passes fields of `paletteRef.current`).
 */
export interface MinimapPalette {
  /** The canvas ground (`--color-canvas`), opaque, painted first. */
  readonly ground: string;
  /** Non-critical bar ink — the scene's `bar`. */
  readonly bar: string;
  /** Critical bar ink — the scene's `critical`; drawn LAST so it survives the merge. */
  readonly critical: string;
  /** The data-date vertical — the scene's `dataDate`. */
  readonly dataDate: string;
}

/**
 * The world→minimap mapping. `view` is a real {@link Viewport} so every x lands via
 * {@link screenXOfDay}; `pxPerLane` is the y-axis scale (see the module docblock for why it
 * is not `LANE_HEIGHT`). `spanDays`/`laneCount` are the denominators, kept so callers (and
 * M3's inverse mapping) never re-derive them.
 */
export interface MinimapMapping {
  readonly view: Viewport;
  readonly pxPerLane: number;
  readonly spanDays: number;
  readonly laneCount: number;
  readonly box: MinimapBox;
}

/**
 * Map a world extent onto a minimap box. Pure arithmetic; the degenerate spans are floored
 * at one day / one lane so an empty-ish plan still maps rather than dividing by zero.
 */
export function minimapViewport(
  extent: { minDay: number; maxDay: number; maxLane: number },
  box: MinimapBox,
): MinimapMapping {
  const spanDays = Math.max(1, extent.maxDay - extent.minDay);
  const laneCount = extent.maxLane + 1;
  const pxPerDay = box.width / spanDays;
  return {
    view: { pxPerDay, originX: -extent.minDay * pxPerDay, originY: 0 },
    pxPerLane: box.height / laneCount,
    spanDays,
    laneCount,
    box,
  };
}

/** One decimated bar. `w`/`h` are floored at 1 px so no placed activity vanishes entirely. */
export interface MinimapRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly critical: boolean;
}

/**
 * The O(n) bar-geometry pass. Skips unplaced activities (no computed dates). This is the
 * SECOND pass by decision: {@link buildMinimapBitmap} calls `worldExtent()` first — folding
 * the extent into this loop would be a fourth inline extent derivation, which
 * `one-world-extent.structural.test.ts` exists to refuse (the ~2 ms fold saving was
 * withdrawn as a premise in the spec's agreement round; the whole cost sits on the
 * scene-change path, measured at single-digit milliseconds — M0-T4).
 */
export function minimapRects(
  activities: readonly RenderActivity[],
  dataDate: string,
  mapping: MinimapMapping,
): MinimapRect[] {
  const { view, pxPerLane } = mapping;
  const rects: MinimapRect[] = [];
  for (const a of activities) {
    if (a.earlyStart === null) continue;
    const x0 = screenXOfDay(daysBetween(dataDate, a.earlyStart), view);
    const x1 =
      a.earlyFinish === null ? x0 : screenXOfDay(daysBetween(dataDate, a.earlyFinish) + 1, view);
    rects.push({
      x: x0,
      y: a.laneIndex * pxPerLane,
      w: Math.max(1, x1 - x0),
      h: Math.max(1, pxPerLane),
      critical: a.isCritical === true,
    });
  }
  return rects;
}

/**
 * Build the invariant plan picture into `ctx` (the caller's detached canvas). Two passes by
 * decision (see {@link minimapRects}); draw order IS the decimation policy — ground, then
 * non-critical, then critical, then the data-date vertical — because later strokes
 * overwrite earlier ones, so **the critical path survives the merge** wherever a critical
 * and a non-critical bar collapse onto the same pixel. Returns the mapping so the caller
 * can place the DOM rectangle/overlays without re-deriving it, or `null` when nothing is
 * placeable (the caller shows the empty-state sentence instead of a blank picture).
 */
export function buildMinimapBitmap(
  ctx: Ctx2D,
  activities: readonly RenderActivity[],
  dataDate: string,
  box: MinimapBox,
  palette: MinimapPalette,
  dpr = 1,
): MinimapMapping | null {
  const extent = worldExtent(activities, dataDate);
  // Author in CSS px on a dpr-scaled backing store — the `paintResourceStrip` convention.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, box.width, box.height);
  if (extent === null) return null;

  const mapping = minimapViewport(extent, box);
  const rects = minimapRects(activities, dataDate, mapping);
  ctx.fillStyle = palette.bar;
  for (const r of rects) {
    if (!r.critical) ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.fillStyle = palette.critical;
  for (const r of rects) {
    if (r.critical) ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // The data-date vertical (day 0 by definition — dates are drawn about the data date).
  const dataDateX = screenXOfDay(0, mapping.view);
  if (dataDateX >= 0 && dataDateX <= box.width) {
    ctx.fillStyle = palette.dataDate;
    ctx.fillRect(dataDateX, 0, 1, box.height);
  }
  return mapping;
}
