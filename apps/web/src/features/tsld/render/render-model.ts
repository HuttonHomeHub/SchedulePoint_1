import type { ActivityType, DependencyType, LagCalendarSource } from '@repo/types';

import {
  addCalendarDays,
  daysBetween,
  ELAPSED_DAY_WALK,
  lagAnchorDay,
  type DayWalk,
} from './working-time';

import type { ConstraintAnchor } from '@/lib/constraint-format';

// ADR-0078 S8: working-time day arithmetic moved to its own module. Re-exported below so this
// file stays the barrel every consumer already imports from — not one import in the repo changed.

export * from './working-time';

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

// ── On-canvas activity labels (ADR-0026 D1) ────────────────────────────────────────────
/** Below this px-per-day, bars are too narrow for legible text — labels are culled (LOD gate). */
export const LABEL_MIN_PX_PER_DAY = 4;
/** A bar must be at least this wide (px) to hold an inside label; narrower bars try a beside label. */
export const LABEL_INSIDE_MIN_PX = 24;
/** Horizontal padding (px) inside a bar before/after inside-label text. */
export const LABEL_PAD_PX = 3;
/** Gap (px) between a bar's right edge and a beside label. */
export const LABEL_GAP_PX = 4;

/**
 * The zoom below which the **flanking start/finish date labels** (ADR-0054 §3) are suppressed.
 *
 * Deliberately far above {@link LABEL_MIN_PX_PER_DAY}: a name label is one string per bar, while
 * dates are two per bar plus the `measureText` each needs for collision — the epic's one real
 * draw-budget risk (ADR-0026's ≤4 ms p95 at 2,000 activities). At 6 px/day a whole year spans
 * ~2,200 px, so the visible activity count is already high while each date needs ~55 px of room;
 * below that the labels would collide far more often than they would render, so the cheapest
 * correct thing is not to measure them at all. Set from the M3-T5 measurement, not by eye — see
 * `docs/specs/canvas-live-feedback/implementation-plan.md`.
 */
export const DATE_LABEL_MIN_PX_PER_DAY = 6;

/**
 * The **gap** in whole days a relationship leaves between its two endpoints (ADR-0054 §5) — the
 * answer to "why is this activity waiting?".
 *
 * Measured from the *drawn* day offsets, per relationship type, with the lag already accounted
 * for. A **driving** edge is by definition the binding constraint, so its gap is 0; a positive
 * gap is genuine slack in that one tie.
 *
 * Deliberately a **calendar-day** count off the drawn geometry, not a working-day walk: this
 * annotates what the planner can see on the diagram, and the diagram's x-axis is calendar time.
 * The engine remains the authority on float — this is a reading of the picture, not a second
 * opinion about the schedule.
 */
export function edgeGapDays(args: {
  type: DependencyType;
  predStartDay: number;
  predFinishDay: number;
  succStartDay: number;
  succFinishDay: number;
  lagDays: number;
}): number {
  const { type, predStartDay, predFinishDay, succStartDay, succFinishDay, lagDays } = args;
  switch (type) {
    case 'FS':
      return succStartDay - (predFinishDay + 1 + lagDays);
    case 'SS':
      return succStartDay - (predStartDay + lagDays);
    case 'FF':
      return succFinishDay - (predFinishDay + lagDays);
    case 'SF':
      return succFinishDay - (predStartDay - 1 + lagDays);
  }
}

/**
 * Every relationship's {@link edgeGapDays}, keyed by dependency id — the datum behind both the
 * on-canvas `Nd` slack chip (ADR-0054 §5) and its spoken equivalent in `summarizeLogic`.
 *
 * Built once from the plan's dependencies so the two surfaces cannot disagree: a number a sighted
 * planner reads off a link and the number a screen-reader user hears for the same link are the
 * same computation, not two similar ones (WCAG 1.1.1). Ties whose endpoints are not yet scheduled
 * are simply absent from the map — there is no gap to state.
 */
export function slackByDependencyId(args: {
  dataDate: string;
  activities: readonly { id: string; earlyStart: string | null; earlyFinish: string | null }[];
  dependencies: readonly {
    id: string;
    type: DependencyType;
    lagDays: number;
    predecessor: { id: string };
    successor: { id: string };
  }[];
}): Map<string, number> {
  const { dataDate, activities, dependencies } = args;
  const byId = new Map(activities.map((a) => [a.id, a]));
  const slack = new Map<string, number>();
  for (const edge of dependencies) {
    const pred = byId.get(edge.predecessor.id);
    const succ = byId.get(edge.successor.id);
    if (!pred?.earlyStart || !pred.earlyFinish || !succ?.earlyStart || !succ.earlyFinish) continue;
    slack.set(
      edge.id,
      edgeGapDays({
        type: edge.type,
        predStartDay: daysBetween(dataDate, pred.earlyStart),
        predFinishDay: daysBetween(dataDate, pred.earlyFinish),
        succStartDay: daysBetween(dataDate, succ.earlyStart),
        succFinishDay: daysBetween(dataDate, succ.earlyFinish),
        lagDays: edge.lagDays,
      }),
    );
  }
  return slack;
}

/** Height (px) of a float/drift tail — thinner than the bar, so it never reads as duration. */
export const TAIL_HEIGHT = 6;

/**
 * The hollow **float** tail (ADR-0054 §4): the room this activity has to slip, drawn extending
 * RIGHT from its finish in the same time-scale as the bar, so slack is comparable between two
 * activities by eye without selecting either — the Graphical Path Method idiom.
 *
 * Returns `null` when there is nothing truthful to draw: no float computed yet, or zero/negative
 * float (a critical activity has no room, and a negative-float one is already late — neither is a
 * tail, and drawing a backwards rectangle would be a lie).
 */
