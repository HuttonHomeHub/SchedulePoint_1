/**
 * **Choosing a link's shape** (node-to-node links M1-T3 and M1-T4, spec §4.3 and §4.4).
 *
 * Each candidate from `routeCandidates` gets a score vector, compared term by term, lower better
 * (spec D-2, the product owner's order: through a bar, then crossings, then overlaps, then length):
 *
 * 1. **obstructions** — foreign glyphs the line passes through. A task bar counts together with its
 *    two nodes (its span widened by `NODE_REACH_PX` each side), because a line through an unrelated
 *    node reads as a link to that node;
 * 2. **crossings** with other links (phase 2 only);
 * 3. **overlaps** — collinear shared length with another link on a lane centre-line or a vertical,
 *    not counted between links that share an end (the bus, spec D-4) and not in gutters (packed
 *    apart afterwards by `packGutterChannels`);
 * 4. **length**, 5. **bends**, 6. the fixed **candidate order**.
 *
 * **Two phases, one frozen snapshot** (ADR-0149 D4's contract, generalised from moving one corridor
 * to choosing among whole shapes). Phase 1 picks each link's best shape on terms 1, 4, 5 and 6,
 * alone. Phase 2 re-scores every link's candidates on all six terms **against the phase-1 lines**,
 * and moves a link only on a strict improvement. Because every decision reads the same frozen
 * snapshot, the result does not depend on the order the links arrive in (FC-T5), and the pass never
 * measures its own output.
 */
import { MAX_ROUTE_CANDIDATES, routeCandidates, type RouteCandidate } from './link-candidates';
import { linkEndOf } from './link-ports';
import {
  activityRect,
  barGlyphKind,
  LANE_HEIGHT,
  LEG_CLEARANCE_PX,
  NODE_REACH_PX,
  type LaneIntervalIndex,
  type LaneIntervals,
  type Point,
  type Rect,
  type RectCache,
  type RenderActivity,
  type Viewport,
} from './render-model';

const EPS = 1e-6;

/**
 * The glyph index the obstruction test reads: every visible activity's span in its lane, a task
 * bar's widened by `NODE_REACH_PX` at each end so its nodes count as part of it. Built from
 * `activityRect`, the one source of where a bar is (ADR-0065's rule), like `laneIntervalIndex`.
 * Unlike that index this one does **not** merge spans, because counting what a line passes through
 * needs each glyph separately; the spans are sorted by start for the binary search.
 */
export function glyphIndex(
  activities: readonly RenderActivity[],
  view: Viewport,
  dataDate: string,
  cache?: RectCache,
): LaneIntervalIndex {
  const byLane = new Map<number, [number, number][]>();
  for (const a of activities) {
    const rect = activityRect(a, view, dataDate, cache);
    if (!rect) continue;
    const widen = barGlyphKind(a.type) === 'bar' ? NODE_REACH_PX : 0;
    const list = byLane.get(a.laneIndex) ?? [];
    list.push([rect.x - widen, rect.x + rect.w + widen]);
    byLane.set(a.laneIndex, list);
  }
  const index = new Map<number, LaneIntervals>();
  for (const [lane, spans] of byLane) {
    spans.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    index.set(lane, { spans });
  }
  return index;
}

/** A glyph span of the link's own ends, which its own segments may touch. */
export interface OwnSpan {
  lane: number;
  x0: number;
  x1: number;
}

function laneOfCentre(y: number, view: Viewport): number | null {
  const k = (y - view.originY - LANE_HEIGHT / 2) / LANE_HEIGHT;
  const lane = Math.round(k);
  return Math.abs(k - lane) * LANE_HEIGHT <= 0.5 ? lane : null;
}

/** Whether `y` is a lane's centre-line: where a horizontal can meet a glyph, and an overlap counts. */
export function isLaneCentre(y: number, view: Viewport): boolean {
  return laneOfCentre(y, view) !== null;
}

/** An activity's own span in the glyph index, widened exactly as `glyphIndex` widens it. */
export function ownSpanOf(activity: RenderActivity, rect: Rect): OwnSpan {
  const widen = barGlyphKind(activity.type) === 'bar' ? NODE_REACH_PX : 0;
  return { lane: activity.laneIndex, x0: rect.x - widen, x1: rect.x + rect.w + widen };
}

function isOwn(own: readonly OwnSpan[], lane: number, x0: number, x1: number): boolean {
  return own.some(
    (o) => o.lane === lane && Math.abs(o.x0 - x0) <= EPS && Math.abs(o.x1 - x1) <= EPS,
  );
}

/**
 * How many foreign glyphs `line` passes through.
 *
 * - A **horizontal** on a lane's centre-line counts each glyph in that lane it overlaps by more than
 *   `LEG_CLEARANCE_PX`. A horizontal anywhere else (a gutter) meets no glyph: a gutter lies outside
 *   every bar and node by construction (ADR-0150).
 * - A **vertical** counts, for each lane whose centre-line it strictly crosses, every glyph in that
 *   lane whose widened span contains its x.
 *
 * The link's own two glyphs are excluded (`own`), because every link touches them by construction.
 */
