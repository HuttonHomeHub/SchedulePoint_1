import type { Ctx2D } from './ctx-2d';
import {
  screenXOfDay,
  worldExtent,
  type RenderActivity,
  type Size,
  type Viewport,
} from './geometry';
import { calendarBoundaries } from './time-scale';
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
  /** The canvas ground (`--canvas`), opaque, painted first. */
  readonly ground: string;
  /** Non-critical bar ink — the scene's `bar`. */
  readonly bar: string;
  /** Critical bar ink — the scene's `critical`; drawn LAST so it survives the merge. */
  readonly critical: string;
  /**
   * Near-critical bar ink — the scene's `nearCritical` (minimap-visual M2).
   *
   * **It was missing, and that is a different defect from the collisions M2 exists to fix.** The
   * scene paints three bar states and the minimap painted two: `isNearCritical` fell through to
   * `bar`, so an activity a planner is being warned about looked exactly like one they are not.
   * Not two marks sharing a token — a scene state with no mark at all (M0 §2.3, measured from a
   * screenshot: the scene's amber `rgb(159,86,0)` against the minimap's `rgb(86,146,205)`).
   *
   * It costs nothing to gate: `token-contrast.test.ts`'s `CRITICALITY_PAIRS` already asserts all
   * three canvas-scope pairs, so the separation this relies on was measured before it had a
   * consumer here.
   */
  readonly nearCritical: string;
  /**
   * The scene's foreground `outline` — the critical FRINGE.
   *
   * **It is a SECOND lightness cue, not "the 1.4.1 answer", and the difference matters.** This
   * docblock previously said the latter, and the M5 accessibility review read it exactly as
   * written: that criticality depends on the fringe, that the fringe fires on neither measured
   * plan, and that the minimap is therefore hue-only. The first premise is the one that is
   * wrong, and it was wrong here rather than in the reviewer.
   *
   * The three bar inks are already separated on **lightness** — measured relative luminance
   * 0.2152 (`--primary`) / 0.1234 (`--warning`) / 0.0626 (`--destructive`), a monotone ladder
   * whose steps are roughly a halving, and which `CRITICALITY_PAIRS` gates at ≥ 1.5:1. That is
   * ADR-0102's own work: it separated these on lightness precisely because they had differed
   * "in hue and almost nothing else" at 1.23:1. A luminance ratio IS a lightness measure, so a
   * hue-only ladder would read ~1.00:1 and this one reads 2.36 / 1.54 / 1.53.
   *
   * What the fringe adds on top is a second cue wherever a lane row can carry it (see
   * {@link CRITICAL_FRINGE_MIN_H}) — belt-and-braces on tall rows, absent on the plans this
   * epic measured (`pxPerLane` 2.93 at 540 activities, 0.674 at 2,160), and not the thing
   * criticality rests on either way.
   */
  readonly outline: string;
  /** The data-date vertical — the scene's `dataDate`. */
  readonly dataDate: string;
  /**
   * The minor temporal tier — the scene's `gridLineMonth` (minimap-visual M3).
   *
   * Drawn for whichever of month/quarter clears {@link MINIMAP_TIER_MIN_PX}; a quarter boundary
   * IS a month boundary, so both use the month ink rather than inventing a third value nothing
   * else in the product has a meaning for.
   */
  readonly gridMinor: string;
  /** The year tier — the scene's `gridLineYear`. Drawn last of the tiers, so a coarser boundary
   *  wins at a coincident x (ADR-0056's rule for the scene's own tiers). */
  readonly gridYear: string;
}

/**
 * Below this row height (px) the critical fringe is dropped: a 1px fringe on a 1–2px bar
 * IS the bar. Above it, a critical bar is drawn as a foreground-luminance rect with the
 * `critical` fill inset 1px vertically — a lightness edge that survives every colour-vision
 * type, which is what the M4 accessibility gate asked for (the scene's own dash cue cannot
 * shrink this far). The sub-threshold degradation to hue-plus-the-scene's-own-cues is
 * REPORTED in `token-contrast.test.ts`, the DAY-tier precedent.
 */
export const CRITICAL_FRINGE_MIN_H = 3;

/**
 * The pitch below which a temporal tier is refused. **Set from rendered images, not by eye and
 * not inherited** — `docs/specs/tsld-minimap-visual/m0-measurement.md` §7 records six candidate
 * pitches drawn into the real 200×120 box with the real ground, grid and bar inks, twice each.
 * At 1.5 px the rules are a solid wash, at 3 px a hatch, at 4.5 px the ground is visibly striped;
 * 6 px is the lowest pitch at which they read as individual structure rather than as a texture.
 *
 * The scene's own day-tier floor (`DAY_GRID_MIN_PX`, `render/paint.ts`) is **also 6**, and that is
 * corroboration rather than the derivation: its docblock gives a reason and cites no measurement,
 * so deriving from it would inherit an unmeasured constant. The agreement supports the rule this
 * ladder rests on — **a pitch ladder, not a tier name**: a 1 px vertical rule is legible or not at
 * a given pitch whatever tier it belongs to.
 *
 * Its one recorded blind spot: the choice between 6 and 8 is unobservable on both measured plans,
 * since neither admits the month tier either way. See §7.2.
 */