export function floatTailRect(
  bar: Rect,
  totalFloatDays: number | null | undefined,
  view: Viewport,
): Rect | null {
  if (totalFloatDays === null || totalFloatDays === undefined || totalFloatDays <= 0) return null;
  return {
    x: bar.x + bar.w,
    y: bar.y + (bar.h - TAIL_HEIGHT) / 2,
    w: totalFloatDays * view.pxPerDay,
    h: TAIL_HEIGHT,
  };
}

/**
 * The hollow **drift** tail (ADR-0054 §4): how much earlier this activity could have gone, drawn
 * extending LEFT from its start.
 *
 * **Absent in Early mode by construction, and that is correct rather than a defect** — an
 * early-start schedule already places everything as early as logic allows, so drift is zero
 * everywhere. It becomes non-zero only under Visual mode (hand placement, ADR-0033) or where a
 * constraint pushes an activity later than its logic permits. The datum is the engine's
 * `visualDriftDays`; the canvas never computes drift itself.
 */
export function driftTailRect(
  bar: Rect,
  driftDays: number | null | undefined,
  view: Viewport,
): Rect | null {
  if (driftDays === null || driftDays === undefined || driftDays <= 0) return null;
  const w = driftDays * view.pxPerDay;
  return { x: bar.x - w, y: bar.y + (bar.h - TAIL_HEIGHT) / 2, w, h: TAIL_HEIGHT };
}

/** Month abbreviations for {@link formatCanvasDate} — fixed, never locale-derived. */
const CANVAS_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * A `YYYY-MM-DD` rendered compactly for an on-canvas flanking date label (ADR-0054 §3): `2 Jan`.
 *
 * No year: the ruler above already carries it, and every character costs horizontal room that
 * decides whether the label is drawn at all. Deliberately **not** locale-formatted — the painter
 * is pure and its output is snapshot-tested, so a machine's locale must not change what is drawn
 * (the same reason the render model does no other domain string work).
 */
export function formatCanvasDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  const index = Number(month) - 1;
  const name = CANVAS_MONTHS[index] ?? month ?? '';
  return `${Number(day)} ${name}`;
}

/** A flanking date label's placement decision for one bar (ADR-0054 §3). */
export interface DateLabelSlot {
  /** Draw the start date to the LEFT of the bar (there is room before its left neighbour). */
  start: boolean;
  /** Draw the finish date to the RIGHT of the bar (there is room before its right neighbour). */
  finish: boolean;
}

/**
 * Decide, per bar, which flanking date labels fit (ADR-0054 §3) — pure, so the LOD rule is
 * testable without a canvas.
 *
 * A date is drawn only where the gap to the neighbouring bar **in the same lane** can hold it.
 * The caller supplies the already-lane-bucketed, x-sorted row and the text widths; this makes no
 * measurement of its own, so the painter can cull a whole lane before touching `measureText`.
 * A milestone is treated exactly like a bar — its diamond is narrow, so its dates almost always
 * have room, which is the point.
 */
export function dateLabelSlot(args: {
  /** Room (px) between this bar's left edge and the previous bar's right edge in the lane. */
  roomLeftPx: number;
  /** Room (px) between this bar's right edge and the next bar's left edge in the lane. */
  roomRightPx: number;
  /** Rendered width (px) of the start date text. */
  startWidthPx: number;
  /** Rendered width (px) of the finish date text. */
  finishWidthPx: number;
}): DateLabelSlot {
  const { roomLeftPx, roomRightPx, startWidthPx, finishWidthPx } = args;
  return {
    start: roomLeftPx >= startWidthPx + LABEL_GAP_PX * 2,
    finish: roomRightPx >= finishWidthPx + LABEL_GAP_PX * 2,
  };
}
/** Minimum clear room (px) to the same-lane neighbour before a beside label is worth drawing. */
export const LABEL_BESIDE_MIN_PX = 24;
/** The fixed label font. Constant so the width memo can key by text alone (font-stable). */
export const LABEL_FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";

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

/**
 * Range-anchored zoom presets (`VITE_CANVAS_TIME_AXIS`, tsld-toolbar-canvas-refinements F3): the
 * **nominal** visible-range target each preset frames, independent of canvas width. "Nominal"
 * because the viewport is a continuous px-per-day scale — "one month visible" is a duration, not
 * a calendar-exact span (a real month is 28–31 days; this uses 30 for all twelve). Consumed by
 * `time-scale.ts#pxPerDayForPreset`; flag-off keeps the fixed `ZOOM_STOPS` table above.
 */
export const ZOOM_TARGET_DAYS = {
  day: 14,
  week: 30,
  month: 91,
  quarter: 365,
  year: 1095,
} as const satisfies Record<ZoomLevel, number>;

/**
 * Human-readable range label for each preset, kept **beside** {@link ZOOM_TARGET_DAYS} (not
 * hand-typed at the toolbar call site) so the two can't drift apart. Used only in the `View▾`
 * zoom menu's row copy ("Day — 2 weeks"); the toolbar trigger keeps the short preset name alone
 * (it is width-constrained).
 */
export const ZOOM_RANGE_LABELS = {
  day: '2 weeks',
  week: '1 month',
  month: '3 months',
  quarter: '1 year',
  year: '3 years',
} as const satisfies Record<ZoomLevel, string>;

/** Inclusive px-per-day bounds (a day column never narrower/wider than this). */
export const MIN_PX_PER_DAY = 0.4;
/**
 * Today's ceiling, kept as its own named constant (not just "the old `MAX_PX_PER_DAY`") so the
 * flag-off callers below can pass it explicitly — `clampPxPerDay`/`zoomAt`/`stepZoom`/
 * `fitToContent` all take the ceiling as a **required** parameter rather than reading
 * `MAX_PX_PER_DAY` off the module directly, precisely so that raising it for
 * `VITE_CANVAS_TIME_AXIS` (below) can't silently widen the flag-off zoom range too — an earlier
 * draft of this feature did exactly that (a component-review finding), leaving wheel/pinch/button
 * zoom reachable at 200 px/day even with the flag off, contradicting the flag's own
 * byte-for-byte-parity contract.
 */
