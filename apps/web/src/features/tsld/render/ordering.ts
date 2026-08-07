/**
 * The one left-to-right, top-to-bottom walk of a plan's activities.
 *
 * Extracted from `conflicts.ts` so the Next-conflict cycle and the search-match cycle order a plan
 * **identically** — the ADR-0063 one-derivation rule applied to a sequence rather than a geometry.
 * Two cycles that each sort "by early start, then lane" would agree on almost every plan and differ
 * on exactly the ones where it matters: ties. A planner pressing Enter and a planner pressing
 * Next-conflict would then walk the same programme in two different orders, with nothing on screen
 * to say which was which.
 *
 * `earlyStart` is an ISO `YYYY-MM-DD` string, which sorts lexicographically — so this is a string
 * compare, not a date parse, and it is O(1) per comparison at programme scale.
 */

/** Order two nullable early-start ISO dates ascending, nulls last (`YYYY-MM-DD` sorts lexicographically). */
export function compareEarlyStart(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** The fields the shared walk orders by. Structural, so any row shape with these three qualifies. */
export interface OrderableActivity {
  readonly id: string;
  readonly earlyStart: string | null;
  readonly laneIndex: number;
}

/**
 * `earlyStart` → `laneIndex` → `id`, the plan's stable reading order.
 *
 * The `id` tie-break is not decoration: without it two activities starting the same day in the same
 * lane would order by whatever `Array.prototype.sort` happened to do, which is implementation-
 * defined for equal elements in older engines and — more to the point — would let the same plan
 * cycle in a different order between two renders. A cycle that is not stable is not a cycle.
 */
export function compareByTimeThenLane(x: OrderableActivity, y: OrderableActivity): number {
  return (
    compareEarlyStart(x.earlyStart, y.earlyStart) ||
    x.laneIndex - y.laneIndex ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
}
