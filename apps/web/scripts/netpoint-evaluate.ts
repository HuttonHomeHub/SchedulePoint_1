/**
 * **NetPoint-layout M0-T3 — what one evaluation of a layout costs (FC-N2).**
 *
 * The optimiser (spec §4.5) scores a candidate layout on a lexicographic vector — overlaps, foreign-
 * occluded links, crossings, same-row chains, travel, rows — and the architecture question is how
 * often it can afford to. This module is the **harness** evaluator, never the product one: M4 writes
 * the product module and this file then imports it (plan M0-T4 risks, FC-N0).
 *
 * ## One line set, the painter's
 *
 * The lines are built by the same five functions `paint.ts:1152-1298` composes, in the same order —
 * `laneIntervalIndex` → `lagAnchorPoints` → `routeOrthogonal` (with the endpoint spans) →
 * `chooseCorridorsByCrossing` → `bundleCorridors` → `packGutterChannels` — which is the model
 * `crossing-probe.ts`'s `avoidableOcclusions` already built and digested against the picture.
 * {@link painterDigest} is that control again, run here rather than trusted: a whole-plan evaluator
 * that routes a different line set is a second opinion about the diagram, and the optimiser would
 * optimise it (the ADR-0065 `routeOrthogonal` argument).
 *
 * ## Full and incremental
 *
 * **Full** re-routes every link. **Incremental** is the plan's M0-T3 definition verbatim: after one
 * activity moves from lane `a` to lane `b`, re-route the links incident to it **and every link whose
 * lane span touches `a` or `b`** (their corridor and leg obstacles changed), then re-run the three
 * post-passes over the whole set — because those passes are whole-set decisions and are not
 * incremental by construction. The counters are then run in full in both.
 *
 * So incremental can only save the **routing** term, and every stage is timed apart
 * so the verdict can see which term dominates rather than inferring it from a total.
 */
import { createHash } from 'node:crypto';

import {
  activityRect,
  BAR_HEIGHT,
  LANE_HEIGHT,
  rowSlots,
} from '../src/features/tsld/render/geometry';
import {
  bundleCorridors,
  chooseCorridorsByCrossing,
  corridorGap,
  lagAnchorPoints,
  laneIntervalIndex,
  type LaneIntervalIndex,
  packGutterChannels,
  routeOrthogonal,
} from '../src/features/tsld/render/link-routing';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import type { Point, RenderActivity, Viewport } from '../src/features/tsld/render/render-model';
import { ELAPSED_DAY_WALK } from '../src/features/tsld/render/working-time';

import {
  countCrossings,
  drawnOverlaps,
  type Layout,
  lineOcclusion,
  linkPaths,
  occlusionContext,
  PALETTE,
  recordingCtx,
  sceneFor,
  sortedDigest,
} from './crossing-probe';
import type { unit300Asap } from './lane-travel-probe';

type Asap = ReturnType<typeof unit300Asap>;

export interface Objective {
  overlaps: number;
  occluded: number;
  crossings: number;
  sameRow: number;
  travel: number;
  rows: number;
}

export interface Model {
  scene: TsldScene;
  view: Viewport;
  byId: Map<string, RenderActivity>;
  /** Per edge (scene order): the route BEFORE the post-passes, or null if it has no anchors. */
  raw: (Point[] | null)[];
  index: LaneIntervalIndex;
}

const VIEW = (pxPerDay: number): Viewport => ({ pxPerDay, originX: 40, originY: 32 });

export function routeOne(model: Model, e: number): Point[] | null {
  const { scene, view, byId, index } = model;
  const edge = scene.edges[e]!;
  const pred = byId.get(edge.predecessorId);
  const succ = byId.get(edge.successorId);
  if (!pred || !succ) return null;
  const anchors = lagAnchorPoints(
    pred,
    succ,
    edge.type,
    edge.lagDays ?? 0,
    view,
    scene.dataDate,
    ELAPSED_DAY_WALK,
  );
  if (!anchors) return null;
  const predRect = activityRect(pred, view, scene.dataDate);
  const succRect = activityRect(succ, view, scene.dataDate);
  return routeOrthogonal(anchors.pred, anchors.succ, edge.type, view, 0, {
    index,
    fromLane: pred.laneIndex,
    toLane: succ.laneIndex,
    laneHeight: LANE_HEIGHT,
    barHeight: BAR_HEIGHT,
    ...(predRect ? { fromSpan: { x0: predRect.x, x1: predRect.x + predRect.w } } : {}),
    ...(succRect ? { toSpan: { x0: succRect.x, x1: succRect.x + succRect.w } } : {}),
  });
}

