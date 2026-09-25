/**
 * **Choosing a link's shape** (node-to-node links M1-T3 and M1-T4, spec §4.3 and §4.4).
 *
 * Each candidate from `routeCandidateParts` gets a score vector, compared term by term, lower better
 * (spec D-2, the product owner's order: through a bar, then crossings, then overlaps, then length):
 *
 * 1. **obstructions** — foreign glyphs the line passes through. A task bar counts together with its
 *    two nodes (its span widened by `NODE_REACH_PX` each side), because a line through an unrelated
 *    node reads as a link to that node;
 * 2. **crossings** with other links (phase 2 only);
 * 3. **overlaps** — collinear shared length with another link on a lane centre-line or a vertical,
 *    not counted between links that share an end (the bus, spec D-4) and not in gutters (packed
 *    apart afterwards by `packGutterChannels`);
 * 4. **text** — names and dates the line runs through (links-and-labels M2, `docs/TECH_DEBT.md`
 *    #393, spec D-1): after overlaps, so a name is never bought with a bar, a crossing or an
 *    overlap, and before length, so it breaks the ties those leave. **Hidden legs rank just above
 *    it**: `obstructions` counts a vertical through a bar and a run hidden behind one alike, and the
 *    product owner's order puts a hidden link above text, so a name is never bought with a hidden
 *    run either (M2's first reading did exactly that, twice on Unit 300: `m2-verdict.md`);
 *    **A lagged link's plate** ranks just below it (spec D-5): at the detail tier, where plates are
 *    drawn, a candidate on which the painter's own `freePlatePosition` finds no room for the link's
 *    lag plate scores `plateBlocked` 1;
 * 5. **length**, 6. **bends**, 7. the fixed **candidate order**.
 *
 * **Two phases, one frozen snapshot** (ADR-0149 D4's contract, generalised from moving one corridor
 * to choosing among whole shapes). Phase 1 picks each link's best shape on terms 1, 4, 5 and 6,
 * alone. Phase 2 re-scores every link's candidates on all six terms **against the phase-1 lines**,
 * and moves a link only on a strict improvement. Because every decision reads the same frozen
 * snapshot, the result does not depend on the order the links arrive in (FC-T5), and the pass never
 * measures its own output.
 */
import { MAX_ROUTE_CANDIDATES, routeCandidateParts, type RouteCandidate } from './link-candidates';
import { linkEndOf } from './link-ports';
import type { PlateRoom } from './plate-room';
import {
  activityRect,
  barGlyphKind,
  LANE_HEIGHT,
  LEG_CLEARANCE_PX,
  NODE_REACH_PX,
  type LaneIntervals,
  type Point,
  type Rect,
  type RectCache,
  type RenderActivity,
  type Viewport,
} from './render-model';
import type { TextBox } from './row-text-layout';
import { firstTextReaching, type TextIndex } from './text-index';

const EPS = 1e-6;

/**
 * The glyph index the obstruction test reads: every visible activity's span in its lane, a task
 * bar's widened by `NODE_REACH_PX` at each end so its nodes count as part of it. Built from
 * `activityRect`, the one source of where a bar is (ADR-0065's rule), like `laneIntervalIndex`.
 * Unlike that index this one does **not** merge spans, because counting what a line passes through
 * needs each glyph separately; the spans are sorted by start for the binary search.
 */
/** One lane of the glyph index: its spans sorted by start, and the widest span's width. */
export interface GlyphLane extends LaneIntervals {
  /**
   * The widest span in the lane. Spans are NOT merged, so their ends are not sorted; this bound is
   * what lets a query binary-search to the first span that could still reach it.
   */
  readonly maxLen: number;
}

export type GlyphIndex = ReadonlyMap<number, GlyphLane>;

