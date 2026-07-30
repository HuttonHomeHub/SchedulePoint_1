import type { ActivitySummary } from '@repo/types';

/** One row of the batch membership write: an activity, its new parent, and the version it was read at. */
export interface MembershipChange {
  id: string;
  parentId: string | null;
  version: number;
}

/** The subset of an activity the diff needs — only its identity and its optimistic-lock version. */
type MembershipRow = Pick<ActivitySummary, 'id' | 'version'>;

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