/** The three whole-set passes, in the painter's order, over COPIES of the raw routes. */
function postPasses(model: Model): { lines: Point[][]; fromLane: number[]; edges: number[] } {
  const corridors: { line: Point[]; fromLane: number; toLane: number }[] = [];
  const edges: number[] = [];
  model.raw.forEach((line, e) => {
    if (!line) return;
    edges.push(e);
    const edge = model.scene.edges[e]!;
    corridors.push({
      line: line.map((p) => ({ x: p.x, y: p.y })),
      fromLane: model.byId.get(edge.predecessorId)!.laneIndex,
      toLane: model.byId.get(edge.successorId)!.laneIndex,
    });
  });
  if (corridors.length > 1) {
    chooseCorridorsByCrossing(corridors, model.index, corridorGap(model.view));
    bundleCorridors(corridors, model.index);
    packGutterChannels(corridors, rowSlots(0).clearHalfBandPx);
  }
  return {
    lines: corridors.map((c) => c.line),
    fromLane: corridors.map((c) => c.fromLane),
    edges,
  };
}

/** The drawn lines, each with the ids of the two activities it connects. */
export function linesWithEdges(model: Model): { line: Point[]; pred: string; succ: string }[] {
  const { lines, edges } = postPasses(model);
  return lines.map((line, i) => {
    const edge = model.scene.edges[edges[i]!]!;
    return { line, pred: edge.predecessorId, succ: edge.successorId };
  });
}

export function buildModel(asap: Asap, layout: Layout, pxPerDay = 4): Model {
  const { scene } = sceneFor(asap, layout);
  const view = VIEW(pxPerDay);
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const model: Model = {
    scene,
    view,
    byId,
    raw: [],
    index: laneIntervalIndex(scene.activities, view, scene.dataDate),
  };
  model.raw = scene.edges.map((_, e) => routeOne(model, e));
  return model;
}

export interface Stages {
  index: number;
  route: number;
  post: number;
  occlusion: number;
  crossings: number;
  /** The harness's overlap counter is all-pairs; the product's is a per-lane sort (spec §4.5). */
  overlaps: number;
  total: number;
}

/**
 * **Which counters the objective uses.** `naive` is the harness's own all-pairs pair (what M0-T3's
 * table was timed with, so that record stays reproducible); `fast` is a sort-and-sweep pair written
 * for the M0-T4 search. They must return the same numbers — `measure-netpoint-search.mjs` checks
 * that on every plan before it trusts a single search result.
 */
let counters: 'naive' | 'fast' = 'naive';
export function setCounters(mode: 'naive' | 'fast'): void {
  counters = mode;
}

const EPS = 0.001;

/**
 * **How a leg's "own" bar is decided (M0-T4 finding).** `position` is `crossing-probe.ts`'s
 * `lineOcclusion`: it recovers a link's own bars from WHERE its polyline starts and ends, via
 * `barAt`, which returns the first bar in list order within 0.5 px. Where two bars touch end to end —
 * `packLanes` packs them exactly so — an anchor sits on both, the neighbour can be taken for the link's
 * own bar, and a leg running behind that neighbour is not counted. It is therefore **order-dependent**:
 * Unit 300 reads 49 in fixture order and 54 with the activity list reversed, over byte-identical lines.
 * `identity` excludes the link's two endpoint bars **by id**, which the product counter will do because
 * it has the ids, and reads 58 in either order. The recorder-based harness cannot do this, because a
 * recorded path carries no link identity (ADR-0149 D1); this evaluator can, because its lines are the
 * painter's digest-verified set built with the edge in hand.
 */
let attribution: 'position' | 'identity' = 'position';
export function setAttribution(mode: 'position' | 'identity'): void {
  attribution = mode;
}

const EPS_Y = 0.01;
const EPS_X = 0.5;