export function glyphIndex(
  activities: readonly RenderActivity[],
  view: Viewport,
  dataDate: string,
  cache?: RectCache,
): GlyphIndex {
  const byLane = new Map<number, [number, number][]>();
  for (const a of activities) {
    const rect = activityRect(a, view, dataDate, cache);
    if (!rect) continue;
    const widen = barGlyphKind(a.type) === 'bar' ? NODE_REACH_PX : 0;
    const list = byLane.get(a.laneIndex) ?? [];
    list.push([rect.x - widen, rect.x + rect.w + widen]);
    byLane.set(a.laneIndex, list);
  }
  const index = new Map<number, GlyphLane>();
  for (const [lane, spans] of byLane) {
    spans.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    index.set(lane, { spans, maxLen: Math.max(...spans.map(([x0, x1]) => x1 - x0)) });
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

/**
 * The index of the first span in `lane` that could reach `x` or beyond: the first whose start is at
 * least `x - maxLen`. Every earlier span ends before `x`, so a scan may begin here and count exactly
 * what a scan from zero counts.
 */
function firstReaching(lane: GlyphLane, x: number): number {
  const target = x - lane.maxLen;
  let lo = 0;
  let hi = lane.spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lane.spans[mid]![0] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
  glyphs: GlyphIndex,
  own: readonly OwnSpan[],
  view: Viewport,
): number {
  return obstructionCounts(line, glyphs, own, view).total;
}

/**
 * {@link obstructions}, with the part of it that is a **horizontal** leg kept apart. The two are one
 * term to phases 1 and 2, and they do not look alike: a vertical through a bar is a short gap in
 * the line, a horizontal along one is a run of the link hidden behind it (links paint under bars) —
 * the thing ADR-0150 and ADR-0158 spent two epics removing. Phase 3 trades lines to remove opposed
 * overlaps and must never pay for it in hidden runs, so it reads `legs` on its own.
 */
function obstructionCounts(
  line: readonly Point[],
  glyphs: GlyphIndex,
  own: readonly OwnSpan[],
  view: Viewport,
): { total: number; legs: number } {
  let count = 0;
  let legs = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (Math.abs(a.y - b.y) <= EPS) {
      const lane = laneOfCentre(a.y, view);
      if (lane === null) continue;
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      const row = glyphs.get(lane);
      if (!row) continue;
      for (let k = firstReaching(row, lo); k < row.spans.length; k += 1) {
        const [x0, x1] = row.spans[k]!;
        if (x0 >= hi) break;
        if (Math.min(hi, x1) - Math.max(lo, x0) <= LEG_CLEARANCE_PX) continue;
        if (!isOwn(own, lane, x0, x1)) {
          count += 1;
          legs += 1;
        }
      }
    } else if (Math.abs(a.x - b.x) <= EPS) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      const first = Math.ceil((lo - view.originY - LANE_HEIGHT / 2) / LANE_HEIGHT);
      for (let lane = first; ; lane += 1) {
        const cy = view.originY + lane * LANE_HEIGHT + LANE_HEIGHT / 2;
        if (cy >= hi - EPS) break;
        if (cy <= lo + EPS) continue;
        const row = glyphs.get(lane);
        if (!row) continue;
        for (let k = firstReaching(row, a.x); k < row.spans.length; k += 1) {
          const [x0, x1] = row.spans[k]!;
          if (x0 > a.x) break;
          if (x1 < a.x) continue;
          if (!isOwn(own, lane, x0, x1)) count += 1;
        }
      }
    }
  }
  return { total: count, legs };
}

/**
 * **How many names and dates `line` runs through** (links-and-labels M2-T1, spec §4.3): the ink
 * boxes of the text layout (`row-text-layout.ts`, indexed by `text-index.ts`) that any segment meets
 * in their strict interior, each box counted once. The same test the attachment probe counts text
 * crossings with, so the router and the instrument agree about what "through a name" means.
 *
 * A text box belongs to its activity's lane and lies inside that lane's band, so only the lanes a
 * segment's y-range spans are asked. `null` (or an empty index) is zero: off the routed path.
 */
