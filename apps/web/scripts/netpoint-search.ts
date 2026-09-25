/**
 * **NetPoint-layout M0-T4 — a harness-only prototype of spec §4.5's search.**
 *
 * This is NOT the product module and is never copied into one (plan M0-T4 risks): M4 writes the
 * product optimiser and the harness then imports it (FC-N0). What this answers is the question CQ-1
 * left open — what a row budget B buys — and it gives FC-N2's run limb its first real number.
 *
 * ## The search, as §4.5 specifies it
 *
 * - **Phase 0, repair:** bars in drawn-start order (key tie-break); a bar overlapping an
 *   already-settled bar in its row moves to the nearest row where it fits (lower row on a tie),
 *   opening a new row if none does. Repair is the hard constraint and may exceed B; it is reported.
 * - **Phase 1, ordering:** adjacent-row swaps, each evaluated in full.
 * - **Phase 2, alignment:** each bar in drawn-start order may move to {its link neighbours' rows,
 *   current ± 1, current ± 2, one new row if rows < B}, where its drawn span fits.
 * - **Phase 3, compaction:** delete empty rows, evaluated in full like any other move.
 * - A move is accepted **only on a strict lexicographic improvement** of
 *   (overlaps, occluded, crossings, −sameRow, travel, rows), with every cap a count, never a clock.
 *
 * ## Two ways to score an alignment candidate, and which is used where
 *
 * - **`exact`:** every candidate is scored by the full evaluation (routing, the three post-passes,
 *   every counter), and the best strict improvement is taken. Affordable on the smaller plans.
 * - **`filtered`:** every candidate is first scored by a **local delta**. The links a move
 *   re-routes are re-routed without the post-passes, and only their occlusion and crossings change
 *   in the score. The best few improving candidates are then **confirmed by the full evaluation**
 *   before anything is accepted. This is §4.5's "filter" arrangement, and it keeps the never-worse
 *   guarantee exact, because nothing is accepted on the filter's say-so. It exists because
 *   M0-T3 measured a full evaluation at about 250 ms at `scale-2000`.
 *
 * Unit 300 is run in both modes, so the filter's cost in quality is measured, not assumed.
 */
import { glyphIndex } from '../src/features/tsld/render/link-score';
import type { Point } from '../src/features/tsld/render/render-model';

import type { Layout } from './crossing-probe';
import type { unit300Asap } from './lane-travel-probe';
import {
  type Model,
  type Objective,
  applyMoveIncremental,
  barIndex,
  type BarIndex,
  buildModel,
  crossAgainst,
  evaluateFull,
  identityForeign,
  routeOne,
  segIndex,
  type SegIndex,
  segmentsOfLines,
  setAttribution,
  setCounters,
} from './netpoint-evaluate';

type Asap = ReturnType<typeof unit300Asap>;

/** −1 / 0 / 1 for a lexicographically smaller / equal / larger objective. */
export function lexCompare(a: Objective, b: Objective): number {
  const va = [a.overlaps, a.occluded, a.crossings, -a.sameRow, a.travel, a.rows];
  const vb = [b.overlaps, b.occluded, b.crossings, -b.sameRow, b.travel, b.rows];
  for (let i = 0; i < va.length; i += 1) if (va[i] !== vb[i]) return va[i]! < vb[i]! ? -1 : 1;
  return 0;
}
function lexVec(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}

export interface SearchOptions {
  budget: number;
  mode: 'exact' | 'filtered';
  /** Pass cap P. */
  passes?: number;
  /** Full evaluations a filtered bar may spend confirming before it gives up. */
  confirms?: number;
}

export interface SearchResult {
  seed: Objective;
  repaired: Objective;
  final: Objective;
  laneOf: Map<string, number>;
  passes: number;
  filterEvals: number;
  fullEvals: number;
  accepted: { swap: number; move: number; compact: number };
  /** Compactions whose occluded or crossings changed — §4.5 says compaction "changes nothing else". */
  compactionSideEffects: number;
  ms: number;
}

