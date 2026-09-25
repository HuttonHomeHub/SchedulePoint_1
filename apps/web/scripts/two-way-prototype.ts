/**
 * **Links-and-labels M0-T3 — `PORT_OFFSET_PX` derived, and two-way tracks prototyped. SCRATCH.**
 *
 * `docs/specs/links-and-labels/feature-spec.md` §4.7 and `docs/TECH_DEBT.md` #394. This is a
 * **harness-only prototype, not the design**: M3 rebuilds the pass in the product with the §4.7
 * guards, and nothing here is imported by `src/`. It exists to answer three questions before M3 is
 * built: does a δ exist at all (the derivation), what does an offset do to TODAY's judge, and what
 * does the picture look like (CQ-2).
 *
 * ## The derivation (spec §4.7)
 *
 * - Lower bound: an arrowhead beside a chevron on the two lines, with 1 px of ground between them —
 *   2δ ≥ `ARROWHEAD_HALF_W_PX` + `CHEVRON_HALF_W_PX` + 1.
 * - Upper bound: each end enters the disc with its whole stroke. The widest stroke is the
 *   highlighted driving link's 3 px (a literal at `paint.ts:1672` and `:1740`; M3 names it), and the
 *   disc's inner edge is `NODE_RADIUS − NODE_RIM_MAX_W / 2` — δ + 3/2 ≤ that.
 *
 * `portOffsetBounds()` computes both from the imported constants and `PROTOTYPE_PORT_OFFSET_PX`
 * throws at module load if the window is empty (M3 is then withdrawn before it starts) or 4 is
 * outside it. 4 is chosen inside the window because it is a whole pixel: a line drawn at a node
 * centre's x keeps the same sub-pixel phase after the move, so a 1 px link stays exactly as crisp.
 *
 * ## The prototype split
 *
 * After `routeFrame` (so after phase 3 and `packGutterChannels` — M3 puts it before the latter, which
 * moves only gutter runs, never verticals), every vertical track carrying an opposed overlap is
 * clustered by y-overlap, and every span in the cluster moves by δ: travelling down to −x, travelling
 * up to +x (right-hand traffic seen from the travelling line). A cluster is refused unless every
 * moved segment that touches its own line's start or end touches it at a task node — the one glyph
 * whose disc can absorb an offset. None of §4.7's other guards (stub, obstruction, hidden leg, text,
 * crossing, occupied target) is applied: the prototype reports what they would have to catch.
 */
