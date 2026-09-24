import { rowOccupancy } from './nearest-free-row.js';
import { meanPlacedPredecessorLane, type LaneChange, type PackItem } from './pack-lanes.js';

/**
 * **Pack the bars a file left without a row, around the rows it did carry** (layout-interchange,
 * spec §4.7 `partial` mode).
 *
 * A SchedulePoint XER carries each activity's row, but a file edited in P6 can gain activities that
 * have none. The carried rows are the planner's picture and are **never moved** (FC-3): `carried`
 * items are the fixed obstacles, and only `movers` are placed.
 *
 * Each mover, in `(startDay, endDay, id)` order — `packLanes`' order, so the result is independent of
 * input order — starts from the mean row of its already-placed predecessors (carried ones and movers
 * placed before it; the packer's own hint rule, shared rather than restated), rounded with a tie to
 * the lower row, or row 0 when it has none, and takes the nearest row it fits in from there
 * (`rowOccupancy`, the auto-resolve's rule). So a new activity lands beside the logic it hangs off.
 *
 * Returns only the movers whose row changes, sorted by id, like `packLanes`.
 */
export function packAroundCarried(
  carried: readonly PackItem[],
  movers: readonly PackItem[],
  predecessorsOf?: ReadonlyMap<string, readonly string[]>,
): LaneChange[] {
  const occupancy = rowOccupancy(carried);
  const laneOf = new Map(carried.map((item) => [item.id, item.laneIndex] as const));
  const ordered = [...movers].sort(
    (a, b) =>
      a.startDay - b.startDay || a.endDay - b.endDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const changes: LaneChange[] = [];
  for (const mover of ordered) {
    const mean = meanPlacedPredecessorLane(predecessorsOf?.get(mover.id), laneOf);
    // Round half DOWN, so a tie goes to the lower row like every other rule in this package.
    const from = mean === null ? 0 : Math.max(0, Math.ceil(mean - 0.5));
    const lane = occupancy.nearestFree({ ...mover, laneIndex: from });
    occupancy.add(mover, lane);
    laneOf.set(mover.id, lane);
    if (lane !== mover.laneIndex) changes.push({ id: mover.id, laneIndex: lane });
  }
  return changes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
