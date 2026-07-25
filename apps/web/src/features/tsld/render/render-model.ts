import type { ActivityType, DependencyType, LagCalendarSource } from '@repo/types';

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
  type: DependencyType,
  view: Viewport,
  dataDateIso: string,
): Point[] | null {
  const from = activityRect(predecessor, view, dataDateIso);
  const to = activityRect(successor, view, dataDateIso);
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
 */
function routeOrthogonal(from: Point, to: Point, type: DependencyType, view: Viewport): Point[] {
  if (from.y === to.y) return [from, to];
  // The vertical elbow sits clear of the anchored edges: just outside a finish edge (right) or a
  // start edge (left) so the line doesn't cut back across either bar; SF spans, so split the middle.
  const gap = Math.min(12, Math.max(4, view.pxPerDay));
  const elbow =
    type === 'FS'
      ? from.x + gap
      : type === 'SS'
        ? Math.min(from.x, to.x) - gap
        : type === 'FF'
          ? Math.max(from.x, to.x) + gap
          : (from.x + to.x) / 2; // SF
  return [from, { x: elbow, y: from.y }, { x: elbow, y: to.y }, to];
}

// ── Time-true lag anchoring + arrowheads (ADR-0052 M1, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ──

/**
 * Walk `n` days from a day offset and return the day offset reached. The working-day variant
 * counts working days (a lead — negative `n` — walks left); the elapsed variant is plain addition.
 * Injected into the anchor geometry so the render model stays free of calendar/CPM logic — the
 * caller builds it from the plan's working-day predicate (the same seam the non-working wash uses).
 */
export type DayWalk = (dayOffset: number, n: number) => number;

/** The outward walk bound (days), mirroring `SNAP_HORIZON_DAYS` — a pathological all-non-working
 * calendar falls back to an elapsed walk rather than scanning forever. */
export const WALK_HORIZON_DAYS = 366;

/** The elapsed-calendar-day walk — a `TWENTY_FOUR_HOUR` lag is elapsed time, not working time
 * (ADR-0036 §6), so its anchor offset is plain day addition. */
export const ELAPSED_DAY_WALK: DayWalk = (dayOffset, n) => dayOffset + n;

/**
 * Build the working-day {@link DayWalk} for a plan calendar: the day reached after consuming `n`
 * working days from `dayOffset`, always landing on a working day (so a lag anchor never sits on a
 * weekend). Memoised — an edge-dense frame re-asks the same walks — and bounded: if the scan
 * exhausts the horizon (no working day found) it falls back to the elapsed result, never hanging
 * (the `snapToWorkingDay` contract).
 */
export function makeWorkingDayWalk(
  isWorkingDay: (dayOffset: number) => boolean,
  horizon = WALK_HORIZON_DAYS,
): DayWalk {
  const memo = new Map<string, number>();
  return (dayOffset, n) => {
    const key = `${dayOffset}:${n}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    // Any sane calendar has a working day within a week, so |n| working days lie within ~7|n|
    // days; the horizon on top guards the pathological calendar.
    const bound = horizon + Math.abs(n) * 7;
    const step = n < 0 ? -1 : 1;
    const target = Math.abs(n);
    let day = n < 0 ? dayOffset - 1 : dayOffset;
    let seen = 0;
    let result: number | null = null;
    for (let i = 0; i <= bound; i += 1, day += step) {
      if (n >= 0) {
        // Forward: consume `n` working days strictly before the landing day, then land working.
        if (seen === target && isWorkingDay(day)) {
          result = day;
          break;
        }
        if (isWorkingDay(day)) seen += 1;
      } else {
        // Backward: the landing day itself is the last of the `|n|` working days walked over.
        if (isWorkingDay(day)) seen += 1;
        if (seen === target) {
          result = day;
          break;
        }
      }
    }
    const value = result ?? dayOffset + n;
    memo.set(key, value);
    return value;
  };
}

/**
 * The day offset a relationship's lag anchor sits at for a given signed lag — the ONE forward
 * mapping shared by the render path ({@link lagAnchorPoints}) and the drag path's inverse
 * ({@link lagFromAnchorDay}), so the picture and the gesture can never disagree (ADR-0052 M3).
 * `predStartDay`/`predFinishDay` are the predecessor bar's inclusive whole-day span:
 *
 * - **FS** — the lag runs from the day after the predecessor's inclusive finish.
 * - **FF** — likewise from the finish, but the anchor marks the constrained successor *finish*,
 *   whose inclusive day converts to the `+1` right edge.
 * - **SS/SF** — the lag embeds along the predecessor bar from its start (the GPM embed point).
 */
export function lagAnchorDay(
  predStartDay: number,
  predFinishDay: number,
  type: DependencyType,
  lagDays: number,
  walk: DayWalk,
): number {
  if (type === 'FS') return walk(predFinishDay + 1, lagDays);
  if (type === 'FF') return walk(predFinishDay, lagDays) + 1;
  return walk(predStartDay, lagDays); // SS / SF — embed along the predecessor from its start
}

/**
 * The signed lag whose anchor sits at (or nearest, snapping **toward zero**) `anchorDay` — the
 * exact inverse of {@link lagAnchorDay} over the same injected walk (ADR-0052 M3: the lag drag
 * reads and writes against the render mapping, one source of truth). Because the walk is strictly
 * monotone in the lag, `lagFromAnchorDay(lagAnchorDay(n)) === n` for every integer `n`; a pointer
 * day that falls between two valid anchor days (a non-working day) snaps to the nearer-zero lag,
 * so `lagAnchorDay(lagFromAnchorDay(x))` is the snapped anchor. Horizon-bounded like the walk
 * itself: a pathological calendar falls back to the elapsed difference, never hanging.
 */
export function lagFromAnchorDay(
  predStartDay: number,
  predFinishDay: number,
  type: DependencyType,
  anchorDay: number,
  walk: DayWalk,
  horizon = WALK_HORIZON_DAYS,
): number {
  const at = (n: number): number => lagAnchorDay(predStartDay, predFinishDay, type, n, walk);
  const base = at(0);
  if (anchorDay === base) return 0;
  const dir = anchorDay > base ? 1 : -1;
  let n = 0;
  for (let i = 0; i < horizon; i += 1) {
    const next = at(n + dir);
    // Walked past the pointer day without landing on it → the pointer sits between two valid
    // anchors; keep the nearer-zero lag (snap toward zero).
    if (dir > 0 ? next > anchorDay : next < anchorDay) return n;
    n += dir;
    if (next === anchorDay) return n;
  }
  // Horizon exhausted (pathological calendar) — the elapsed difference, the walk's own fallback.
  return anchorDay - lagAnchorDay(predStartDay, predFinishDay, type, 0, ELAPSED_DAY_WALK);
}

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
): LagAnchors | null {
  const from = activityRect(predecessor, view, dataDateIso);
  const to = activityRect(successor, view, dataDateIso);
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
): Point[] | null {
  const anchors = lagAnchorPoints(predecessor, successor, type, lagDays, view, dataDateIso, walk);
  if (!anchors) return null;
  return routeOrthogonal(anchors.pred, anchors.succ, type, view);
}

/** Arrowhead length (px) along the final segment; the head is the same width across. */
export const ARROWHEAD_PX = 5;

/**
 * The three vertices of the directional arrowhead at a polyline's successor end (ADR-0052): the
 * tip is the last point, the two barbs sit `size` back along the final non-degenerate segment,
 * half a `size` either side of it. Pure vertex math — the painter batches the fills. Null for a
 * degenerate line (fewer than two distinct points), where no direction exists.
 */
export function arrowhead(
  points: readonly Point[],
  size = ARROWHEAD_PX,
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
    const half = size / 2;
    return [
      { x: tip.x, y: tip.y },
      { x: baseX - uy * half, y: baseY + ux * half },
      { x: baseX + uy * half, y: baseY - ux * half },
    ];
  }
  return null;
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

/** Half-width (px) of the grab zone around a drawn lag anchor (ADR-0052 M3). Kept as small as the
 * bar-end zones ({@link EDGE_HANDLE_PX}) so a crowded bar isn't swallowed; the same lag is settable
 * exactly through the dependency dialog (Enter on the listbox → Logic), so the pointer zone falls
 * under WCAG 2.5.8's Equivalent exception, like the edge handles. */
export const LAG_ANCHOR_PX = 8;

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
    const byId = new Map(activities.map((a) => [a.id, a]));
    const offsetEdges = edges
      .filter((e) => e.id !== undefined && (e.lagDays ?? 0) !== 0)
      .sort((a, b) => (a.id! < b.id! ? -1 : 1));
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
