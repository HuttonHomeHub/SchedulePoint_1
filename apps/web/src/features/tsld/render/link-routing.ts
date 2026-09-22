import type { DependencyType } from '@repo/types';

import {
  activityRect,
  screenXOfDay,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './geometry';
import { daysBetween, lagAnchorDay, type DayWalk } from './working-time';

/**
 * **Link routing** (ADR-0078 S8; ADR-0065 for the corridors themselves).
 *
 * The orthogonal polylines that carry dependencies between bars, the per-lane interval index they
 * step around, corridor bundling, fan-out, arrowheads and the GPM lag anchors.
 *
 * Extracted from `render-model.ts`, which had grown to 1,727 lines. It imports the geometry core
 * and **never the barrel** — `render-model.ts` re-exports this module, so an import back would be
 * the cycle `docs/TECH_DEBT.md` #106 was about. `geometry-is-a-leaf.structural.test.ts` pins the
 * core's half of that; this module's half is that it names `./geometry` and not `./render-model`.
 *
 * `link-routing.test.ts` has imported these ten symbols from `./render-model` since it was written
 * — a test named for a module that did not exist, which ADR-0078 called out as a small live piece
 * of misinformation. It now imports them from here.
 */
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

/**
 * The elbow's clearance from a bar edge, in CSS px.
 *
 * Exported because {@link chooseCorridorsByCrossing} needs the same quantity to build its candidate
 * offsets, and two copies of this expression would drift apart in the one place a reader could
 * never see it: a corridor that moved by a different step than the one the router would have
 * considered.
 */
export function corridorGap(view: Viewport): number {
  return Math.min(12, Math.max(4, view.pxPerDay));
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
  const gap = corridorGap(view);
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
  /**
   * **In SCREEN space, which means ADDING `view.originY`, not subtracting it.**
   *
   * `from.y` and `to.y` arrive already in screen space, and `screenYOfLane` — the function that
   * defines it — is `view.originY + laneIndex * LANE_HEIGHT`. This expression subtracted instead,
   * so the leg landed `2 x originY` away from the gutter it names. `originY` is never zero in the
   * shipped product (40 on first paint, 32 after Fit, accumulating negative after any downward
   * pan), so at rest the leg was 64 px out and panned ~34 lanes down it was ~1,920 px out — the
   * line left the canvas and came back, which is exactly what a planner reported seeing.
   *
   * It survived because the only two exercises of this path both pinned `originY: 0` — the single
   * value at which the two signs agree — and the unit case asserted the route's shape rather than
   * the leg's value. Both are fixed in `link-routing.test.ts`.
   *
   * The pitch stays the INJECTED `obstacles.laneHeight` rather than becoming a `screenYOfLane`
   * call: the two are the same value at the one real call site (`paint.ts:1185-1190` passes
   * `LANE_HEIGHT`), and the parameter exists so this module does not depend on that constant.
   * Swapping it would be a second change riding along with a one-character fix.
   */
  const gutterY =
    view.originY +
    (gutterLane + 1) * obstacles.laneHeight -
    (obstacles.laneHeight - obstacles.barHeight) / 2;
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

// ── Crossing-aware corridor choice (diagram-legibility M-C3) ─────────────────────────────────────

/** How far either side of its current x a corridor may be moved, in `corridorGap` multiples. */
const CORRIDOR_OFFSETS = [1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8] as const;
const EPS = 0.001;

/** `true` iff every value in the sorted array strictly before `x` … (an upper bound by binary search). */
function countBelow(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A frozen picture of every horizontal segment on screen, indexed by y for containment counting.
 *
 * **Frozen is the load-bearing word.** The pass below moves corridors, and moving a corridor moves
 * the two horizontals attached to it — so a chooser that re-read the geometry as it went would be
 * measuring its own output, which is ADR-0090's recorded oscillation with a different subject. The
 * snapshot is taken once, every decision is made against it, and no decision is ever re-evaluated.
 */
interface SegmentIndex {
  /** Sorted distinct positions on the segments' FIXED axis (y for horizontals, x for verticals). */
  readonly at: number[];
  /** Per position, the segment starts and ends on the other axis, each sorted. */
  readonly spans: Map<number, { starts: number[]; ends: number[] }>;
}

interface Snapshot {
  readonly horizontals: SegmentIndex;
  readonly verticals: SegmentIndex;
}

function emptyIndex(): { at: number[]; spans: Map<number, { starts: number[]; ends: number[] }> } {
  return { at: [], spans: new Map() };
}

function push(
  index: { spans: Map<number, { starts: number[]; ends: number[] }> },
  at: number,
  lo: number,
  hi: number,
): void {
  const bucket = index.spans.get(at) ?? { starts: [], ends: [] };
  bucket.starts.push(lo);
  bucket.ends.push(hi);
  index.spans.set(at, bucket);
}

function seal(index: {
  at: number[];
  spans: Map<number, { starts: number[]; ends: number[] }>;
}): SegmentIndex {
  for (const bucket of index.spans.values()) {
    bucket.starts.sort((p, q) => p - q);
    bucket.ends.sort((p, q) => p - q);
  }
  index.at = [...index.spans.keys()].sort((p, q) => p - q);
  return index;
}

function snapshotSegments(candidates: readonly BundleCandidate[]): Snapshot {
  const horizontals = emptyIndex();
  const verticals = emptyIndex();
  for (const candidate of candidates) {
    const line = candidate.line;
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) {
        push(horizontals, a.y, Math.min(a.x, b.x), Math.max(a.x, b.x));
      } else if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) {
        push(verticals, a.x, Math.min(a.y, b.y), Math.max(a.y, b.y));
      }
    }
  }
  return { horizontals: seal(horizontals), verticals: seal(verticals) };
}

