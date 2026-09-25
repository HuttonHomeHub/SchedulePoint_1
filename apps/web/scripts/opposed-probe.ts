/**
 * **Links-and-labels M0-T2 — the opposed pairs ADR-0158's phase 3 leaves, listed and classified.**
 *
 * `docs/TECH_DEBT.md` #394 and `docs/specs/links-and-labels/feature-spec.md` §4.7. The attachment
 * probe counts opposed pairs; this lists them, so the remedy is chosen from the pairs rather than
 * from the count. It commits the scratch listing the #394 row was written from.
 *
 * ## What it reads
 *
 * The pairs come from `routeFrame`'s own final lines, never a re-routing (the ADR-0124 lesson). The
 * candidate scores used to classify a pair are **recomputed** with the same exported functions the
 * frame's `lineOf` calls (`lagAnchorPoints`, `routeNodeToNodeParts`, the frame's own glyph index):
 * that is a second evaluation of phase 1, used only to classify, and it is held to the frame by a
 * control — the drawn line's shape (its x coordinates and its point count; a gutter run's y is moved
 * afterwards by `packGutterChannels`) must be one of the recomputed candidates, or the probe throws.
 *
 * ## Each pair's kind
 *
 * - **crowded-shared-node**: the two links meet at one point, one arriving and one leaving, and two
 *   different activities anchor there (a finish and the next bar's start sharing one node).
 * - **escape-through-bar**: not the above, and one of the two links has a candidate that opposes
 *   nothing in the final picture but meets more foreign glyphs, or hides more of the line, than the
 *   one drawn — so ADR-0158's order (glyphs first, decision 10) correctly kept it.
 * - **arrive-leave-unshared**: they meet at one node that only one activity anchors.
 * - **other**: they share no end point.
 *
 * ## Absorbable (spec §4.7)
 *
 * The pair sits on a vertical track, and every segment of either link lying on that track that
 * touches the line's own start or end touches it at a task node (`start-node` or `finish-node`), the
 * only glyph whose disc can take an end offset by `PORT_OFFSET_PX`. A middle segment (neither end on
 * an anchor) is attachment-neutral.
 */
import { routeNodeToNodeParts, type ScoredCandidate } from '../src/features/tsld/render/link-score';
import type { TsldScene } from '../src/features/tsld/render/paint';
import {
  activityRect,
  ELAPSED_DAY_WALK,
  lagAnchorPoints,
  LANE_HEIGHT,
  type Point,
  type RectCache,
  type RenderEdge,
  type Viewport,
} from '../src/features/tsld/render/render-model';
import { routeFrame } from '../src/features/tsld/render/route-frame';

import { endSpecOf, type EndKind } from './attachment-probe';

export type OpposedKind =
  'crowded-shared-node' | 'escape-through-bar' | 'arrive-leave-unshared' | 'other';

export interface OpposedPair {
  a: string;
  b: string;
  orientation: 'h' | 'v';
  kind: OpposedKind;
  absorbable: boolean;
  /** The anchored-end glyph kinds of the segments on the track, per link. */
  trackEnds: { a: EndKind[]; b: EndKind[] };
  /** Each link's best candidate that opposes nothing, against the drawn one, or null if none. */
  escape: { a: EscapeScore | null; b: EscapeScore | null };
}

export interface EscapeScore {
  drawn: { obstructions: number; hiddenLegs: number; length: number } | null;
  best: { obstructions: number; hiddenLegs: number; length: number; shape: string };
}

interface Span {
  link: number;
  at: number;
  lo: number;
  hi: number;
  dir: 1 | -1;
  /** Segment index in its line, so its anchored ends can be found. */
  seg: number;
}

const nameOf = (e: RenderEdge): string => `${e.predecessorId}>${e.successorId}>${e.type}`;

function spansOf(
  lines: readonly (readonly Point[])[],
  laneCentre: (y: number) => boolean,
): { h: Map<string, Span[]>; v: Map<string, Span[]> } {
  const h = new Map<string, Span[]>();
  const v = new Map<string, Span[]>();
  lines.forEach((line, link) => {
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1]!;
      const q = line[i]!;
      if (Math.abs(p.y - q.y) < 1e-6 && Math.abs(p.x - q.x) > 1e-6) {
        if (!laneCentre(p.y)) continue;
        const key = p.y.toFixed(2);
        const list = h.get(key) ?? [];
        list.push({
          link,
          at: p.y,
          lo: Math.min(p.x, q.x),
          hi: Math.max(p.x, q.x),
          dir: q.x > p.x ? 1 : -1,
          seg: i - 1,
        });
        h.set(key, list);
      } else if (Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) > 1e-6) {
        const key = p.x.toFixed(2);
        const list = v.get(key) ?? [];
        list.push({
          link,
          at: p.x,
          lo: Math.min(p.y, q.y),
          hi: Math.max(p.y, q.y),
          dir: q.y > p.y ? 1 : -1,
          seg: i - 1,
        });
        v.set(key, list);
      }
    }
  });
  return { h, v };
}

