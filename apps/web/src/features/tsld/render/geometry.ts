/**
 * **The TSLD render model's geometry core** (ADR-0078 §3, `docs/TECH_DEBT.md` #106).
 *
 * Constants, coordinate transforms, the shapes (`Rect`/`Point`/`Size`/`Viewport`), the render types
 * and `activityRect` with its per-frame `RectCache` — everything the scene is measured in.
 *
 * **Why this is its own module rather than a section of the barrel.** `render-model.ts` re-exports
 * `link-routing`, and link routing needs `activityRect`, `screenXOfDay` and `BAR_HEIGHT` back from
 * `render-model`. That is a genuine import cycle. ES modules tolerate cycles at runtime, so it
 * compiles, the suite passes, and the defect is invisible until an initialisation order changes
 * under you — which is exactly why ADR-0078 says nothing after S8 may be built on it. The core
 * being a **leaf** is what makes the barrel able to hold nothing but re-exports.
 *
 * Nothing here imports from `render-model.ts`, and nothing here may. That is the whole contract.
 */
import type { ActivityType, DependencyType, LagCalendarSource } from '@repo/types';

import { daysBetween } from './working-time';

import type { ConstraintAnchor } from '@/lib/constraint-format';

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
 * The ids of the activities whose geometry intersects a screen-space rectangle — the **one**
 * predicate a marquee sweep and a shift-click span both resolve through
 * (`docs/specs/canvas-multi-select/` M2-T2).
 *
 * One function rather than two call sites doing their own overlap arithmetic, and a structural test
 * pins that: a marquee and a span that disagreed about whether a bar is inside a rectangle would be
 * a defect nobody could see, because each gesture looks correct in isolation and only a planner who
 * swept and shift-clicked the same region would ever notice one caught a bar the other missed.
 *
 * Order follows `activities`, not the sweep — a selection's order is "the order they were added",
 * and for a batch gesture that means the plan's own order, which is stable across repeats.
 *
 * A milestone is a zero-**duration** diamond but not a zero-**area** rect ({@link activityRect}
 * returns its bounding box), so it is caught like any bar. An activity with no computed dates has no
 * geometry and cannot be swept, which is the same rule the painter and the cull already follow.
 */
export function idsIntersecting(
  activities: readonly RenderActivity[],
  rect: Rect,
  view: Viewport,
  dataDateIso: string,
  cache?: RectCache,
): string[] {
  // A zero-area rectangle — a click that never moved — touches nothing. `rectsIntersect` is a
  // strict overlap test and would already say so; this is here to make the intent explicit rather
  // than incidental, because "a sweep over nothing clears the selection" is a decision.
  if (rect.w <= 0 || rect.h <= 0) return [];
  const hits: string[] = [];
  for (const activity of activities) {
    const bar = activityRect(activity, view, dataDateIso, cache);
    if (bar && rectsIntersect(bar, rect)) hits.push(activity.id);
  }
  return hits;
}

/**
 * Normalise a drag's two corners into a positive-extent rectangle. A marquee dragged up-and-left is
 * the same rectangle as one dragged down-and-right, and every consumer downstream — the painter,
 * {@link idsIntersecting} — assumes non-negative `w`/`h`.
 */
export function rectFromCorners(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
