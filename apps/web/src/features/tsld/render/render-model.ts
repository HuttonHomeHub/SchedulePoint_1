import type { ActivityType } from '@repo/types';

/**
 * The pure, renderer-agnostic TSLD render model (ADR-0026). It turns a plan's
 * computed schedule into screen geometry — **x = time** (derived from CPM dates about
 * the data date), **y = lane** (the persisted `laneIndex`) — and answers the geometry
 * questions the painter and the pointer both need (bar rects, milestone points,
 * dependency polylines, hit-testing, viewport culling). It has **no** canvas, DOM, or
 * React dependency and does **no** schedule arithmetic (ADR-0023/0024 keep CPM +
 * calendars server-side): it only positions the inclusive dates the engine already
 * computed. This is the swappable core the Canvas 2D painter (and any future WebGL
 * painter) draws from, and it is exhaustively unit-tested.
 */

/** Row height per lane, in CSS px at 1× zoom (x scales with `pxPerDay`; y is fixed). */
export const LANE_HEIGHT = 28;
/** Activity bar height (leaves vertical padding within the lane). */
export const BAR_HEIGHT = 18;
/** Half-diagonal of a milestone diamond, in CSS px. */
export const MILESTONE_RADIUS = 7;

/**
 * Discrete zoom stops → pixels per day. A continuous slider interpolates between them;
 * each stop also fixes the ruler's tick granularity (owned by the painter, M1b).
 */
export const ZOOM_STOPS = {
  day: 40,
  week: 14,
  month: 5,
  quarter: 2,
  year: 0.7,
} as const;

export type ZoomLevel = keyof typeof ZOOM_STOPS;

/** Inclusive px-per-day bounds (a day column never narrower/wider than this). */
export const MIN_PX_PER_DAY = 0.4;
export const MAX_PX_PER_DAY = 60;

/**
 * The viewport transform. `pxPerDay` is the zoom; `originX`/`originY` are the screen
 * pixel coordinates of the world origin (day 0 = the data date, lane 0). world→screen
 * is affine and shared by the painter and hit-testing so they can never disagree.
 */
export interface Viewport {
  pxPerDay: number;
  originX: number;
  originY: number;
}

/** The minimal activity shape the render model needs (a subset of `ActivitySummary`). */
export interface RenderActivity {
  id: string;
  type: ActivityType;
  laneIndex: number;
  /** Inclusive computed dates (`YYYY-MM-DD`), or null until the plan is recalculated. */
  earlyStart: string | null;
  earlyFinish: string | null;
  isCritical: boolean;
  isNearCritical: boolean;
}

