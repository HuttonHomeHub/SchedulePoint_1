/**
 * Swimlanes (swimlanes epic M0): the two pure functions the server and the web must agree on —
 * where a swimlane's members sit, and which WBS summary an activity belongs to at a given level.
 * Like the rest of this package they take plain structural inputs and import neither Prisma nor
 * `@repo/types`, so a server row and a web `ActivitySummary` can each be mapped onto them
 * (ADR-0019, `docs/specs/swimlanes/schema-design.md` §4 Q3).
 *
 * Convention for spans is `packLanes`': inclusive whole-day offsets, and two members share a lane
 * iff one finishes strictly before the other starts.
 */

/** One activity as a swimlane sees it. */
export interface SwimlaneMember {
  id: string;
  /** The swimlane this member belongs to under the current basis; members are placed per swimlane. */
  swimlane: string;
  /** The drawn span, inclusive whole days (see {@link drawnSpanDays}). */
  startDay: number;
  endDay: number;
  /** The swimlane-free layout lane. Used only to order members, never as a result. */
  laneIndex: number;
  /**
   * The lane stored for this member against the current basis, or `undefined` when it has never
   * been placed against it — the absence of a row, not a sentinel (ADR-0139).
   */
  stored?: { lane: number; updatedAt: number };
}

/** The placement of one swimlane's members. */
export interface SwimlanePlacement {
  /** Every member's lane within the swimlane, placed or derived. */
  lanes: Map<string, number>;
  /** Lanes the swimlane needs: one past the highest lane used, and 0 when it has no members. */
  laneCount: number;
  /**
   * The members whose lane was **derived** rather than read from a stored row, in placement order:
   * those with no row, and the losers of a stale-row collision. The materialise-on-write contract
   * writes exactly these, in the same batch as the first write into the swimlane.
   */
  derived: string[];
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Place every member inside its swimlane. Pure and deterministic: members are taken in
 * `(laneIndex, startDay, id)` order, so the result does not depend on input order.
 *
 * - **Stored rows are kept** unless two collide. When two members of one swimlane hold rows for the
 *   same lane and their spans overlap, the later `updatedAt` keeps the lane, ties going to the lower
 *   id, and the loser is treated as unplaced (feature-spec §4.4, "Collision rule for stale rows").
 *   A row that is not a non-negative integer is likewise treated as absent.
 * - **Unplaced members** take, in order, the free lane nearest to the lane first-fit would give
 *   them among the unplaced alone; ties go to the lower lane (ADR-0153 D3). With no stored row in
 *   the swimlane that is plain first-fit, compact and in the swimlane-free vertical order.
 *
 * ## The window in which an unplaced member can be re-placed
 *
 * A derived lane depends on spans, so a recalculation can move it. It is stable only until the
 * **next write into the swimlane**: that write also stores every `derived` member at the lane
 * returned here ("Materialise on write", feature-spec §4.4), after which they are placed and stay
 * put. Unplaced members come only from server-side arrivals (import, API create, another client's
 * WBS move), so between the arrival and the next write the picture may change, and this is stated
 * rather than hidden.
 *
 * The result is keyed by swimlane and ordered by swimlane key.
 */
export function deriveSwimlaneLanes(
  members: readonly SwimlaneMember[],
): Map<string, SwimlanePlacement> {
  const groups = new Map<string, SwimlaneMember[]>();
  for (const member of members) {
    const group = groups.get(member.swimlane);
    if (group) group.push(member);
    else groups.set(member.swimlane, [member]);
  }

  const result = new Map<string, SwimlanePlacement>();
  for (const key of [...groups.keys()].sort(byId)) {
    result.set(key, placeOne(groups.get(key)!));
  }
  return result;
}

function placeOne(group: readonly SwimlaneMember[]): SwimlanePlacement {
  const ordered = [...group].sort(
    (a, b) => a.laneIndex - b.laneIndex || a.startDay - b.startDay || byId(a.id, b.id),
  );

  const occupancy: SwimlaneMember[][] = [];
  const lanes = new Map<string, number>();
  const free = (lane: number, member: SwimlaneMember): boolean =>
    !(occupancy[lane] ?? []).some(
      (m) => !(m.endDay < member.startDay || member.endDay < m.startDay),
    );
  const place = (member: SwimlaneMember, lane: number): void => {
    (occupancy[lane] ??= []).push(member);
    lanes.set(member.id, lane);
  };

  // Winners first: the later row, then the lower id. A greedy pass over that order resolves a
  // collision between any number of rows the same way a pair would.
  const stored = ordered
    .filter((m) => m.stored !== undefined && Number.isInteger(m.stored.lane) && m.stored.lane >= 0)
    .sort((a, b) => b.stored!.updatedAt - a.stored!.updatedAt || byId(a.id, b.id));
  const unplacedIds = new Set(ordered.map((m) => m.id));
  for (const member of stored) {
    const lane = member.stored!.lane;
    if (!free(lane, member)) continue;
    place(member, lane);
    unplacedIds.delete(member.id);
  }

  const derived: string[] = [];
  const firstFitEnds: number[] = [];
  for (const member of ordered) {
    if (!unplacedIds.has(member.id)) continue;
    // Where the member would sit if only the unplaced were laid out; the target the nearest free
    // lane is measured from.
    let target = firstFitEnds.findIndex((end) => member.startDay > end);
    if (target === -1) {
      target = firstFitEnds.length;
      firstFitEnds.push(member.endDay);
    } else {
      firstFitEnds[target] = member.endDay;
    }
    place(
      member,
      nearestFreeLane(target, (lane) => free(lane, member)),
    );
    derived.push(member.id);
  }

  return { lanes, laneCount: occupancy.length, derived };
}

/** The free lane closest to `target`, the lower one on a tie. One past the highest in use is free. */
function nearestFreeLane(target: number, isFree: (lane: number) => boolean): number {
  for (let distance = 0; ; distance += 1) {
    const below = target - distance;
    if (below >= 0 && isFree(below)) return below;
    if (distance > 0 && isFree(target + distance)) return target + distance;
  }
}

/** The part of an activity the ancestor walk reads. `type` is a plain string, as in `drawn-span`. */
export interface WbsNode {
  id: string;
  parentId: string | null;
  type: string;
}

/** Which WBS summary an activity belongs to at a level, or that it belongs to none. */
export type WbsBasis = { kind: 'summary'; summaryId: string } | { kind: 'none' };

/**
 * The ancestor walk: the `WBS_SUMMARY` at WBS level `level` (1 is a top-level summary) on the path
 * from the root to `activityId`, or `none` — "No swimlane at level L" — when the path has no
 * summary there. The one derivation the server (`findPlanWbsTree`) and the web both call, so they
 * cannot disagree about depth (ADR-0063 §9, `schema-design.md` §4 Q3).
 *
 * - A summary is on its own path: a summary at exactly level L is its own basis; one shallower than
 *   L has none, and a deeper one takes its level-L ancestor.
 * - A `parentId` naming a node that is not in `nodes` is an orphan and counts as top-level,
 *   exactly as `deriveWbsGroups` and the Gantt row model treat it.
 * - An unknown id, a cycle (forbidden by ADR-0038, but this is a read path) and a level below 1 all
 *   give `none` rather than hanging or throwing.
 */
export function wbsBasisOf(
  activityId: string,
  nodes: ReadonlyMap<string, WbsNode>,
  level: number,
): WbsBasis {
  const none: WbsBasis = { kind: 'none' };
  if (!Number.isInteger(level) || level < 1) return none;

  // Leaf-first path of every node from the activity up, with a seen guard.
  const path: WbsNode[] = [];
  const seen = new Set<string>();
  let node = nodes.get(activityId);
  while (node !== undefined && !seen.has(node.id)) {
    seen.add(node.id);
    path.push(node);
    node = node.parentId === null ? undefined : nodes.get(node.parentId);
  }
  if (node !== undefined) return none; // the walk stopped on a cycle, not at a root

  const atLevel = path[path.length - level];
  return atLevel !== undefined && atLevel.type === 'WBS_SUMMARY'
    ? { kind: 'summary', summaryId: atLevel.id }
    : none;
}
