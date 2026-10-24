import type { CompareGhost } from './paint';

/**
 * **Where a ghost sits once the diagram is divided into swimlanes** (swimlanes ui-architecture C6;
 * ADR-0126, ADR-0127; spec SQ-7 yes). A ghost is drawn at a lane, and a stored lane is a position
 * inside one swimlane, not a row of the stack: drawn as it is, a ghost lands in some other
 * swimlane's row. So while swimlanes are shown every ghost takes its row from the same projection
 * that placed the bars, and with no projection nothing here changes anything.
 *
 * The scene is the neutral shape of that projection, declared here so `render/` keeps its no-feature
 * rule.
 */
export interface GhostLaneScene {
  /** Activity id → display lane, exactly the lane the bar is drawn at. */
  displayLanes: ReadonlyMap<string, number>;
  /** `id: null` is "No swimlane". */
  extents: readonly { id: string | null; firstLane: number; laneCount: number }[];
}

/**
 * The lane a ghost of a LIVE activity is drawn at: the activity's display lane, so it sits in the
 * same row as its bar. `null` when swimlanes are shown and the activity has no bar to sit behind
 * (no drawn start, or drawn in the WBS band), because its stored lane belongs to another space.
 * Without a scene it is the stored lane, untouched.
 */
export function ghostLaneOf(
  scene: GhostLaneScene | null,
  activityId: string,
  storedLane: number,
): number | null {
  if (scene === null) return storedLane;
  return scene.displayLanes.get(activityId) ?? null;
}

/**
 * Place the revision-comparison ghosts for a swimlane diagram, and count the ones that cannot be.
 *
 * - A ghost of a **live** activity draws on that activity's display lane.
 * - A ghost of **removed** work has no bar, so it is placed from the lane its baseline froze for the
 *   basis today's source resolves to: its frozen swimlane if that swimlane still exists, else "No
 *   swimlane". It is **counted, not drawn** when the baseline froze nothing (a `NONE` capture), when
 *   no frozen row exists for that basis, or when the frozen lane lies outside the swimlane's rows
 *   today. A lane is never derived among today's members, because that would put removed work
 *   somewhere plausible, which is a false statement about where it was.
 *
 * With no scene the ghosts come back as the same array.
 */
export function placeCompareGhosts(
  ghosts: readonly CompareGhost[],
  scene: GhostLaneScene | null,
): { ghosts: readonly CompareGhost[]; counted: number } {
  if (scene === null) return { ghosts, counted: 0 };
  const placed: CompareGhost[] = [];
  let counted = 0;
  for (const ghost of ghosts) {
    const lane = ghost.removed
      ? removedLane(ghost, scene)
      : scene.displayLanes.get(ghost.activityId);
    if (lane === undefined) {
      counted += 1;
      continue;
    }
    placed.push({ ...ghost, laneIndex: lane });
  }
  return { ghosts: placed, counted };
}

function removedLane(ghost: CompareGhost, scene: GhostLaneScene): number | undefined {
  if (ghost.frozenLanes === undefined) return undefined;
  const own = ghost.frozenSwimlaneId ?? null;
  const known = own !== null && scene.extents.some((e) => e.id === own);
  const swimlaneId = known ? own : null;
  const row = ghost.frozenLanes.find(
    (r) => r.basis === (known ? 'SWIMLANE' : 'NO_SWIMLANE') && r.swimlaneId === swimlaneId,
  );
  const extent = scene.extents.find((e) => e.id === swimlaneId);
  if (row === undefined || extent === undefined || row.laneIndex >= extent.laneCount) {
    return undefined;
  }
  return extent.firstLane + row.laneIndex;
}
