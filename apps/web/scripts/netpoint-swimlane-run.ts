/**
 * **Swimlanes M0-T4 — what does a partitioned Tidy and Re-layout cost, and buy, in node?**
 * (`docs/specs/swimlanes/implementation-plan.md`, feature-spec §4.5.)
 *
 * The unpartitioned columns run the PRODUCT's `optimiseLayout`, `relayoutSeeds` and `pickBestStart`
 * unchanged. The partitioned columns run {@link partitionedOptimise} below, which is a **copy of
 * `optimiseLayout`'s four phases with the §4.5 restrictions added**, and nothing in the product is
 * touched (the partition reaches the product in M2-T6). A copy can drift, so {@link selfTest} proves
 * it: with ONE swimlane holding every bar it must return `optimiseLayout`'s lanes exactly, on every
 * plan measured. It shares the product's objective (`evaluateLayout`), order (`compareObjectives`),
 * packer and nearest-free-row (`@repo/layout`, with the M0-T2 `partition` argument).
 *
 * **Lanes in the search are LOCAL to a swimlane** (the same "lane within swimlane" that
 * `deriveSwimlaneLanes` returns); the objective is scored on **display lanes**, the swimlanes stacked
 * in `order`, each as tall as its highest lane (at least one row). So a link between swimlanes is
 * scored, which is the point of §4.5.
 *
 * Node figures bound the algorithm, not the product owner's hardware (#75). The text width is the
 * harness's 6 px a character (`HARNESS_TEXT`), as `netpoint-optimise-run.ts` uses, not the browser's
 * `textWidthTable`.
 */
import { packLanes, nearestFreeRow, type PackItem } from '@repo/layout';
import { scaleSpec } from '@repo/seed/scale';

import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';
import {
  compareObjectives,
  evaluateLayout,
  LAYOUT_REFERENCE_PX_PER_DAY,
  type LayoutObjective,
  type LayoutScene,
} from '../src/features/tsld/render/layout-objective';
import {
  DEFAULT_EVALUATIONS_PER_PASS,
  DEFAULT_MAX_EVALUATIONS,
  DEFAULT_PASSES,
  optimiseLayout,
  OPTIMISE_MAX_ACTIVITIES,
} from '../src/features/tsld/render/optimise-layout';
import {
  chainRowsStart,
  depthFirstStart,
  pickBestStart,
  relayoutSeeds,
  relayoutStartIds,
  unhintedPackStart,
  type StartId,
} from '../src/features/tsld/render/relayout-starts';
import {
  axisDayOf,
  type RenderActivity,
  type RenderEdge,
} from '../src/features/tsld/render/render-model';
import type { PlacedText } from '../src/features/tsld/render/row-text-layout';

import { HARNESS_TEXT } from './crossing-probe';
import corpus from './fixtures/relayout-corpus.json';

