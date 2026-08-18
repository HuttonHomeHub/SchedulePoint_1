import type { DeletedHierarchyItem } from '@repo/types';

/**
 * **One row per deletion, not one row per deleted thing** (ADR-0096).
 *
 * Deleting a client stamps ONE `deleteBatchId` on the whole subtree, and `restoreBatch` keys the
 * restore on that value — so those rows come back together whatever the reader clicks. Listing them
 * separately offered a per-row action on rows that were never independently actionable, and told
 * two of every three to "Restore its parent first" about work the product already does.
 *
 * Grouping is a pure transform over the array the client already holds. It is correct only because
 * `use-deleted-items.ts` fetches every page: a group shown partially would be a false statement
 * about what a Restore brings back. That is a standing rule, recorded on `docs/TECH_DEBT.md` #57 so
 * a later performance fix cannot quietly remove it.
 */

export interface DeletionGroup {
  /** Stable key: the batch id, or the lone row's own key when it predates batch ids. */
  key: string;
  /** The row a reader acts on — see {@link rootOf} for what makes it the root. */
  root: DeletedHierarchyItem;
  /** Everything else the same deletion took, in the order the server returned it. */
  members: readonly DeletedHierarchyItem[];
  /** The root's, because the root is what the Restore button acts on. */
  canRestore: boolean;
}

/**
 * The row a group is acted on through.
 *
 * **Not "the shallowest kind present"**, which is the obvious rule and is wrong for a project-rooted
 * cascade: that batch contains no client, so a kind-ranking has to special-case every shape. The
 * rule that holds for all of them is *the row whose blocker is outside this batch* — for a
 * client-rooted delete the client has no blocker at all; for a project-rooted one the project's
 * parent is still alive; and for the cross-batch case the plan's blocker sits in a **different**
 * batch, which is exactly what makes that group blocked rather than restorable.
 */
function rootOf(rows: readonly DeletedHierarchyItem[], batchId: string): DeletedHierarchyItem {
  const root = rows.find(
    (row) => row.blockedBy === null || row.blockedBy.deleteBatchId !== batchId,
  );
  // Fall back to the first row rather than throwing. A batch whose every row is blocked from
  // within itself would mean a cycle in the hierarchy, which the parent FKs make impossible — but
  // an empty screen is a worse answer to an impossible state than a slightly odd one.
  return root ?? rows[0]!;
}

export function groupDeletions(items: readonly DeletedHierarchyItem[]): DeletionGroup[] {
  const byBatch = new Map<string, DeletedHierarchyItem[]>();
  const ungrouped: DeletedHierarchyItem[] = [];

  for (const item of items) {
    // A row deleted before batch ids existed stands alone. It cannot be grouped with anything —
    // there is no evidence it was ever part of a cascade — and inventing a group of one that
    // claims otherwise would be worse than showing it as it is.
    if (item.deleteBatchId === null) {
      ungrouped.push(item);
      continue;
    }
    const existing = byBatch.get(item.deleteBatchId);
    if (existing) existing.push(item);
    else byBatch.set(item.deleteBatchId, [item]);
  }

  const groups: DeletionGroup[] = [];
  for (const [batchId, rows] of byBatch) {
    const root = rootOf(rows, batchId);
    groups.push({
      key: batchId,
      root,
      members: rows.filter((row) => row !== root),
      canRestore: root.canRestore,
    });
  }
  for (const item of ungrouped) {
    groups.push({
      key: `${item.kind}:${item.id}`,
      root: item,
      members: [],
      canRestore: item.canRestore,
    });
  }

  // Newest deletion first, matching the server's order. Sorted on the ROOT's timestamp: every row
  // in a cascade shares one instant, so any member would do — but saying "the root's" makes the
  // tie-break irrelevant rather than accidentally correct.
  return groups.sort((a, b) => b.root.deletedAt.localeCompare(a.root.deletedAt));
}

/** "+ 1 project, 1 plan" — what the deletion took beyond its root, named rather than counted. */
export function describeMembers(members: readonly DeletedHierarchyItem[]): string | null {
  if (members.length === 0) return null;
  const counts = new Map<DeletedHierarchyItem['kind'], number>();
  for (const m of members) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const parts: string[] = [];
  // Fixed order, not insertion order, so the same deletion reads the same way every time.
  for (const kind of ['client', 'project', 'plan'] as const) {
    const n = counts.get(kind);
    if (n === undefined) continue;
    parts.push(`${n} ${kind}${n === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}