export const LEGACY_MAX_PX_PER_DAY = 60;
/**
 * Raised 60 → 200 for `VITE_CANVAS_TIME_AXIS`'s Day preset (2 weeks visible): a 1 600 px canvas
 * needs 114 px/day, a 2 560 px canvas needs 183 — both above the old bound, which would make the
 * headline preset silently miss its own contract at ordinary desktop widths. 200 covers 2 560 px
 * with headroom. Safe to raise: every LOD threshold gated on `pxPerDay` (`DAY_GRID_MIN_PX`,
 * `NON_WORKING_MIN_PX`, `DAY_ROW_MIN_PX_PER_DAY`, …) is a **lower** bound, so widening the top of
 * the range destabilises nothing below it. Only reaches a viewport when the caller resolves the
 * flag-aware ceiling (`TsldCanvas`) and passes it as `maxPxPerDay` — flag-off call sites pass
 * {@link LEGACY_MAX_PX_PER_DAY} instead, so this constant alone never widens flag-off behaviour.
 */
export const MAX_PX_PER_DAY = 200;

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
  /** The on-canvas bar label (`{code} {name} · {n}d`), pre-built at the mapping seam from the
   * shared `activityBarLabel` so the render model does no domain string logic and the visible
   * label stays consistent with the accessible name (ADR-0026 D1; WCAG 2.5.3). */
  label: string;
  /**
   * The inclusive dates (`YYYY-MM-DD`) the bar is **drawn** at, or null until the plan is
   * recalculated. Sourced per the active view at the mapping seam (ADR-0033): EARLY → the CPM
   * earliest dates, VISUAL → the engine's effective-Visual dates, Late overlay → the late dates.
   * The field names keep their EARLY-mode heritage; `activityRect` reads them verbatim, blind to
   * which mode chose them.
   */
  earlyStart: string | null;
  earlyFinish: string | null;
  isCritical: boolean;
  isNearCritical: boolean;
  /** Engine-owned (ADR-0033): true when a Visual placement is earlier than its feasible start —
   * the painter marks it (a warning cue, never colour-only). Only meaningful in VISUAL mode. */
  visualConflict?: boolean;
  /** Engine-owned (ADR-0033): working-day drift of the placement from the early start (signed). */
  visualDriftDays?: number | null;
  /** True when this bar shares a lane with a time-overlapping neighbour (TECH_DEBT #24c) — a manual
   * lane drop can create one (auto-arrange never does). Derived at the mapping seam from the drawn
   * dates + lane (`laneOverlapIds`); the painter marks it and the listbox speaks it. */
  laneOverlap?: boolean;
  /** Which edge a set date constraint pins (start/finish), or null when unconstrained —
   * the painter marks that edge with a small pin. Pre-derived from `constraintType` at the
   * mapping seam so the render model stays free of constraint-kind logic (ADR-0026 D8,
   * module structure — the pure render model reads no domain enums). */
  constraint?: ConstraintAnchor | null;
  /** Schedule % complete (0–100), the same value the row/AT reports — drawn as the in-bar
   * progress fill under the visual refresh (ADR-0052 M4). Optional so legacy callers/fixtures
   * stay valid; absent (or 0) draws no progress detail. */
  percentComplete?: number;
  /** Engine-owned total float in whole days (ADR-0054 §4) — drawn as a hollow tail extending
   * right from the bar's finish under the float/drift lens. Null/absent (uncalculated, or the
   * lens off) ⇒ no tail. */
  totalFloat?: number | null;
}

/** A directed dependency edge (predecessor → successor) by activity id. */
export interface RenderEdge {
  /** The dependency's id, carried so the lag-anchor hit zone can name the edge it manipulates
   * (ADR-0052 M3). Optional so legacy callers/fixtures stay valid; an id-less edge simply offers
   * no grab zone. */
  id?: string;
  predecessorId: string;
  /** The dependency type (FS/SS/FF/SF), carried so the link-draw legality pre-check can spot a
   * same-`(predecessor, successor, type)` duplicate (ADR-0026 D5). */
  type: DependencyType;
  successorId: string;
  /** Engine-owned: true when this edge drives its successor's start (M3). Drawn emphasised. */
  isDriving: boolean;
  /** Signed lag in whole days (a lead is negative), drawn as the time-true anchor offset
   * (ADR-0052). Optional so legacy callers stay valid; absent reads as zero (no offset). */
  lagDays?: number;
  /** The calendar the lag is measured on (ADR-0036 §6): `TWENTY_FOUR_HOUR` walks elapsed calendar
   * days, everything else the plan working-day calendar today. Absent reads as `PROJECT_DEFAULT`. */
  lagCalendar?: LagCalendarSource;
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
 * A per-frame id→rect cache the painter threads through the geometry functions so one frame
 * computes each activity's rect once instead of once per consumer (cull, the lane index, and
 * every incident edge's anchors each re-derive it otherwise — up to five `Date.parse` pairs per
 * lagged edge). The cache is only valid for one `(view, dataDate)` pair, so it must live for a
 * single paint call and never longer; the caller owns that lifetime.
 */
export type RectCache = Map<string, Rect | null>;