export function obstructions(
  line: readonly Point[],
  glyphs: LaneIntervalIndex,
  own: readonly OwnSpan[],
  view: Viewport,
): number {
  let count = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (Math.abs(a.y - b.y) <= EPS) {
      const lane = laneOfCentre(a.y, view);
      if (lane === null) continue;
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      for (const [x0, x1] of glyphs.get(lane)?.spans ?? []) {
        if (x0 >= hi) break;
        if (Math.min(hi, x1) - Math.max(lo, x0) <= LEG_CLEARANCE_PX) continue;
        if (!isOwn(own, lane, x0, x1)) count += 1;
      }
    } else if (Math.abs(a.x - b.x) <= EPS) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      const first = Math.ceil((lo - view.originY - LANE_HEIGHT / 2) / LANE_HEIGHT);
      for (let lane = first; ; lane += 1) {
        const cy = view.originY + lane * LANE_HEIGHT + LANE_HEIGHT / 2;
        if (cy >= hi - EPS) break;
        if (cy <= lo + EPS) continue;
        for (const [x0, x1] of glyphs.get(lane)?.spans ?? []) {
          if (x0 > a.x) break;
          if (x1 < a.x) continue;
          if (!isOwn(own, lane, x0, x1)) count += 1;
        }
      }
    }
  }
  return count;
}

function lengthOf(line: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += Math.abs(line[i]!.x - line[i - 1]!.x) + Math.abs(line[i]!.y - line[i - 1]!.y);
  }
  return total;
}

/** Terms 1, 4, 5 and 6 — everything a link can know about itself alone. */
export interface Phase1Score {
  obstructions: number;
  length: number;
  bends: number;
  order: number;
}

export function comparePhase1(a: Phase1Score, b: Phase1Score): number {
  return (
    a.obstructions - b.obstructions || a.length - b.length || a.bends - b.bends || a.order - b.order
  );
}

export interface ScoredCandidate extends RouteCandidate {
  phase1: Phase1Score;
}

/** Score every candidate and return them, best first by phase 1. */
export function scoreCandidates(
  candidates: readonly RouteCandidate[],
  glyphs: LaneIntervalIndex,
  own: readonly OwnSpan[],
  view: Viewport,
): ScoredCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      phase1: {
        obstructions: obstructions(c.line, glyphs, own, view),
        length: lengthOf(c.line),
        bends: c.line.length - 2,
        order: c.order,
      },
    }))
    .sort((p, q) => comparePhase1(p.phase1, q.phase1));
}

/** One link's two ends, as the frame has already resolved them. */
export interface LinkRouteInput {
  from: RenderActivity;
  to: RenderActivity;
  fromAnchor: Point;
  toAnchor: Point;
  fromRect: Rect;
  toRect: Rect;
}

/**
 * **Phase 1 for one link**: every valid candidate, scored alone, best first. Never empty: when no
 * shape obeys both ports (only when the anchors coincide) the single `fallback` is the straight
 * line between them, which draws nothing a reader can see because it has no length.
 */
export function routeNodeToNode(
  input: LinkRouteInput,
  glyphs: LaneIntervalIndex,
  view: Viewport,
): ScoredCandidate[] {
  const pred = linkEndOf(input.from, input.fromAnchor, input.fromRect);
  const succ = linkEndOf(input.to, input.toAnchor, input.toRect);
  const own = [ownSpanOf(input.from, input.fromRect), ownSpanOf(input.to, input.toRect)];
  const scored = scoreCandidates(
    routeCandidates(pred, succ, input.from.laneIndex, input.to.laneIndex, view),
    glyphs,
    own,
    view,
  );
  if (scored.length > 0) return scored;
  const line = [input.fromAnchor, input.toAnchor];
  return [
    {
      shape: 'fallback',
      line,
      order: MAX_ROUTE_CANDIDATES,
      phase1: { obstructions: 0, length: lengthOf(line), bends: 0, order: MAX_ROUTE_CANDIDATES },
    },
  ];
}

// ── Phase 2 ────────────────────────────────────────────────────────────────────────────────────

/** One link as the frame pass sees it: its scored candidates (best first) and its two ends. */
export interface FrameLink {
  candidates: readonly ScoredCandidate[];
  /** The two anchor points, for the shared-end exemption on overlaps (spec D-4). */
  ends: readonly [Point, Point];
}

interface Seg {
  link: number;
  fixed: number;
  lo: number;
  hi: number;
}

