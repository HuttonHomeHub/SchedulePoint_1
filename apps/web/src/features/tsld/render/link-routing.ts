import type { DependencyType } from '@repo/types';

import {
  activityRect,
  axisDayOf,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  screenXOfDay,
  type Viewport,
} from './geometry';
import { lagAnchorDay, type DayWalk } from './working-time';

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

/**
 * Is the closed screen-x interval `[from, to]` clear of every bar in `lane`?
 *
 * **ONE predicate** (logic-legibility M0-T1 step 4): a point and a span are the same question, so
 * the occlusion instrument (`scripts/crossing-probe.ts`) asks it once. The corridor router that
 * also used it was retired by node-to-node links M2, which scores against `link-score.ts`'s glyph
 * index instead; this stays because the instrument still reads it.
 *
 * **Containment is CLOSED at both ends.** A closed interval means a leg that merely TOUCHES a bar's edge
 * counts as blocked, which is deliberate and is not the same question as whether it is occluded:
 * every link's own anchor sits on its own bar's edge by construction, so a caller measuring
 * occlusion owes an endpoint rule of its own. It cannot be bought here with an epsilon, because an
 * `SF` corridor at `(from.x + to.x) / 2` can fall well INSIDE either bar and a clamped lag anchor is
 * put on the bar deliberately (`lagAnchorPoints`), so neither is near an edge.
 *
 * Binary search over the merged spans: find any span whose start is `<= to`, then test it.
 */
export function isLaneFreeBetween(
  index: LaneIntervalIndex,
  lane: number,
  from: number,
  to: number,
): boolean {
  const lane_ = index.get(lane);
  if (!lane_) return true;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const spans = lane_.spans;
  // Spans are sorted by start and merged, so the only candidate is the last one starting at or
  // before `hi`; anything earlier ends before it (merging is what guarantees that) and anything
  // later starts after it.
  let left = 0;
  let right = spans.length - 1;
  let candidate = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (spans[mid]![0] <= hi) {
      candidate = mid;
      left = mid + 1;
    } else right = mid - 1;
  }
  if (candidate === -1) return true;
  return spans[candidate]![1] < lo;
}

/**
 * How much of the screen-x interval `[from, to]` lies inside a bar in `lane`, in pixels?
 *
 * **Deliberately OPEN where {@link isLaneFreeBetween} is closed, and the two conventions answer
 * different questions about the same bars.** The router asks *may I draw a line here?* — a corridor
 * sitting on a bar's edge is drawn on the bar and is unusable, so touching counts as blocked. This
 * asks *is this line hidden by a bar?* — a line that merely touches an edge hides nothing, and
 * every link's horizontal leg starts on its own bar's edge by construction, so a closed test
 * reports every link in the plan as occluded by itself.
 *
 * That is measured rather than argued: the first reading taken with the closed predicate reported
 * **100 % of Unit 300's links occluded with 391 of 395 incidents self-anchored**, which is the
 * artefact and not the picture. Both functions read the same `laneIntervalIndex`, so they cannot
 * disagree about where a bar IS; only about whether an edge counts, which is the caller's question.
 *
 * A length rather than a boolean, because a leg buried forty pixels inside a bar and one grazing it
 * for half a pixel are not the same defect, and the caller owns the threshold.
 */
export function laneOverlapBetween(
  index: LaneIntervalIndex,
  lane: number,
  from: number,
  to: number,
): number {
  const lane_ = index.get(lane);
  if (!lane_) return 0;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const spans = lane_.spans;
  // The first span that could contribute is the first whose END lies beyond `lo`; spans are sorted
  // by start and merged, so from there they are walked until one starts at or after `hi`.
  let left = 0;
  let right = spans.length - 1;
  let first = spans.length;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (spans[mid]![1] > lo) {
      first = mid;
      right = mid - 1;
    } else left = mid + 1;
  }
  let total = 0;
  for (let i = first; i < spans.length && spans[i]![0] < hi; i += 1) {
    total += Math.min(hi, spans[i]![1]) - Math.max(lo, spans[i]![0]);
  }
  return total;
}