/** A directed dependency edge (predecessor → successor) by activity id. */
export interface RenderEdge {
  predecessorId: string;
  successorId: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Size of the drawing surface, in CSS px. */
export interface Size {
  width: number;
  height: number;
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `fromIso` to `toIso` (`YYYY-MM-DD`), signed. UTC-exact. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

/** The calendar date `n` days after `iso` (`YYYY-MM-DD`), UTC-exact — inverse of {@link daysBetween}. */
export function addCalendarDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** True for the two milestone activity types (drawn as a diamond, not a bar). */
export function isMilestone(type: ActivityType): boolean {
  return type === 'START_MILESTONE' || type === 'FINISH_MILESTONE';
}

/** Screen x of a day offset from the data date. */
export function screenXOfDay(dayOffset: number, view: Viewport): number {
  return view.originX + dayOffset * view.pxPerDay;
}

/** Screen y of a lane index. */
export function screenYOfLane(laneIndex: number, view: Viewport): number {
  return view.originY + laneIndex * LANE_HEIGHT;
}

/** The (fractional) day offset at a screen x — the inverse of {@link screenXOfDay}. */
export function dayAtScreenX(x: number, view: Viewport): number {
  return (x - view.originX) / view.pxPerDay;
}

/** The (fractional) lane index at a screen y. */
export function laneAtScreenY(y: number, view: Viewport): number {
  return (y - view.originY) / LANE_HEIGHT;
}

/**
 * The screen-space rectangle for an activity, or null if it has no computed dates yet
 * (nothing to place). A task spans `[earlyStart, earlyFinish + 1 day)` — the inclusive
 * finish plus one day so a 1-day task is one column wide (ADR-0023). A milestone is a
 * zero-duration diamond centred on its day: the rect is the diamond's bounding box.
 */
export function activityRect(
  activity: RenderActivity,
  view: Viewport,
  dataDateIso: string,
): Rect | null {
  if (activity.earlyStart === null) return null;
  const startDay = daysBetween(dataDateIso, activity.earlyStart);
  const top = screenYOfLane(activity.laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;

  if (isMilestone(activity.type)) {
    const cx = screenXOfDay(startDay, view);
    return {
      x: cx - MILESTONE_RADIUS,
      y: screenYOfLane(activity.laneIndex, view) + LANE_HEIGHT / 2 - MILESTONE_RADIUS,
      w: MILESTONE_RADIUS * 2,
      h: MILESTONE_RADIUS * 2,
    };
  }

  const finishDay =
    activity.earlyFinish === null ? startDay : daysBetween(dataDateIso, activity.earlyFinish);
  const x1 = screenXOfDay(startDay, view);
  const x2 = screenXOfDay(finishDay + 1, view); // inclusive finish → +1 day right edge
  return { x: x1, y: top, w: Math.max(2, x2 - x1), h: BAR_HEIGHT };
}

/** Whether two screen-space rectangles overlap (used for viewport culling). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * The ids of the activities whose geometry intersects the viewport (+ margin), so the
 * painter draws O(visible), not O(total). Activities without computed dates are omitted.
 */
export function cull(
  activities: readonly RenderActivity[],
  view: Viewport,
  size: Size,
  dataDateIso: string,
  marginPx = LANE_HEIGHT,
): string[] {
  const viewport: Rect = {
    x: -marginPx,
    y: -marginPx,
    w: size.width + marginPx * 2,
    h: size.height + marginPx * 2,
  };
  const visible: string[] = [];
  for (const activity of activities) {
    const rect = activityRect(activity, view, dataDateIso);
    if (rect && rectsIntersect(rect, viewport)) visible.push(activity.id);
  }
  return visible;
}

/**
 * The orthogonal (L-shaped) polyline routing a dependency from a predecessor's right
 * edge (finish) to a successor's left edge (start), each at the bar's vertical centre.
 * Returns null if either endpoint has no geometry. The elbow steps a small fixed gap
 * out of the predecessor before turning, so parallel edges don't overlap their bars.
 */
export function dependencyPolyline(
  predecessor: RenderActivity,
  successor: RenderActivity,
  view: Viewport,
  dataDateIso: string,
): Point[] | null {
  const from = activityRect(predecessor, view, dataDateIso);
  const to = activityRect(successor, view, dataDateIso);
  if (!from || !to) return null;
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const elbow = x1 + Math.min(12, Math.max(4, view.pxPerDay));
  if (y1 === y2)
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  return [
    { x: x1, y: y1 },
    { x: elbow, y: y1 },
    { x: elbow, y: y2 },
    { x: x2, y: y2 },
  ];
}

/**
 * The id of the topmost activity under a screen point, or null. Iterates in reverse so
 * later-drawn (visually on top) activities win. Milestones use their bounding box.
 */
export function hitTest(
  activities: readonly RenderActivity[],
  point: Point,
  view: Viewport,
  dataDateIso: string,
): string | null {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i]!;
    const rect = activityRect(activity, view, dataDateIso);
    if (
      rect &&
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h
    ) {
      return activity.id;
    }
  }
  return null;
}

/** Width of the grab-zone at each end of a bar, for dependency-draw (ADR-0026 D5). */
export const EDGE_HANDLE_PX = 8;

/** Where a screen point falls relative to the activities, for gesture routing. */
export type HitZoneKind = 'empty' | 'body' | 'startHandle' | 'finishHandle';

export interface HitZone {
  kind: HitZoneKind;
  /** The activity id for a non-empty zone. */
  id?: string;
}

/**
 * Classify a screen point for gesture routing (ADR-0026 D5): the topmost activity (if
 * any) under it, and whether the point is on the bar **body** (→ reposition) or an end
 * **grab-zone** (→ dependency-draw). Iterates topmost-first like {@link hitTest}; the end
 * zones take precedence over the body and are capped at half the bar so they never
 * overlap. `empty` (no activity under the point) routes to pan or create.
 */
export function classifyHit(
  activities: readonly RenderActivity[],
  point: Point,
  view: Viewport,
  dataDateIso: string,
): HitZone {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i]!;
    const rect = activityRect(activity, view, dataDateIso);
    if (!rect) continue;
    if (
      point.x < rect.x ||
      point.x > rect.x + rect.w ||
      point.y < rect.y ||
      point.y > rect.y + rect.h
    ) {
      continue;
    }
    const handleW = Math.min(EDGE_HANDLE_PX, rect.w / 2);
    if (point.x <= rect.x + handleW) return { kind: 'startHandle', id: activity.id };
    if (point.x >= rect.x + rect.w - handleW) return { kind: 'finishHandle', id: activity.id };
    return { kind: 'body', id: activity.id };
  }
  return { kind: 'empty' };
}