import { CHEVRON_HALF_W_PX } from '../src/features/tsld/render/link-marks';
import { ARROWHEAD_HALF_W_PX } from '../src/features/tsld/render/link-routing';
import type { TsldScene } from '../src/features/tsld/render/paint';
import {
  activityRect,
  barGlyphKind,
  ELAPSED_DAY_WALK,
  isMilestone,
  lagAnchorPoints,
  NODE_RADIUS,
  NODE_RIM_MAX_W,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from '../src/features/tsld/render/render-model';

/** The widest link stroke: a highlighted driving link (`paint.ts:1672`, `:1740`). */
const WIDEST_LINK_STROKE_PX = 3;
/** Ground between the two lines' widest marks. */
const MARK_GROUND_PX = 1;

export function portOffsetBounds(): { lower: number; upper: number } {
  return {
    lower: (ARROWHEAD_HALF_W_PX + CHEVRON_HALF_W_PX + MARK_GROUND_PX) / 2,
    upper: NODE_RADIUS - NODE_RIM_MAX_W / 2 - WIDEST_LINK_STROKE_PX / 2,
  };
}

export const PROTOTYPE_PORT_OFFSET_PX = 4;
{
  const { lower, upper } = portOffsetBounds();
  if (lower > upper) {
    throw new Error(`no port offset exists: lower ${lower} > upper ${upper}; M3 is withdrawn`);
  }
  if (PROTOTYPE_PORT_OFFSET_PX < lower || PROTOTYPE_PORT_OFFSET_PX > upper) {
    throw new Error(
      `PROTOTYPE_PORT_OFFSET_PX ${PROTOTYPE_PORT_OFFSET_PX} is outside [${lower}, ${upper}]`,
    );
  }
}

interface Span {
  edge: RenderEdge;
  seg: number;
  lo: number;
  hi: number;
  dir: 1 | -1;
}

/**
 * Which side each direction takes. The spec fixes only that the two directions part; which way is
 * open, and M0-T3 measures it: `down-west` / `down-east` are the two fixed conventions, and
 * `fewest-crossings` picks per track whichever of the two crosses fewer other lines (a function of
 * the segment set, so still order-independent; ties go to `down-west`).
 */
export type SideRule = 'down-west' | 'down-east' | 'fewest-crossings';

export interface SplitResult {
  lines: Map<RenderEdge, Point[]>;
  /** Tracks (clusters) split, and segments moved. */
  tracks: number;
  segments: number;
  /** Where each split track is, in the frame's own coordinates, for the pictures. */
  clusters: { x: number; lo: number; hi: number; segments: number }[];
  /** Clusters left alone, by reason. */
  refused: Record<string, number>;
}

/** Split every vertical two-way track by travel direction. Pure: `lines` is not mutated. */
export function splitTwoWayTracks(
  scene: TsldScene,
  view: Viewport,
  lines: ReadonlyMap<RenderEdge, readonly Point[]>,
  workingWalk: Parameters<typeof lagAnchorPoints>[6],
  delta: number = PROTOTYPE_PORT_OFFSET_PX,
  sides: SideRule = 'down-west',
): SplitResult {
  const byId = new Map<string, RenderActivity>(scene.activities.map((a) => [a.id, a]));
  const rectCache: RectCache = new Map();
  const byX = new Map<string, Span[]>();
  for (const [edge, line] of lines) {
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1]!;
      const q = line[i]!;
      if (Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) < 1e-6) continue;
      const key = p.x.toFixed(2);
      const list = byX.get(key) ?? [];
      list.push({
        edge,
        seg: i - 1,
        lo: Math.min(p.y, q.y),
        hi: Math.max(p.y, q.y),
        dir: q.y > p.y ? 1 : -1,
      });
      byX.set(key, list);
    }
  }
  const overlap = (a: Span, b: Span): boolean => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0.5;

  // Is this span's anchored end (if any) at a task node?
  const absorbable = (s: Span): boolean => {
    const line = lines.get(s.edge)!;
    const touchesStart = s.seg === 0;
    const touchesEnd = s.seg + 1 === line.length - 1;
    if (!touchesStart && !touchesEnd) return true;
    const pred = byId.get(s.edge.predecessorId)!;
    const succ = byId.get(s.edge.successorId)!;
    const walk = s.edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : workingWalk;
    const anchors = lagAnchorPoints(
      pred,
      succ,
      s.edge.type,
      s.edge.lagDays ?? 0,
      view,
      scene.dataDate,
      walk,
      rectCache,
    );
    if (!anchors) return false;
    // A task node: a bar glyph (not a milestone, LOE, hammock or summary) with the anchor on one of
    // its two ends. Restated rather than imported from `attachment-probe.ts`, which imports
    // `node:crypto` and cannot be bundled for the browser pictures.
    const isNode = (a: RenderActivity, anchor: Point): boolean => {
      const r = activityRect(a, view, scene.dataDate, rectCache);
      if (!r || isMilestone(a.type) || barGlyphKind(a.type) !== 'bar') return false;
      return Math.abs(anchor.x - r.x) <= 0.5 || Math.abs(anchor.x - (r.x + r.w)) <= 0.5;
    };
    return (
      (!touchesStart || isNode(pred, anchors.pred)) && (!touchesEnd || isNode(succ, anchors.succ))
    );
  };

  const moves: { span: Span; dx: number }[] = [];
  const refused: Record<string, number> = {};
  let tracks = 0;
  const placed: SplitResult['clusters'] = [];
  for (const spans of byX.values()) {
    // Cluster by y-overlap (union-find).
    const parent = spans.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length; j += 1) {
        if (spans[i]!.edge !== spans[j]!.edge && overlap(spans[i]!, spans[j]!)) {
          parent[find(i)] = find(j);
        }
      }
    }
    const clusters = new Map<number, Span[]>();
    spans.forEach((s, i) => {
      const root = find(i);
      clusters.set(root, [...(clusters.get(root) ?? []), s]);
    });
    for (const cluster of clusters.values()) {
      const opposed = cluster.some((s) =>
        cluster.some((t) => t.edge !== s.edge && t.dir !== s.dir && overlap(s, t)),
      );
      if (!opposed) continue;
      if (!cluster.every(absorbable)) {
        refused['not-absorbable'] = (refused['not-absorbable'] ?? 0) + 1;
        continue;
      }
      tracks += 1;
      placed.push({
        x: lines.get(cluster[0]!.edge)![cluster[0]!.seg]!.x,
        lo: Math.min(...cluster.map((c) => c.lo)),
        hi: Math.max(...cluster.map((c) => c.hi)),
        segments: cluster.length,
      });
      const movesFor = (downDx: number): { span: Span; dx: number }[] =>
        cluster.map((span) => ({ span, dx: span.dir === 1 ? downDx : -downDx }));
      let chosen = movesFor(sides === 'down-east' ? delta : -delta);
      if (sides === 'fewest-crossings') {
        const east = movesFor(delta);
        if (crossingsAfter(lines, east) < crossingsAfter(lines, chosen)) chosen = east;
      }
      moves.push(...chosen);
    }
  }

  return {
    lines: applyMoves(lines, moves),
    tracks,
    segments: moves.length,
    clusters: placed,
    refused,
  };
}

function applyMoves(
  lines: ReadonlyMap<RenderEdge, readonly Point[]>,
  moves: readonly { span: Span; dx: number }[],
): Map<RenderEdge, Point[]> {
  const out = new Map<RenderEdge, Point[]>();
  for (const [edge, line] of lines)
    out.set(
      edge,
      line.map((p) => ({ x: p.x, y: p.y })),
    );
  for (const { span, dx } of moves) {
    const line = out.get(span.edge)!;
    line[span.seg]!.x += dx;
    line[span.seg + 1]!.x += dx;
  }
  return out;
}

/** Proper H×V crossings between different lines, after applying `moves` to one track. */
function crossingsAfter(
  lines: ReadonlyMap<RenderEdge, readonly Point[]>,
  moves: readonly { span: Span; dx: number }[],
): number {
  const moved = applyMoves(lines, moves);
  const touched = new Set(moves.map((m) => m.span.edge));
  type Seg = { edge: RenderEdge; a: Point; b: Point };
  const h: Seg[] = [];
  const v: Seg[] = [];
  for (const [edge, line] of moved) {
    for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1]!;
      const b = line[i]!;
      if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) h.push({ edge, a, b });
      else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) v.push({ edge, a, b });
    }
  }
  let n = 0;
  for (const s of h) {
    for (const t of v) {
      if (s.edge === t.edge || (!touched.has(s.edge) && !touched.has(t.edge))) continue;
      const [x0, x1] = [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)];
      const [y0, y1] = [Math.min(t.a.y, t.b.y), Math.max(t.a.y, t.b.y)];
      if (t.a.x > x0 + 1e-6 && t.a.x < x1 - 1e-6 && s.a.y > y0 + 1e-6 && s.a.y < y1 - 1e-6) n += 1;
    }
  }
  return n;
}