const rowsOf = (laneOf: ReadonlyMap<string, number>): number => {
  let rows = 0;
  for (const lane of laneOf.values()) rows = Math.max(rows, lane + 1);
  return rows;
};

/** Phase 0 — the repair (§4.5; M3's auto-resolve rule, prototyped). */
export function repair(
  asap: Asap,
  seed: ReadonlyMap<string, number>,
  order: string[],
): Map<string, number> {
  const laneOf = new Map(seed);
  const settled = new Map<number, [number, number][]>();
  const fits = (lane: number, s: number, f: number): boolean =>
    (settled.get(lane) ?? []).every(([a, b]) => !(a <= f && s <= b));
  for (const key of order) {
    const s = asap.start.get(key) ?? 0;
    const f = asap.finish.get(key) ?? 0;
    const own = laneOf.get(key) ?? 0;
    let lane = own;
    if (!fits(own, s, f)) {
      lane = -1;
      for (let d = 1; lane < 0; d += 1) {
        if (own - d >= 0 && fits(own - d, s, f)) lane = own - d;
        else if (fits(own + d, s, f)) lane = own + d;
      }
    }
    laneOf.set(key, lane);
    const list = settled.get(lane);
    if (list) list.push([s, f]);
    else settled.set(lane, [[s, f]]);
  }
  return laneOf;
}

function compacted(laneOf: ReadonlyMap<string, number>): Map<string, number> | null {
  const used = [...new Set(laneOf.values())].sort((a, b) => a - b);
  if (used.every((lane, i) => lane === i)) return null;
  const to = new Map(used.map((lane, i) => [lane, i]));
  return new Map([...laneOf].map(([k, lane]) => [k, to.get(lane)!]));
}

/** Everything the filter needs about the current state, rebuilt after each accepted move. */
interface Cache {
  bars: BarIndex;
  occl: boolean[];
  index: SegIndex;
  segsOf: {
    h: ReturnType<typeof segmentsOfLines>['h'];
    v: ReturnType<typeof segmentsOfLines>['v'];
  }[];
}
function buildCache(model: Model): Cache {
  const bars = barIndex(model);
  const occl = model.raw.map((line, e) => {
    const edge = model.scene.edges[e]!;
    return line ? identityForeign(line, edge.predecessorId, edge.successorId, bars) : false;
  });
  const segsOf = model.raw.map((line, e) => segmentsOfLines(line ? [line] : [], [e]));
  const index = segIndex(
    segsOf.flatMap((s) => s.h),
    segsOf.flatMap((s) => s.v),
  );
  return { bars, occl, index, segsOf };
}

