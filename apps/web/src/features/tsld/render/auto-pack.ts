/**
 * Auto-pack (TSLD M4 4.3): a pure, deterministic greedy first-fit lane packer. Given the drawn
 * activities' time spans and current lanes, it re-flows them into the **fewest** lanes with no
 * time-overlap within a lane, and returns **only** the rows whose lane actually changes (the
 * minimal batch for the positions endpoint). Pure like `render-model` — no canvas/DOM/React/
 * network — so it is exhaustively unit-testable and never persists anything itself (ADR-0026 D5).
 *
 * Convention: spans are inclusive whole-day offsets about the data date (ADR-0023) — an activity
 * occupies `[startDay, endDay]`; a milestone is `startDay === endDay`. Two items may share a lane
 * iff one finishes strictly before the other starts (`a.endDay < b.startDay`).
 */

/** An activity's placement input: its drawn span and the lane it currently sits in. */
export interface PackItem {
  id: string;
  startDay: number;
  endDay: number;
  laneIndex: number;
}

/** A single lane reassignment — only emitted for items whose lane changes. */
export interface LaneChange {
  id: string;
  laneIndex: number;
}

/**
 * Pack `items` into the fewest non-overlapping-in-time lanes and return the minimal set of lane
 * changes.
 *
 * Deterministic: items are sorted by `(startDay, endDay, id)` — a total order — so the packing is
 * independent of input order. Each item takes the **first** lane whose last-occupied finish is
 * strictly before its start, else opens a new lane. Only rows whose resulting lane differs from
 * their current `laneIndex` are returned, sorted by `id` for a stable result.
 */
export function packLanes(items: readonly PackItem[]): LaneChange[] {
  const ordered = [...items].sort(
    (a, b) =>
      a.startDay - b.startDay || a.endDay - b.endDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  // laneEnds[l] = the latest endDay currently occupying lane l. A lane is free for an item iff
  // the item starts strictly after that end (inclusive-finish convention).
  const laneEnds: number[] = [];
  const changes: LaneChange[] = [];

  for (const item of ordered) {
    let lane = laneEnds.findIndex((end) => item.startDay > end);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endDay);
    } else {
      laneEnds[lane] = item.endDay;
    }
    if (lane !== item.laneIndex) changes.push({ id: item.id, laneIndex: lane });
  }

  return changes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