export const MINIMAP_TIER_MIN_PX = 6;

/** Mean days per tier step — calendar-average, since the ladder is a legibility question about
 *  typical pitch and not an exact boundary count. */
const TIER_DAYS = { month: 30.44, quarter: 91.31, year: 365.25 } as const;

/**
 * Which temporal tiers this span can carry, at this box width.
 *
 * **At most two**: one minor tier plus the year. Month and quarter are never both drawn — a
 * quarter boundary is a subset of the month boundaries, so drawing both paints the same rules
 * twice in the same ink and buys nothing. The minor tier is therefore the FINEST of the two that
 * clears the floor, which is the ladder §7.2 measures: on a 1,059-day plan quarter (17.2 px) and
 * year (69.0 px); on a 4,385-day plan year (16.7 px) alone.
 */
export function minimapTiers(
  spanDays: number,
  boxWidth: number,
): { minor: 'month' | 'quarter' | null; year: boolean } {
  const pxPerDay = boxWidth / Math.max(1, spanDays);
  const fits = (tier: keyof typeof TIER_DAYS): boolean =>
    pxPerDay * TIER_DAYS[tier] >= MINIMAP_TIER_MIN_PX;
  return {
    minor: fits('month') ? 'month' : fits('quarter') ? 'quarter' : null,
    year: fits('year'),
  };
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

/**
 * The visible window a navigation commit produced — what the host's `centerOnWorld`/`panPages`
 * return and the panel's announcement reads out (M4 component review: pure data with no React
 * dependency belongs beside `MinimapMapping`, not inside the panel component that consumes it).
 */
export interface MinimapWindow {
  startIso: string;
  endIso: string;
  laneFrom: number;
  laneTo: number;
}

/**
 * The scene viewport expressed in minimap coordinates (M4 architecture gate, B1/S4): the
 * TRUE rectangle (exact, unclamped), the DISPLAY rectangle (clamped to the box, floored at
 * 8 px per axis so a border-only frame stays legible), and the true viewport CENTRE as a
 * world point. Extracted from the host's rAF closure because twenty lines of pure
 * arithmetic sealed inside a frame loop are reachable by no unit test — and because the
 * drag anchor MUST come from the true rect: reading it back off the inflated display
 * rectangle put every drag's first commit ~`(display−true)/2` px of world off target, and
 * made Escape restore the inflated centre rather than the press viewport.
 *
 * `sceneLaneHeight` is a parameter, never `LANE_HEIGHT` imported here — the axis pin
 * (`minimap-axes.structural.test.ts`) bans that name from this module so the LANE
 * compression cannot be "simplified" back to the scene's fixed rows; the scene→box
 * conversion legitimately needs the scene's row height, so the host passes it in.
 */
export function sceneWindowRect(
  view: Viewport,
  size: Size,
  sceneLaneHeight: number,
  mapping: MinimapMapping,
): {
  true: { x: number; y: number; w: number; h: number };
  display: { x: number; y: number; w: number; h: number };
  centre: { day: number; lane: number };
} {
  const leftDay = -view.originX / view.pxPerDay;
  const topLane = -view.originY / sceneLaneHeight;
  const visibleDays = size.width / view.pxPerDay;
  const visibleLanes = size.height / sceneLaneHeight;
  const x = screenXOfDay(leftDay, mapping.view);
  const y = topLane * mapping.pxPerLane;
  const w = visibleDays * mapping.view.pxPerDay;
  const h = visibleLanes * mapping.pxPerLane;
  const cw = Math.min(mapping.box.width, Math.max(8, w));
  const ch = Math.min(mapping.box.height, Math.max(8, h));
  return {
    true: { x, y, w, h },
    display: {
      x: Math.min(mapping.box.width - cw, Math.max(0, x)),
      y: Math.min(mapping.box.height - ch, Math.max(0, y)),
      w: cw,
      h: ch,
    },
    centre: { day: leftDay + visibleDays / 2, lane: topLane + visibleLanes / 2 - 0.5 },
  };
}

/** One decimated bar. `w`/`h` are floored at 1 px so no placed activity vanishes entirely. */
export interface MinimapRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly critical: boolean;
  /** Near-critical (minimap-visual M2). Its own field rather than a three-valued `criticality`
   *  so the existing `critical` consumers are untouched — the parity the epic relies on. */
  readonly nearCritical: boolean;
}