export function textCrossings(
  line: readonly Point[],
  text: TextIndex | null,
  view: Viewport,
): number {
  if (text === null || text.size === 0) return 0;
  // Called for every candidate of every link, every frame and every Tidy evaluation, and almost
  // every line meets no text: so it allocates nothing until it finds a box (links-and-labels M2's
  // cost sitting profiled a Set and a result array per call as the largest share of the term).
  let met: TextBox[] | null = null;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const firstLane = Math.floor((y0 - view.originY) / LANE_HEIGHT);
    const lastLane = Math.floor((y1 - view.originY) / LANE_HEIGHT);
    for (let lane = firstLane; lane <= lastLane; lane += 1) {
      const entry = text.get(lane);
      if (!entry) continue;
      const boxes = entry.boxes;
      for (let k = firstTextReaching(entry, x0); k < boxes.length; k += 1) {
        const box = boxes[k]!;
        if (box.x >= x1) break;
        if (box.x + box.w <= x0 || y0 >= box.y + box.h || y1 <= box.y) continue;
        if (met === null) met = [box];
        else if (!met.includes(box)) met.push(box);
      }
    }
  }
  return met === null ? 0 : met.length;
}

function lengthOf(line: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += Math.abs(line[i]!.x - line[i - 1]!.x) + Math.abs(line[i]!.y - line[i - 1]!.y);
  }
  return total;
}

/**
 * One axis-aligned segment: its fixed coordinate, its extent along the other axis, and which way the
 * link travels along it (`1` towards `hi`, `-1` towards `lo`) — what tells an opposed overlap from a
 * shared stem.
 */
interface Seg {
  fixed: number;
  lo: number;
  hi: number;
  dir: 1 | -1;
}

/** A line cut into its horizontals and verticals; a zero-length segment is neither. */
interface Segments {
  h: readonly Seg[];
  v: readonly Seg[];
}

function segmentsOf(line: readonly Point[]): Segments {
  const h: Seg[] = [];
  const v: Seg[] = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) {
      h.push({
        fixed: a.y,
        lo: Math.min(a.x, b.x),
        hi: Math.max(a.x, b.x),
        dir: b.x > a.x ? 1 : -1,
      });
    } else if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) {
      v.push({
        fixed: a.x,
        lo: Math.min(a.y, b.y),
        hi: Math.max(a.y, b.y),
        dir: b.y > a.y ? 1 : -1,
      });
    }
  }
  return { h, v };
}

/** Terms 1, 4, 5, 6 and 7 — everything a link can know about itself alone. */
export interface Phase1Score {
  obstructions: number;
  /** Names and dates the line runs through ({@link textCrossings}). Absent reads as zero. */
  text?: number;
  /**
   * 1 where a lagged link's plate has no free position on this line (spec D-5), else 0. Scored only
   * for a lagged link at the detail tier; absent reads as zero.
   */
  plateBlocked?: number;
  /**
   * How many of `obstructions` are horizontal legs hidden behind a bar. Ranked only just above
   * `text` (links-and-labels M2): where it leads, obstructions has already tied. Phase 3 also
   * refuses any move that raises it. Absent on a hand-built score, where it reads as zero.
   */
  hiddenLegs?: number;
  length: number;
  bends: number;
  order: number;
}

function comparePhase1(a: Phase1Score, b: Phase1Score): number {
  return (
    a.obstructions - b.obstructions ||
    (a.hiddenLegs ?? 0) - (b.hiddenLegs ?? 0) ||
    (a.text ?? 0) - (b.text ?? 0) ||
    (a.plateBlocked ?? 0) - (b.plateBlocked ?? 0) ||
    a.length - b.length ||
    a.bends - b.bends ||
    a.order - b.order
  );
}

/** A lagged link's plate, for the plate sub-term: where there is room, and how wide it is. */
export interface PlateScoringInput {
  room: PlateRoom;
  width: number;
}

