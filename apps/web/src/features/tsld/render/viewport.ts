import {
  BAR_HEIGHT,
  dayAtScreenX,
  LANE_HEIGHT,
  laneAtScreenY,
  MIN_PX_PER_DAY,
  screenXOfDay,
  screenYOfLane,
  worldExtent,
  ZOOM_STOPS,
  type Rect,
  type RenderActivity,
  type Size,
  type Viewport,
} from './geometry';
import { addCalendarDays, daysBetween } from './working-time';

/**
 * **The viewport** (ADR-0078 S8) — pan, zoom, framing, and the day/lane cell a point falls in.
 *
 * Every command that moves the camera rather than the model: `pan`, `zoomAt` (which holds a screen
 * point fixed while the scale changes), `panToDate`, the fit/frame helpers and `DEFAULT_VIEWPORT`.
 *
 * Imports the geometry core; **never the barrel** (`docs/TECH_DEBT.md` #106). Note the direction —
 * geometry defines what a `Viewport` *is* and how a day maps to an x; this module decides what the
 * viewport should *become*. Keeping those apart is why a zoom preset can be reasoned about without
 * reading the painter.
 */
/**
 * The bar rect for a whole-day span `[leftDay, rightDay]` (inclusive, about the data
 * date) at a lane — the geometry of a create/reposition **ghost**, matching
 * {@link activityRect}'s convention (right edge at `rightDay + 1`).
 */
export function dayCellRect(
  leftDay: number,
  rightDay: number,
  laneIndex: number,
  view: Viewport,
): Rect {
  const x1 = screenXOfDay(leftDay, view);
  const x2 = screenXOfDay(rightDay + 1, view);
  const top = screenYOfLane(laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;
  return { x: x1, y: top, w: Math.max(2, x2 - x1), h: BAR_HEIGHT };
}

/** The whole day column at a screen x (floor of the fractional day offset). */
export function dayColumnAt(x: number, view: Viewport): number {
  return Math.floor(dayAtScreenX(x, view));
}

/** The lane index (≥ 0) containing a screen y. */
export function laneRowAt(y: number, view: Viewport): number {
  return Math.max(0, Math.floor(laneAtScreenY(y, view)));
}

/**
 * Clamp a px-per-day value to the allowed zoom range. `maxPxPerDay` is a **required** parameter
 * (not read off the `MAX_PX_PER_DAY` module constant directly) so a flag-off caller can pass
 * {@link LEGACY_MAX_PX_PER_DAY} instead — the compiler, not a reviewer, catches a call site that
 * forgets to resolve the flag-aware ceiling.
 */
export function clampPxPerDay(pxPerDay: number, maxPxPerDay: number): number {
  return Math.max(MIN_PX_PER_DAY, Math.min(maxPxPerDay, pxPerDay));
}

/**
 * Zoom by `factor` about a screen x anchor (cursor-anchored zoom, ADR-0026): the world
 * day under `anchorX` stays under `anchorX` after the zoom. Returns a new viewport.
 */
export function zoomAt(
  view: Viewport,
  anchorX: number,
  factor: number,
  maxPxPerDay: number,
): Viewport {
  const dayUnderAnchor = dayAtScreenX(anchorX, view);
  const pxPerDay = clampPxPerDay(view.pxPerDay * factor, maxPxPerDay);
  return { ...view, pxPerDay, originX: anchorX - dayUnderAnchor * pxPerDay };
}

/** Pan the viewport by a screen delta. Returns a new viewport. */
export function pan(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, originX: view.originX + dx, originY: view.originY + dy };
}

/**
 * Centre the viewport on a world point — day on the time axis, lane row on the vertical
 * (ADR-0100 M3, the minimap's one navigation primitive). Either axis takes `null` to leave
 * that origin untouched (Home/End move only the time axis). Scale is unchanged: this is the
 * `centerOnDate` contract generalised to two axes and day-numbers — deliberately NOT a
 * refactor of `centerOnDate` itself, which takes ISO, centres horizontally only, and has
 * three callers with their own suite.
 */
export function centerOnWorld(
  view: Viewport,
  size: Size,
  day: number | null,
  lane: number | null,
): Viewport {
  return {
    ...view,
    originX: day === null ? view.originX : size.width / 2 - day * view.pxPerDay,
    originY: lane === null ? view.originY : size.height / 2 - (lane + 0.5) * LANE_HEIGHT,
  };
}

/**
 * Pan (no zoom) so the calendar day `iso` lands `inset` px from the left edge — the pure math behind
 * the "Go to date" view command (ADR-0033). The scale (`pxPerDay`) and vertical pan are unchanged, so
 * `screenXOfDay(daysBetween(dataDateIso, iso), result) === inset`. A pure view transform: it moves
 * nothing in the schedule and issues no request.
 */