/**
 * How much of a bar a leg may overlap before it counts as running through it, in CSS px.
 *
 * Half a pixel: the question is whether a reader loses the line, and a sub-pixel graze is a
 * rounding artefact rather than an occlusion. It is the same tolerance the measurement harness
 * uses, for the same reason.
 */
export const LEG_CLEARANCE_PX = 0.5;

/**
 * The elbow's clearance from a bar edge, in CSS px.
 *
 * Used by the legacy elbow ({@link routeOrthogonal}), which draws every link while node-to-node
 * routing is off (`scene.linkRouting`).
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
): Point[] {
  if (from.y === to.y) return [from, to];
  // The vertical elbow sits clear of the anchored edges: just outside a finish edge (right) or a
  // start edge (left) so the line doesn't cut back across either bar; SF spans, so split the middle.
  const gap = corridorGap(view);
  const shift = elbowShift === 0 ? 0 : Math.max(-(gap - 1), Math.min(gap - 1, elbowShift));
  const elbow =
    type === 'FS'
      ? from.x + gap + shift
      : type === 'SS'
        ? Math.min(from.x, to.x) - gap - shift
        : type === 'FF'
          ? Math.max(from.x, to.x) + gap + shift
          : (from.x + to.x) / 2 + shift; // SF
  return [from, { x: elbow, y: from.y }, { x: elbow, y: to.y }, to];
}

/** One routed line, with the lanes its ends sit in — what {@link packGutterChannels} reads. */
export interface BundleCandidate {
  line: Point[];
  fromLane: number;
  toLane: number;
}

// ── Gutter channels (logic-legibility M1) ───────────────────────────────────────────────────────

/**
 * How far apart two channels sit in a gutter, in CSS px.
 *
 * Three, the same step {@link FAN_OUT_STEP_PX} uses, because the question is the same one: how far
 * apart must two parallel lines be before a reader sees two lines? It is NOT a capacity — capacity
 * is derived from the geometry in {@link gutterChannels}, so a thinner bar widens the band and
 * yields more channels with no edit here.
 */
export const GUTTER_CHANNEL_PITCH_PX = 3;

/**
 * The channel offsets available in a gutter, **derived from the band and ordered centre-out**.
 *
 * Takes the usable **half-band in px**, one number, rather than the lane and bar heights it took
 * at M1 — and the change is a correction rather than a tidy-up. **M1's own docblock predicted that
 * a NetPoint-thin 5 px bar would give "+/- 10 px and 7 channels, with nothing here changed", and
 * M3-T3 falsified it**: the band a thin bar hands back is exactly where the row's name and date
 * rows now live, so the raw pad stopped being the clear space the moment the row carried text.
 * Deriving capacity from `(laneHeight, barHeight)` would have claimed seven channels through the
 * middle of a label.
 *
 * The caller passes {@link RowSlots.clearHalfBandPx}, which knows what the row spends. One pixel
 * comes off inside each end here, which is what makes "a channel never enters what bounds it" true
 * rather than nearly true.
 *
 * Centre-out, so a gutter carrying one run draws it on the boundary — the tidiest answer — and the
 * picture degrades gracefully as a gutter fills rather than starting off-centre.
 */
export function gutterChannels(clearHalfBandPx: number): number[] {
  const usable = Math.max(0, clearHalfBandPx - 1);
  const steps = Math.floor(usable / GUTTER_CHANNEL_PITCH_PX);
  const offsets = [0];
  for (let k = 1; k <= steps; k += 1) {
    offsets.push(-k * GUTTER_CHANNEL_PITCH_PX, k * GUTTER_CHANNEL_PITCH_PX);
  }
  return offsets;
}

