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
 * the function always returns a row.
 *
 * Cost is O(rows × items): a single mover scans each candidate row's occupants. The auto-resolve
 * processes movers one at a time, each seeing the rows the previous ones chose, which is what stops a
 * cascade resolving two bars into the same row.
 */
export function nearestFreeRow(mover: PackItem, others: readonly PackItem[]): number {
  const byLane = new Map<number, PackItem[]>();
  for (const item of others) {
    if (item.id === mover.id) continue;
    const list = byLane.get(item.laneIndex);
    if (list) list.push(item);
    else byLane.set(item.laneIndex, [item]);
  }
  const free = (lane: number): boolean =>
    (byLane.get(lane) ?? []).every(
      (item) => item.endDay < mover.startDay || mover.endDay < item.startDay,
    );
  const from = mover.laneIndex;
  for (let distance = 0; ; distance += 1) {
    const below = from - distance;
    const above = from + distance;
    if (below >= 0 && free(below)) return below;
    // Terminates: once `above` passes the highest row in use its row is empty, so this returns
    // one past that row at the latest.
    if (distance > 0 && free(above)) return above;
  }
}
