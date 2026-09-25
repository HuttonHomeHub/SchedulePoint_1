import { obeysPorts } from './link-candidates';
import { CHEVRON_HALF_W_PX } from './link-marks';
import { portFor, type LinkEnd } from './link-ports';
import { ARROWHEAD_HALF_W_PX } from './link-routing';
import { obstructionCounts, textCrossings, type GlyphIndex, type OwnSpan } from './link-score';
import {
  NODE_RADIUS,
  NODE_REACH_PX,
  NODE_RIM_MAX_W,
  type Point,
  type Viewport,
} from './render-model';
import type { TextIndex } from './text-index';

/**
 * **Two-way tracks at crowded nodes** (links-and-labels M3, `docs/TECH_DEBT.md` #394, spec §4.7).
 *
 * Phase 3 (`link-score.ts`) moves one half of an opposed pair off a shared vertical when it can. Some
 * pairs it cannot separate: every other shape passes through a bar or hides a run behind one, and
 * those outrank an opposed overlap (ADR-0158 decision 4). Two arrowheads then point at each other on
 * one stroke. This pass draws such a track as **two lines, one each way**: every segment on it
 * travelling down moves to one side by {@link PORT_OFFSET_PX} and every segment travelling up to
 * the other, both still entering the node's disc.
 *
 * It re-ranks nothing and moves no line that is not on such a track. A V link keeps one direction
 * along its whole length, so it takes the same side at both ends; a same-direction bus stays
 * together. The decision for a track is a function of the frame's segments before the pass, so the
 * result does not depend on the order the links arrive in (FC-T5).
 */

/** The widest link stroke: a highlighted driving link, 2 px plus the 1 px highlight step (`paint.ts`). */
export const WIDEST_LINK_STROKE_PX = 3;

/** Ground between the two lines' widest marks, so they read as two. */
const MARK_GROUND_PX = 1;

/**
 * The bounds a port offset must sit within (spec §4.7), from the constants they are about:
 *
 * - **lower**: an arrowhead on one line beside a chevron on the other, with a pixel of ground
 *   between them: 2δ ≥ `ARROWHEAD_HALF_W_PX` + `CHEVRON_HALF_W_PX` + 1;
 * - **upper**: each end still enters the disc with its whole stroke: δ + stroke/2 ≤ the disc's inner
 *   edge, `NODE_RADIUS` − `NODE_RIM_MAX_W` / 2.
 */
export function portOffsetBounds(): { lower: number; upper: number } {
  return {
    lower: (ARROWHEAD_HALF_W_PX + CHEVRON_HALF_W_PX + MARK_GROUND_PX) / 2,
    upper: NODE_RADIUS - NODE_RIM_MAX_W / 2 - WIDEST_LINK_STROKE_PX / 2,
  };
}

/**
 * How far each line of a two-way track sits from the node centre (CQ-2: an end exactly this far
 * from a task node's centre, inside the disc, counts as attached). A whole pixel inside the window
 * {@link portOffsetBounds} gives, so a line drawn at a node centre's x keeps its sub-pixel phase and
 * a 1 px link stays exactly as crisp. `link-tracks.test.ts` holds it inside the window.
 */
export const PORT_OFFSET_PX = 4;

/**
 * How far back from its tip an arrowhead into a task node is drawn, so it stops at the node's rim
 * rather than under the disc that paints over it: `NODE_REACH_PX` for a tip on a node centre, and
 * √(reach² − δ²) for a two-way track's tip exactly {@link PORT_OFFSET_PX} beside one — the point
 * where a vertical δ from the centre meets the rim. `null` where the tip is at neither.
 */
export function nodeHeadTrim(tip: Point, centres: readonly Point[]): number | null {
  const near = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) < tolerance;
  if (centres.some((c) => near(c.x, tip.x, 0.5) && near(c.y, tip.y, 0.5))) return NODE_REACH_PX;
  const offset = centres.some(
    (c) => near(Math.abs(c.x - tip.x), PORT_OFFSET_PX, 0.01) && near(c.y, tip.y, 0.5),
  );
  return offset ? Math.sqrt(NODE_REACH_PX ** 2 - PORT_OFFSET_PX ** 2) : null;
}