/**
 * Spread the frame's gutter runs across channels so two runs sharing a gutter sit at different y
 * **where they overlap in x**, in place. Returns the number of runs moved.
 *
 * ## Why this cannot live inside `routeOrthogonal`
 *
 * That function sees one link. Whether two runs need different channels is a question about the
 * whole frame — the same reason ADR-0065 M3 moved bundling out of the draw passes, and the reason
 * ADR-0149 D3 could measure **13 legs on a single y, identically at pitch 28, 36 and 44**:
 * `gutterY` has no per-link term, so no pitch can separate them and only a pass over all of them
 * can.
 *
 * ## Four properties, in the order they matter
 *
 * 1. **It never measures its own output.** Channels are assigned against x-intervals that are
 *    already final, which is why it runs LAST — after node-to-node routing's phase 2
 *    (`chooseRoutesByCrossing`), which chooses each link's shape and therefore the x-extent of its
 *    gutter run. Running it earlier would pack against runs that then change, which is ADR-0090's
 *    recorded oscillation with a third subject.
 * 2. **It moves y only.** Lag anchors, drag handles and hit zones keep today's geometry — they are
 *    computed before this runs and are not passed in. Structural, not remembered: the
 *    {@link BundleCandidate} argument shape cannot reach them.
 * 3. **It is deterministic and permutation-independent.** Runs are sorted by (gutter y, left x,
 *    right x, candidate index) — a total order over the geometry, never the order `scene.edges`
 *    happened to arrive in, which is a server response. A channel that varied between frames would
 *    move a line while the viewport stood still.
 * 4. **Surplus spreads to the LEAST-LOADED channel, never into a bar.** A gutter carrying more
 *    simultaneous runs than it has channels cannot separate them all; the rest go to whichever
 *    channel already carries the fewest runs overlapping them, so the excess is shared evenly
 *    rather than piled on one line. That is not tidiness — FC-L3's second limb asks for
 *    `max legs on one y <= ceil(peak overlap / channels)`, and dumping every surplus run on one
 *    offset misses it by the whole surplus. Either way the run stays inside the clear band, which
 *    is the property that must not be traded for a cosmetic gain.
 */
