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

interface Model {
  scene: TsldScene;
  view: Viewport;
  byId: Map<string, RenderActivity>;
  /** Per edge (scene order): the route BEFORE the post-passes, or null if it has no anchors. */
  raw: (Point[] | null)[];
  index: LaneIntervalIndex;
}

const VIEW = (pxPerDay: number): Viewport => ({ pxPerDay, originX: 40, originY: 32 });

function routeOne(model: Model, e: number): Point[] | null {
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
function postPasses(model: Model): { lines: Point[][]; fromLane: number[] } {
  const corridors: { line: Point[]; fromLane: number; toLane: number }[] = [];
  model.raw.forEach((line, e) => {
    if (!line) return;
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
  return { lines: corridors.map((c) => c.line), fromLane: corridors.map((c) => c.fromLane) };
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

function score(
  model: Model,
  lines: Point[][],
  laneOf: ReadonlyMap<string, number>,
  asap: Asap,
  t: Partial<Stages>,
): Objective {
  let s = performance.now();
  const ctx = occlusionContext(model.scene, model.view);
  let occluded = 0;
  for (const line of lines) if (lineOcclusion(line, ctx).foreign > 0) occluded += 1;
  t.occlusion = performance.now() - s;
  s = performance.now();
  const { crossings } = countCrossings(lines.map((pts) => ({ pts })) as never);
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
  const overlaps = drawnOverlaps(laneOf, asap.start, asap.finish);
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
  const { lines } = postPasses(model);
  t.post = performance.now() - s;
  const objective = score(model, lines, layout.laneOf, asap, t);
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
  const { lines } = postPasses(model);
  t.post = performance.now() - s;
  const objective = score(model, lines, laneOf, asap, t);
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