/** One routed link as the pass reads it: its line and the two ends it joins. */
export interface TrackLink {
  line: Point[];
  pred: LinkEnd;
  succ: LinkEnd;
  own: readonly OwnSpan[];
  /** The two activities it joins: their nodes are the line's own, never a junction. */
  endIds: readonly [string, string];
}

/** A task node's centre, and whose it is. */
export interface TrackNode {
  id: string;
  point: Point;
}

/** Why a track was left as it was. */
export type TrackRefusal =
  | 'not-absorbable'
  | 'ports'
  | 'obstruction'
  | 'hidden-leg'
  | 'node'
  | 'text'
  | 'crossing'
  | 'occupied';

export interface TrackSplit {
  /** Every link's line: the same array where the pass left it alone, a copy where it moved it. */
  lines: Point[][];
  /** Tracks split, and segments moved. */
  split: number;
  segments: number;
  /** The x of each track split, before the move: its two lines now sit either side of it. */
  splitAt: number[];
  /** Tracks left as they were, by the first guard both sides failed. */
  refused: Partial<Record<TrackRefusal, number>>;
}

interface Span {
  link: number;
  seg: number;
  lo: number;
  hi: number;
  /** +1 travelling down (screen y grows), −1 up. */
  dir: 1 | -1;
}

const EPS = 1e-6;
/** Two vertical spans share a track only where they overlap by more than half a pixel. */
const OVERLAP_PX = 0.5;

const isNodeEnd = (end: LinkEnd): boolean =>
  end.kind === 'start-node' || end.kind === 'finish-node';

function verticalSpans(lines: readonly (readonly Point[])[]): Map<string, Span[]> {
  const byX = new Map<string, Span[]>();
  lines.forEach((line, link) => {
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1]!;
      const q = line[i]!;
      if (Math.abs(p.x - q.x) > EPS || Math.abs(p.y - q.y) < EPS) continue;
      const key = p.x.toFixed(2);
      const span: Span = {
        link,
        seg: i - 1,
        lo: Math.min(p.y, q.y),
        hi: Math.max(p.y, q.y),
        dir: q.y > p.y ? 1 : -1,
      };
      const list = byX.get(key);
      if (list) list.push(span);
      else byX.set(key, [span]);
    }
  });
  return byX;
}

const overlaps = (a: Span, b: Span): boolean =>
  Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > OVERLAP_PX;

/** Tracks at one x: spans of different links joined by y-overlap (union-find), in input order. */
function tracksOf(spans: readonly Span[]): Span[][] {
  const parent = spans.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      if (spans[i]!.link !== spans[j]!.link && overlaps(spans[i]!, spans[j]!)) {
        parent[find(i)] = find(j);
      }
    }
  }
  const out = new Map<number, Span[]>();
  spans.forEach((s, i) => {
    const root = find(i);
    const list = out.get(root);
    if (list) list.push(s);
    else out.set(root, [s]);
  });
  return [...out.values()];
}

/** Proper crossings between two lines: a horizontal and a vertical meeting strictly inside both. */
function crossingsBetween(a: readonly Point[], b: readonly Point[]): number {
  let n = 0;
  const count = (h: readonly Point[], v: readonly Point[]): void => {
    for (let i = 1; i < h.length; i += 1) {
      const p = h[i - 1]!;
      const q = h[i]!;
      if (Math.abs(p.y - q.y) > EPS) continue;
      const x0 = Math.min(p.x, q.x);
      const x1 = Math.max(p.x, q.x);
      for (let j = 1; j < v.length; j += 1) {
        const r = v[j - 1]!;
        const s = v[j]!;
        if (Math.abs(r.x - s.x) > EPS) continue;
        const y0 = Math.min(r.y, s.y);
        const y1 = Math.max(r.y, s.y);
        if (r.x > x0 + EPS && r.x < x1 - EPS && p.y > y0 + EPS && p.y < y1 - EPS) n += 1;
      }
    }
  };
  count(a, b);
  count(b, a);
  return n;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function boxOf(line: readonly Point[]): Box {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of line) {
    if (p.x < box.x0) box.x0 = p.x;
    if (p.x > box.x1) box.x1 = p.x;
    if (p.y < box.y0) box.y0 = p.y;
    if (p.y > box.y1) box.y1 = p.y;
  }
  return box;
}

