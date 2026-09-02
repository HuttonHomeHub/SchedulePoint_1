/**
 * Which member of a soft-deleted batch `restoreBatch` should be handed as its anchor
 * (`docs/TECH_DEBT.md` #230, `docs/specs/cascade-undo/`).
 *
 * **The defect this replaces.** `restoreDeleteBatch` selected the batch's members with a `findMany`
 * carrying **no `orderBy`** and took `ids[0]` — whichever row the database happened to return
 * first. `restoreBatch` then runs `assertParentActive` on that member **before** restoring
 * anything, and for an activity that guard checks the WBS parent
 * (`hierarchy-lifecycle.service.ts`, the `root.wbsParentId` branch).
 *
 * In a **cascade** batch — a WBS summary deleted with its subtree — every non-root member's parent
 * is another member of the same batch, still deleted at that instant. So the restore succeeded only
 * when an unrequested ordering happened to return the root first, and threw 409 `PARENT_DELETED`
 * otherwise. Leaf and bulk batches are structurally safe, which is why nobody had seen it: their
 * members' parents are outside the batch and already active.
 *
 * The guard's own comment reasons about the intended OUTCOME — _"a child deleted with its summary
 * shares the batch and is restored together, so this only bites a separately-deleted child"_ —
 * which is true of what `restoreBatch` does and false of what happens when such a child is the
 * anchor, because the guard runs first. Worth knowing before reading that comment as a contract.
 *
 * **The rule: anchor on a member whose parent is not itself in the batch.** That member's parent is
 * either absent or already active, so the guard is asking the question it was written to ask — is
 * this batch allowed back at all — rather than one about the batch's own internals.
 */

/**
 * @param members every soft-deleted row in the batch, with its WBS parent (`activity.parentId`).
 * @returns the id to hand `restoreBatch`, or `undefined` when the batch is empty.
 */
export function batchRestoreAnchor(
  members: readonly { id: string; parentId: string | null }[],
): string | undefined {
  if (members.length === 0) return undefined;
  const inBatch = new Set(members.map((m) => m.id));
  // Sorted, so a batch with several eligible roots — an ADR-0080 bulk delete stamps ONE batch
  // across unrelated activities — always picks the same one. The choice is arbitrary between them
  // and every one of them passes the guard; determinism is for reproducing a failure, not
  // correctness.
  const roots = members
    .filter((m) => m.parentId === null || !inBatch.has(m.parentId))
    .map((m) => m.id)
    .sort();
  const root = roots[0];
  if (root !== undefined) return root;
  // No member qualifies. That means every parent is inside the batch — a cycle, which ADR-0021's
  // DAG invariant and ADR-0038's acyclic parent tree both forbid. Rather than invent a new failure
  // mode for a state that should not exist, fall back to the old behaviour and let the guard speak:
  // a corrupt batch then reports `PARENT_DELETED` exactly as it does today.
  return [...inBatch].sort()[0];
}