export interface ScoredCandidate extends RouteCandidate {
  phase1: Phase1Score;
  /**
   * The line's horizontal and vertical segments, cut the first time phase 2 needs them and kept.
   * Most candidates are never scored by phase 2, so cutting them all up front was pure garbage.
   */
  segments?: Segments;
}

function segmentsFor(candidate: ScoredCandidate): Segments {
  candidate.segments ??= segmentsOf(candidate.line);
  return candidate.segments;
}

/** A candidate with its phase-1 score. */
export function toScored(candidate: RouteCandidate, phase1: Phase1Score): ScoredCandidate {
  return { ...candidate, phase1 };
}

/** Score every candidate and return them, best first by phase 1. */
function scoreCandidates(
  candidates: readonly RouteCandidate[],
  glyphs: GlyphIndex,
  own: readonly OwnSpan[],
  view: Viewport,
  text: TextIndex | null,
  plate: PlateScoringInput | null,
): ScoredCandidate[] {
  return (
    candidates
      .map((c) => {
        const counts = obstructionCounts(c.line, glyphs, own, view);
        return toScored(c, {
          obstructions: counts.total,
          hiddenLegs: counts.legs,
          text: textCrossings(c.line, text, view),
          // Always a number, never a conditional spread: this runs per candidate per evaluation.
          plateBlocked: plate === null || plate.room.hasRoom(c.line, plate.width) ? 0 : 1,
          length: lengthOf(c.line),
          bends: c.line.length - 2,
          order: c.order,
        });
      })
      // An escape sorts after every ordinary shape, so phase 1's pick is one only when nothing else
      // obeys both ports; phase 3 is the one pass that looks past the first.
      .sort(
        (p, q) =>
          Number(p.escape === true) - Number(q.escape === true) ||
          comparePhase1(p.phase1, q.phase1),
      )
  );
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
  glyphs: GlyphIndex,
  view: Viewport,
  text: TextIndex | null,
): ScoredCandidate[] {
  const parts = routeNodeToNodeParts(input, glyphs, view, text);
  return [...parts.candidates, ...parts.escapes()];
}

/**
 * {@link routeNodeToNode} with the four escapes scored **only when asked for**, which is what the
 * frame uses: phase 2 stops at a pick with no crossing and no overlap and phase 3 looks only at a
 * link still opposed, so most links never ask. `candidates` are the ordinary shapes best first, or
 * every shape when no ordinary one obeys both ports (so phase 1's pick never waits on a thunk).
 */
export function routeNodeToNodeParts(
  input: LinkRouteInput,
  glyphs: GlyphIndex,
  view: Viewport,
  text: TextIndex | null,
  /** The link's lag plate, where plates are drawn and the link has a lag (spec D-5); else null. */
  plate: PlateScoringInput | null = null,
): { candidates: readonly ScoredCandidate[]; escapes: () => readonly ScoredCandidate[] } {
  const pred = linkEndOf(input.from, input.fromAnchor, input.fromRect);
  const succ = linkEndOf(input.to, input.toAnchor, input.toRect);
  const own = [ownSpanOf(input.from, input.fromRect), ownSpanOf(input.to, input.toRect)];
  const parts = routeCandidateParts(pred, succ, input.from.laneIndex, input.to.laneIndex, view);
  let escapes: ScoredCandidate[] | undefined;
  const escapesOf = (): ScoredCandidate[] =>
    (escapes ??= scoreCandidates(parts.escapes(), glyphs, own, view, text, plate));
  const ordinary = scoreCandidates(parts.ordinary, glyphs, own, view, text, plate);
  if (ordinary.length > 0) return { candidates: ordinary, escapes: escapesOf };
  const all = escapesOf();
  if (all.length > 0) return { candidates: all, escapes: () => [] };
  const line = [input.fromAnchor, input.toAnchor];
  return {
    candidates: [
      toScored(
        { shape: 'fallback', line, order: MAX_ROUTE_CANDIDATES },
        { obstructions: 0, length: lengthOf(line), bends: 0, order: MAX_ROUTE_CANDIDATES },
      ),
    ],
    escapes: () => [],
  };
}