const boxesMeet = (a: Box, b: Box): boolean =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** How many node centres, other than the line's own two activities', lie within reach of `line`. */
function nodesReached(
  line: readonly Point[],
  /** Sorted by x (`byX`), so only the nodes within reach of the line's x-range are tested. */
  nodes: readonly TrackNode[],
  a: string,
  b: string,
): number {
  const box = boxOf(line);
  let lo = 0;
  let hi = nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid]!.point.x < box.x0 - NODE_REACH_PX) lo = mid + 1;
    else hi = mid;
  }
  let n = 0;
  for (let k = lo; k < nodes.length; k += 1) {
    const { id, point: c } = nodes[k]!;
    if (c.x > box.x1 + NODE_REACH_PX) break;
    if (id === a || id === b || c.y < box.y0 - NODE_REACH_PX || c.y > box.y1 + NODE_REACH_PX) {
      continue;
    }
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1]!;
      const q = line[i]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / len2));
      const ex = p.x + t * dx - c.x;
      const ey = p.y + t * dy - c.y;
      if (ex * ex + ey * ey < NODE_REACH_PX * NODE_REACH_PX) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/** How many horizontal segment pairs of two lines lie on one y and overlap by more than half a pixel. */
function collinearOverlaps(a: readonly Point[], b: readonly Point[]): number {
  let n = 0;
  for (let i = 1; i < a.length; i += 1) {
    const p = a[i - 1]!;
    const q = a[i]!;
    if (Math.abs(p.y - q.y) > EPS) continue;
    for (let j = 1; j < b.length; j += 1) {
      const r = b[j - 1]!;
      const s = b[j]!;
      if (Math.abs(r.y - s.y) > EPS || Math.abs(r.y - p.y) > EPS) continue;
      const lo = Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x));
      const hi = Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x));
      if (hi - lo > OVERLAP_PX) n += 1;
    }
  }
  return n;
}

/**
 * Split every vertical track that still carries an opposed overlap, where §4.7's guards allow. The
 * input lines are not mutated.
 */