function segmentsOf(line: readonly Point[], link: number): { h: Seg[]; v: Seg[] } {
  const h: Seg[] = [];
  const v: Seg[] = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) {
      h.push({ link, fixed: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    } else if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) {
      v.push({ link, fixed: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  }
  return { h, v };
}

/** Segments bucketed by their fixed coordinate, sorted, for range queries. */
class SegmentBuckets {
  private readonly keys: number[];
  private readonly buckets = new Map<number, Seg[]>();
  constructor(segs: readonly Seg[]) {
    for (const s of segs) {
      const list = this.buckets.get(s.fixed) ?? [];
      list.push(s);
      this.buckets.set(s.fixed, list);
    }
    this.keys = [...this.buckets.keys()].sort((p, q) => p - q);
  }
  /** Buckets whose fixed coordinate lies strictly inside `(lo, hi)`. */
  *between(lo: number, hi: number): Iterable<Seg[]> {
    let left = 0;
    let right = this.keys.length;
    while (left < right) {
      const mid = (left + right) >> 1;
      if (this.keys[mid]! <= lo + EPS) left = mid + 1;
      else right = mid;
    }
    for (let i = left; i < this.keys.length && this.keys[i]! < hi - EPS; i += 1) {
      yield this.buckets.get(this.keys[i]!)!;
    }
  }
  at(fixed: number): readonly Seg[] {
    return this.buckets.get(fixed) ?? [];
  }
}

/** Phase 2's full score: phase 1 plus crossings and overlaps against the frozen snapshot. */
export interface Phase2Score extends Phase1Score {
  crossings: number;
  overlaps: number;
}

export function comparePhase2(a: Phase2Score, b: Phase2Score): number {
  return (
    a.obstructions - b.obstructions ||
    a.crossings - b.crossings ||
    a.overlaps - b.overlaps ||
    a.length - b.length ||
    a.bends - b.bends ||
    a.order - b.order
  );
}

/**
 * **Phase 2: re-score every link against the frozen phase-1 picture**, and return each link's
 * chosen line. A link moves off its phase-1 choice only on a strict improvement in the full vector.
 *
 * Crossings are strictly interior meetings of one link's horizontal with another's vertical: a
 * meeting at an endpoint is a shared anchor, never a crossing (the same rule every counter here
 * uses). A link's own phase-1 segments are excluded by owner, since a candidate may legitimately
 * cross the line it would replace.
 *
 * `laneCentre(y)` says whether a horizontal lies on a lane centre-line, where an overlap counts; a
 * gutter run is separated afterwards by `packGutterChannels`, so it does not.
 */
export function chooseRoutesByCrossing(
  links: readonly FrameLink[],
  laneCentre: (y: number) => boolean,
): Point[][] {
  const chosen = links.map((l) => l.candidates[0]?.line ?? []);
  if (links.length < 2) return chosen;
  const hs: Seg[] = [];
  const vs: Seg[] = [];
  chosen.forEach((line, i) => {
    const { h, v } = segmentsOf(line, i);
    hs.push(...h);
    vs.push(...v);
  });
  const hBuckets = new SegmentBuckets(hs);
  const vBuckets = new SegmentBuckets(vs);
  const near = (p: Point, q: Point): boolean =>
    Math.abs(p.x - q.x) <= 0.5 && Math.abs(p.y - q.y) <= 0.5;
  const shareEnd = (i: number, j: number): boolean =>
    links[i]!.ends.some((p) => links[j]!.ends.some((q) => near(p, q)));

  const score = (i: number, candidate: ScoredCandidate): Phase2Score => {
    const { h, v } = segmentsOf(candidate.line, i);
    let crossings = 0;
    let overlaps = 0;
    for (const s of h) {
      for (const bucket of vBuckets.between(s.lo, s.hi)) {
        for (const t of bucket) {
          if (t.link === i) continue;
          if (s.fixed > t.lo + EPS && s.fixed < t.hi - EPS) crossings += 1;
        }
      }
      if (laneCentre(s.fixed)) {
        for (const t of hBuckets.at(s.fixed)) {
          if (t.link === i) continue;
          if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 0.5 && !shareEnd(i, t.link))
            overlaps += 1;
        }
      }
    }
    for (const s of v) {
      for (const bucket of hBuckets.between(s.lo, s.hi)) {
        for (const t of bucket) {
          if (t.link === i) continue;
          if (s.fixed > t.lo + EPS && s.fixed < t.hi - EPS) crossings += 1;
        }
      }
      for (const t of vBuckets.at(s.fixed)) {
        if (t.link === i) continue;
        if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 0.5 && !shareEnd(i, t.link))
          overlaps += 1;
      }
    }
    return { ...candidate.phase1, crossings, overlaps };
  };

  return links.map((link, i) => {
    const current = link.candidates[0];
    if (!current) return [];
    let best = current;
    let bestScore = score(i, current);
    for (let k = 1; k < link.candidates.length; k += 1) {
      const candidate = link.candidates[k]!;
      // Obstructions lead the vector, so a candidate through more glyphs can never win.
      if (candidate.phase1.obstructions > bestScore.obstructions) continue;
      const s = score(i, candidate);
      if (comparePhase2(s, bestScore) < 0) {
        best = candidate;
        bestScore = s;
      }
    }
    return best.line;
  });
}