export interface BarIndex {
  /** lane → bars in that lane, with their ids. */
  byLane: Map<number, { id: string; x0: number; x1: number }[]>;
  /** lane → the lane's bar extent (every bar in a lane shares it). */
  extent: Map<number, { top: number; bottom: number }>;
}
export function barIndex(model: Model, lanes?: readonly number[], base?: BarIndex): BarIndex {
  const byLane = new Map(base?.byLane);
  const extent = new Map(base?.extent);
  if (lanes)
    for (const lane of lanes) {
      byLane.delete(lane);
      extent.delete(lane);
    }
  for (const scene of model.scene.activities) {
    const a = model.byId.get(scene.id)!;
    if (lanes && !lanes.includes(a.laneIndex)) continue;
    const rect = activityRect(a, model.view, model.scene.dataDate);
    if (rect === null) continue;
    const list = byLane.get(a.laneIndex);
    const bar = { id: a.id, x0: rect.x, x1: rect.x + rect.w };
    if (list) list.push(bar);
    else byLane.set(a.laneIndex, [bar]);
    if (!extent.has(a.laneIndex)) extent.set(a.laneIndex, { top: rect.y, bottom: rect.y + rect.h });
  }
  return { byLane, extent };
}
/** Does any horizontal leg of `line` run over a bar that is neither of its endpoints? */
export function identityForeign(
  line: readonly Point[],
  pred: string,
  succ: string,
  bars: BarIndex,
): boolean {
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    if (Math.abs(a.y - b.y) > EPS_Y) continue;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    for (const [lane, ext] of bars.extent) {
      if (a.y < ext.top - EPS_Y || a.y > ext.bottom + EPS_Y) continue;
      for (const bar of bars.byLane.get(lane) ?? []) {
        if (bar.id === pred || bar.id === succ) continue;
        if (Math.min(hi, bar.x1) - Math.max(lo, bar.x0) > EPS_X) return true;
      }
    }
  }
  return false;
}

/** One link's axis-aligned segments, tagged with the link — `segmentsOf`'s definition exactly. */
export interface Seg {
  link: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export function segmentsOfLines(
  lines: readonly (readonly Point[])[],
  ids?: readonly number[],
): {
  h: Seg[];
  v: Seg[];
} {
  const h: Seg[] = [];
  const v: Seg[] = [];
  lines.forEach((pts, i) => {
    const link = ids ? ids[i]! : i;
    for (let k = 1; k < pts.length; k += 1) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const horizontal = Math.abs(a.y - b.y) < EPS;
      const vertical = Math.abs(a.x - b.x) < EPS;
      if (!horizontal && !vertical) continue;
      const seg = { link, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      // A zero-length segment is BOTH, exactly as `countCrossings` classifies it.
      if (horizontal) h.push(seg);
      if (vertical) v.push(seg);
    }
  });
  return { h, v };
}

/** Verticals sorted by x and horizontals sorted by y, for range queries. */
export interface SegIndex {
  v: Seg[];
  vx: Float64Array;
  h: Seg[];
  hy: Float64Array;
}
export function segIndex(h: Seg[], v: Seg[]): SegIndex {
  const vs = [...v].sort((a, b) => a.x0 - b.x0);
  const hs = [...h].sort((a, b) => a.y0 - b.y0);
  return {
    v: vs,
    vx: Float64Array.from(vs.map((s) => s.x0)),
    h: hs,
    hy: Float64Array.from(hs.map((s) => s.y0)),
  };
}
function lowerBound(arr: Float64Array, value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo; // first index with arr[i] > value
}

/**
 * Crossings between the segments `h`/`v` (one link set) and an index (another), skipping any
 * index segment whose link is in `exclude` and any pair sharing a link. `countCrossings`'s
 * predicate exactly: the vertical's x strictly inside the horizontal, the horizontal's y strictly
 * inside the vertical.
 */
export function crossAgainst(
  h: readonly Seg[],
  v: readonly Seg[],
  index: SegIndex,
  exclude?: ReadonlySet<number>,
): number {
  let n = 0;
  for (const s of h) {
    const lo = Math.min(s.x0, s.x1) + EPS;
    const hi = Math.max(s.x0, s.x1) - EPS;
    for (let i = lowerBound(index.vx, lo); i < index.v.length && index.vx[i]! < hi; i += 1) {
      const t = index.v[i]!;
      if (t.link === s.link || exclude?.has(t.link)) continue;
      if (s.y0 > Math.min(t.y0, t.y1) + EPS && s.y0 < Math.max(t.y0, t.y1) - EPS) n += 1;
    }
  }
  for (const s of v) {
    const lo = Math.min(s.y0, s.y1) + EPS;
    const hi = Math.max(s.y0, s.y1) - EPS;
    for (let i = lowerBound(index.hy, lo); i < index.h.length && index.hy[i]! < hi; i += 1) {
      const t = index.h[i]!;
      if (t.link === s.link || exclude?.has(t.link)) continue;
      if (s.x0 > Math.min(t.x0, t.x1) + EPS && s.x0 < Math.max(t.x0, t.x1) - EPS) n += 1;
    }
  }
  return n;
}

/** Whole-set crossings by sweep: every horizontal against the x-sorted verticals. */
export function countCrossingsFast(lines: readonly (readonly Point[])[]): number {
  const { h, v } = segmentsOfLines(lines);
  return crossAgainst(h, [], segIndex([], v));
}

/** Same-row drawn-span overlap pairs by a per-lane sort — `drawnOverlaps`'s predicate exactly. */
export function overlapsFast(
  laneOf: ReadonlyMap<string, number>,
  start: ReadonlyMap<string, number>,
  finish: ReadonlyMap<string, number>,
): number {
  const byLane = new Map<number, [number, number][]>();
  for (const [key, lane] of laneOf) {
    const span: [number, number] = [start.get(key) ?? 0, finish.get(key) ?? 0];
    const list = byLane.get(lane);
    if (list) list.push(span);
    else byLane.set(lane, [span]);
  }
  let n = 0;
  for (const spans of byLane.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length && spans[j]![0] <= spans[i]![1]; j += 1) {
        // start_j >= start_i; the pair overlaps iff start_j <= finish_i AND start_i <= finish_j.
        if (spans[i]![0] <= spans[j]![1]) n += 1;
      }
    }
  }
  return n;
}