/**
 * How many snapshot segments a segment at `fixed`, spanning `(lo, hi)` on the other axis, crosses.
 *
 * Only positions strictly inside the span can be crossed: a segment meeting this one at an endpoint
 * is its own elbow, or another link's segment meeting it at a shared anchor — and ADR-0065's
 * fan-out puts many of those on one bar edge **by design**. Strict interiority also excludes a
 * link's own segments structurally (they meet at its elbows), so this needs no owner bookkeeping.
 */
function crossingsOf(index: SegmentIndex, fixed: number, from: number, to: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let total = 0;
  for (let i = countBelow(index.at, lo + EPS); i < index.at.length; i += 1) {
    const position = index.at[i]!;
    if (position >= hi - EPS) break;
    const bucket = index.spans.get(position)!;
    total += countBelow(bucket.starts, fixed - EPS) - countBelow(bucket.ends, fixed + EPS);
  }
  return total;
}

/**
 * Move each vertical corridor to the candidate x it crosses the fewest other lines at, **in place**.
 *
 * ## Why this exists
 *
 * `routeOrthogonal` chooses a corridor for what it **hits** — a bar in a lane it passes through —
 * and has never had an opinion about what it **crosses**. The product owner's complaint was about
 * crossings ("the logic lines cross each other, which in NetPoint they rarely do"), and
 * `docs/specs/diagram-legibility/part-c-m-c0.md` measured that the obvious remedy is not height: at
 * the two zooms a planner works at, spreading Unit 300 over 144 rows instead of 21 changes
 * crossings per link by under half a per cent, while a bad assignment at constant height changes it
 * by 2.7×. So the levers are assignment and corridor choice, and this is the corridor half — at
 * **zero** vertical cost, which is why it is sequenced before the layout rule.
 *
 * ## The four properties, in the order they matter
 *
 * 1. **It measures a frozen snapshot, never its own output.** See {@link snapshotHorizontals}.
 * 2. **It never undoes the routing.** A corridor moves only to an x that is free of bars across
 *    every lane it crosses — the same `isLaneFreeAt` test `routeOrthogonal` applies — so this
 *    cannot snap an obstacle-avoiding corridor back through the bar ADR-0065 M2 moved it off. That
 *    is the same hazard {@link bundleCorridors} records, and it is checked the same way.
 * 3. **It moves only on a strict improvement**, and the candidate order is fixed, so the same frame
 *    always produces the same lines. A route that varies between frames reads as the diagram
 *    twitching (ADR-0065), and a tie is not a reason to abandon the line the router chose.
 * 4. **It moves the line only.** Lag anchors, their drag handles and their hit zones are computed
 *    before this runs and are not passed in — {@link bundleCorridors}'s structural property,
 *    inherited by taking the same argument.
 *
 * Bounded: four candidate offsets per corridor, and each is costed over the lanes that corridor
 * crosses rather than over the plan. Returns the number of corridors moved, so a test can assert it
 * did something rather than assert the absence of a change it never attempted.
 */