/**
 * The screen-space rectangle for an activity, or null if it has no computed dates yet
 * (nothing to place). A task spans `[earlyStart, earlyFinish + 1 day)` — the inclusive
 * finish plus one day so a 1-day task is one column wide (ADR-0023). A milestone is a
 * zero-duration diamond centred on its day: the rect is the diamond's bounding box.
 *
 * `cache` (optional) is a same-frame {@link RectCache}; omitted, behaviour is byte-identical
 * to the uncached path.
 */
export function activityRect(
  activity: RenderActivity,
  view: Viewport,
  dataDateIso: string,
  cache?: RectCache,
): Rect | null {
  if (cache) {
    const hit = cache.get(activity.id);
    if (hit !== undefined) return hit;
    const rect = computeActivityRect(activity, view, dataDateIso);
    cache.set(activity.id, rect);
    return rect;
  }
  return computeActivityRect(activity, view, dataDateIso);
}

function computeActivityRect(
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

/**
 * Where an activity's label should sit (ADR-0026 D1): **inside** a task bar wide enough to hold
 * text; **beside** (to the right) for a narrow bar or a milestone when the same-lane neighbour
 * leaves clear room; else **none** (suppressed). Pure — the painter supplies the measured bar
 * width and the pre-computed room to the next same-lane bar, and truncation fits the actual text.
 */
export function labelPlacement(args: {
  barWidth: number;
  isMilestone: boolean;
  besideRoomPx: number;
}): 'inside' | 'beside' | 'none' {
  if (!args.isMilestone && args.barWidth >= LABEL_INSIDE_MIN_PX) return 'inside';
  if (args.besideRoomPx >= LABEL_BESIDE_MIN_PX) return 'beside';
  return 'none';
}

/**
 * Fit `text` into `maxPx` using `measure` (a width function), appending an ellipsis when it must
 * trim. Returns the full text when it fits, the empty string when not even the ellipsis fits, else
 * the longest prefix (trailing space trimmed) plus the ellipsis. Text width is monotonic in prefix
 * length, so a binary search finds the fit in O(log n) measurements.
 */
export function truncateToWidth(
  text: string,
  maxPx: number,
  measure: (s: string) => number,
  ellipsis = '…',
): string {
  if (maxPx <= 0 || text.length === 0) return '';
  if (measure(text) <= maxPx) return text;
  if (measure(ellipsis) > maxPx) return '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + ellipsis) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  const kept = text.slice(0, lo).trimEnd();
  return kept ? kept + ellipsis : ellipsis;
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
  cache?: RectCache,
): string[] {
  const viewport: Rect = {
    x: -marginPx,
    y: -marginPx,
    w: size.width + marginPx * 2,
    h: size.height + marginPx * 2,
  };
  const visible: string[] = [];
  for (const activity of activities) {
    const rect = activityRect(activity, view, dataDateIso, cache);
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
  type: DependencyType,
  view: Viewport,
  dataDateIso: string,
  cache?: RectCache,
): Point[] | null {
  const from = activityRect(predecessor, view, dataDateIso, cache);
  const to = activityRect(successor, view, dataDateIso, cache);
  if (!from || !to) return null;
  // Anchor each end to the edge the relationship type constrains (ADR-0021 logic types), not always
  // predecessor-finish → successor-start: FS finish→start, SS start→start, FF finish→finish,
  // SF start→finish. The tie's *type* — carried on the edge — decides which vertical edge to attach.
  const predFinish = type === 'FS' || type === 'FF';
  const succStart = type === 'FS' || type === 'SS';
  return routeOrthogonal(
    { x: predFinish ? from.x + from.w : from.x, y: from.y + from.h / 2 },
    { x: succStart ? to.x : to.x + to.w, y: to.y + to.h / 2 },
    type,
    view,
  );
}

/**
 * The shared orthogonal routing between two edge anchors — extracted so the legacy extreme-end
 * routing and the time-true anchor routing (ADR-0052) can never disagree on the line's shape.
 * Exported for the painter's refreshed link path (ADR-0052 M5), which composes it directly with
 * fanned-out anchors. `elbowShift` nudges the vertical elbow sideways so crowded parallel edges
 * don't collapse onto one vertical run; it is clamped inside the gap so the elbow never cuts
 * back across the anchored bar edge, and the default `0` keeps the legacy shape byte-for-byte.
 */
/**
 * A lane's occupied horizontal spans, sorted by `x0` and non-overlapping after construction.
 * Screen pixels, for the frame this was built from.
 */
export interface LaneIntervals {
  readonly spans: readonly (readonly [number, number])[];
}

/** Per-lane occupied x-spans for the visible frame (ADR-0064 M2 T14). */
export type LaneIntervalIndex = ReadonlyMap<number, LaneIntervals>;

/** How many corridor candidates a single edge may try before falling back (ADR-0064 T15). */
export const MAX_CORRIDOR_CANDIDATES = 4;

/**
 * Build the per-lane interval index a link route consults to avoid drawing through bars.
 *
 * **Pure, and derived from `activityRect` — the one existing source of a bar's geometry.** A
 * milestone is a diamond and a WBS summary is a wider bracket; re-deriving either here would give
 * routing a second opinion about where a bar is, and the two would disagree exactly when it
 * mattered. Merging overlapping spans keeps the free test a single binary search rather than a scan
 * (two bars can legitimately overlap in a lane — `lane-overlap.ts` models that conflict).
 */
export function laneIntervalIndex(
  activities: readonly RenderActivity[],
  view: Viewport,
  dataDate: string,
  cache?: RectCache,
): LaneIntervalIndex {
  const byLane = new Map<number, [number, number][]>();
  for (const activity of activities) {
    const rect = activityRect(activity, view, dataDate, cache);
    if (!rect) continue;
    const lane = activity.laneIndex;
    const list = byLane.get(lane);
    const span: [number, number] = [rect.x, rect.x + rect.w];
    if (list) list.push(span);
    else byLane.set(lane, [span]);
  }
  const index = new Map<number, LaneIntervals>();
  for (const [lane, spans] of byLane) {
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
      else merged.push([span[0], span[1]]);
    }
    index.set(lane, { spans: merged });
  }
  return index;
}

/** Is screen-x `x` clear of every bar in `lane`? Binary search over the merged spans. */
export function isLaneFreeAt(index: LaneIntervalIndex, lane: number, x: number): boolean {
  const lane_ = index.get(lane);
  if (!lane_) return true;
  const spans = lane_.spans;
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const span = spans[mid]!;
    if (x < span[0]) hi = mid - 1;
    else if (x > span[1]) lo = mid + 1;
    else return false;
  }
  return true;
}