/** A plan as this harness reads it: the canvas's scene, the swimlane of each activity, their order. */
export interface Case {
  name: string;
  /** How the swimlanes were chosen, quoted with the reading. */
  split: string;
  dataDate: string;
  activities: RenderActivity[];
  edges: RenderEdge[];
  partition: Map<string, string>;
  order: string[];
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// --- the cases ----------------------------------------------------------------------------------

function corpusPlan(seedName: string): {
  dataDate: string;
  activities: RenderActivity[];
  edges: RenderEdge[];
} {
  const p = (
    corpus as unknown as {
      plans: {
        seedName: string;
        dataDate: string;
        activities: RenderActivity[];
        edges: RenderEdge[];
      }[];
    }
  ).plans.find((x) => x.seedName === seedName);
  if (p === undefined) throw new Error(`the committed corpus has no ${seedName}`);
  return p;
}

/** Order swimlane keys by their first appearance in `keys`, which is the plan's own order. */
function orderOf(keys: Iterable<string>): string[] {
  return [...new Set(keys)];
}

function powerPlant(): Case {
  const p = corpusPlan('reference-netpoint-power-plant');
  const prefix = (code: string): string => code.split('_')[0]!;
  const counts = new Map<string, number>();
  for (const a of p.activities) counts.set(prefix(a.code!), (counts.get(prefix(a.code!)) ?? 0) + 1);
  // A system is a code prefix with at least two activities that is not the milestone prefix; the
  // one-offs and the milestones share "Common", so no swimlane is a lone bar.
  const keyOf = (code: string): string =>
    counts.get(prefix(code))! >= 2 && prefix(code) !== 'M' ? prefix(code) : 'Common';
  const partition = new Map(p.activities.map((a) => [a.id, keyOf(a.code!)]));
  return {
    name: 'reference-netpoint-power-plant',
    split: 'by system: the code prefix (EI, P, B, S, C, CW, CH, AQ, SW, CO), the rest in "Common"',
    ...p,
    partition,
    order: orderOf(p.activities.map((a) => partition.get(a.id)!)),
  };
}

function torture(): Case {
  const p = corpusPlan('fixture-p6-torture-v1');
  // The corpus has no WBS parent, so the swimlane is the activity code's thousands digit (A1xxx..A9xxx),
  // P6's own convention for the work package, and the WBS summaries are their own swimlane.
  const keyOf = (a: RenderActivity): string =>
    /^A\d/.test(a.code ?? '') ? `A${a.code!.slice(1, 2)}` : 'Summaries';
  const partition = new Map(p.activities.map((a) => [a.id, keyOf(a)]));
  return {
    name: 'fixture-p6-torture-v1',
    split: 'by work package: the thousands digit of the activity code (A1..A9), summaries apart',
    ...p,
    partition,
    order: orderOf(p.activities.map((a) => partition.get(a.id)!)).sort(byKey),
  };
}

function scale(count: number): Case {
  const scene = scaleScene(count);
  const spec = scaleSpec({ activities: count });
  const parentOf = new Map(spec.activities.map((a) => [a.key, a.parentKey]));
  const phaseOf = (key: string): string => {
    let at = key;
    for (;;) {
      const up = parentOf.get(at);
      if (up === null || up === undefined) return at;
      const next = parentOf.get(up);
      if (next === null || next === undefined) return up;
      at = up;
    }
  };
  const partition = new Map(scene.activities.map((a) => [a.id, phaseOf(a.id)]));
  return {
    name: `scale-${String(count)}`,
    split: 'by phase: the top WBS level of the generator',
    dataDate: '2026-01-01',
    activities: scene.activities,
    edges: scene.edges,
    partition,
    order: orderOf(
      spec.activities.map((a) => partition.get(a.key)).filter((k): k is string => k !== undefined),
    ),
  };
}

// --- lanes: local <-> display -------------------------------------------------------------------

type Lanes = ReadonlyMap<string, number>;

/** Rows of each swimlane: its highest lane + 1, and at least one. */
function bandRows(c: Case, local: Lanes): Map<string, number> {
  const rows = new Map(c.order.map((k) => [k, 1]));
  for (const [id, lane] of local) {
    const k = c.partition.get(id)!;
    rows.set(k, Math.max(rows.get(k)!, lane + 1));
  }
  return rows;
}

function offsetsOf(c: Case, rows: ReadonlyMap<string, number>): Map<string, number> {
  const offsets = new Map<string, number>();
  let at = 0;
  for (const k of c.order) {
    offsets.set(k, at);
    at += rows.get(k)!;
  }
  return offsets;
}

export function displayOf(c: Case, local: Lanes): Map<string, number> {
  const offsets = offsetsOf(c, bandRows(c, local));
  return new Map([...local].map(([id, lane]) => [id, offsets.get(c.partition.get(id)!)! + lane]));
}

export const displayRows = (c: Case, local: Lanes): number =>
  [...bandRows(c, local).values()].reduce((a, b) => a + b, 0);

/** The diagram as it stands, read per swimlane: each swimlane's distinct rows, in order, from 0. */
export function localise(c: Case, global: Lanes): Map<string, number> {
  const local = new Map<string, number>();
  for (const k of c.order) {
    const members = c.activities.filter((a) => c.partition.get(a.id) === k);
    const rows = [...new Set(members.map((a) => global.get(a.id) ?? a.laneIndex))].sort(
      (a, b) => a - b,
    );
    const rank = new Map(rows.map((r, i) => [r, i]));
    for (const a of members) local.set(a.id, rank.get(global.get(a.id) ?? a.laneIndex)!);
  }
  return local;
}

const rowsOf = (lanes: Lanes): number => {
  let rows = 0;
  for (const lane of lanes.values()) rows = Math.max(rows, lane + 1);
  return rows;
};

// --- the partitioned search ---------------------------------------------------------------------

export interface PartitionedResult {
  lanes: Map<string, number>;
  seed: LayoutObjective;
  repaired: LayoutObjective;
  final: LayoutObjective;
  passes: number;
  evaluations: number;
  capped: boolean;
}

interface Bar {
  id: string;
  startDay: number;
  endDay: number;
}

export function partitionedOptimise(
  c: Case,
  startLocal: Lanes,
  options: { budget?: number } = {},
): PartitionedResult {
  const activities = [...c.activities].sort((a, b) => byKey(a.id, b.id));
  const edges = [...c.edges].sort((a, b) =>
    byKey(
      `${a.id ?? ''}|${a.predecessorId}|${a.successorId}|${a.type}`,
      `${b.id ?? ''}|${b.predecessorId}|${b.successorId}|${b.type}`,
    ),
  );
  const bars: Bar[] = [];
  for (const a of activities) {
    if (a.drawnStart === null) continue;
    const startDay = axisDayOf(a.type, c.dataDate, a.drawnStart);
    const endDay = a.drawnFinish === null ? startDay : axisDayOf(a.type, c.dataDate, a.drawnFinish);
    bars.push({ id: a.id, startDay, endDay });
  }
  const order = [...bars].sort((a, b) => a.startDay - b.startDay || byKey(a.id, b.id));
  const barOf = new Map(bars.map((b) => [b.id, b]));
  const swimlaneOf = (id: string): string => c.partition.get(id)!;

  const seedLanes = new Map(activities.map((a) => [a.id, startLocal.get(a.id) ?? a.laneIndex]));
  const budget = options.budget ?? displayRows(c, seedLanes);

  let evaluations = 0;
  const text = { ...HARNESS_TEXT, memo: new Map<string, readonly PlacedText[]>() };
  const evaluate = (local: Lanes): LayoutObjective => {
    evaluations += 1;
    const display = displayOf(c, local);
    const scene: LayoutScene = {
      activities: activities.map((a) => ({ ...a, laneIndex: display.get(a.id) ?? a.laneIndex })),
      edges,
      dataDate: c.dataDate,
      isWorkingDay: null,
      text,
    };
    return evaluateLayout(scene, LAYOUT_REFERENCE_PX_PER_DAY);
  };

  const seed = evaluate(seedLanes);
  let lanes = repair(seedLanes, order, c.partition);
  let current = evaluate(lanes);
  const repaired = current;

  const neighbours = new Map<string, string[]>();
  const push = (k: string, v: string): void => {
    const list = neighbours.get(k);
    if (list) list.push(v);
    else neighbours.set(k, [v]);
  };
  for (const e of edges) {
    push(e.predecessorId, e.successorId);
    push(e.successorId, e.predecessorId);
  }

  let capped = false;
  let pass = 0;
  while (pass < DEFAULT_PASSES) {
    pass += 1;
    const passStart = evaluations;
    const budgetLeft = (): boolean => {
      if (
        evaluations - passStart < DEFAULT_EVALUATIONS_PER_PASS &&
        evaluations < DEFAULT_MAX_EVALUATIONS
      )
        return true;
      capped = true;
      return false;
    };
    let accepted = 0;
    const tryAdopt = (next: Map<string, number>): boolean => {
      const o = evaluate(next);
      if (compareObjectives(o, current) >= 0) return false;
      lanes = next;
      current = o;
      accepted += 1;
      return true;
    };

    // Phase 1: adjacent-row swaps, within one swimlane.
    for (const k of c.order) {
      for (let r = 0; r + 1 < bandRows(c, lanes).get(k)! && budgetLeft(); r += 1) {
        tryAdopt(swapRows(lanes, swimlaneOf, k, r));
      }
    }

    // Phase 2: single-bar moves; candidates from the bar's own swimlane, a new row at the bottom of it.
    for (const bar of order) {
      if (!budgetLeft()) break;
      const k = swimlaneOf(bar.id);
      const cur = lanes.get(bar.id)!;
      const rows = bandRows(c, lanes).get(k)!;
      const total = displayRows(c, lanes);
      const offset = offsetsOf(c, bandRows(c, lanes)).get(k)!;
      const want = new Set([cur - 2, cur - 1, cur + 1, cur + 2]);
      for (const n of neighbours.get(bar.id) ?? []) {
        if (swimlaneOf(n) !== k) continue;
        const lane = lanes.get(n);
        if (lane !== undefined) want.add(lane);
      }
      if (total < budget) want.add(rows);
      const candidates = [...want]
        .filter((lane) => lane >= 0 && lane !== cur && lane <= rows)
        // A row already there is allowed only below the budget, as `optimiseLayout` does; the new row
        // at the swimlane's bottom is allowed while the whole diagram is under it.
        .filter((lane) => (lane < rows ? offset + lane < budget : total < budget))
        .filter((lane) => fits(lanes, barOf, swimlaneOf, bar, lane))
        .sort((a, b) => a - b);
      let best: { lanes: Map<string, number>; objective: LayoutObjective } | null = null;
      for (const lane of candidates) {
        if (!budgetLeft()) break;
        const next = new Map(lanes);
        next.set(bar.id, lane);
        const o = evaluate(next);
        if (compareObjectives(o, best?.objective ?? current) < 0)
          best = { lanes: next, objective: o };
      }
      if (best) {
        lanes = best.lanes;
        current = best.objective;
        accepted += 1;
      }
    }

    // Phase 3: compaction, keeping at least one row per swimlane (a swimlane's rows start at 0).
    const packed = compacted(lanes, swimlaneOf, c.order);
    if (packed && budgetLeft()) tryAdopt(packed);

    if (accepted === 0) break;
  }
  return { lanes, seed, repaired, final: current, passes: pass, evaluations, capped };
}

function repair(
  seed: Lanes,
  order: readonly Bar[],
  partition: ReadonlyMap<string, string>,
): Map<string, number> {
  const lanes = new Map(seed);
  const settled: PackItem[] = [];
  for (const bar of order) {
    const item: PackItem = { ...bar, laneIndex: lanes.get(bar.id) ?? 0 };
    const lane = nearestFreeRow(item, settled, partition);
    lanes.set(bar.id, lane);
    settled.push({ ...item, laneIndex: lane });
  }
  return lanes;
}

function fits(
  lanes: Lanes,
  barOf: ReadonlyMap<string, Bar>,
  swimlaneOf: (id: string) => string,
  bar: Bar,
  lane: number,
): boolean {
  const k = swimlaneOf(bar.id);
  for (const [id, l] of lanes) {
    if (l !== lane || id === bar.id || swimlaneOf(id) !== k) continue;
    const other = barOf.get(id);
    if (other && !(other.endDay < bar.startDay || bar.endDay < other.startDay)) return false;
  }
  return true;
}

function swapRows(
  lanes: Lanes,
  swimlaneOf: (id: string) => string,
  k: string,
  r: number,
): Map<string, number> {
  return new Map(
    [...lanes].map(([id, lane]) => [
      id,
      swimlaneOf(id) !== k ? lane : lane === r ? r + 1 : lane === r + 1 ? r : lane,
    ]),
  );
}

/** Each swimlane's empty rows deleted; null when nothing changes. */
function compacted(
  lanes: Lanes,
  swimlaneOf: (id: string) => string,
  order: readonly string[],
): Map<string, number> | null {
  let changed = false;
  const out = new Map<string, number>();
  for (const k of order) {
    const members = [...lanes].filter(([id]) => swimlaneOf(id) === k);
    const used = [...new Set(members.map(([, l]) => l))].sort((a, b) => a - b);
    const to = new Map(used.map((l, i) => [l, i]));
    if (!used.every((l, i) => l === i)) changed = true;
    for (const [id, l] of members) out.set(id, to.get(l)!);
  }
  return changed ? out : null;
}

// --- seeds and the two hints --------------------------------------------------------------------

function itemsOf(c: Case): PackItem[] {
  const items: PackItem[] = [];
  for (const a of c.activities) {
    if (a.drawnStart === null) continue;
    const startDay = axisDayOf(a.type, c.dataDate, a.drawnStart);
    items.push({
      id: a.id,
      startDay,
      endDay: a.drawnFinish === null ? startDay : axisDayOf(a.type, c.dataDate, a.drawnFinish),
      laneIndex: -1,
    });
  }
  return items;
}

function predecessorsOf(edges: readonly RenderEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) m.set(e.successorId, [...(m.get(e.successorId) ?? []), e.predecessorId]);
  return m;
}