function score(
  model: Model,
  lines: Point[][],
  edges: number[],
  laneOf: ReadonlyMap<string, number>,
  asap: Asap,
  t: Partial<Stages>,
): Objective {
  let s = performance.now();
  let occluded = 0;
  if (attribution === 'identity') {
    const bars = barIndex(model);
    lines.forEach((line, i) => {
      const edge = model.scene.edges[edges[i]!]!;
      if (identityForeign(line, edge.predecessorId, edge.successorId, bars)) occluded += 1;
    });
  } else {
    const ctx = occlusionContext(model.scene, model.view);
    for (const line of lines) if (lineOcclusion(line, ctx).foreign > 0) occluded += 1;
  }
  t.occlusion = performance.now() - s;
  s = performance.now();
  const crossings =
    counters === 'fast'
      ? countCrossingsFast(lines)
      : countCrossings(lines.map((pts) => ({ pts })) as never).crossings;
  t.crossings = performance.now() - s;

  const deps = asap.dependencies as { predecessorKey: string; successorKey: string }[];
  let sameRow = 0;
  let travel = 0;
  for (const d of deps) {
    const a = laneOf.get(d.predecessorKey) ?? 0;
    const b = laneOf.get(d.successorKey) ?? 0;
    if (a === b) sameRow += 1;
    travel += Math.abs(a - b);
  }
  let rows = 0;
  for (const lane of laneOf.values()) rows = Math.max(rows, lane + 1);
  s = performance.now();
  const overlaps =
    counters === 'fast'
      ? overlapsFast(laneOf, asap.start, asap.finish)
      : drawnOverlaps(laneOf, asap.start, asap.finish);
  t.overlaps = performance.now() - s;
  return {
    overlaps,
    occluded,
    crossings,
    sameRow,
    travel,
    rows,
  };
}