/**
 * The lanes a vertical run between two lane-centres crosses, **excluding the two endpoints' own
 * lanes** — a link is allowed to touch the bars it connects, and forbidding that would make every
 * route fall back.
 */
function crossedLanes(fromLane: number, toLane: number): number[] {
  const lo = Math.min(fromLane, toLane);
  const hi = Math.max(fromLane, toLane);
  const lanes: number[] = [];
  for (let lane = lo + 1; lane < hi; lane += 1) lanes.push(lane);
  return lanes;
}

export function routeOrthogonal(
  from: Point,
  to: Point,
  type: DependencyType,
  view: Viewport,
  elbowShift = 0,
  /**
   * Obstacle awareness (ADR-0064 M2). **Absent ⇒ this function returns exactly what it always
   * returned** — that default is the parity gate, and it is why the new path could be added without
   * a flag inside the geometry itself.
   */
  obstacles?: {
    index: LaneIntervalIndex;
    fromLane: number;
    toLane: number;
    /** Lane pitch and bar height, so the 5-point fallback can find the inter-lane gutter. */
    laneHeight: number;
    barHeight: number;
  },
): Point[] {
  if (from.y === to.y) return [from, to];
  // The vertical elbow sits clear of the anchored edges: just outside a finish edge (right) or a
  // start edge (left) so the line doesn't cut back across either bar; SF spans, so split the middle.
  const gap = Math.min(12, Math.max(4, view.pxPerDay));
  const shift = elbowShift === 0 ? 0 : Math.max(-(gap - 1), Math.min(gap - 1, elbowShift));
  const preferred =
    type === 'FS'
      ? from.x + gap + shift
      : type === 'SS'
        ? Math.min(from.x, to.x) - gap - shift
        : type === 'FF'
          ? Math.max(from.x, to.x) + gap + shift
          : (from.x + to.x) / 2 + shift; // SF
  const fourPoint = (elbow: number): Point[] => [
    from,
    { x: elbow, y: from.y },
    { x: elbow, y: to.y },
    to,
  ];
  if (!obstacles) return fourPoint(preferred);

  const crossed = crossedLanes(obstacles.fromLane, obstacles.toLane);
  // Nothing between the two lanes to hit: today's elbow is already correct, and taking the
  // candidate path anyway would risk moving a line that had no reason to move.
  if (crossed.length === 0) return fourPoint(preferred);

  const free = (x: number): boolean =>
    crossed.every((lane) => isLaneFreeAt(obstacles.index, lane, x));
  if (free(preferred)) return fourPoint(preferred);

  /**
   * A **bounded** candidate list, tried in a fixed order so the same input always produces the same
   * line — a route that varies between frames reads as the diagram twitching. The order runs from
   * "closest to what we would have drawn" outwards, so a corridor is only abandoned for a reason.
   */
  const candidates = [
    preferred + gap * 2,
    preferred - gap * 2,
    (from.x + to.x) / 2,
    Math.max(from.x, to.x) + gap * 3,
  ].slice(0, MAX_CORRIDOR_CANDIDATES);
  for (const candidate of candidates) {
    if (free(candidate)) return fourPoint(candidate);
  }

  /**
   * No single corridor is clear. Route via **two** corridors joined by a short horizontal leg in
   * the inter-lane gutter — the band between one lane's bar bottom and the next lane's bar top,
   * where a bar can never be. This is the VHV shape, and it is the last structured attempt: if the
   * gutter itself is unusable the line falls back to today's elbow, because bounded work is the
   * contract and an unbounded search on the paint path is how a draw budget dies.
   */
  const gutterLane = Math.min(obstacles.fromLane, obstacles.toLane);
  const gutterY =
    (gutterLane + 1) * obstacles.laneHeight -
    (obstacles.laneHeight - obstacles.barHeight) / 2 -
    view.originY;
  // Each leg only has to clear the lanes IT crosses, which is why this can succeed where a single
  // corridor could not: the near leg runs from the source lane down to the gutter, the far leg from
  // the gutter to the target lane, and neither spans the blocked middle.
  const near = preferred + gap * 2;
  const far = (from.x + to.x) / 2;
  return [
    from,
    { x: near, y: from.y },
    { x: near, y: gutterY },
    { x: far, y: gutterY },
    { x: far, y: to.y },
    to,
  ];
}

// ── Trunk/branch bundling of co-linear corridors (ADR-0065 M3, the SAME flag) ────────────────────

/**
 * How far apart (px) two vertical corridors may sit and still be drawn as one trunk.
 *
 * Six pixels is the fan-out cap (`FAN_OUT_MAX_PX`), and that is not a coincidence: the spread this
 * bundles away is largely the fan-out's own, plus the small type-dependent gap. Wider would start
 * merging corridors a reader can tell apart, which would move a line for no visible gain.
 */
export const BUNDLE_TOLERANCE_PX = 6;

/** One routed line, with the lanes its corridors cross — the bundler needs both. */
export interface BundleCandidate {
  line: Point[];
  fromLane: number;
  toLane: number;
}