/** Today's whole-plan pack: Re-layout's start 0 with no swimlanes. */
export function plainPack(c: Case): Map<string, number> {
  const lanes = new Map(c.activities.map((a) => [a.id, a.laneIndex]));
  for (const ch of packLanes(itemsOf(c), predecessorsOf(c.edges))) lanes.set(ch.id, ch.laneIndex);
  return lanes;
}

/** Start 0 partitioned, the hint reading predecessors in the SAME swimlane only (the §4.5 default). */
export function samePack(c: Case): Map<string, number> {
  const lanes = new Map(c.activities.map((a) => [a.id, 0]));
  for (const ch of packLanes(itemsOf(c), predecessorsOf(c.edges), c.partition))
    lanes.set(ch.id, ch.laneIndex);
  return lanes;
}

/**
 * Start 0 partitioned, the hint reading predecessors ACROSS swimlanes by their display lane. The
 * swimlanes' heights come from {@link samePack} (a hint never opens a lane it would not otherwise
 * open, so the heights do not move), and every predecessor in another swimlane steers by the display
 * lane it had there. This is the same first-fit as `packLanes` with the target taken in display lanes
 * and converted back to the bar's own swimlane, and {@link selfTest} holds it to `packLanes` when the
 * hint is restricted.
 */
export function displayPack(c: Case): Map<string, number> {
  const first = samePack(c);
  const offsets = offsetsOf(c, bandRows(c, first));
  const displayFirst = displayOf(c, first);
  const preds = predecessorsOf(c.edges);
  const local = new Map<string, number>(c.activities.map((a) => [a.id, 0]));
  const placedDisplay = new Map<string, number>();
  for (const k of c.order) {
    const items = itemsOf(c)
      .filter((i) => c.partition.get(i.id) === k)
      .sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay || byKey(a.id, b.id));
    const laneEnds: number[] = [];
    for (const item of items) {
      const lanes: number[] = [];
      for (const p of preds.get(item.id) ?? []) {
        const d = c.partition.get(p) === k ? placedDisplay.get(p) : displayFirst.get(p);
        if (d !== undefined) lanes.push(d);
      }
      let lane: number;
      if (lanes.length === 0) {
        lane = laneEnds.findIndex((end) => item.startDay > end);
      } else {
        const target = lanes.reduce((a, b) => a + b, 0) / lanes.length - offsets.get(k)!;
        lane = -1;
        let bestDistance = Infinity;
        laneEnds.forEach((end, l) => {
          if (item.startDay <= end) return;
          const d = Math.abs(l - target);
          if (d < bestDistance) {
            bestDistance = d;
            lane = l;
          }
        });
      }
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.endDay);
      } else laneEnds[lane] = item.endDay;
      local.set(item.id, lane);
      placedDisplay.set(item.id, offsets.get(k)! + lane);
    }
  }
  return local;
}