/**
 * The O(n) bar-geometry pass. Skips unplaced activities (no computed dates). This is the
 * SECOND pass by decision: {@link buildMinimapBitmap} calls `worldExtent()` first — folding
 * the extent into this loop would be a fourth inline extent derivation, which
 * `one-world-extent.structural.test.ts` exists to refuse (the ~2 ms fold saving was
 * withdrawn as a premise in the spec's agreement round; the whole cost sits on the
 * scene-change path, measured at single-digit milliseconds — M0-T4). The panel's own
 * `worldExtent` memo means a data change pays the fold twice (~1.9 ms measured at 2,160
 * activities in the M4 perf gate) — once per consumer, by the one-derivation design, on an
 * event that already costs a recalculation and a scene repaint.
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
      nearCritical: a.isNearCritical === true,
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

  // ── Temporal tiers, BENEATH the bars (minimap-visual M3, ADR-0100 D5 as amended).
  //
  // Beneath is the whole affordability argument: their only ground is `--canvas`, and
  // `--canvas-grid-month`/`--canvas-grid-year` are already asserted ≥ 3:1 against it, so this
  // adds **no new contrast pair**. Drawn over the bars they would need gating against both bar
  // inks as well, and would be reading as noise over the very thing the picture is for.
  //
  // The boundaries come from `calendarBoundaries`, the same walk the scene's ruler uses — a
  // second date walk is how two views drift about where a Monday is (ADR-0059). Minor first, year
  // last, so a coarser boundary wins at a coincident x (ADR-0056's rule for the scene's tiers).
  //
  // Cost is bounded by the floor rather than by the plan: a tier is refused below
  // `MINIMAP_TIER_MIN_PX`, so at most `box.width / 6` ≈ 33 rules per tier and at most two tiers.
  // Still fillRect-only, still one `fillStyle` write per drawn tier, and a span that admits
  // neither tier writes nothing at all.
  const tiers = minimapTiers(mapping.spanDays, box.width);
  if (tiers.minor !== null || tiers.year) {
    const bounds = calendarBoundaries(extent.minDay, extent.maxDay, dataDate);
    const stroke = (days: readonly number[], ink: string): void => {
      ctx.fillStyle = ink;
      for (const day of days) {
        const x = Math.round(screenXOfDay(day, mapping.view));
        if (x >= 0 && x <= box.width) ctx.fillRect(x, 0, 1, box.height);
      }
    };
    if (tiers.minor !== null) {
      stroke(tiers.minor === 'month' ? bounds.months : bounds.quarters, palette.gridMinor);
    }
    if (tiers.year) stroke(bounds.years, palette.gridYear);
  }

  const rects = minimapRects(activities, dataDate, mapping);
  ctx.fillStyle = palette.bar;
  for (const r of rects) {
    if (!r.critical && !r.nearCritical) ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  const anyNearCritical = rects.some((r) => r.nearCritical && !r.critical);
  if (anyNearCritical) {
    ctx.fillStyle = palette.nearCritical;
    for (const r of rects) {
      if (r.nearCritical && !r.critical) ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }
  // Near-critical, between ordinary and critical — draw order IS the decimation policy (ADR-0100
  // D5), so the ladder is painted in ascending urgency and the most urgent survives the 1px merge.
  //
  // **Guarded, so a plan with none pays nothing.** Without the guard every existing budget
  // assertion would move from 4 style writes to 5 for a pass that draws zero rects, which is a
  // gate loosened to accommodate a feature rather than a cost the feature actually has. The
  // `fringed` guard immediately below is the same shape and the precedent.
  // The critical fringe (WCAG 1.4.1): where the row can carry it, a critical bar is a
  // foreground-luminance rect with the critical fill inset — lightness, not hue alone.
  // Still fillRect-only and still batched (one fillStyle write per pass), so the budget
  // gate's shape holds.
  const fringed = rects.some((r) => r.critical && r.h >= CRITICAL_FRINGE_MIN_H);
  if (fringed) {
    ctx.fillStyle = palette.outline;
    for (const r of rects) {
      if (r.critical && r.h >= CRITICAL_FRINGE_MIN_H) ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }
  ctx.fillStyle = palette.critical;
  for (const r of rects) {
    if (r.critical) {
      if (r.h >= CRITICAL_FRINGE_MIN_H) ctx.fillRect(r.x, r.y + 1, r.w, r.h - 2);
      else ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }

  // The data-date vertical (day 0 by definition — dates are drawn about the data date).
  const dataDateX = screenXOfDay(0, mapping.view);
  if (dataDateX >= 0 && dataDateX <= box.width) {
    ctx.fillStyle = palette.dataDate;
    ctx.fillRect(dataDateX, 0, 1, box.height);
  }
  return mapping;
}