export function search(asap: Asap, seedLayout: Layout, options: SearchOptions): SearchResult {
  setCounters('fast');
  setAttribution('identity');
  const t0 = performance.now();
  const passesCap = options.passes ?? 8;
  const confirms = options.confirms ?? 3;
  const B = options.budget;
  const keys = (asap.activities as { key: string }[]).map((a) => a.key);
  const order = [...keys].sort(
    (a, b) => (asap.start.get(a) ?? 0) - (asap.start.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const deps = asap.dependencies as { predecessorKey: string; successorKey: string }[];
  const adjacency = new Map<string, number[]>();
  deps.forEach((d, e) => {
    for (const k of [d.predecessorKey, d.successorKey]) {
      const list = adjacency.get(k);
      if (list) list.push(e);
      else adjacency.set(k, [e]);
    }
  });

  let fullEvals = 0;
  let filterEvals = 0;
  const full = (laneOf: Map<string, number>): Objective => {
    fullEvals += 1;
    return evaluateFull(asap, { name: 'x', laneOf, lanes: rowsOf(laneOf) }).objective;
  };

  const seed = full(new Map(seedLayout.laneOf));
  let laneOf = repair(asap, seedLayout.laneOf, order);
  let obj = full(laneOf);
  const repaired = obj;
  let model = buildModel(asap, { name: 'x', laneOf, lanes: rowsOf(laneOf) });
  let cache = buildCache(model);
  const accepted = { swap: 0, move: 0, compact: 0 };
  let compactionSideEffects = 0;

  const adopt = (next: Map<string, number>, nextObj: Objective): void => {
    laneOf = next;
    obj = nextObj;
    model = buildModel(asap, { name: 'x', laneOf, lanes: rowsOf(laneOf) });
    cache = buildCache(model);
  };

  let pass = 0;
  for (; pass < passesCap; pass += 1) {
    let acceptedThisPass = 0;

    // ---- Phase 1: adjacent-row swaps ----
    for (let r = 0; r + 1 < rowsOf(laneOf); r += 1) {
      const next = new Map(
        [...laneOf].map(([k, lane]) => [k, lane === r ? r + 1 : lane === r + 1 ? r : lane]),
      );
      const o = full(next);
      if (lexCompare(o, obj) < 0) {
        adopt(next, o);
        accepted.swap += 1;
        acceptedThisPass += 1;
      }
    }

    // ---- Phase 2: single-bar moves ----
    for (const key of order) {
      const cur = laneOf.get(key)!;
      const s = asap.start.get(key) ?? 0;
      const f = asap.finish.get(key) ?? 0;
      const rows = rowsOf(laneOf);
      const lanes = new Set<number>([cur - 2, cur - 1, cur + 1, cur + 2]);
      for (const e of adjacency.get(key) ?? []) {
        const d = deps[e]!;
        lanes.add(laneOf.get(d.predecessorKey === key ? d.successorKey : d.predecessorKey)!);
      }
      if (rows < B) lanes.add(rows);
      const candidates = [...lanes]
        .filter((lane) => lane >= 0 && lane < B && lane !== cur && lane <= rows)
        .filter((lane) => {
          for (const [k, l] of laneOf) {
            if (l !== lane || k === key) continue;
            if ((asap.start.get(k) ?? 0) <= f && s <= (asap.finish.get(k) ?? 0)) return false;
          }
          return true;
        })
        .sort((a, b) => a - b);
      if (candidates.length === 0) continue;

      let ranked: number[];
      if (options.mode === 'exact') {
        ranked = candidates;
      } else {
        const scored: { lane: number; vec: number[] }[] = [];
        for (const lane of candidates) {
          filterEvals += 1;
          const vec = localDelta(model, cache, laneOf, adjacency, deps, key, cur, lane);
          if (lexVec(vec, [0, 0, 0, 0, 0]) < 0) scored.push({ lane, vec });
        }
        scored.sort((a, b) => lexVec(a.vec, b.vec) || a.lane - b.lane);
        ranked = scored.slice(0, confirms).map((c) => c.lane);
      }

      let best: { lane: number; obj: Objective } | null = null;
      for (const lane of ranked) {
        const snapshot = {
          scene: model.scene,
          byId: new Map(model.byId),
          raw: model.raw.slice(),
          index: model.index,
        };
        fullEvals += 1;
        const r = applyMoveIncremental(model, asap, laneOf, key, lane);
        // Restore: the move is only a trial.
        model.scene = snapshot.scene;
        model.byId = snapshot.byId;
        model.raw = snapshot.raw;
        model.index = snapshot.index;
        laneOf.set(key, cur);
        const better = lexCompare(r.objective, best ? best.obj : obj) < 0;
        if (better) best = { lane, obj: r.objective };
        // Filtered mode takes the first confirmed improvement in ranked order; exact takes the best.
        if (better && options.mode === 'filtered') break;
      }
      if (best && lexCompare(best.obj, obj) < 0) {
        const next = new Map(laneOf);
        next.set(key, best.lane);
        adopt(next, best.obj);
        accepted.move += 1;
        acceptedThisPass += 1;
      }
    }

    // ---- Phase 3: compaction ----
    const packed = compacted(laneOf);
    if (packed) {
      const o = full(packed);
      if (lexCompare(o, obj) < 0) {
        if (o.occluded !== obj.occluded || o.crossings !== obj.crossings)
          compactionSideEffects += 1;
        adopt(packed, o);
        accepted.compact += 1;
        acceptedThisPass += 1;
      }
    }
    if (acceptedThisPass === 0) {
      pass += 1;
      break;
    }
  }

  return {
    seed,
    repaired,
    final: obj,
    laneOf,
    passes: pass,
    filterEvals,
    fullEvals,
    accepted,
    compactionSideEffects,
    ms: performance.now() - t0,
  };
}

/**
 * The filter: how a move changes (occluded, crossings, −sameRow, travel, rows), counting only the
 * links it re-routes and ignoring the three post-passes. Restores the model before returning.
 */
function localDelta(
  model: Model,
  cache: Cache,
  laneOf: Map<string, number>,
  adjacency: Map<string, number[]>,
  deps: { predecessorKey: string; successorKey: string }[],
  key: string,
  from: number,
  to: number,
): number[] {
  const moved = model.byId.get(key)!;
  const savedIndex = model.index;
  model.byId.set(key, { ...moved, laneIndex: to });
  const touched = model.scene.activities
    .map((a) => model.byId.get(a.id)!)
    .filter((a) => a.laneIndex === from || a.laneIndex === to);
  const patch = glyphIndex(touched, model.view, model.scene.dataDate);
  const next = new Map(model.index);
  next.delete(from);
  next.delete(to);
  for (const [lane, spans] of patch) next.set(lane, spans);
  model.index = next;
  const bars = barIndex(model, [from, to], cache.bars);

  const affected: number[] = [];
  model.scene.edges.forEach((edge, e) => {
    const p = model.byId.get(edge.predecessorId);
    const q = model.byId.get(edge.successorId);
    if (!p || !q) return;
    const incident = edge.predecessorId === key || edge.successorId === key;
    const lo = Math.min(p.laneIndex, q.laneIndex);
    const hi = Math.max(p.laneIndex, q.laneIndex);
    if (incident || (from >= lo && from <= hi) || (to >= lo && to <= hi)) affected.push(e);
  });
  const exclude = new Set(affected);
  const newLines: (Point[] | null)[] = affected.map((e) => routeOne(model, e));

  let dOccl = 0;
  for (let i = 0; i < affected.length; i += 1) {
    const line = newLines[i];
    const edge = model.scene.edges[affected[i]!]!;
    const now = line ? identityForeign(line, edge.predecessorId, edge.successorId, bars) : false;
    dOccl += Number(now) - Number(cache.occl[affected[i]!]);
  }
  const oldSegs = segmentsOfLines(
    affected.map((e) => model.raw[e] ?? []),
    affected,
  );
  const newSegs = segmentsOfLines(
    newLines.map((l) => l ?? []),
    affected,
  );
  const internal = (s: typeof oldSegs): number => crossAgainst(s.h, [], segIndex([], s.v));
  const dCross =
    crossAgainst(newSegs.h, newSegs.v, cache.index, exclude) +
    internal(newSegs) -
    crossAgainst(oldSegs.h, oldSegs.v, cache.index, exclude) -
    internal(oldSegs);

  let dSame = 0;
  let dTravel = 0;
  for (const e of adjacency.get(key) ?? []) {
    const d = deps[e]!;
    const other = laneOf.get(d.predecessorKey === key ? d.successorKey : d.predecessorKey)!;
    dSame += Number(other === to) - Number(other === from);
    dTravel += Math.abs(other - to) - Math.abs(other - from);
  }
  const rowsBefore = rowsOf(laneOf);
  laneOf.set(key, to);
  const dRows = rowsOf(laneOf) - rowsBefore;
  laneOf.set(key, from);

  model.byId.set(key, moved);
  model.index = savedIndex;
  return [dOccl, dCross, -dSame, dTravel, dRows];
}

export { chainPlacedLayouts, drawnOverlaps, sceneFor, smallPlanLayouts } from './crossing-probe';
export { activityRect as rectOf } from '../src/features/tsld/render/geometry';
export {
  countCrossingsFast,
  linesWithEdges,
  evaluateFull,
  objectiveKey,
  overlapsFast,
  packedOnDrawn,
  scalePlan,
  setAttribution,
  setCounters,
  unit300Layouts,
} from './netpoint-evaluate';
