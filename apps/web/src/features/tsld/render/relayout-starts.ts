import { packLanes } from '@repo/layout';

import { compareObjectives, type LayoutObjective } from './layout-objective';
import { axisDayOf, type RenderActivity, type RenderEdge } from './render-model';

/**
 * **Re-layout's start seeds** (`docs/specs/relayout-quality` §4.5 D3, plan M2).
 *
 * Re-layout runs the same strict-improvement search from up to four structurally different starting
 * layouts and keeps the best by the product's own order. Each start is only a place to begin: ADR-0149
 * D5 and ADR-0150 D5 rejected these constructions as RULES applied to every plan, and here one wins
 * only on a plan where the search from it ends better ({@link pickBestStart}).
 *
 * | id | start                                                                                  |
 * | -- | -------------------------------------------------------------------------------------- |
 * | 0  | Today's pack (`packLanes` with the predecessor hint), handed in as `packed`             |
 * | 1  | Chain rows: the longest linked chains first, each on one row where its members fit      |
 * | 2  | Depth-first pack: first-fit in longest-path-depth order rather than date order          |
 * | 3  | Unhinted pack: `packLanes` with no predecessor hint, "point for point" the original     |
 *
 * Starts 1 and 2 place with a first-fit of their own rather than `packLanes`, because `packLanes`
 * orders by start date and these two exist to change the order; they are the constructions
 * `scripts/measure-relayout.mjs --frontier` measured. Starts 0 and 3 are `packLanes` itself
 * (ADR-0069's one-packer rule).
 *
 * Pure and engine-free: it reads drawn spans and links, nothing else. An undrawn activity is not on
 * the canvas and keeps its lane, as `optimiseLayout` leaves it.
 *
 * **Which starts run is a function of the drawn count alone** ({@link relayoutStartIds}), never of
 * the machine: two planners pressing the same button must get the same diagram, however many cores
 * either has. The core count only changes how long the answer takes.
 */
export type StartId = 0 | 1 | 2 | 3;

export const START_NAMES: Record<StartId, string> = {
  0: 'pack (today)',
  1: 'chain rows',
  2: 'depth-first pack',
  3: 'unhinted pack',
};

/**
 * The largest plan that runs more than the pack start. **Owner decision, 2026-10-18**, replacing
 * CQ-2's "within 1.5x today's wait" (which only held up to 10 activities and so withheld the starts
 * from every plan a planner presses Re-layout on): Re-layout searches from all four starts on plans
 * up to about 150 drawn activities, a wait the planner can cancel, and from the pack start alone
 * above it (M1's behaviour). The owner accepted knowingly that fixture-p6-torture-v1 (147 drawn,
 * inside the limit) spreads from 24 to 35 rows (FC-R5). **Measured 2026-10-17** by `measure-relayout.mjs` in the
 * product's real module workers (`docs/specs/relayout-quality/m2-verdict.md`): the reference plan
 * (58 drawn) waits about 0.27 s today and about 3.6 s across the starts; the ratio is 3.4-4x at
 * 100-150 activities (about 28 s at 147) and the wait is 90 s at 300, which stays outside.
 */
export const RELAYOUT_MULTISTART_MAX_ACTIVITIES = 150;

const ALL_STARTS: readonly StartId[] = [0, 1, 2, 3];

/** The starts to run for a plan of `drawn` activities. Start 0 always runs. */
export function relayoutStartIds(drawn: number): readonly StartId[] {
  return drawn <= RELAYOUT_MULTISTART_MAX_ACTIVITIES ? ALL_STARTS : [0];
}

interface Item {
  id: string;
  startDay: number;
  endDay: number;
}

function itemsOf(activities: readonly RenderActivity[], dataDate: string): Item[] {
  const items: Item[] = [];
  for (const a of activities) {
    if (a.drawnStart === null) continue;
    const startDay = axisDayOf(a.type, dataDate, a.drawnStart);
    const endDay = a.drawnFinish === null ? startDay : axisDayOf(a.type, dataDate, a.drawnFinish);
    items.push({ id: a.id, startDay, endDay });
  }
  return items;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The lowest lane whose last finish is strictly before `startDay`, or -1 (inclusive finish). */
function firstFree(laneEnds: readonly number[], startDay: number): number {
  return laneEnds.findIndex((end) => startDay > end);
}

function overlay(
  activities: readonly RenderActivity[],
  assigned: ReadonlyMap<string, number>,
): Map<string, number> {
  return new Map(activities.map((a) => [a.id, assigned.get(a.id) ?? a.laneIndex]));
}

/** Start 3: `packLanes` with no predecessor hint, which is "point for point" the original packer. */
export function unhintedPackStart(
  activities: readonly RenderActivity[],
  dataDate: string,
): Map<string, number> {
  // A sentinel lane no pack can produce, so every item comes back as a change (`arrange-lanes.ts`).
  const changes = packLanes(itemsOf(activities, dataDate).map((i) => ({ ...i, laneIndex: -1 })));
  return overlay(activities, new Map(changes.map((c) => [c.id, c.laneIndex])));
}

function graphOf(edges: readonly RenderEdge[]): {
  successorsOf: Map<string, string[]>;
  predecessorsOf: Map<string, string[]>;
} {
  const successorsOf = new Map<string, string[]>();
  const predecessorsOf = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string): void => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  for (const e of [...edges].sort((a, b) =>
    byKey(`${a.predecessorId}|${a.successorId}`, `${b.predecessorId}|${b.successorId}`),
  )) {
    push(successorsOf, e.predecessorId, e.successorId);
    push(predecessorsOf, e.successorId, e.predecessorId);
  }
  return { successorsOf, predecessorsOf };
}