/**
 * Snap near-coincident vertical corridors onto a shared trunk, **in place**.
 *
 * A hub with a dozen successors draws a dozen verticals two or three pixels apart: a comb, which
 * reads as noise rather than as "these all follow that". Snapping them to one x makes the picture
 * say what the logic says — one trunk, branching at each successor's lane.
 *
 * Three properties, in the order they matter:
 *
 * 1. **It never undoes the routing.** A corridor is only moved onto the trunk if the trunk x is
 *    *free across the lanes that corridor crosses*. Without that check, bundling would cheerfully
 *    snap an obstacle-avoiding corridor back through the bar M2 moved it off — the new feature
 *    silently reverting the old one, on the plans where both matter most.
 * 2. **It is deterministic.** Groups are swept over a sorted list and the trunk is the group's
 *    median, so the same frame always bundles the same way. The tie-break carries the candidate's
 *    index, because two corridors at an identical x must still order stably.
 * 3. **It moves the line only.** Lag anchors, their drag handles and their hit zones keep today's
 *    per-edge geometry — they are computed before this runs and are not passed in. That is the
 *    ADR-0065 M3 risk mitigation, and it is structural: this function cannot reach them.
 *
 * Returns the number of corridors actually moved, so a test can assert it did something rather
 * than assert the absence of a change it never attempted.
 */
export function bundleCorridors(
  candidates: readonly BundleCandidate[],
  index: LaneIntervalIndex,
  tolerancePx = BUNDLE_TOLERANCE_PX,
): number {
  type Corridor = { candidate: number; at: number; x: number; lanes: number[] };
  const corridors: Corridor[] = [];
  candidates.forEach((candidate, c) => {
    const lanes = crossedLanes(candidate.fromLane, candidate.toLane);
    if (lanes.length === 0) return; // adjacent lanes: nothing crosses, nothing to bundle
    for (let i = 0; i + 1 < candidate.line.length; i += 1) {
      const a = candidate.line[i]!;
      const b = candidate.line[i + 1]!;
      if (a.x === b.x && a.y !== b.y) corridors.push({ candidate: c, at: i, x: a.x, lanes });
    }
  });
  if (corridors.length < 2) return 0;
  corridors.sort((p, q) => p.x - q.x || p.candidate - q.candidate || p.at - q.at);

  let moved = 0;
  let start = 0;
  while (start < corridors.length) {
    let end = start + 1;
    while (end < corridors.length && corridors[end]!.x - corridors[start]!.x <= tolerancePx) {
      end += 1;
    }
    if (end - start > 1) {
      const trunk = corridors[start + ((end - start) >> 1)]!.x;
      for (let i = start; i < end; i += 1) {
        const corridor = corridors[i]!;
        if (corridor.x === trunk) continue;
        if (!corridor.lanes.every((lane) => isLaneFreeAt(index, lane, trunk))) continue;
        const line = candidates[corridor.candidate]!.line;
        line[corridor.at] = { x: trunk, y: line[corridor.at]!.y };
        line[corridor.at + 1] = { x: trunk, y: line[corridor.at + 1]!.y };
        moved += 1;
      }
    }
    start = end;
  }
  return moved;
}

// ── Time-true lag anchoring + arrowheads (ADR-0052 M1, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ──

/** The screen points a dependency's two ends anchor at (each on its bar's vertical centre). */
export interface LagAnchors {
  pred: Point;
  succ: Point;
}

/**
 * The time-true anchor pair for a relationship (ADR-0052, amending ADR-0026's extreme-end
 * routing): each end sits at the point in time it actually constrains, so lag/lead reads as
 * horizontal offset. A zero-lag tie keeps today's constrained-edge endpoints exactly (no visible
 * change for the common `FS+0`). A non-zero lag is walked on the relationship's lag calendar via
 * the injected {@link DayWalk}, at the end the lag rides in time:
 *
 * - **FS/FF** — the lag runs forward from the predecessor's finish, so the **successor** anchor
 *   marks the constrained point (`pred finish + lag`; FS constrains a start, FF a finish — whose
 *   inclusive day converts to the `+1` right edge).
 * - **SS/SF** — the lag embeds along the **predecessor** bar from its start (the GPM embed point):
 *   an `SS+3` tie departs three working days into the predecessor.
 *
 * A lead (negative lag) walks left. The walked anchor is clamped to its bar's span so it always
 * sits ON the bar, even for a lag past the bar's extent. Null when either end has no computed
 * dates — the caller falls back to the extreme-end routing.
 */
export function lagAnchorPoints(
  predecessor: RenderActivity,
  successor: RenderActivity,
  type: DependencyType,
  lagDays: number,
  view: Viewport,
  dataDateIso: string,
  walk: DayWalk,
  cache?: RectCache,
): LagAnchors | null {
  const from = activityRect(predecessor, view, dataDateIso, cache);
  const to = activityRect(successor, view, dataDateIso, cache);
  if (!from || !to || predecessor.earlyStart === null) return null;
  const predFinish = type === 'FS' || type === 'FF';
  const succStart = type === 'FS' || type === 'SS';
  let predX = predFinish ? from.x + from.w : from.x;
  let succX = succStart ? to.x : to.x + to.w;
  if (lagDays !== 0) {
    const startDay = daysBetween(dataDateIso, predecessor.earlyStart);
    const finishDay =
      predecessor.earlyFinish === null
        ? startDay
        : daysBetween(dataDateIso, predecessor.earlyFinish);
    // The one shared forward mapping (ADR-0052 M3) — the lag drag's inverse reads the same fn.
    const day = lagAnchorDay(startDay, finishDay, type, lagDays, walk);
    if (predFinish) {
      succX = Math.min(Math.max(screenXOfDay(day, view), to.x), to.x + to.w);
    } else {
      predX = Math.min(Math.max(screenXOfDay(day, view), from.x), from.x + from.w);
    }
  }
  return {
    pred: { x: predX, y: from.y + from.h / 2 },
    succ: { x: succX, y: to.y + to.h / 2 },
  };
}