/** How many other links a line runs opposite to, on the frame's final picture. */
function opposedCount(
  line: readonly Point[],
  self: number,
  spans: ReturnType<typeof spansOf>,
  laneCentre: (y: number) => boolean,
): number {
  const own = spansOf([line], laneCentre);
  const hit = new Set<number>();
  for (const [key, list] of own.h) {
    for (const s of list) {
      for (const t of spans.h.get(key) ?? []) {
        if (t.link === self || t.dir === s.dir) continue;
        if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 0.5) hit.add(t.link);
      }
    }
  }
  for (const [key, list] of own.v) {
    for (const s of list) {
      for (const t of spans.v.get(key) ?? []) {
        if (t.link === self || t.dir === s.dir) continue;
        if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 0.5) hit.add(t.link);
      }
    }
  }
  return hit.size;
}

/** The shape key the control compares: point count and x coordinates (a gutter's y moves later). */
const shapeKey = (line: readonly Point[]): string =>
  `${line.length}:${line.map((p) => p.x.toFixed(2)).join(',')}`;

export function listOpposed(scene: TsldScene, view: Viewport): OpposedPair[] {
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const rectCache: RectCache = new Map();
  const frame = routeFrame(scene, view, new Set(byId.keys()), byId, rectCache);
  if (!frame.glyphs || !frame.workingWalk) {
    throw new Error('opposed-probe needs the refreshed, time-true, node-to-node router');
  }
  const glyphs = frame.glyphs;
  const workingWalk = frame.workingWalk;
  const edges = [...frame.lines.keys()];
  const lines = edges.map((e) => frame.lines.get(e)!);
  const laneCentre = (y: number): boolean => {
    const off = (((y - view.originY - LANE_HEIGHT / 2) % LANE_HEIGHT) + LANE_HEIGHT) % LANE_HEIGHT;
    return off < 0.5 || off > LANE_HEIGHT - 0.5;
  };
  const spans = spansOf(lines, laneCentre);
  const near = (p: Point, q: Point): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 0.5;

  // Every bar-glyph anchor point, by activity, for "two different activities anchor here".
  const anchorsAt = (p: Point): Set<string> => {
    const ids = new Set<string>();
    for (const a of scene.activities) {
      const r = activityRect(a, view, scene.dataDate, rectCache);
      if (!r) continue;
      const cy = r.y + r.h / 2;
      if (Math.abs(p.y - cy) > 0.5) continue;
      // Within the shared-node window (`sharesNode`: gap under the label gap, so up to 4 px apart).
      if (Math.abs(p.x - r.x) <= 4 || Math.abs(p.x - (r.x + r.w)) <= 4) ids.add(a.id);
    }
    return ids;
  };

  const candidatesOf = (i: number): readonly ScoredCandidate[] => {
    const edge = edges[i]!;
    const pred = byId.get(edge.predecessorId)!;
    const succ = byId.get(edge.successorId)!;
    const walk = edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : workingWalk;
    const anchors = lagAnchorPoints(
      pred,
      succ,
      edge.type,
      edge.lagDays ?? 0,
      view,
      scene.dataDate,
      walk,
      rectCache,
    );
    const fromRect = activityRect(pred, view, scene.dataDate, rectCache);
    const toRect = activityRect(succ, view, scene.dataDate, rectCache);
    if (!anchors || !fromRect || !toRect) return [];
    const parts = routeNodeToNodeParts(
      {
        from: pred,
        to: succ,
        fromAnchor: anchors.pred,
        toAnchor: anchors.succ,
        fromRect,
        toRect,
      },
      glyphs,
      view,
    );
    const all = [...parts.candidates, ...parts.escapes()];
    // The control: the drawn shape is one of these, or this is not the frame's phase 1.
    const drawn = shapeKey(lines[i]!);
    if (!all.some((c) => shapeKey(c.line) === drawn)) {
      throw new Error(
        `the drawn line of ${nameOf(edge)} is not among its recomputed candidates; refusing to ` +
          'classify against a different phase 1',
      );
    }
    return all;
  };

  const escapeOf = (i: number): EscapeScore | null => {
    const all = candidatesOf(i);
    const drawnKey = shapeKey(lines[i]!);
    const drawnC = all.find((c) => shapeKey(c.line) === drawnKey) ?? null;
    let best: ScoredCandidate | null = null;
    for (const c of all) {
      if (opposedCount(c.line, i, spans, laneCentre) > 0) continue;
      const k = (x: ScoredCandidate): number[] => [
        x.phase1.obstructions,
        x.phase1.hiddenLegs ?? 0,
        x.phase1.length,
      ];
      if (!best) best = c;
      else {
        const [p, q] = [k(c), k(best)];
        const cmp = p[0]! - q[0]! || p[1]! - q[1]! || p[2]! - q[2]!;
        if (cmp < 0) best = c;
      }
    }
    if (!best) return null;
    return {
      drawn: drawnC
        ? {
            obstructions: drawnC.phase1.obstructions,
            hiddenLegs: drawnC.phase1.hiddenLegs ?? 0,
            length: drawnC.phase1.length,
          }
        : null,
      best: {
        obstructions: best.phase1.obstructions,
        hiddenLegs: best.phase1.hiddenLegs ?? 0,
        length: best.phase1.length,
        shape: best.shape,
      },
    };
  };

  /** Anchored-end glyph kinds of one link's segments on a track. */
  const trackEndsOf = (i: number, onTrack: readonly Span[]): EndKind[] => {
    const edge = edges[i]!;
    const line = lines[i]!;
    const pred = byId.get(edge.predecessorId)!;
    const succ = byId.get(edge.successorId)!;
    const kinds: EndKind[] = [];
    for (const s of onTrack) {
      if (s.link !== i) continue;
      if (s.seg === 0) {
        const r = activityRect(pred, view, scene.dataDate, rectCache)!;
        kinds.push(endSpecOf(pred, line[0]!, r).kind);
      }
      if (s.seg === line.length - 2) {
        const r = activityRect(succ, view, scene.dataDate, rectCache)!;
        kinds.push(endSpecOf(succ, line.at(-1)!, r).kind);
      }
    }
    return kinds;
  };

  const out: OpposedPair[] = [];
  const seen = new Set<string>();
  for (const [orientation, map] of [
    ['h', spans.h],
    ['v', spans.v],
  ] as const) {
    for (const bucket of map.values()) {
      for (let x = 0; x < bucket.length; x += 1) {
        for (let y = x + 1; y < bucket.length; y += 1) {
          const s = bucket[x]!;
          const t = bucket[y]!;
          if (s.link === t.link || s.dir === t.dir) continue;
          if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) <= 0.5) continue;
          const [i, j] = s.link < t.link ? [s.link, t.link] : [t.link, s.link];
          const key = `${i}:${j}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const [la, lb] = [lines[i]!, lines[j]!];
          const shared: Point | null = near(la.at(-1)!, lb[0]!)
            ? la.at(-1)!
            : near(lb.at(-1)!, la[0]!)
              ? lb.at(-1)!
              : null;
          const onTrack = bucket.filter((u) => u.link === i || u.link === j);
          const trackEnds = { a: trackEndsOf(i, onTrack), b: trackEndsOf(j, onTrack) };
          const escape = { a: escapeOf(i), b: escapeOf(j) };
          const worse = (e: EscapeScore | null): boolean =>
            e !== null &&
            e.drawn !== null &&
            (e.best.obstructions > e.drawn.obstructions || e.best.hiddenLegs > e.drawn.hiddenLegs);
          let kind: OpposedKind;
          if (shared && anchorsAt(shared).size >= 2) kind = 'crowded-shared-node';
          else if (worse(escape.a) || worse(escape.b)) kind = 'escape-through-bar';
          else if (shared) kind = 'arrive-leave-unshared';
          else kind = 'other';
          const task = (k: EndKind): boolean => k === 'start-node' || k === 'finish-node';
          out.push({
            a: nameOf(edges[i]!),
            b: nameOf(edges[j]!),
            orientation,
            kind,
            absorbable: orientation === 'v' && [...trackEnds.a, ...trackEnds.b].every(task),
            trackEnds,
            escape,
          });
        }
      }
    }
  }
  return out;
}
