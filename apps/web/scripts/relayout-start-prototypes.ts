import { packLanes } from '@repo/layout';

import {
  axisDayOf,
  type RenderActivity,
  type RenderEdge,
} from '../src/features/tsld/render/render-model';

/**
 * **Re-layout start seeds, as prototypes** (spec `docs/specs/relayout-quality` §4.5 D3, plan M0-T3).
 *
 * `measure-relayout.mjs --starts=0,1,2,3` runs `optimiseLayout` from each of these and reports what
 * each reaches, ALONE, so M2 ships only the starts that win on a corpus plan. They live in the
 * script and never in `src/`: nothing here is product code until M2 promotes it.
 *
 * The assignment rules are `crossing-probe.ts:1234-1399` (candidates A and C), read as prior art and
 * re-expressed over the render model. They are the rules ADR-0149 D5 and ADR-0150 D5 rejected as
 * applied to every plan; here each is only a place for the same strict-improvement search to start.
 *
 * A seed covers the DRAWN activities. An undrawn one keeps its lane, as `optimiseLayout` leaves it.
 */
export type StartId = 0 | 1 | 2 | 3;

export const START_NAMES: Record<StartId, string> = {
  0: 'pack (today)',
  1: 'chain rows',
  2: 'depth-first pack',
  3: 'unhinted pack',
};

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

/** Start 0: the dialog's own seed, `arrangeSummary.changes` laid over the current rows. */
export function packStart(
  activities: readonly RenderActivity[],
  packChanges: readonly { id: string; laneIndex: number }[],
): Map<string, number> {
  return overlay(activities, new Map(packChanges.map((c) => [c.id, c.laneIndex])));
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

export function startSeed(
  id: StartId,
  plan: {
    activities: readonly RenderActivity[];
    edges: readonly RenderEdge[];
    dataDate: string;
    packChanges: readonly { id: string; laneIndex: number }[];
  },
): Map<string, number> {
  switch (id) {
    case 0:
      return packStart(plan.activities, plan.packChanges);
    case 1:
      return chainRowsStart(plan.activities, plan.edges, plan.dataDate);
    case 2:
      return depthFirstStart(plan.activities, plan.edges, plan.dataDate);
    case 3:
      return unhintedPackStart(plan.activities, plan.dataDate);
  }
}