// ── Phase 2 ────────────────────────────────────────────────────────────────────────────────────

/** One link as the frame pass sees it: its scored candidates (best first) and its two ends. */
export interface FrameLink {
  candidates: readonly ScoredCandidate[];
  /**
   * The escapes, scored on first call (`routeNodeToNodeParts`). Absent where `candidates` already
   * holds every shape the link has, as it does in a hand-built test.
   */
  escapes?: () => readonly ScoredCandidate[];
  /** The two anchor points, for the shared-end exemption on overlaps (spec D-4). */
  ends: readonly [Point, Point];
}

/** A snapshot segment, tagged with the link that drew it. */
interface OwnedSeg extends Seg {
  link: number;
}

/** Segments bucketed by their fixed coordinate, sorted, for range queries. */
class SegmentBuckets {
  private readonly keys: number[];
  private readonly lists: OwnedSeg[][];
  private readonly byKey = new Map<number, OwnedSeg[]>();
  constructor(segs: readonly OwnedSeg[]) {
    for (const s of segs) {
      const list = this.byKey.get(s.fixed) ?? [];
      list.push(s);
      this.byKey.set(s.fixed, list);
    }
    this.keys = [...this.byKey.keys()].sort((p, q) => p - q);
    this.lists = this.keys.map((k) => this.byKey.get(k)!);
  }
  /**
   * The index range `[start, end)` of the buckets whose fixed coordinate lies strictly inside
   * `(lo, hi)`: a plain range rather than a generator, because it runs in phase 2's innermost loop.
   */
  between(lo: number, hi: number): [number, number] {
    let left = 0;
    let right = this.keys.length;
    while (left < right) {
      const mid = (left + right) >> 1;
      if (this.keys[mid]! <= lo + EPS) left = mid + 1;
      else right = mid;
    }
    let end = left;
    while (end < this.keys.length && this.keys[end]! < hi - EPS) end += 1;
    return [left, end];
  }
  bucket(i: number): readonly OwnedSeg[] {
    return this.lists[i]!;
  }
  at(fixed: number): readonly OwnedSeg[] {
    return this.byKey.get(fixed) ?? [];
  }
  /**
   * Phase 3's move, in place: link `link`'s old segments out of their buckets, its new ones in. The
   * lists `at()` reads are updated exactly, so an opposed or collinear count sees the picture as it
   * now stands. A new segment on a fixed coordinate nothing held before is visible to `at()` and not
   * to `between()` — the sorted keys are not rebuilt — so a crossing against a moved link is counted
   * against where it was. Phase 2 counts every crossing against a snapshot for the same reason: a
   * rebuild per move measured at 1.7–2× a frame's routing.
   */
  move(link: number, from: readonly Seg[], to: readonly Seg[]): void {
    for (const s of from) {
      const list = this.byKey.get(s.fixed);
      if (!list) continue;
      const at = list.findIndex((t) => t.link === link && t.lo === s.lo && t.hi === s.hi);
      if (at >= 0) list.splice(at, 1);
    }
    for (const s of to) {
      const list = this.byKey.get(s.fixed);
      if (list) list.push({ ...s, link });
      else this.byKey.set(s.fixed, [{ ...s, link }]);
    }
  }
}

/**
 * Phase 2's full score: phase 1 plus crossings and overlaps against the frozen snapshot, and the
 * opposed overlaps phase 3 ranks on (phase 2 counts them and does not rank on them).
 */
interface Phase2Score extends Phase1Score {
  opposed: number;
  crossings: number;
  overlaps: number;
}

/**
 * Phase 3's order: phase 2's with **opposed overlaps ranked above crossings** (product owner,
 * 2026-09-25, on `web-v0.150.0`: "the logic should avoid routing lines in opposing direction on each
 * other"). Two crossing lines are still two lines; two lines on one track running opposite ways read
 * as neither, because their arrowheads point at each other along one stroke.
 */