/** Starts 1-3 partitioned: the product's own builders, run on one swimlane's bars and links at a time. */
function perSwimlane(
  c: Case,
  build: (acts: RenderActivity[], edges: RenderEdge[]) => Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of c.order) {
    const ids = new Set(c.activities.filter((a) => c.partition.get(a.id) === k).map((a) => a.id));
    const acts = c.activities.filter((a) => ids.has(a.id)).map((a) => ({ ...a, laneIndex: 0 }));
    const edges = c.edges.filter((e) => ids.has(e.predecessorId) && ids.has(e.successorId));
    for (const [id, lane] of build(acts, edges)) out.set(id, lane);
  }
  return out;
}

// --- measuring -----------------------------------------------------------------------------------

export interface Row {
  plan: string;
  variant: string;
  drawn: number;
  starts: number;
  ms: [number, number];
  evaluations: number;
  seed: LayoutObjective;
  final: LayoutObjective;
  rows: number;
  capped: boolean;
  /** Two runs returned identical lanes. */
  repeatable: boolean;
  digest: string;
}

const digestOf = (lanes: Lanes): string => {
  let h = 2166136261;
  for (const [id, lane] of [...lanes].sort((a, b) => byKey(a[0], b[0]))) {
    for (const ch of `${id}:${String(lane)};`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return h.toString(16);
};

const sceneOf = (c: Case, lanes: Lanes): LayoutScene => ({
  activities: c.activities.map((a) => ({ ...a, laneIndex: lanes.get(a.id) ?? a.laneIndex })),
  edges: c.edges,
  dataDate: c.dataDate,
  isWorkingDay: null,
  text: HARNESS_TEXT,
});

const drawnOf = (c: Case): number => c.activities.filter((a) => a.drawnStart !== null).length;

function timed<T>(f: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = f();
  return { value, ms: Math.round(performance.now() - t0) };
}

/** Run `f` twice; the rows record both times and whether the two answers agree. */
function twice<T extends { lanes: Lanes }>(f: () => T): { a: T; b: T; ms: [number, number] } {
  const a = timed(f);
  const b = timed(f);
  return { a: a.value, b: b.value, ms: [a.ms, b.ms] };
}

function unpartitioned(c: Case): { tidy: Row; relayout: Row } {
  const current = new Map(c.activities.map((a) => [a.id, a.laneIndex]));
  const scene = { ...sceneOf(c, current) };
  const tidyRun = twice(() => optimiseLayout(scene));
  const tidy: Row = {
    plan: c.name,
    variant: 'Tidy, no swimlanes',
    drawn: drawnOf(c),
    starts: 1,
    ms: tidyRun.ms,
    evaluations: tidyRun.a.evaluations,
    seed: tidyRun.a.seed,
    final: tidyRun.a.final,
    rows: rowsOf(tidyRun.a.lanes),
    capped: tidyRun.a.capped,
    repeatable: digestOf(tidyRun.a.lanes) === digestOf(tidyRun.b.lanes),
    digest: digestOf(tidyRun.a.lanes),
  };

  const packed = plainPack(c);
  const ids = relayoutStartIds(drawnOf(c));
  const run = (): {
    lanes: Lanes;
    evaluations: number;
    seed: LayoutObjective;
    final: LayoutObjective;
    capped: boolean;
    starts: number;
  } => {
    const starts = relayoutSeeds(
      { activities: c.activities, edges: c.edges, dataDate: c.dataDate, packed },
      ids,
    );
    const results = starts.map((s) =>
      optimiseLayout(sceneOf(c, s.lanes), { budget: Math.max(rowsOf(current), rowsOf(s.lanes)) }),
    );
    const best = results[pickBestStart(results)]!;
    return {
      lanes: best.lanes,
      evaluations: results.reduce((n, r) => n + r.evaluations, 0),
      seed: best.seed,
      final: best.final,
      capped: results.some((r) => r.capped),
      starts: starts.length,
    };
  };
  const r = twice(run);
  const relayout: Row = {
    plan: c.name,
    variant: 'Re-layout, no swimlanes',
    drawn: drawnOf(c),
    starts: r.a.starts,
    ms: r.ms,
    evaluations: r.a.evaluations,
    seed: r.a.seed,
    final: r.a.final,
    rows: rowsOf(r.a.lanes),
    capped: r.a.capped,
    repeatable: digestOf(r.a.lanes) === digestOf(r.b.lanes),
    digest: digestOf(r.a.lanes),
  };
  return { tidy, relayout };
}

function partitionedTidy(c: Case, rowsOut: { lanes: Map<string, number> | null }): Row {
  const start = localise(c, new Map(c.activities.map((a) => [a.id, a.laneIndex])));
  const r = twice(() => partitionedOptimise(c, start));
  rowsOut.lanes = r.a.lanes;
  return {
    plan: c.name,
    variant: 'Tidy, swimlanes',
    drawn: drawnOf(c),
    starts: 1,
    ms: r.ms,
    evaluations: r.a.evaluations,
    seed: r.a.seed,
    final: r.a.final,
    rows: displayRows(c, r.a.lanes),
    capped: r.a.capped,
    repeatable: digestOf(r.a.lanes) === digestOf(r.b.lanes),
    digest: digestOf(r.a.lanes),
  };
}

function partitionedRelayout(
  c: Case,
  hint: 'same' | 'display',
  out: { lanes: Map<string, number> | null },
  only0 = false,
): Row {
  const current = localise(c, new Map(c.activities.map((a) => [a.id, a.laneIndex])));
  const ids = only0 ? ([0] as const) : relayoutStartIds(drawnOf(c));
  const run = (): PartitionedResult & { starts: number; evaluationsAll: number } => {
    const all: Record<StartId, () => Map<string, number>> = {
      0: () => (hint === 'same' ? samePack(c) : displayPack(c)),
      1: () => perSwimlane(c, (acts, edges) => chainRowsStart(acts, edges, c.dataDate)),
      2: () => perSwimlane(c, (acts, edges) => depthFirstStart(acts, edges, c.dataDate)),
      3: () => perSwimlane(c, (acts) => unhintedPackStart(acts, c.dataDate)),
    };
    const seeds: Map<string, number>[] = [];
    const seen = new Set<string>();
    for (const id of [...ids].sort((a, b) => a - b)) {
      const lanes = all[id]();
      const key = digestOf(lanes);
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push(lanes);
    }
    const results = seeds.map((s) =>
      partitionedOptimise(c, s, { budget: Math.max(displayRows(c, current), displayRows(c, s)) }),
    );
    const best = results[pickBestStart(results)]!;
    return {
      ...best,
      starts: seeds.length,
      evaluationsAll: results.reduce((n, r) => n + r.evaluations, 0),
      capped: results.some((r) => r.capped),
    };
  };
  const r = twice(run);
  out.lanes = r.a.lanes;
  return {
    plan: c.name,
    variant: `Re-layout${only0 ? ' (start 0 only)' : ''}, swimlanes, ${hint === 'same' ? 'same-swimlane' : 'display-lane'} hint`,
    drawn: drawnOf(c),
    starts: r.a.starts,
    ms: r.ms,
    evaluations: r.a.evaluationsAll,
    seed: r.a.seed,
    final: r.a.final,
    rows: displayRows(c, r.a.lanes),
    capped: r.a.capped,
    repeatable: digestOf(r.a.lanes) === digestOf(r.b.lanes),
    digest: digestOf(r.a.lanes),
  };
}

/**
 * Hold the copy to the product, and the display hint to the packer. Throws on any disagreement.
 *  1. One swimlane for every bar: {@link partitionedOptimise} returns `optimiseLayout`'s lanes.
 *  2. {@link samePack} on the plan's own partition equals `packLanes` with the partition argument
 *     (trivially, it is that call) and {@link displayPack} with every bar in one swimlane equals the
 *     plain pack (so the re-implemented first-fit is the packer's).
 */
export function selfTest(c: Case): string[] {
  const one: Case = {
    ...c,
    partition: new Map(c.activities.map((a) => [a.id, 'all'])),
    order: ['all'],
  };
  const seedLanes = new Map(c.activities.map((a) => [a.id, a.laneIndex]));
  const product = optimiseLayout(sceneOf(c, seedLanes));
  const mine = partitionedOptimise(one, seedLanes, { budget: rowsOf(seedLanes) });
  const lines: string[] = [];
  const a = digestOf(product.lanes);
  const b = digestOf(mine.lanes);
  if (a !== b)
    throw new Error(
      `${c.name}: partitionedOptimise with one swimlane differs from optimiseLayout (${a} vs ${b})`,
    );
  lines.push(
    `${c.name}: one-swimlane search = optimiseLayout (${a}); evaluations ${String(product.evaluations)} = ${String(mine.evaluations)}`,
  );
  const plain = digestOf(
    new Map(
      [...plainPack(c)].filter(([id]) =>
        c.activities.some((x) => x.id === id && x.drawnStart !== null),
      ),
    ),
  );
  const dp = digestOf(
    new Map(
      [...displayPack(one)].filter(([id]) =>
        c.activities.some((x) => x.id === id && x.drawnStart !== null),
      ),
    ),
  );
  if (plain !== dp)
    throw new Error(`${c.name}: displayPack with one swimlane differs from the plain pack`);
  lines.push(`${c.name}: display-hint pack with one swimlane = plain pack (${plain})`);
  return lines;
}

export const CASES = {
  power: powerPlant,
  torture,
  scale500: () => scale(500),
  scale300: () => scale(300),
} as const;

export function run(which: string): {
  checks: string[];
  rows: Row[];
  lanes: Record<string, unknown>;
} {
  const rows: Row[] = [];
  const checks: string[] = [];
  const lanes: Record<string, unknown> = {};
  for (const key of which.split(',') as (keyof typeof CASES)[]) {
    const c = CASES[key]();
    checks.push(
      `${c.name} split ${c.split}: ${String(c.order.length)} swimlanes, ${String(drawnOf(c))} drawn, ${String(c.edges.length)} links`,
    );
    if (drawnOf(c) <= OPTIMISE_MAX_ACTIVITIES) checks.push(...selfTest(c));
    const u = unpartitioned(c);
    const t: { lanes: Map<string, number> | null } = { lanes: null };
    const rs: { lanes: Map<string, number> | null } = { lanes: null };
    const rd: { lanes: Map<string, number> | null } = { lanes: null };
    const scratch: { lanes: Map<string, number> | null } = { lanes: null };
    rows.push(
      u.tidy,
      u.relayout,
      partitionedTidy(c, t),
      partitionedRelayout(c, 'same', rs),
      partitionedRelayout(c, 'display', rd),
      partitionedRelayout(c, 'same', scratch, true),
      partitionedRelayout(c, 'display', scratch, true),
    );
    lanes[c.name] = {
      split: c.split,
      order: c.order,
      partition: [...c.partition],
      tidy: [...t.lanes!],
      relayoutSame: [...rs.lanes!],
      relayoutDisplay: [...rd.lanes!],
    };
  }
  return { checks, rows, lanes };
}

export { type Case as SwimlaneCase };

/**
 * A schematic, not the painter: bars at their drawn span on their display lane, the swimlanes as
 * alternating bands, and each link as a straight segment from the end of its predecessor to the start
 * of its successor. Node has no raster painter in this repo (`shoot-*.mjs` need a browser and a dev
 * server), so this shows WHERE the bars sit and how far links travel, not how they are routed.
 */
export function renderPictures(result: { lanes: Record<string, unknown> }): Record<string, string> {
  const pictures: Record<string, string> = {};
  for (const key of ['power'] as const) {
    const c = CASES[key]();
    const l = result.lanes[c.name] as
      undefined | { tidy: [string, number][]; relayoutSame: [string, number][] };
    if (!l) continue;
    const before = plainPack(c);
    const noSwimlanes: Case = {
      ...c,
      partition: new Map(c.activities.map((a) => [a.id, 'all'])),
      order: ['all'],
    };
    pictures[`${c.name}-relayout-before.svg`] = svgOf(
      c,
      noSwimlanes,
      before,
      'The current pack (Re-layout start 0, before its search), no swimlanes',
    );
    pictures[`${c.name}-relayout-after.svg`] = svgOf(
      c,
      c,
      new Map(l.relayoutSame),
      'Re-layout (searched), swimlanes by system',
    );
  }
  return pictures;
}

function svgOf(c: Case, as: Case, local: Lanes, title: string): string {
  const display = displayOf(as, local);
  const rows = displayRows(as, local);
  const offsets = offsetsOf(as, bandRows(as, local));
  const rowsOfBand = bandRows(as, local);
  const days = c.activities
    .filter((a) => a.drawnStart !== null)
    .map((a) => ({
      a,
      s: axisDayOf(a.type, c.dataDate, a.drawnStart!),
      e: axisDayOf(a.type, c.dataDate, a.drawnFinish ?? a.drawnStart!),
    }));
  const min = Math.min(...days.map((d) => d.s));
  const max = Math.max(...days.map((d) => d.e));
  const PX = 1.4;
  const ROW = 22;
  const LEFT = 90;
  const x = (d: number): number => LEFT + (d - min) * PX;
  const w = x(max) + 20;
  const h = rows * ROW + 40;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(Math.ceil(w))}" height="${String(h)}" font-family="sans-serif" font-size="10">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<text x="4" y="14" font-size="12" font-weight="bold">${title} (${String(rows)} rows)</text>`,
  ];
  as.order.forEach((k, i) => {
    const y = 24 + offsets.get(k)! * ROW;
    const bh = rowsOfBand.get(k)! * ROW;
    if (as.order.length > 1) {
      parts.push(
        `<rect x="0" y="${String(y)}" width="${String(Math.ceil(w))}" height="${String(bh)}" fill="${i % 2 === 0 ? '#eef2f7' : '#f9fafb'}"/>`,
      );
      parts.push(`<text x="4" y="${String(y + 13)}" fill="#334">${k}</text>`);
    }
  });
  const at = new Map(
    days.map((d) => [
      d.a.id,
      { x0: x(d.s), x1: x(d.e) + 2, y: 24 + display.get(d.a.id)! * ROW + ROW / 2 },
    ]),
  );
  for (const e of c.edges) {
    const p = at.get(e.predecessorId);
    const s = at.get(e.successorId);
    if (!p || !s) continue;
    parts.push(
      `<line x1="${p.x1.toFixed(1)}" y1="${String(p.y)}" x2="${s.x0.toFixed(1)}" y2="${String(s.y)}" stroke="#c0392b" stroke-opacity="0.45" stroke-width="0.8"/>`,
    );
  }
  for (const d of days) {
    const b = at.get(d.a.id)!;
    parts.push(
      `<rect x="${b.x0.toFixed(1)}" y="${String(b.y - 5)}" width="${Math.max(3, b.x1 - b.x0).toFixed(1)}" height="10" fill="${d.a.isCritical ? '#c0392b' : '#2c5f8a'}" rx="2"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('\n');
}
