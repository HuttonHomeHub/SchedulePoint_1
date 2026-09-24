import type { PackItem } from './pack-lanes.js';

/**
 * **The nearest row a bar fits in** (NetPoint-layout M3, ADR-0153) — the auto-resolve's "where does
 * the bar that caused an overlap go".
 *
 * Rows are tried in order of distance from the mover's **current** lane, and a tie goes to the
 * **lower** row — the same tie rule as `packLanes`' `nearestFreeLane`, so the two answers to "which
 * free row" cannot disagree about direction. A row is free when no OTHER item in it overlaps the
 * mover in time under the inclusive-finish convention `packLanes` uses (two items share a row iff one
 * finishes strictly before the other starts). The mover's current row is a candidate at distance
 * zero, so a mover that already fits stays put. One past the highest row in use is always free, so
 * a row is always returned.
 */
export function nearestFreeRow(mover: PackItem, others: readonly PackItem[]): number {
  return rowOccupancy(others).nearestFree(mover);
}

/**
 * The same answer for a **cascade**: the rows indexed once, and each mover's new row recorded so the
 * next mover sees it. Resolving 47 movers at `scale-2000` by calling {@link nearestFreeRow} each time
 * re-indexed all 2,160 bars per mover; this is what keeps FC-N5b's 2 ms. One implementation — the
 * one-shot function is this with a throwaway index.
 */
export interface RowOccupancy {
  nearestFree(mover: PackItem): number;
  /** Record that `id` now sits in `lane`, so later queries see it there. */
  move(id: string, lane: number): void;
  /** Record a bar the index was not built with, in `lane` (layout-interchange's partial pack). */
  add(item: PackItem, lane: number): void;
}

export function rowOccupancy(items: readonly PackItem[]): RowOccupancy {
  const byLane = new Map<number, Map<string, PackItem>>();
  const laneOf = new Map<string, number>();
  const place = (item: PackItem, lane: number): void => {
    const row = byLane.get(lane);
    if (row) row.set(item.id, item);
    else byLane.set(lane, new Map([[item.id, item]]));
    laneOf.set(item.id, lane);
  };
  const itemOf = new Map<string, PackItem>();
  for (const item of items) {
    itemOf.set(item.id, item);
    place(item, item.laneIndex);
  }

  const free = (lane: number, mover: PackItem): boolean => {
    for (const item of byLane.get(lane)?.values() ?? []) {
      if (item.id === mover.id) continue;
      if (!(item.endDay < mover.startDay || mover.endDay < item.startDay)) return false;
    }
    return true;
  };

  return {
    nearestFree(mover) {
      const from = mover.laneIndex;
      for (let distance = 0; ; distance += 1) {
        const below = from - distance;
        const above = from + distance;
        if (below >= 0 && free(below, mover)) return below;
        // Terminates: once `above` passes the highest row in use its row is empty, so this returns
        // one past that row at the latest.
        if (distance > 0 && free(above, mover)) return above;
      }
    },
    move(id, lane) {
      const item = itemOf.get(id);
      if (item === undefined) return;
      byLane.get(laneOf.get(id)!)?.delete(id);
      place(item, lane);
    },
    add(item, lane) {
      const existing = laneOf.get(item.id);
      if (existing !== undefined) byLane.get(existing)?.delete(item.id);
      itemOf.set(item.id, item);
      place(item, lane);
    },
  };
}