/**
 * The screen point at a bar's start (left) or finish (right) edge, vertically centred — the
 * anchor a dependency rubber-band springs from (ADR-0026 D5). Pure over the same rect geometry
 * hit-testing uses, so the drawn line begins exactly where {@link classifyHit} reports the handle.
 */
export function edgeAnchor(rect: Rect, handle: 'startHandle' | 'finishHandle'): Point {
  return {
    x: handle === 'startHandle' ? rect.x : rect.x + rect.w,
    y: rect.y + rect.h / 2,
  };
}

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

/** Clamp a px-per-day value to the allowed zoom range. */
export function clampPxPerDay(pxPerDay: number): number {
  return Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, pxPerDay));
}

/**
 * Zoom by `factor` about a screen x anchor (cursor-anchored zoom, ADR-0026): the world
 * day under `anchorX` stays under `anchorX` after the zoom. Returns a new viewport.
 */
export function zoomAt(view: Viewport, anchorX: number, factor: number): Viewport {
  const dayUnderAnchor = dayAtScreenX(anchorX, view);
  const pxPerDay = clampPxPerDay(view.pxPerDay * factor);
  return { ...view, pxPerDay, originX: anchorX - dayUnderAnchor * pxPerDay };
}

/** Pan the viewport by a screen delta. Returns a new viewport. */
export function pan(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, originX: view.originX + dx, originY: view.originY + dy };
}

/** The default viewport before any content is framed (day zoom, small margin). */
export const DEFAULT_VIEWPORT: Viewport = { pxPerDay: ZOOM_STOPS.week, originX: 40, originY: 40 };

/**
 * A viewport that frames every computed activity within `size`, with padding. Chooses a
 * `pxPerDay` so the full day span fits horizontally (clamped to the zoom range) and pans
 * so the earliest day / topmost lane sit just inside the top-left padding. Falls back to
 * {@link DEFAULT_VIEWPORT} when nothing is computed yet.
 */
export function fitToContent(
  activities: readonly RenderActivity[],
  size: Size,
  dataDateIso: string,
  paddingPx = 32,
): Viewport {
  let minDay = Infinity;
  let maxDay = -Infinity;
  let maxLane = 0;
  for (const a of activities) {
    if (a.earlyStart === null) continue;
    const start = daysBetween(dataDateIso, a.earlyStart);
    const finish = a.earlyFinish === null ? start : daysBetween(dataDateIso, a.earlyFinish);
    minDay = Math.min(minDay, start);
    maxDay = Math.max(maxDay, finish + 1);
    maxLane = Math.max(maxLane, a.laneIndex);
  }
  if (!Number.isFinite(minDay)) return DEFAULT_VIEWPORT;

  const usableW = Math.max(1, size.width - paddingPx * 2);
  const spanDays = Math.max(1, maxDay - minDay);
  const pxPerDay = clampPxPerDay(usableW / spanDays);
  return {
    pxPerDay,
    originX: paddingPx - minDay * pxPerDay,
    originY: paddingPx,
  };
}