/** A full whole-plan evaluation, timed by stage. */
export function evaluateFull(
  asap: Asap,
  layout: Layout,
  pxPerDay = 4,
): { objective: Objective; digest: string; stages: Stages; model: Model } {
  const t: Partial<Stages> = {};
  const t0 = performance.now();
  let s = t0;
  const { scene } = sceneFor(asap, layout);
  const view = VIEW(pxPerDay);
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const model: Model = {
    scene,
    view,
    byId,
    raw: [],
    index: laneIntervalIndex(scene.activities, view, scene.dataDate),
  };
  t.index = performance.now() - s;
  s = performance.now();
  model.raw = scene.edges.map((_, e) => routeOne(model, e));
  t.route = performance.now() - s;
  s = performance.now();
  const { lines, edges } = postPasses(model);
  t.post = performance.now() - s;
  const objective = score(model, lines, edges, layout.laneOf, asap, t);
  t.total = performance.now() - t0;
  return { objective, digest: sortedDigest(lines), stages: t as Stages, model };
}

/**
 * Apply one move (activity `key` to lane `to`) to a live model and re-evaluate INCREMENTALLY.
 *
 * `skipLane` is the equivalence control's red mutation: when set, links that touch the
 * DESTINATION lane without being incident are NOT re-routed — the plan's named way to break it
 * (M0-T3 Testing: "deliberately skipping one lane's re-route").
 */
export function applyMoveIncremental(
  model: Model,
  asap: Asap,
  laneOf: Map<string, number>,
  key: string,
  to: number,
  options: { skipLane?: boolean } = {},
): { objective: Objective; digest: string; stages: Stages; rerouted: number } {
  const t: Partial<Stages> = {};
  const t0 = performance.now();
  let s = t0;
  const moved = model.byId.get(key)!;
  const from = moved.laneIndex;
  const updated = { ...moved, laneIndex: to };
  model.byId.set(key, updated);
  model.scene = {
    ...model.scene,
    activities: model.scene.activities.map((a) => (a.id === key ? updated : a)),
  };
  laneOf.set(key, to);

  // Patch the two lanes of the index rather than rebuilding it.
  const touched = model.scene.activities.filter((a) => a.laneIndex === from || a.laneIndex === to);
  const patch = laneIntervalIndex(touched, model.view, model.scene.dataDate);
  const next = new Map(model.index);
  next.delete(from);
  next.delete(to);
  for (const [lane, spans] of patch) next.set(lane, spans);
  model.index = next;
  t.index = performance.now() - s;

  s = performance.now();
  let rerouted = 0;
  model.scene.edges.forEach((edge, e) => {
    const p = model.byId.get(edge.predecessorId);
    const q = model.byId.get(edge.successorId);
    if (!p || !q) return;
    const incident = edge.predecessorId === key || edge.successorId === key;
    const lo = Math.min(p.laneIndex, q.laneIndex);
    const hi = Math.max(p.laneIndex, q.laneIndex);
    const touchesFrom = from >= lo && from <= hi;
    const touchesTo = to >= lo && to <= hi;
    const touches = options.skipLane === true ? touchesFrom : touchesFrom || touchesTo;
    if (!incident && !touches) return;
    model.raw[e] = routeOne(model, e);
    rerouted += 1;
  });
  t.route = performance.now() - s;
  s = performance.now();
  const { lines, edges } = postPasses(model);
  t.post = performance.now() - s;
  const objective = score(model, lines, edges, laneOf, asap, t);
  t.total = performance.now() - t0;
  return { objective, digest: sortedDigest(lines), stages: t as Stages, rerouted };
}

/**
 * The painter's own line set for the same layout, digested the same way — the agreement control.
 * The canvas is sized to the whole plan, so every link is drawn (the `readVector` sizing).
 */
export function painterDigest(asap: Asap, layout: Layout, pxPerDay = 4): string {
  const { scene } = sceneFor(asap, layout);
  const view = VIEW(pxPerDay);
  const acts = asap.activities as { key: string }[];
  const maxDay = Math.max(...acts.map((a) => asap.finish.get(a.key) ?? 0));
  const size = {
    width: (maxDay + 4) * pxPerDay + 400,
    height: Math.max(layout.lanes, 145) * LANE_HEIGHT + 200 + view.originY,
  };
  const { ctx, paths } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  return sortedDigest(linkPaths(paths).map((p) => p.pts));
}

/** mulberry32 — a seeded PRNG, so the 1,000 sampled moves are the same moves on every run. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function objectiveKey(o: Objective): string {
  return createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 12);
}

export { packedOnDrawn, scalePlan, unit300Layouts } from './crossing-probe';