/**
 * Start 1, **chain rows**: decompose the logic into chains longest-first and give each chain a row
 * of its own where its members fit. A chain on one row has no vertical corridor at all, which is
 * what a NetPoint diagram looks like and what the critical spine needs.
 */
export function chainRowsStart(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
  dataDate: string,
): Map<string, number> {
  const items = itemsOf(activities, dataDate);
  const byId = new Map(items.map((i) => [i.id, i]));
  const { successorsOf } = graphOf(
    edges.filter((e) => byId.has(e.predecessorId) && byId.has(e.successorId)),
  );
  const lane = new Map<string, number>();
  const laneEnds: number[] = [];
  const remaining = new Set(items.map((i) => i.id));
  const order = [...items].sort(
    (a, b) => a.startDay - b.startDay || a.endDay - b.endDay || byKey(a.id, b.id),
  );
  while (remaining.size > 0) {
    // Longest chain (by member count) through what is left, by DP over the fixed time order.
    const best = new Map<string, number>();
    const next = new Map<string, string | null>();
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const id = order[i]!.id;
      if (!remaining.has(id)) continue;
      let bestLen = 1;
      let bestNext: string | null = null;
      for (const successor of successorsOf.get(id) ?? []) {
        if (!remaining.has(successor)) continue;
        const length = (best.get(successor) ?? 0) + 1;
        if (length > bestLen || (length === bestLen && bestNext !== null && successor < bestNext)) {
          bestLen = length;
          bestNext = successor;
        }
      }
      best.set(id, bestLen);
      next.set(id, bestNext);
    }
    let head: string | null = null;
    let headLen = -1;
    for (const item of order) {
      if (!remaining.has(item.id)) continue;
      const length = best.get(item.id) ?? 0;
      if (length > headLen) {
        headLen = length;
        head = item.id;
      }
    }
    if (head === null) break;
    const chain: string[] = [];
    for (let at: string | null = head; at !== null; at = next.get(at) ?? null) chain.push(at);

    // The chain's own row: the lowest lane its first member fits in, then every member that fits
    // after it. A member that does not fit (an SS/FF overlap) spills to the general pool.
    const first = byId.get(chain[0]!)!;
    let row = firstFree(laneEnds, first.startDay);
    if (row === -1) {
      row = laneEnds.length;
      laneEnds.push(Number.NEGATIVE_INFINITY);
    }
    for (const id of chain) {
      const item = byId.get(id)!;
      const target = item.startDay > laneEnds[row]! ? row : firstFree(laneEnds, item.startDay);
      const placed = target === -1 ? laneEnds.push(Number.NEGATIVE_INFINITY) - 1 : target;
      laneEnds[placed] = item.endDay;
      lane.set(id, placed);
      remaining.delete(id);
    }
  }
  return overlay(activities, lane);
}

/**
 * Start 2, **depth-first pack**: sort by longest-path depth before first-fit, so a chain's members
 * are placed in logical order rather than in date order. One comparator, nothing else.
 */
export function depthFirstStart(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
  dataDate: string,
): Map<string, number> {
  const items = itemsOf(activities, dataDate);
  const { predecessorsOf } = graphOf(edges);
  const depth = new Map<string, number>();
  const byTime = [...items].sort((a, b) => a.startDay - b.startDay || byKey(a.id, b.id));
  for (const item of byTime) {
    const preds = predecessorsOf.get(item.id) ?? [];
    depth.set(
      item.id,
      preds.length === 0 ? 0 : Math.max(...preds.map((p) => (depth.get(p) ?? 0) + 1)),
    );
  }
  const lane = new Map<string, number>();
  const laneEnds: number[] = [];
  const sorted = [...items].sort(
    (a, b) =>
      (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) ||
      a.startDay - b.startDay ||
      byKey(a.id, b.id),
  );
  for (const item of sorted) {
    let target = firstFree(laneEnds, item.startDay);
    if (target === -1) {
      target = laneEnds.length;
      laneEnds.push(Number.NEGATIVE_INFINITY);
    }
    laneEnds[target] = item.endDay;
    lane.set(item.id, target);
  }
  return overlay(activities, lane);
}