/**
 * The dependency polyline routed through the time-true {@link lagAnchorPoints} (ADR-0052), with
 * the same orthogonal shape as {@link dependencyPolyline}. Null when either end has no geometry —
 * matching the legacy routing, so the painter's fallback needs no extra branch.
 */
export function dependencyPolylineTimeTrue(
  predecessor: RenderActivity,
  successor: RenderActivity,
  type: DependencyType,
  lagDays: number,
  view: Viewport,
  dataDateIso: string,
  walk: DayWalk,
  cache?: RectCache,
): Point[] | null {
  const anchors = lagAnchorPoints(
    predecessor,
    successor,
    type,
    lagDays,
    view,
    dataDateIso,
    walk,
    cache,
  );
  if (!anchors) return null;
  return routeOrthogonal(anchors.pred, anchors.succ, type, view);
}

/** Arrowhead length (px) along the final segment; the head is the same width across. */
export const ARROWHEAD_PX = 5;

/**
 * The routed arrowhead's length along the line (ADR-0064 M2 T17). A 5 px equilateral head is legible
 * at Day zoom and close to invisible at Month, where the whole link is a few pixels of dashed rule —
 * so a planner reading a compressed programme cannot tell which end of a tie is which, which is the
 * one thing the head exists to say.
 *
 * **Length, not size**: `ARROWHEAD_HALF_W_PX` is deliberately held at the fan-out step rather than
 * scaled with the length. Widening the barbs past `FAN_OUT_STEP_PX` would push each head across its
 * neighbour's line in a fanned bundle (ADR-0052 M5), trading one legibility problem for another —
 * and direction reads off the head's *point*, which is a function of its length.
 */
export const ARROWHEAD_ROUTED_PX = 8;

/**
 * The three vertices of the directional arrowhead at a polyline's successor end (ADR-0052): the
 * tip is the last point, the two barbs sit `size` back along the final non-degenerate segment,
 * `halfWidth` either side of it. Pure vertex math — the painter batches the fills. Null for a
 * degenerate line (fewer than two distinct points), where no direction exists.
 *
 * `halfWidth` defaults to `size / 2`, which is the equilateral head every existing caller draws —
 * so the added parameter changes nothing it is not passed to.
 */
export function arrowhead(
  points: readonly Point[],
  size = ARROWHEAD_PX,
  halfWidth = size / 2,
): [Point, Point, Point] | null {
  const tip = points[points.length - 1];
  if (!tip) return null;
  // The last segment can be zero-length (e.g. a clamped anchor meeting its elbow) — scan back for
  // the last segment that actually has a direction.
  for (let i = points.length - 1; i >= 1; i -= 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const baseX = tip.x - ux * size;
    const baseY = tip.y - uy * size;
    const half = halfWidth;
    return [
      { x: tip.x, y: tip.y },
      { x: baseX - uy * half, y: baseY + ux * half },
      { x: baseX + uy * half, y: baseY - ux * half },
    ];
  }
  return null;
}

// ── Link visual refresh (ADR-0052 M5, behind the SAME `VITE_CANVAS_DIRECT_MANIPULATION`) ──

/** Target corner radius (px) of a refreshed link elbow — small, so the line reads as routed
 * wiring (softened, not curved). Clamped per corner to half the adjoining segment lengths. */
export const LINK_ELBOW_RADIUS = 5;

/**
 * The rounded-corner radius to draw at polyline vertex `b` between segments `a→b` and `b→c`
 * (ADR-0052 M5): the target radius clamped to **half** of each adjoining segment, so two corners
 * sharing a segment can never overlap their arcs, and `0` (a hard corner / plain lineTo) for a
 * degenerate or collinear vertex where no turn exists. Pure — the painter feeds it to `arcTo`.
 */
export function elbowRadius(a: Point, b: Point, c: Point, max = LINK_ELBOW_RADIUS): number {
  const inLen = Math.hypot(b.x - a.x, b.y - a.y);
  const outLen = Math.hypot(c.x - b.x, c.y - b.y);
  if (inLen === 0 || outLen === 0) return 0;
  // No turn (the cross product vanishes for collinear segments) → nothing to round.
  if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) === 0) return 0;
  return Math.min(max, inLen / 2, outLen / 2);
}

/** Vertical spacing (px) between fanned-out edge ends sharing a bar edge — small, so the spread
 * stays inside the bar's half-height and reads as separation, not displacement. */
export const FAN_OUT_STEP_PX = 3;
/** Cap (px) on a fan-out offset: a very crowded bar edge saturates rather than spilling the
 * anchors off the bar (BAR_HEIGHT/2 = 9px; ±6 keeps every anchor visibly on it). */
export const FAN_OUT_MAX_PX = 6;

/**
 * Half the **routed** arrowhead's width across (ADR-0064 T17), pinned to the fan-out step rather
 * than derived from {@link ARROWHEAD_ROUTED_PX} — see that constant for why the head grows in
 * length only. Declared here, below `FAN_OUT_STEP_PX`, because a module-level `const` cannot read
 * one declared after it.
 */
export const ARROWHEAD_HALF_W_PX = FAN_OUT_STEP_PX;

/** The signed vertical offsets (px) a fanned-out edge applies at each of its two ends. */
export interface FanOutOffsets {
  pred: number;
  succ: number;
}