export function panToDate(
  view: Viewport,
  dataDateIso: string,
  iso: string,
  inset: number,
): Viewport {
  const day = daysBetween(dataDateIso, iso);
  return { ...view, originX: inset - day * view.pxPerDay };
}

/** The default viewport before any content is framed (day zoom, small margin). */
export const DEFAULT_VIEWPORT: Viewport = { pxPerDay: ZOOM_STOPS.week, originX: 40, originY: 40 };

/**
 * A viewport that frames every computed activity within `size`, with padding. Chooses a
 * `pxPerDay` so the full day span fits horizontally (clamped to `[MIN_PX_PER_DAY, maxPxPerDay]`)
 * and pans so the earliest day / topmost lane sit just inside the top-left padding. Falls back to
 * {@link DEFAULT_VIEWPORT} when nothing is computed yet. `maxPxPerDay` is required, not defaulted,
 * so the caller must resolve the flag-aware ceiling (`MAX_PX_PER_DAY` vs {@link LEGACY_MAX_PX_PER_DAY}).
 */
/**
 * The minimum span {@link withMinimumSpan} frames, in days.
 *
 * Two weeks, and the number is doing two jobs. A **milestone has zero span**, so framing it exactly
 * would divide by nothing and produce an undefined scale. And a task framed to its own edges is
 * legible as a shape but not as a *position*: a planner who jumped to it wants to see what is beside
 * it. Fourteen days is one working fortnight either side of a short task at the finest useful zoom.
 */
export const MIN_CONTEXT_DAYS = 14;

/**
 * One activity, widened to at least `minDays` and re-centred on its own midpoint, as the single-item
 * array {@link fitToContent} frames.
 *
 * Pure and separate from the canvas so the arithmetic is unit-testable without a 2D context. It
 * returns a **synthetic** activity rather than mutating: the widened span is a framing decision, and
 * nothing downstream should be able to mistake it for the activity's real dates.
 */
/**
 * The pan (along one axis) that brings a `[start, start+span)` interval fully into a `[0, extent)`
 * viewport with a `margin` off each edge — `0` when it is already in. An interval larger than the
 * usable window aligns its START (reading a too-big thing from its beginning beats fitting its
 * end); otherwise the pan is the minimum distance, so an already-visible target does not jump.
 *
 * **Extracted from the selection-reveal effect for `docs/TECH_DEBT.md` #152**, so `zoomToActivity`
 * can repair the lane axis with the SAME arithmetic rather than a second opinion — the ADR-0065
 * `routeOrthogonal` rule: two implementations of "make this visible" would drift, and the drift
 * would be visible only to someone using both on the same plan.
 */
export function revealOffset(start: number, span: number, extent: number, margin: number): number {
  if (start < margin) return margin - start;
  if (start + span > extent - margin) {
    return span > extent - 2 * margin ? margin - start : extent - margin - (start + span);
  }
  return 0;
}

export function withMinimumSpan(
  activity: RenderActivity,
  dataDateIso: string,
  minDays: number,
): RenderActivity[] {
  if (activity.earlyStart === null) return [];
  const start = daysBetween(dataDateIso, activity.earlyStart);
  const finish =
    activity.earlyFinish === null ? start : daysBetween(dataDateIso, activity.earlyFinish);
  const span = finish - start;
  if (span >= minDays) return [activity];
  // Grow symmetrically about the midpoint, so a short task stays where the planner is looking rather
  // than sliding to one edge of the new frame.
  const pad = (minDays - span) / 2;
  return [
    {
      ...activity,
      earlyStart: addCalendarDays(dataDateIso, Math.floor(start - pad)),
      earlyFinish: addCalendarDays(dataDateIso, Math.ceil(finish + pad)),
    },
  ];
}

export function fitToContent(
  activities: readonly RenderActivity[],
  size: Size,
  dataDateIso: string,
  maxPxPerDay: number,
  paddingPx = 32,
): Viewport {
  // `extent.maxLane` is deliberately ignored, exactly as this function has always ignored the
  // lane axis: originY is pinned to the padding. That is right for whole-plan Fit from lane 0 and
  // wrong for zoom-to-one-activity in a high lane — a PRE-EXISTING defect proven live and filed as
  // `docs/TECH_DEBT.md` #152, not repaired inside this refactor (a behavioural change hiding in a
  // "no behaviour change" diff is how it would never be reviewed as one).
  const extent = worldExtent(activities, dataDateIso);
  if (extent === null) return DEFAULT_VIEWPORT;
  const { minDay, maxDay } = extent;

  const usableW = Math.max(1, size.width - paddingPx * 2);
  const spanDays = Math.max(1, maxDay - minDay);
  const pxPerDay = clampPxPerDay(usableW / spanDays, maxPxPerDay);
  return {
    pxPerDay,
    originX: paddingPx - minDay * pxPerDay,
    originY: paddingPx,
  };
}