export function chooseCorridorsByCrossing(
  candidates: readonly BundleCandidate[],
  index: LaneIntervalIndex,
  gap: number,
): number {
  if (candidates.length < 2) return 0;
  const snapshot = snapshotSegments(candidates);

  let moved = 0;
  for (const candidate of candidates) {
    /**
     * **Adjacent lanes are NOT skipped here, and that single decision is most of the result.**
     *
     * `routeOrthogonal` returns today's elbow unexamined when `crossedLanes` is empty, because it
     * is answering "could this corridor hit a bar?" and the answer is no. This pass answers a
     * different question — "what does this corridor cross?" — and a one-lane hop crosses other
     * links just as readily. On Unit 300 **115 of 188 links are one lane apart or less**, so
     * inheriting that early return excluded 61 % of the diagram: measured, the pass was worth
     * −4.1 % with the skip and **−20.8 % without it**.
     *
     * The bar check below then does the right thing for free: an empty lane list makes
     * `Array.every` vacuously true, which is correct — there is no intermediate lane to hit.
     */
    const lanes = crossedLanes(candidate.fromLane, candidate.toLane);
    const line = candidate.line;
    // Only the plain four-point elbow is moved. A six-point VHV route was produced because NO
    // single corridor was clear (`routeOrthogonal`'s last structured attempt), so there is nothing
    // here to improve on and moving one of its two legs would be re-deciding that search from the
    // outside with less information than it had.
    if (line.length !== 4) continue;
    const from = line[0]!;
    const elbow = line[1]!;
    const to = line[3]!;

    /**
     * **The whole line, not just the corridor.** Moving the elbow moves the two horizontals
     * attached to it, and an objective that counted only the vertical would trade one crossing for
     * two elsewhere — measured: corridor-only scoring made Unit 300 very slightly WORSE
     * (2.612 → 2.622 per link), which is how this came to count all three segments.
     *
     * The snapshot is frozen, so the two horizontals other links see are the ones they had before
     * this pass ran. Re-snapshotting after every move was measured as well and is worth a further
     * 1.2 % for an O(N²) rebuild — declined, and recorded rather than left as an open idea.
     */
    const score = (x: number): number =>
      crossingsOf(snapshot.horizontals, x, from.y, to.y) +
      crossingsOf(snapshot.verticals, from.y, from.x, x) +
      crossingsOf(snapshot.verticals, to.y, x, to.x);

    const current = score(elbow.x);
    if (current === 0) continue; // nothing to improve, and a move could only make it worse

    /**
     * Two families, because they answer different questions and the measurement says both earn
     * their place (Unit 300, whole-plan crossings per link, 2.612 baseline):
     *
     * - **Offsets from the elbow** — "shift it a little" — reach 2.117 on their own (−18.9 %).
     * - **Positions relative to the ENDPOINTS** — "run it beside the successor's start instead of
     *   the predecessor's finish", "run it down the middle" — take that to **2.037 (−22.0 %)**.
     *
     * Sampling the whole span at sixteen points instead was measured too and buys 0.2 % more, so
     * it is not done: a corridor at an arbitrary fraction of the span has nothing to say for
     * itself, and this list is one a reader can justify line by line.
     */
    const anchored = [
      (from.x + to.x) / 2,
      to.x - gap,
      from.x + gap,
      (from.x + to.x * 3) / 4,
      (from.x * 3 + to.x) / 4,
    ];
    let bestX = elbow.x;
    let best = current;
    for (const x of [...CORRIDOR_OFFSETS.map((step) => elbow.x + step * gap), ...anchored]) {
      if (!lanes.every((lane) => isLaneFreeAt(index, lane, x))) continue;
      const count = score(x);
      if (count < best) {
        best = count;
        bestX = x;
      }
    }
    if (bestX === elbow.x) continue;
    line[1] = { x: bestX, y: from.y };
    line[2] = { x: bestX, y: to.y };
    moved += 1;
  }
  return moved;
}