function comparePhase3(a: Phase2Score, b: Phase2Score): number {
  return a.obstructions - b.obstructions || a.opposed - b.opposed || comparePhase2(a, b);
}

function comparePhase2(a: Phase2Score, b: Phase2Score): number {
  return (
    a.obstructions - b.obstructions ||
    a.crossings - b.crossings ||
    a.overlaps - b.overlaps ||
    (a.hiddenLegs ?? 0) - (b.hiddenLegs ?? 0) ||
    (a.text ?? 0) - (b.text ?? 0) ||
    (a.plateBlocked ?? 0) - (b.plateBlocked ?? 0) ||
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
  const near = (p: Point, q: Point): boolean =>
    Math.abs(p.x - q.x) <= 0.5 && Math.abs(p.y - q.y) <= 0.5;
  const shareEnd = (i: number, j: number): boolean =>
    links[i]!.ends.some((p) => links[j]!.ends.some((q) => near(p, q)));

  /** Every link's segments for one pick per link, bucketed for the range queries below. */
  const index = (picks: readonly (ScoredCandidate | undefined)[]) => {
    const hs: OwnedSeg[] = [];
    const vs: OwnedSeg[] = [];
    picks.forEach((pick, i) => {
      if (!pick) return;
      const segments = segmentsFor(pick);
      for (const s of segments.h) hs.push({ ...s, link: i });
      for (const s of segments.v) vs.push({ ...s, link: i });
    });
    return { hBuckets: new SegmentBuckets(hs), vBuckets: new SegmentBuckets(vs) };
  };

  /**
   * One candidate for link `i`, scored against `snapshot` (every other link's pick). With a
   * `crossingLimit` it gives up — returning `null` — as soon as it has counted more crossings than
   * that: phase 2 passes the best score's crossings for a candidate with the same obstructions, which
   * then cannot win, since crossings are the next term. Exact, and most losing candidates stop early.
   */
  const scoreAgainst = (
    snapshot: ReturnType<typeof index>,
    i: number,
    candidate: ScoredCandidate,
    crossingLimit = Infinity,
  ): Phase2Score | null => {
    const { hBuckets, vBuckets } = snapshot;
    const { h, v } = segmentsFor(candidate);
    let crossings = 0;
    let overlaps = 0;
    let opposed = 0;
    // A collinear pair is an overlap unless the two share an end (the bus), exactly as phase 2 has
    // always counted it. Running opposite ways it is also opposed, shared end or not — a shared end
    // is exactly where the report found one, links rising into a finish node up the vertical its
    // successor link came down. Phase 2 does not rank on `opposed`; phase 3 does.
    const collinear = (s: Seg, t: OwnedSeg): void => {
      if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) <= 0.5) return;
      if (!shareEnd(i, t.link)) overlaps += 1;
      if (s.dir !== t.dir) opposed += 1;
    };
    for (const s of h) {
      const [start, end] = vBuckets.between(s.lo, s.hi);
      for (let b = start; b < end; b += 1) {
        for (const t of vBuckets.bucket(b)) {
          if (t.link === i) continue;
          if (s.fixed > t.lo + EPS && s.fixed < t.hi - EPS) crossings += 1;
        }
      }
      if (crossings > crossingLimit) return null;
      if (laneCentre(s.fixed)) {
        for (const t of hBuckets.at(s.fixed)) {
          if (t.link !== i) collinear(s, t);
        }
      }
    }
    for (const s of v) {
      const [start, end] = hBuckets.between(s.lo, s.hi);
      for (let b = start; b < end; b += 1) {
        for (const t of hBuckets.bucket(b)) {
          if (t.link === i) continue;
          if (s.fixed > t.lo + EPS && s.fixed < t.hi - EPS) crossings += 1;
        }
      }
      if (crossings > crossingLimit) return null;
      for (const t of vBuckets.at(s.fixed)) {
        if (t.link !== i) collinear(s, t);
      }
    }
    return { ...candidate.phase1, opposed, crossings, overlaps };
  };

  // ── Phase 2: one frozen snapshot, unchanged ranking. ──
  const frozen = index(links.map((l) => l.candidates[0]));
  const picks: (ScoredCandidate | undefined)[] = links.map((link, i) => {
    const current = link.candidates[0];
    if (!current) return undefined;
    let best = current;
    let bestScore = scoreAgainst(frozen, i, current)!;
    // Nothing can beat a pick with no crossings and no overlaps: phase 1 already made it the best
    // on every other term, and phase 2 only inserts those two. Exact, and most links stop here.
    // Still exact with the text term (links-and-labels M2): hidden legs and text rank after
    // overlaps here and in the same order before length in phase 1, so phase 1's pick is already
    // the best on both among the ordinary shapes, and the escapes are not consulted by this exit,
    // before or after.
    if (bestScore.crossings === 0 && bestScore.overlaps === 0) return best;
    // The escapes after the ordinary shapes, scored only now that this link has asked for them.
    const all = [...link.candidates, ...(link.escapes?.() ?? [])];
    for (let k = 1; k < all.length; k += 1) {
      const candidate = all[k]!;
      // Obstructions lead the vector, so a candidate through more glyphs can never win. An escape
      // may not trade a vertical through a bar for a run hidden behind one (see phase 3).
      if (candidate.phase1.obstructions > bestScore.obstructions) continue;
      if ((candidate.phase1.hiddenLegs ?? 0) > (current.phase1.hiddenLegs ?? 0)) continue;
      const limit =
        candidate.phase1.obstructions < bestScore.obstructions ? Infinity : bestScore.crossings;
      const s = scoreAgainst(frozen, i, candidate, limit);
      if (s && comparePhase2(s, bestScore) < 0) {
        best = candidate;
        bestScore = s;
      }
    }
    return best;
  });

  // Phase 3 reads the picture as phase 2 left it: bring the frozen snapshot up to date in place
  // rather than building a second index, which on a Tidy run is paid once per routed frame.
  picks.forEach((pick, i) => {
    const was = links[i]!.candidates[0];
    if (!pick || !was || pick === was) return;
    const from = segmentsFor(was);
    const to = segmentsFor(pick);
    frozen.hBuckets.move(i, from.h, to.h);
    frozen.vBuckets.move(i, from.v, to.v);
  });
  resolveOpposed(links, picks, frozen, scoreAgainst, laneCentre);
  return picks.map((pick) => pick?.line ?? []);
}