/**
 * Deterministic fan-out for crowded bar edges (ADR-0052 M5): when several relationship ends
 * attach to the SAME bar edge (e.g. many FS successors springing from one finish, or many
 * predecessors landing on one start), spread them vertically by {@link FAN_OUT_STEP_PX}, centred
 * on the bar's centreline and capped at ±{@link FAN_OUT_MAX_PX}, so the links don't overdraw
 * into one unreadable bundle. Ends group by the bar edge their type anchors to (FS/FF pred ends
 * at the predecessor's finish, SS/SF at its start; FS/SS succ ends at the successor's start,
 * FF/SF at its finish — the same mapping the anchors use), and members order by **edge id**
 * (falling back to the `(pred, succ, type)` triple for id-less edges), so the layout is stable
 * across frames AND across input-array permutations — no jitter, ever. A group of one gets no
 * offset (and is omitted from the map), so an uncrowded diagram — the common zero-lag FS chain —
 * is byte-for-byte unmoved. O(edges) grouping + a per-group sort; one map per frame.
 */
export function computeEdgeFanOut(
  edges: readonly RenderEdge[],
): ReadonlyMap<RenderEdge, FanOutOffsets> {
  const keyOf = (e: RenderEdge): string =>
    e.id ?? `${e.predecessorId}\u0000${e.successorId}\u0000${e.type}`;
  const groups = new Map<string, { edge: RenderEdge; end: 'pred' | 'succ' }[]>();
  const add = (groupKey: string, edge: RenderEdge, end: 'pred' | 'succ'): void => {
    const members = groups.get(groupKey);
    if (members) members.push({ edge, end });
    else groups.set(groupKey, [{ edge, end }]);
  };
  for (const edge of edges) {
    add(
      `${edge.predecessorId}:${edge.type === 'FS' || edge.type === 'FF' ? 'F' : 'S'}`,
      edge,
      'pred',
    );
    add(
      `${edge.successorId}:${edge.type === 'FS' || edge.type === 'SS' ? 'S' : 'F'}`,
      edge,
      'succ',
    );
  }
  const offsets = new Map<RenderEdge, FanOutOffsets>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((x, y) => {
      const kx = keyOf(x.edge);
      const ky = keyOf(y.edge);
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
    const mid = (members.length - 1) / 2;
    for (let i = 0; i < members.length; i += 1) {
      const raw = (i - mid) * FAN_OUT_STEP_PX;
      const off = Math.max(-FAN_OUT_MAX_PX, Math.min(FAN_OUT_MAX_PX, raw));
      if (off === 0) continue;
      const member = members[i]!;
      const current = offsets.get(member.edge) ?? { pred: 0, succ: 0 };
      current[member.end] = off;
      offsets.set(member.edge, current);
    }
  }
  return offsets;
}

/** A lag run: the horizontal on-bar segment between a bar edge and its walked lag anchor. */
export interface LagRun {
  from: Point;
  to: Point;
}

/**
 * The **lag run** for a lagged relationship (ADR-0052 M5): the horizontal segment between the
 * walked end's zero-lag bar edge and its time-true anchor — the stretch of bar the lag "waits"
 * across (the GPM embed for SS/SF; the pre-constraint portion of the successor for FS/FF). The
 * painter draws it as a subtle dashed hairline over the bar so lag reads as waiting time, not
 * just displacement. Null when there is nothing to depict: zero lag, the anchor clamped/landing
 * exactly on the edge, or missing geometry. Shares {@link lagAnchorPoints} (the ONE forward
 * mapping), so the run can never disagree with where the anchor is drawn.
 */
export function lagRunSegment(
  predecessor: RenderActivity,
  successor: RenderActivity,
  type: DependencyType,
  lagDays: number,
  view: Viewport,
  dataDateIso: string,
  walk: DayWalk,
  cache?: RectCache,
): LagRun | null {
  if (lagDays === 0) return null;
  const anchors = lagAnchorPoints(
    predecessor,
    successor,
    type,
    lagDays,
    view,
    dataDateIso,
    walk,
    cache,
  );
  if (!anchors) return null;
  if (type === 'FS' || type === 'FF') {
    // The walked (offset) end is the successor's; its zero-lag edge is the constrained one.
    const rect = activityRect(successor, view, dataDateIso, cache);
    if (!rect) return null;
    const edgeX = type === 'FS' ? rect.x : rect.x + rect.w;
    if (anchors.succ.x === edgeX) return null;
    return { from: { x: edgeX, y: anchors.succ.y }, to: anchors.succ };
  }
  // SS/SF embed along the predecessor from its start edge.
  const rect = activityRect(predecessor, view, dataDateIso, cache);
  if (!rect) return null;
  if (anchors.pred.x === rect.x) return null;
  return { from: { x: rect.x, y: anchors.pred.y }, to: anchors.pred };
}

/**
 * The activity ids whose incident links the painter highlights (ADR-0052 M5): the persistent
 * **selection** (the keyboard/AT-reachable state — WCAG 2.1.1) plus the transient idle **hover**
 * (editing surfaces only, published like the M4 hover ring). Null when neither is set, so the
 * painter skips the highlight passes entirely on an idle scene.
 */
export function linkHighlightIds(
  selectedId: string | null | undefined,
  hoverId: string | null | undefined,
): ReadonlySet<string> | null {
  if (!selectedId && !hoverId) return null;
  const ids = new Set<string>();
  if (selectedId) ids.add(selectedId);
  if (hoverId) ids.add(hoverId);
  return ids;
}

/** True when the edge touches (is incident to) any of the highlight ids — the pure predicate the
 * painter partitions its edge passes with (ADR-0052 M5). */
export function edgeTouches(edge: RenderEdge, ids: ReadonlySet<string>): boolean {
  return ids.has(edge.predecessorId) || ids.has(edge.successorId);
}

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