export function packGutterChannels(
  candidates: readonly BundleCandidate[],
  clearHalfBandPx: number,
  /** Whether a y is a lane boundary: the gutter datum (ADR-0150). */
  isGutter: (y: number) => boolean,
): number {
  const offsets = gutterChannels(clearHalfBandPx);
  if (offsets.length < 2) return 0;

  // A gutter run is the horizontal leg of a VHV route, found by geometry: any interior horizontal
  // segment lying on a lane boundary. Its y is a lane boundary by construction, so grouping by that
  // y groups by gutter.
  type Run = { candidate: number; at: number; y: number; x0: number; x1: number };
  const runs: Run[] = [];
  candidates.forEach((candidate, c) => {
    const line = candidate.line;
    const at: number[] = [];
    for (let i = 1; i + 2 < line.length; i += 1) {
      if (line[i]!.y === line[i + 1]!.y && isGutter(line[i]!.y)) at.push(i);
    }
    for (const i of at) {
      const a = line[i]!;
      const b = line[i + 1]!;
      runs.push({ candidate: c, at: i, y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
    }
  });
  if (runs.length < 2) return 0;

  runs.sort((p, q) => p.y - q.y || p.x0 - q.x0 || p.x1 - q.x1 || p.candidate - q.candidate);

  let moved = 0;
  let start = 0;
  while (start < runs.length) {
    let end = start + 1;
    while (end < runs.length && runs[end]!.y === runs[start]!.y) end += 1;

    // First fit: the lowest channel whose occupants do not overlap this run in x. Occupancy is a
    // list per channel rather than a single "rightmost x", because a run may sit entirely to the
    // LEFT of one already placed there — sorting by x0 makes that rare, not impossible.
    const occupied: { x0: number; x1: number }[][] = offsets.map(() => []);
    for (let i = start; i < end; i += 1) {
      const run = runs[i]!;
      const clashesIn = (k: number): number =>
        occupied[k]!.filter((o) => o.x0 < run.x1 && o.x1 > run.x0).length;
      let channel = 0;
      let fewest = Number.POSITIVE_INFINITY;
      for (let k = 0; k < offsets.length; k += 1) {
        const clashes = clashesIn(k);
        // First fit while a channel is free; least-loaded once none is. Strict `<` keeps the search
        // stable and centre-out, so a quiet gutter still draws on the boundary.
        if (clashes === 0) {
          channel = k;
          fewest = 0;
          break;
        }
        if (clashes < fewest) {
          fewest = clashes;
          channel = k;
        }
      }
      occupied[channel]!.push({ x0: run.x0, x1: run.x1 });
      const offset = offsets[channel]!;
      if (offset === 0) continue;
      const line = candidates[run.candidate]!.line;
      line[run.at] = { x: line[run.at]!.x, y: run.y + offset };
      line[run.at + 1] = { x: line[run.at + 1]!.x, y: run.y + offset };
      moved += 1;
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
    const startDay = axisDayOf(predecessor.type, dataDateIso, predecessor.earlyStart);
    const finishDay =
      predecessor.earlyFinish === null
        ? startDay
        : axisDayOf(predecessor.type, dataDateIso, predecessor.earlyFinish);
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

/**
 * The polyline with `distance` px of length removed from its successor end, walking back across
 * corners where a final segment is shorter than that. The head of a link that ends on a node is
 * built from this (NetPoint grammar M2-T3, spec §4.13 A1): a ground-filled node painted over the
 * link's end would otherwise hide nearly all of an 8 px head. Only the head is built from it; the
 * stroked line and every routing decision keep the untouched polyline, so FC-G1 cannot see it.
 * Returns a single point when the whole line is shorter than `distance`, and `arrowhead` draws no
 * head for that, which is right: such a link lies inside the node it points at.
 */
export function trimPolylineEnd(points: readonly Point[], distance: number): Point[] {
  const out = points.slice();
  let left = distance;
  while (out.length >= 2 && left > 0) {
    const b = out[out.length - 1]!;
    const a = out[out.length - 2]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > left) {
      const t = (len - left) / len;
      out[out.length - 1] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return out;
    }
    out.pop();
    left -= len;
  }
  return out;
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

/**
 * **Fan-out is retired** (logic-legibility M3-T3, spec D10).
 *
 * `computeEdgeFanOut` spread several link ends sharing one bar edge apart by `FAN_OUT_STEP_PX`,
 * capped at `FAN_OUT_MAX_PX`, so a crowded edge did not collapse into one unreadable bundle. Its
 * justification was written as a comment — _"BAR_HEIGHT/2 = 9px; ±6 keeps every anchor visibly on
 * it"_ — **in a module that did not import `BAR_HEIGHT`**, so nothing could check it, and the row
 * treatment's 5 px bar made it false: the half-height is 2.5 and the *step* alone was 3.
 *
 * The reference the product owner chose solves the same crowding the other way. Every link
 * converges on the **node glyph** at the bar's end (`render-model.ts`), which is a shape a reader's
 * eye lands on rather than a spread that needs vertical room on the bar. So this is a replacement,
 * not a loss — and it takes a pass off the draw path. **What that saves is smaller than the figure
 * usually quoted with it, and the M6 performance review was right to say so.** The 5–11 ms measured
 * at 2,000 activities / 4,000 edges (`docs/TECH_DEBT.md` 51(a)) is the cost the ADR-0052 M5 WeakMap
 * memo had ALREADY removed from a pan frame: `scene.edges` is reference-stable across pan and zoom
 * (`TsldPanel.tsx`'s `useMemo` over `dependencies`), so the per-frame cost was a `WeakMap.get`. What
 * this deletion actually reclaims is that lookup per frame, plus the 5–11 ms **once per edge-list
 * change** — real, and a rarer event than a frame.
 *
 * `elbowShift` survives as a general parameter of {@link routeOrthogonal}: fan-out was its only
 * caller, but it says something about the elbow rather than about the bar, and the corridor search
 * still uses it.
 */
/**
 * Half-width (px) of a routed arrowhead's barbs.
 *
 * **Its old justification named fan-out and this epic deleted fan-out** (ADR-0151 D4), so the
 * constant briefly stood with a reason that pointed at nothing — the exact shape
 * `geometry.constant-derivation.test.ts` exists to remove, one file over, found by the M6
 * component review. Re-stated in terms of what it still protects: the barbs must stay inside the
 * corridor the head sits on, and at the tightest bundling `corridorGap` allows a wider barb would
 * reach across its neighbour's line. It is deliberately NOT derived from `BAR_HEIGHT`: an
 * arrowhead is a decoration on a LINK, and inheriting a bar-derived value would shrink every head
 * the day the bar thins, for no reason anybody chose (the ADR-0151 D2 ruling).
 */
export const ARROWHEAD_HALF_W_PX = 3;

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
