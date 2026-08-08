import type { ActivitySummary } from '@repo/types';

import { deriveWbsGroups } from '@/features/wbs/model/wbs-groups';

/**
 * Everything a band copy takes: the summary, and its whole subtree
 * (`docs/specs/activity-copy-paste/` M2-T1).
 *
 * **Built on `deriveWbsGroups`, not on a fresh `parentId` walk.** That derivation is already the
 * single answer to "what is in this band" — the Gantt row model and the canvas band both read it
 * (ADR-0063's one-derivation rule) — and a second opinion would disagree exactly when it mattered:
 * on a plan where a `parentId` points at a row that is not in the list. `deriveWbsGroups` resolves
 * that case (an unresolvable parent makes the activity unfiled); a naive walk would silently treat
 * the dangling id as a real parent and copy nothing.
 *
 * What is added here is only the **transitive** step: `deriveWbsGroups` returns direct children per
 * summary, and a band copy takes the whole subtree. The closure is computed over that map rather
 * than over the raw rows, so the reuse is real rather than decorative.
 *
 * Returns them in **depth order, summary first**, which is what `planClone` needs to create a
 * parent before its children — though `planClone` re-derives the ordering itself rather than
 * trusting this one, because the two answer different questions and only one of them is the
 * creation contract.
 */
export function bandMembers(
  activities: readonly ActivitySummary[],
  summaryId: string,
): readonly ActivitySummary[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const root = byId.get(summaryId);
  if (root === undefined || root.type !== 'WBS_SUMMARY') return [];

  const { summaries } = deriveWbsGroups(activities);
  const directChildren = new Map(summaries.map((g) => [g.summary.id, g.memberIds]));

  const out: ActivitySummary[] = [root];
  const seen = new Set<string>([root.id]);
  // Breadth-first over the derived map. The `seen` guard is not defensive decoration: ADR-0038
  // enforces acyclicity server-side under a lock, but this runs against a client cache that can be
  // mid-refetch, and a tab that hangs is worse than a copy that is one activity short.
  const queue: string[] = [root.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    for (const childId of directChildren.get(id) ?? []) {
      if (seen.has(childId)) continue;
      const child = byId.get(childId);
      if (child === undefined) continue;
      seen.add(childId);
      out.push(child);
      queue.push(childId);
    }
  }
  return out;
}

/** The counts a confirmation needs, derived from the SAME set the write will use. */
export interface BandCopyCounts {
  /** Activities inside the band, excluding the summary itself. */
  readonly memberCount: number;
  /** Links whose two endpoints are both inside the band — the only ones a copy carries. */
  readonly linkCount: number;
}
