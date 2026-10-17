import type { ActivitySummary } from '@repo/types';

/**
 * The WBS parent tree, as one pure answer to "may this go under that?" — shared by the Members
 * panel (a summary choosing its members) and the Breakdown picker (an activity choosing its
 * parent), so the two cannot come to disagree about what is circular.
 *
 * The server is authoritative: `ActivitiesService.updateParents` walks the resulting tree under the
 * plan lock and answers `409 PARENT_CYCLE`. Everything here exists so a reader is never *offered* a
 * choice that would be refused, and is told why. Every walk carries a `seen` guard and stops at an
 * orphan (a `parentId` naming a row that is not loaded), the rule `wbs-groups.ts` applies — this is
 * render-path code and must not hang on a malformed tree.
 */

type TreeRow = Pick<ActivitySummary, 'id' | 'parentId'>;

/** Every summary above `id`, nearest first, as a set. Excludes `id` itself. */
export function ancestorIds(id: string, byId: ReadonlyMap<string, TreeRow>): ReadonlySet<string> {
  const ancestors = new Set<string>();
  const seen = new Set<string>([id]);
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break; // an orphan is top-level, exactly as the row model treats it
    seen.add(parentId);
    ancestors.add(parentId);
    parentId = parent.parentId;
  }
  return ancestors;
}

/**
 * How many activities sit under each id, at any depth, keyed by id (an id with nothing under it is
 * absent — read it with `?? 0`). Over the SAME resolved-parent rule `deriveWbsGroups` uses: an
 * activity whose `parentId` names a row that is not present belongs to no subtree.
 */
export function subtreeSizes(activities: readonly TreeRow[]): ReadonlyMap<string, number> {
  const present = new Set(activities.map((a) => a.id));
  const childrenOf = new Map<string, string[]>();
  for (const activity of activities) {
    const parentId = activity.parentId;
    if (parentId === null || !present.has(parentId)) continue;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(activity.id);
    else childrenOf.set(parentId, [activity.id]);
  }

  const sizes = new Map<string, number>();
  for (const id of childrenOf.keys()) {
    let total = 0;
    const seen = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined) break;
      for (const child of childrenOf.get(next) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        total += 1;
        stack.push(child);
      }
    }
    sizes.set(id, total);
  }
  return sizes;
}

/** Why a candidate cannot be filed under a target — `null` when it can. */
export type NestingRefusal = 'SELF' | 'CONTAINS_TARGET';

/**
 * May `candidateId` be filed directly under `targetId`? Refused when it is the target itself, or
 * when it already contains the target (it is one of the target's `targetAncestors`) — either would
 * close a loop.
 */
export function nestingRefusal(
  candidateId: string,
  targetId: string,
  targetAncestors: ReadonlySet<string>,
): NestingRefusal | null {
  if (candidateId === targetId) return 'SELF';
  if (targetAncestors.has(candidateId)) return 'CONTAINS_TARGET';
  return null;
}
