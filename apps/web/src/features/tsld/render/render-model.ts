import type { ActivityType } from '@repo/types';

import {
  activityRect,
  BAR_HEIGHT,
  dayAtScreenX,
  isMilestone,
  LABEL_MIN_PX_PER_DAY,
  LANE_HEIGHT,
  laneAtScreenY,
  MIN_PX_PER_DAY,
  screenXOfDay,
  screenYOfLane,
  ZOOM_STOPS,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from './geometry';
import { lagAnchorPoints } from './link-routing';
import { addCalendarDays, daysBetween, ELAPSED_DAY_WALK, type DayWalk } from './working-time';

/**
 * The pure, renderer-agnostic TSLD render model (ADR-0026) — **the barrel**, plus the bar/label
 * model that has not yet been extracted.
 *
 * Every consumer in the repository imports from here, and none of them changed when the geometry
 * core (#106) and link routing (ADR-0078 S8) moved out — that is the barrel-preserving rule, and it
 * is what makes an extraction reviewable: the diff is a move, and the whole-scene golden log
 * (`paint.golden.test.ts`) is the oracle that says so.
 *
 * Remaining here and named as such rather than left to be discovered: the bar visual refresh
 * constants, the label model, and the viewport/hit-test helpers ADR-0078 S8 still has to move.
 */

export * from './geometry';
export * from './link-routing';
export * from './working-time';

// ── Bar visual refresh (ADR-0052 M4, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ────────────

/** Corner radius (px) of a refreshed task bar — subtle at BAR_HEIGHT 18, so the bar reads
 * "softened", not "pill". The selection/hover rings add 2 so their curve tracks the bar's. */
export const BAR_RADIUS = 3;

/** Outline width (px) of the refreshed critical/near-critical emphasis stroke — heavier than the
 * legacy 1.5 so the critical path pops against the calmer hairline-stroked normal bars. The
 * solid-vs-dashed dash cue is unchanged (WCAG 1.4.1 — never colour/weight alone). */
export const EMPHASIS_STROKE_W = 2;

/** Height (px) of the in-bar progress band (the completed portion), inset along the bar bottom. */
export const PROGRESS_BAND_H = 4;
/** Inset (px) of the progress band from the bar's left/right/bottom edges (shape-bounded). */
export const PROGRESS_INSET_PX = 2;
/** Bars narrower than this (px) draw no progress detail — it would be a sub-pixel smear. */
export const PROGRESS_MIN_BAR_PX = 12;
/** Below this px-per-day the progress band is culled, mirroring the label LOD gate. */
export const PROGRESS_MIN_PX_PER_DAY = LABEL_MIN_PX_PER_DAY;

/** The in-bar progress geometry: the completed band plus the divider x at the progress front. */
export interface ProgressGeometry {
  /** The completed portion — a band inset along the bar's bottom edge, length ∝ % complete. */
  band: Rect;
  /** The x of the hairline divider at the progress front (the boundary/shape cue — never
   * colour-only, WCAG 1.4.1), or null at 100% where the front coincides with the bar end. */
  frontX: number | null;
}

/**
 * The shape-bounded in-bar progress fill for a bar rect (ADR-0052 M4): a band inset along the
 * bar's bottom edge whose length is proportional to `percentComplete`, plus a band-height hairline
 * divider at the progress front so the completed/remaining boundary reads as a shape, not colour
 * alone (WCAG 1.4.1). The band — and the divider, clamped to the band's vertical extent — sits
 * below the label's centred text line, so the label ink never loses contrast over it and the
 * divider never slices through the label row. Null when there is nothing to draw: no progress (≤ 0 / not finite) or a
 * bar too narrow to hold legible detail ({@link PROGRESS_MIN_BAR_PX}). Percent clamps to 100.
 */
export function progressGeometry(rect: Rect, percentComplete: number): ProgressGeometry | null {
  if (!Number.isFinite(percentComplete) || percentComplete <= 0) return null;
  if (rect.w < PROGRESS_MIN_BAR_PX) return null;
  const fraction = Math.min(100, percentComplete) / 100;
  const innerW = rect.w - PROGRESS_INSET_PX * 2;
  const band: Rect = {
    x: rect.x + PROGRESS_INSET_PX,
    y: rect.y + rect.h - PROGRESS_INSET_PX - PROGRESS_BAND_H,
    w: innerW * fraction,
    h: PROGRESS_BAND_H,
  };
  return { band, frontX: fraction < 1 ? band.x + band.w : null };
}

/** Width (px) of an LOE/hammock bracket end-cap; the caps overhang the bar top+bottom. */
export const GLYPH_CAP_W = 2;
/** How far (px) an LOE/hammock bracket end-cap overhangs the bar's top and bottom edges. */
export const GLYPH_CAP_OVERHANG = 3;

/**
 * The two vertical end-cap rects of the refreshed LOE / hammock **bracketed-span** glyph
 * (ADR-0052 M4): `[` and `]` caps at the span's ends, overhanging the bar top and bottom, so a
 * derived-span activity reads as a bracket, not a task bar — a shape cue, consistent across
 * themes (the painter draws them in the bar's own resolved fill, so lenses compose). Pure vertex
 * math over the bar rect.
 */
export function loeBracketRects(rect: Rect): [Rect, Rect] {
  const y = rect.y - GLYPH_CAP_OVERHANG;
  const h = rect.h + GLYPH_CAP_OVERHANG * 2;
  return [
    { x: rect.x, y, w: GLYPH_CAP_W, h },
    { x: rect.x + rect.w - GLYPH_CAP_W, y, w: GLYPH_CAP_W, h },
  ];
}

/** Width / height (px) of a WBS-summary bracket's downward end tab. */
export const SUMMARY_TAB_W = 3;
export const SUMMARY_TAB_H = 4;

/**
 * The two downward end-tab rects of the refreshed WBS-summary **bracket** glyph (ADR-0052 M4):
 * small tabs dropping below the bar at each end — the classic summary-bar silhouette — so a
 * rolled-up span reads distinctly from a task and from an LOE bracket. Pure vertex math.
 */
export function summaryTabRects(rect: Rect): [Rect, Rect] {
  const y = rect.y + rect.h;
  return [
    { x: rect.x, y, w: SUMMARY_TAB_W, h: SUMMARY_TAB_H },
    { x: rect.x + rect.w - SUMMARY_TAB_W, y, w: SUMMARY_TAB_W, h: SUMMARY_TAB_H },
  ];
}

/** Which refreshed glyph family a bar draws as (ADR-0052 M4). */
export type BarGlyphKind = 'milestone' | 'loe' | 'summary' | 'bar';

/** The refreshed glyph family for an activity type: milestones stay diamonds, LOE **and**
 * hammock spans draw the bracketed-span glyph (both are derived spans), WBS summaries the
 * summary bracket, and everything else a plain (rounded) bar. */
export function barGlyphKind(type: ActivityType): BarGlyphKind {
  if (isMilestone(type)) return 'milestone';
  if (type === 'LEVEL_OF_EFFORT' || type === 'HAMMOCK') return 'loe';
  if (type === 'WBS_SUMMARY') return 'summary';
  return 'bar';
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

/**
 * Width of the grab-zone at each end of a bar, for dependency-draw (ADR-0026 D5). Kept small and
 * capped at half the bar (see {@link classifyHit}) so it never swallows the body's reposition
 * zone on short bars. It is intentionally below the ≥24px target-size guideline: the same
 * link-creation capability is available through the ≥36px buttons in the dependency dialog
 * (reachable via Enter on the diagram listbox), so this pointer grab-zone falls under WCAG 2.5.8's
 * **Equivalent** exception. The selected bar also shows a persistent edge mark (a non-hover cue).
 */
export const EDGE_HANDLE_PX = 8;

/** Where a screen point falls relative to the activities, for gesture routing. The `resize*`
 * kinds exist only when {@link classifyHit} is asked for resize handles (ADR-0052 M2);
 * `lagAnchor` only when it is given the drawn lag anchors (ADR-0052 M3). */
export type HitZoneKind =
  'empty' | 'body' | 'startHandle' | 'finishHandle' | 'resizeStart' | 'resizeFinish' | 'lagAnchor';

export interface HitZone {
  kind: HitZoneKind;
  /** The activity id for a non-empty zone (for `lagAnchor`, the bar the anchor sits on). */
  id?: string;
  /** The dependency a `lagAnchor` zone manipulates (ADR-0052 M3). */
  dependencyId?: string;
}

/**
 * True when a bar's duration is a user-entered number the finish edge can resize (ADR-0052 M2).
 * False for the duration-derived types — milestones (a zero-duration point), Level of Effort
 * (span derived from its SS/FF ties, ADR-0035 §21) and WBS summaries (rolled up from the branch,
 * ADR-0035 §24) — which therefore offer no resize handles. Mirrors `isDurationDerivedType` in
 * `features/activities` (kept in step by hand: the pure render model imports no other feature —
 * ADR-0026 D8).
 */
export function isResizeEligibleType(type: ActivityType): boolean {
  return !isMilestone(type) && type !== 'LEVEL_OF_EFFORT' && type !== 'WBS_SUMMARY';
}

/** Half-width (px) of the grab zone around a drawn lag anchor (ADR-0052 M3) — 12, so the target is
 * a full **24px** wide and meets WCAG 2.5.8 outright rather than leaning on the Equivalent
 * exception the bar-end zones ({@link EDGE_HANDLE_PX}) take. It is deliberately wider than those
 * zones because the anchor is a *point* target with no bar edge to aim at, and because the anchor
 * now paints a visible handle (`TsldScene.lagHandles`) the user aims for: an under-sized target
 * around a drawn dot is the defect this widens away. The vertical tolerance stays `BAR_HEIGHT / 2`
 * (the bar the anchor sits on), which also covers the M5 fan-out offset (±`FAN_OUT_MAX_PX`). */
export const LAG_ANCHOR_PX = 12;

/**
 * Id→activity index for {@link classifyHit}'s lag branch, memoised on the activities ARRAY
 * identity — the `edgeFanOutFor` pattern (paint.ts), duplicated here rather than shared because
 * paint.ts imports this module and the reverse import would be a cycle. `classifyHit` runs on
 * every pointer-move while the lag tool is armed, and its single production caller passes the
 * reference-stable `sceneRef.current.activities`, so per-call rebuilding was O(n) per mousemove.
 * A caller constructing fresh arrays per call degrades to always-recompute — a missed
 * optimisation, never a stale result. Exported for the memo-identity test only.
 */
const classifyActivityIndexes = new WeakMap<
  readonly RenderActivity[],
  ReadonlyMap<string, RenderActivity>
>();
export function classifyActivityIndexFor(
  activities: readonly RenderActivity[],
): ReadonlyMap<string, RenderActivity> {
  let index = classifyActivityIndexes.get(activities);
  if (!index) {
    index = new Map(activities.map((a) => [a.id, a]));
    classifyActivityIndexes.set(activities, index);
  }
  return index;
}

/**
 * The filtered + id-sorted offset-edge list {@link classifyHit}'s lag branch walks, memoised on
 * the edges ARRAY identity. The sort is what makes overlapping anchors resolve deterministically
 * (ADR-0065's fixed-order rule); memoising it changes nothing about the order — the same array
 * reference now returns the identical precomputed list instead of re-sorting per pointer-move
 * (O(E log E) each). Exported for the memo-identity test only.
 */
const offsetEdgesByArray = new WeakMap<readonly RenderEdge[], readonly RenderEdge[]>();
export function offsetEdgesFor(edges: readonly RenderEdge[]): readonly RenderEdge[] {
  let sorted = offsetEdgesByArray.get(edges);
  if (!sorted) {
    sorted = edges
      .filter((e) => e.id !== undefined && (e.lagDays ?? 0) !== 0)
      .sort((a, b) => (a.id! < b.id! ? -1 : 1));
    offsetEdgesByArray.set(edges, sorted);
  }
  return sorted;
}

/** Options for {@link classifyHit}'s zone vocabulary (ADR-0052 M2/M3). */
export interface ClassifyHitOptions {
  /**
   * When true (the direct-manipulation flag is on, in `select` mode with a resize handler wired),
   * the bar-end grab-zones classify as **resize** zones (`resizeStart`/`resizeFinish`) instead of
   * the link-draw `startHandle`/`finishHandle` — the ADR-0052 §1 edge-handle repurpose. A bar whose
   * duration isn't resizable ({@link isResizeEligibleType} false: milestone / LOE / WBS summary)
   * classifies entirely as `body`, so it never advertises a handle it can't honour. Absent/false ⇒
   * byte-for-byte today's zones (the flag-off parity gate).
   */
  resizeHandles?: boolean;
  /**
   * When present (the flag is on, in `select` mode with a lag handler wired — the same gate as
   * {@link ClassifyHitOptions.resizeHandles}), a grab zone surrounds each drawn **lag anchor**
   * (ADR-0052 M3) and classifies as `lagAnchor` carrying the edge's `dependencyId`. Only edges
   * whose anchor is actually *offset* (`lagDays !== 0`) offer a zone: a zero-lag anchor sits ON
   * the constrained edge, exactly where the resize handles live, and must not steal them — a
   * zero-lag tie's lag is set through the dependency dialog instead. `walk` is the plan
   * working-day {@link DayWalk}; a `TWENTY_FOUR_HOUR` edge branches to the elapsed walk here,
   * mirroring the painter, so the zone always sits where the anchor is drawn.
   */
  lagAnchors?: {
    edges: readonly RenderEdge[];
    walk: DayWalk;
  };
}

/**
 * Classify a screen point for gesture routing (ADR-0026 D5): the topmost activity (if
 * any) under it, and whether the point is on the bar **body** (→ reposition) or an end
 * **grab-zone** (→ dependency-draw, or — with `resizeHandles` on — duration resize,
 * ADR-0052 M2). Iterates topmost-first like {@link hitTest}; the end zones take precedence
 * over the body and are capped at half the bar so they never overlap. `empty` (no activity
 * under the point) routes to pan or create.
 */
export function classifyHit(
  activities: readonly RenderActivity[],
  point: Point,
  view: Viewport,
  dataDateIso: string,
  options?: ClassifyHitOptions,
): HitZone {
  // Lag-anchor zones first (ADR-0052 M3): an anchor is a small point target drawn ON a bar, so it
  // must win over the bar body (topmost/smallest target wins — the same rule that puts the end
  // zones above the body). Overlapping anchors on a crowded bar resolve by stable edge-id order,
  // so the winner never jitters between frames/refetches.
  if (options?.lagAnchors) {
    const { edges, walk } = options.lagAnchors;
    const byId = classifyActivityIndexFor(activities);
    const offsetEdges = offsetEdgesFor(edges);
    for (const edge of offsetEdges) {
      const pred = byId.get(edge.predecessorId);
      const succ = byId.get(edge.successorId);
      if (!pred || !succ) continue;
      const anchors = lagAnchorPoints(
        pred,
        succ,
        edge.type,
        edge.lagDays ?? 0,
        view,
        dataDateIso,
        edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : walk,
      );
      if (!anchors) continue;
      // The *offset* anchor is the draggable one: FS/FF walk the successor end, SS/SF the
      // predecessor end (see lagAnchorPoints) — the other end sits on a plain bar edge.
      const predFinish = edge.type === 'FS' || edge.type === 'FF';
      const anchor = predFinish ? anchors.succ : anchors.pred;
      const anchorBar = predFinish ? succ : pred;
      if (
        Math.abs(point.x - anchor.x) <= LAG_ANCHOR_PX &&
        Math.abs(point.y - anchor.y) <= BAR_HEIGHT / 2
      ) {
        return { kind: 'lagAnchor', id: anchorBar.id, dependencyId: edge.id! };
      }
    }
  }
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
    // Resize vocabulary (ADR-0052 M2): a duration-derived bar has no end zones at all — the whole
    // rect is body, so a press falls through to reposition/select rather than a dead handle.
    if (options?.resizeHandles && !isResizeEligibleType(activity.type)) {
      return { kind: 'body', id: activity.id };
    }
    const handleW = Math.min(EDGE_HANDLE_PX, rect.w / 2);
    if (point.x <= rect.x + handleW) {
      return { kind: options?.resizeHandles ? 'resizeStart' : 'startHandle', id: activity.id };
    }
    if (point.x >= rect.x + rect.w - handleW) {
      return { kind: options?.resizeHandles ? 'resizeFinish' : 'finishHandle', id: activity.id };
    }
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
  const pxPerDay = clampPxPerDay(usableW / spanDays, maxPxPerDay);
  return {
    pxPerDay,
    originX: paddingPx - minDay * pxPerDay,
    originY: paddingPx,
  };
}