/**
 * **Phase 3: two lines on one track, running opposite ways** (product owner, 2026-09-25, on
 * `web-v0.150.0`). Phase 2 counts crossings and overlaps against one frozen snapshot, which is what
 * makes it independent of the order links arrive in (FC-T5) — and what makes it the wrong tool
 * here. Both halves of an opposed pair see the conflict, so both move, and at a node they meet
 * again from the other side: measured on the report's own shape, the links arriving at the finish
 * node moved to come in over the top, and so did the link leaving it.
 *
 * So the opposed pairs phase 2 leaves are resolved **one link at a time against the picture as it
 * now stands**: each link still opposed re-chooses on {@link comparePhase3} (opposed overlaps above
 * crossings) and moves only on a strict improvement, so the second half of a pair sees the first
 * half's move and has no reason to follow it. Which half moves is whichever has a better line to
 * move to, not a fixed role: at a far zoom the link leaving the node can turn east first; at a
 * whole-plan zoom it cannot (its successor is closer than the stub rule), and an arriving link
 * comes in over the top instead.
 *
 * The order is fixed by the links' own geometry (source then target, x then y), never by the order
 * they arrive in, so FC-T5 still holds. It reads phase 2's snapshot, updated in place to phase 2's
 * picks, so a frame with no opposed pair pays only the scan that finds none.
 */