/**
 * Start 0 inside swimlanes: `packLanes` with the partition and the links as its hint, so each swimlane
 * is packed on its own and a link into another swimlane steers nothing (feature-spec §4.5). The lanes
 * are local to each swimlane. Today's pack (`computeLaneArrangement`) is for the swimlane-free layout,
 * where the WBS band's summaries are appended above the scene; while swimlanes are shown they have no
 * lane here at all.
 */
export function partitionedPackStart(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
  dataDate: string,
  partition: ReadonlyMap<string, string>,
): Map<string, number> {
  const predecessorsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = predecessorsOf.get(e.successorId);
    if (list) list.push(e.predecessorId);
    else predecessorsOf.set(e.successorId, [e.predecessorId]);
  }
  // A sentinel lane no pack can produce, so every item comes back as a change (`unhintedPackStart`).
  const changes = packLanes(
    itemsOf(activities, dataDate).map((i) => ({ ...i, laneIndex: -1 })),
    predecessorsOf,
    partition,
  );
  return overlay(activities, new Map(changes.map((c) => [c.id, c.laneIndex])));
}

export interface StartSeed {
  id: StartId;
  lanes: Map<string, number>;
}

/**
 * Starts 1 to 3 inside swimlanes (swimlanes M2-T6, feature-spec §4.5): the same constructions, run on
 * one swimlane's bars and the links between them at a time, so each swimlane is built from row 0 and
 * the lanes that come back are local to it. A link into another swimlane says nothing about a row
 * here. An id with no entry shares one group, as it does in `packLanes`.
 */
function inSwimlanes(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
  partition: ReadonlyMap<string, string>,
  build: (acts: readonly RenderActivity[], within: readonly RenderEdge[]) => Map<string, number>,
): Map<string, number> {
  const groups = new Map<string | undefined, RenderActivity[]>();
  for (const a of activities) {
    const key = partition.get(a.id);
    const group = groups.get(key);
    if (group) group.push(a);
    else groups.set(key, [a]);
  }
  const lanes = new Map<string, number>();
  for (const acts of groups.values()) {
    const ids = new Set(acts.map((a) => a.id));
    const within = edges.filter((e) => ids.has(e.predecessorId) && ids.has(e.successorId));
    for (const [id, lane] of build(acts, within)) lanes.set(id, lane);
  }
  return lanes;
}

const lanesKey = (lanes: ReadonlyMap<string, number>): string =>
  JSON.stringify([...lanes].sort((a, b) => byKey(a[0], b[0])));

/**
 * The seeds for `ids`, in id order, with any seed equal to an earlier one dropped (the same lanes
 * search to the same answer, so running it twice would only cost time). Start 0 is `packed`.
 */
export function relayoutSeeds(
  plan: {
    activities: readonly RenderActivity[];
    edges: readonly RenderEdge[];
    dataDate: string;
    packed: ReadonlyMap<string, number>;
    /**
     * Activity id → swimlane key, while swimlanes are shown. Starts 1 to 3 are then built one swimlane
     * at a time, and `packed` is expected to be the partitioned pack (lanes local to a swimlane).
     */
    partition?: ReadonlyMap<string, string> | undefined;
  },
  ids: readonly StartId[],
): StartSeed[] {
  const seeds: StartSeed[] = [];
  const seen = new Set<string>();
  const { partition } = plan;
  const build: Record<
    1 | 2 | 3,
    (acts: readonly RenderActivity[], within: readonly RenderEdge[]) => Map<string, number>
  > = {
    1: (acts, within) => chainRowsStart(acts, within, plan.dataDate),
    2: (acts, within) => depthFirstStart(acts, within, plan.dataDate),
    3: (acts) => unhintedPackStart(acts, plan.dataDate),
  };
  for (const id of [...ids].sort((a, b) => a - b)) {
    const lanes =
      id === 0
        ? new Map(plan.packed)
        : partition
          ? inSwimlanes(plan.activities, plan.edges, partition, build[id])
          : build[id](plan.activities, plan.edges);
    const key = lanesKey(lanes);
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ id, lanes });
  }
  return seeds;
}

/**
 * The index of the best result by the product's order. `results` are in seed order and a tie keeps the
 * earlier one, so the pick depends on neither the order the searches finished in nor how many ran at
 * once.
 */
export function pickBestStart(results: readonly { final: LayoutObjective }[]): number {
  if (results.length === 0) throw new Error('no start produced a result');
  let best = 0;
  for (let i = 1; i < results.length; i += 1) {
    if (compareObjectives(results[i]!.final, results[best]!.final) < 0) best = i;
  }
  return best;
}