export function splitResidueTracks(
  links: readonly TrackLink[],
  glyphs: GlyphIndex,
  text: TextIndex | null,
  view: Viewport,
  /** Every visible task node: a moved line may come within reach of none it did not before. */
  nodes: readonly TrackNode[],
  delta: number = PORT_OFFSET_PX,
): TrackSplit {
  const before = links.map((l) => l.line);
  const out: Point[][] = [...before];
  const refused: TrackSplit['refused'] = {};
  let split = 0;
  let segments = 0;
  const splitAt: number[] = [];

  // The pre-pass picture every guard reads, so no track's decision depends on another's.
  const allSpans = verticalSpans(before);
  // The same verticals sorted by x, so "does a moved segment land on one" is a search, not a scan.
  const spanXs = [...allSpans].map(([key, list]) => ({ x: Number(key), list }));
  spanXs.sort((p, q) => p.x - q.x);
  // Each line's box, and the nodes sorted by x, built once and only when a track is opposed.
  let boxes: Box[] | undefined;
  let byX: TrackNode[] | undefined;
  const scoreOf = (link: number, line: readonly Point[]) => {
    const counts = obstructionCounts(line, glyphs, links[link]!.own, view);
    return { total: counts.total, legs: counts.legs, text: textCrossings(line, text, view) };
  };
  // A link's pre-pass score and node count, asked by both sides of every track it lies on: once.
  const wasScores = new Map<number, ReturnType<typeof scoreOf>>();
  const wasScore = (link: number) => {
    let score = wasScores.get(link);
    if (!score) wasScores.set(link, (score = scoreOf(link, before[link]!)));
    return score;
  };
  const wasNodes = new Map<number, number>();

  for (const [key, spans] of allSpans) {
    for (const track of tracksOf(spans)) {
      const opposed = track.some((s) =>
        track.some((t) => t.link !== s.link && t.dir !== s.dir && overlaps(s, t)),
      );
      if (!opposed) continue;

      // Every moved end must be a task node: the one glyph whose disc absorbs an offset.
      const absorbable = track.every((s) => {
        const link = links[s.link]!;
        const touchesStart = s.seg === 0;
        const touchesEnd = s.seg + 1 === link.line.length - 1;
        return (!touchesStart || isNodeEnd(link.pred)) && (!touchesEnd || isNodeEnd(link.succ));
      });
      if (!absorbable) {
        refused['not-absorbable'] = (refused['not-absorbable'] ?? 0) + 1;
        continue;
      }

      const trackLinks = [...new Set(track.map((s) => s.link))];
      const onTrack = new Set(trackLinks);
      // A move changes a line only in its moved segments and the two either side of each, which it
      // lengthens by δ. Crossings and shared runs are sums over segment pairs, so the guards count
      // them on each moved line's window (one segment before its first moved segment to one after
      // its last) and every other pair cancels between before and after. The window's segments are
      // the same for both sides, so the side chosen is unchanged too. And only a line whose box
      // meets a window's box, widened by the move, can cross it or share a run with it. So a
      // track's work follows the segments it moves, not the frame (the M4 performance review:
      // every other visible line was tested in full, and in Tidy that is every line in the plan).
      const windows = new Map<number, [number, number]>();
      for (const span of track) {
        const w = windows.get(span.link);
        windows.set(
          span.link,
          w ? [Math.min(w[0], span.seg), Math.max(w[1], span.seg)] : [span.seg, span.seg],
        );
      }
      const windowOf = (link: number, line: readonly Point[]): readonly Point[] => {
        const [first, last] = windows.get(link)!;
        return line.slice(Math.max(0, first - 1), Math.min(line.length, last + 3));
      };
      boxes ??= before.map(boxOf);
      byX ??= [...nodes].sort((p, q) => p.point.x - q.point.x);
      const sortedNodes = byX;
      const reach = boxOf(trackLinks.flatMap((i) => windowOf(i, before[i]!)));
      reach.x0 -= delta + OVERLAP_PX;
      reach.x1 += delta + OVERLAP_PX;
      reach.y0 -= OVERLAP_PX;
      reach.y1 += OVERLAP_PX;
      const others: number[] = [];
      for (let i = 0; i < boxes.length; i += 1) {
        if (!onTrack.has(i) && boxesMeet(boxes[i]!, reach)) others.push(i);
      }
      // What each track line's window crosses and shares before the move: the same for both sides.
      const crossedBefore = new Map<number, number>();
      const sharedBefore = new Map<number, number[]>();
      for (const link of trackLinks) {
        const window = windowOf(link, before[link]!);
        let crossed = 0;
        const shared: number[] = [];
        for (const other of others) {
          crossed += crossingsBetween(window, before[other]!);
          shared.push(collinearOverlaps(window, before[other]!));
        }
        crossedBefore.set(link, crossed);
        sharedBefore.set(link, shared);
      }
      const x = Number(key);

      // One side: down-travelling segments by `downDx`, up-travelling by its opposite.
      const attempt = (
        downDx: number,
      ): { moved: Map<number, Point[]>; fail: TrackRefusal | null; cost: number[] } => {
        const moved = new Map<number, Point[]>();
        for (const s of track) {
          const line = moved.get(s.link) ?? before[s.link]!.map((p) => ({ x: p.x, y: p.y }));
          const dx = s.dir === 1 ? downDx : -downDx;
          line[s.seg] = { x: line[s.seg]!.x + dx, y: line[s.seg]!.y };
          line[s.seg + 1] = { x: line[s.seg + 1]!.x + dx, y: line[s.seg + 1]!.y };
          moved.set(s.link, line);
        }
        let crossingsBefore = 0;
        let crossingsAfter = 0;
        let textAfter = 0;
        let obstructionsAfter = 0;
        for (const [link, line] of moved) {
          const { pred, succ } = links[link]!;
          const firstV = Math.abs(line[0]!.x - line[1]!.x) < EPS;
          const n = line.length;
          const lastV = Math.abs(line[n - 2]!.x - line[n - 1]!.x) < EPS;
          const predPort = portFor(pred, firstV ? 'V' : 'H');
          const succPort = portFor(succ, lastV ? 'V' : 'H');
          if (!predPort || !succPort || !obeysPorts(line, predPort, succPort)) {
            return { moved, fail: 'ports', cost: [] };
          }
          const was = wasScore(link);
          const now = scoreOf(link, line);
          if (now.total > was.total) return { moved, fail: 'obstruction', cost: [] };
          if (now.legs > was.legs) return { moved, fail: 'hidden-leg', cost: [] };
          // A vertical that ends on a lane centre crosses no lane there, so `obstructions` cannot
          // see it pass beside a neighbour's node; moved δ closer, it can reach one (the first
          // reading made two such junctions on Unit 300: `m3-verdict.md`).
          const [a, b] = links[link]!.endIds;
          let reachedBefore = wasNodes.get(link);
          if (reachedBefore === undefined) {
            reachedBefore = nodesReached(before[link]!, sortedNodes, a, b);
            wasNodes.set(link, reachedBefore);
          }
          if (nodesReached(line, sortedNodes, a, b) > reachedBefore) {
            return { moved, fail: 'node', cost: [] };
          }
          if (now.text > was.text) return { moved, fail: 'text', cost: [] };
          textAfter += now.text;
          obstructionsAfter += now.total;
          crossingsBefore += crossedBefore.get(link)!;
          const window = windowOf(link, line);
          for (const other of others) crossingsAfter += crossingsBetween(window, before[other]!);
        }
        for (let i = 0; i < trackLinks.length; i += 1) {
          for (let j = i + 1; j < trackLinks.length; j += 1) {
            crossingsBefore += crossingsBetween(before[trackLinks[i]!]!, before[trackLinks[j]!]!);
            crossingsAfter += crossingsBetween(
              moved.get(trackLinks[i]!)!,
              moved.get(trackLinks[j]!)!,
            );
          }
        }
        if (crossingsAfter > crossingsBefore) return { moved, fail: 'crossing', cost: [] };
        // No moved line may overlap another line along a horizontal it did not before: moving a
        // vertical lengthens the horizontals either side of it by δ.
        for (const [link, line] of moved) {
          const window = windowOf(link, line);
          const shared = sharedBefore.get(link)!;
          for (let k = 0; k < others.length; k += 1) {
            if (collinearOverlaps(window, before[others[k]!]!) > shared[k]!) {
              return { moved, fail: 'occupied', cost: [] };
            }
          }
        }
        // No moved segment may land on a vertical another line already runs along.
        for (const s of track) {
          const nx = x + (s.dir === 1 ? downDx : -downDx);
          let lo = 0;
          let hi = spanXs.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (spanXs[mid]!.x < nx - OVERLAP_PX) lo = mid + 1;
            else hi = mid;
          }
          for (let k = lo; k < spanXs.length && spanXs[k]!.x <= nx + OVERLAP_PX; k += 1) {
            if (spanXs[k]!.list.some((t) => t.link !== s.link && overlaps(s, t))) {
              return { moved, fail: 'occupied', cost: [] };
            }
          }
        }
        return { moved, fail: null, cost: [crossingsAfter, textAfter, obstructionsAfter] };
      };

      // Each track takes whichever side does better on the guard quantities (conditions.md
      // decision 5); a tie goes to down-west, so the choice is a function of the segments alone.
      const west = attempt(-delta);
      const east = attempt(delta);
      const better = (a: number[], b: number[]): boolean => {
        for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
        return false;
      };
      const chosen =
        west.fail === null && (east.fail !== null || !better(east.cost, west.cost))
          ? west
          : east.fail === null
            ? east
            : null;
      if (chosen === null) {
        const reason = west.fail ?? east.fail ?? 'occupied';
        refused[reason] = (refused[reason] ?? 0) + 1;
        continue;
      }
      split += 1;
      segments += track.length;
      splitAt.push(x);
      // Applied onto the output rather than copied from `chosen`: a link can lie on two tracks
      // (one at each end), and each track's evaluation started from the pre-pass line.
      const downDx = chosen === west ? -delta : delta;
      for (const span of track) {
        if (out[span.link] === before[span.link]) {
          out[span.link] = before[span.link]!.map((p) => ({ x: p.x, y: p.y }));
        }
        const line = out[span.link]!;
        const dx = span.dir === 1 ? downDx : -downDx;
        line[span.seg] = { x: line[span.seg]!.x + dx, y: line[span.seg]!.y };
        line[span.seg + 1] = { x: line[span.seg + 1]!.x + dx, y: line[span.seg + 1]!.y };
      }
    }
  }
  return { lines: out, split, segments, splitAt, refused };
}