function resolveOpposed(
  links: readonly FrameLink[],
  picks: (ScoredCandidate | undefined)[],
  snapshot: { hBuckets: SegmentBuckets; vBuckets: SegmentBuckets },
  scoreAgainst: (
    snapshot: { hBuckets: SegmentBuckets; vBuckets: SegmentBuckets },
    i: number,
    candidate: ScoredCandidate,
    crossingLimit?: number,
  ) => Phase2Score | null,
  laneCentre: (y: number) => boolean,
): void {
  /** Only the opposed count: which links need this pass at all, without counting crossings. */
  const opposedOf = (i: number, candidate: ScoredCandidate): number => {
    const { h, v } = segmentsFor(candidate);
    let opposed = 0;
    const against = (s: Seg, list: readonly OwnedSeg[]): void => {
      for (const t of list) {
        if (t.link === i || t.dir === s.dir) continue;
        if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 0.5) opposed += 1;
      }
    };
    for (const s of h) if (laneCentre(s.fixed)) against(s, snapshot.hBuckets.at(s.fixed));
    for (const s of v) against(s, snapshot.vBuckets.at(s.fixed));
    return opposed;
  };
  const opposedNow = picks
    .map((pick, i) => (pick && opposedOf(i, pick) > 0 ? i : -1))
    .filter((i) => i >= 0);
  if (opposedNow.length === 0) return;
  const key = (i: number): number[] => {
    const [p, q] = links[i]!.ends;
    return [p.x, p.y, q.x, q.y];
  };
  opposedNow.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let k = 0; k < ka.length; k += 1) {
      if (ka[k] !== kb[k]) return ka[k]! - kb[k]!;
    }
    return 0;
  });
  for (const i of opposedNow) {
    const current = picks[i]!;
    const opposedHere = opposedOf(i, current);
    if (opposedHere === 0) continue; // an earlier move cleared it
    let best = current;
    let bestScore = scoreAgainst(snapshot, i, current)!;
    const hiddenNow = current.phase1.hiddenLegs ?? 0;
    const link = links[i]!;
    for (const candidate of [...link.candidates, ...(link.escapes?.() ?? [])]) {
      if (candidate === current || candidate.phase1.obstructions > bestScore.obstructions) continue;
      // Never trade an opposed overlap for a run hidden behind a bar: both are one obstruction to
      // the ranking, and only the first is what this pass exists to remove. Measured without this
      // guard, Unit 300's links hidden behind a foreign bar rose by two or three a frame.
      if ((candidate.phase1.hiddenLegs ?? 0) > hiddenNow) continue;
      // Opposed overlaps come next in the order and are cheap to count alone, so a candidate that
      // ties on obstructions and has more of them cannot win; one that ties on both can win only on
      // crossings, which bounds the full count exactly as phase 2 does.
      // This pass moves a link to leave an opposed track, not to trade one crossing for another
      // (phase 2 did that): a candidate through no fewer bars must run opposite fewer links.
      const opposed = opposedOf(i, candidate);
      if (candidate.phase1.obstructions >= current.phase1.obstructions && opposed >= opposedHere)
        continue;
      const tie = candidate.phase1.obstructions === bestScore.obstructions;
      if (tie && opposed > bestScore.opposed) continue;
      const limit = tie && opposed === bestScore.opposed ? bestScore.crossings : Infinity;
      const s = scoreAgainst(snapshot, i, candidate, limit);
      if (s && comparePhase3(s, bestScore) < 0) {
        best = candidate;
        bestScore = s;
      }
    }
    if (best !== current) {
      const from = segmentsFor(current);
      const to = segmentsFor(best);
      snapshot.hBuckets.move(i, from.h, to.h);
      snapshot.vBuckets.move(i, from.v, to.v);
      picks[i] = best;
    }
  }
}
