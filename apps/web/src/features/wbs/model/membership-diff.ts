import type { ActivitySummary } from '@repo/types';

/** One row of the batch membership write: an activity, its new parent, and the version it was read at. */
export interface MembershipChange {
  id: string;
  parentId: string | null;
  version: number;
}

/** The subset of an activity the diff needs — only its identity and its optimistic-lock version. */
type MembershipRow = Pick<ActivitySummary, 'id' | 'version'>;

/** What {@link bulkParentChanges} needs: identity, version, where the row is now, and what it is. */
type BulkRow = Pick<ActivitySummary, 'id' | 'version' | 'parentId' | 'type'>;

/**
 * The **minimal** batch to turn a summary's current membership into the one the user ticked.
 *
 * Minimal is the point, not an optimisation. The endpoint is all-or-nothing and per-row
 * optimistic-locked, so every row sent is another chance for a stale `version` — belonging to an
 * activity the user never touched — to reject the whole save. Sending only genuine changes means a
 * concurrent edit elsewhere in the plan can only break this save if it touched something this save
 * is actually moving.
 *
 * `checked` is the complete set the panel believes should be members, held as state rather than
 * derived from the visible page: the panel filters and pages, and a member scrolled out of view is
 * still a member. Deriving it from what is on screen would silently unfile everyone the current
 * filter excludes — the batch would be valid, atomic, and catastrophic.
 *
 * `current` is passed in rather than read back off each row's `parentId`, so the caller can advance
 * it the moment a save succeeds instead of waiting for the refetch. Reading `parentId` would make
 * the two disagree in that window: un-ticking a just-saved row would diff against a `parentId` the
 * server has already changed, decide nothing had happened, and drop the user's edit.
 *
 * @param summaryId the summary whose membership is being edited
 * @param current   ids believed to be filed under it right now (the baseline to diff against)
 * @param checked   ids the user wants filed under it (in any order, from any page)
 * @param byId      every activity in the plan, at the versions last read from the server
 */
export function membershipDiff(
  summaryId: string,
  current: ReadonlySet<string>,
  checked: ReadonlySet<string>,
  byId: ReadonlyMap<string, MembershipRow>,
): MembershipChange[] {
  const changes: MembershipChange[] = [];

  for (const row of byId.values()) {
    // A summary can never be filed under itself, whatever a caller ticks.
    if (row.id === summaryId) continue;

    const isMember = current.has(row.id);
    const shouldBeMember = checked.has(row.id);
    if (isMember === shouldBeMember) continue;

    // Un-ticking returns the activity to the TOP LEVEL, not to some previous parent — this panel
    // only knows about membership of THIS summary, and inventing a former parent it never recorded
    // would be a guess presented as a restore.
    changes.push({
      id: row.id,
      parentId: shouldBeMember ? summaryId : null,
      version: row.version,
    });
  }

  return changes;
}

/**
 * The batch to file an arbitrary **selection** under one target — the table's bulk assign, and the
 * mirror image of {@link membershipDiff}. That one starts from a summary and asks which activities
 * belong to it; this one starts from a set of activities and says where they go.
 *
 * Both send the same minimal batch for the same reason: the endpoint is all-or-nothing and per-row
 * optimistic-locked, so a row that would not move is pure risk. A selection of forty where thirty
 * are already filed correctly sends ten.
 *
 * Three rows are refused rather than trusted, because the selection is held as ids and the plan
 * moves underneath it:
 *
 * - an id no longer in the plan (deleted, or filtered away by a refetch) — sending it would fail
 *   the whole batch on behalf of an activity the user cannot even see;
 * - the target itself, which cannot be its own parent;
 * - a `WBS_SUMMARY`, because nesting one summary inside another is the Breakdown picker's job
 *   (spec C-1b). A checklist has nowhere to put the cycle feedback that restructuring needs, and
 *   the server would reject the cycle anyway — after failing the other thirty-nine rows with it.
 *
 * @param selected  ids the user ticked, in any order
 * @param targetId  the summary to file them under, or `null` for the top level
 * @param byId      every activity in the plan, at the versions last read from the server
 */
export function bulkParentChanges(
  selected: ReadonlySet<string>,
  targetId: string | null,
  byId: ReadonlyMap<string, BulkRow>,
): MembershipChange[] {
  const changes: MembershipChange[] = [];

  // Iterated over the plan rather than over the selection so the batch comes out in plan order
  // whatever order the user ticked in — the same traversal the sibling uses, and one less thing
  // that differs between two functions doing one job. An id no longer in `byId` simply never
  // appears, which is the "deleted underneath the selection" case above.
  for (const row of byId.values()) {
    if (!selected.has(row.id)) continue;
    if (row.id === targetId) continue;
    if (row.type === 'WBS_SUMMARY') continue;
    if (row.parentId === targetId) continue;

    changes.push({ id: row.id, parentId: targetId, version: row.version });
  }

  return changes;
}
