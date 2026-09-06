import type {
  RevisionChangeClass,
  RevisionClassAssessment,
  RevisionNotAssessableReason,
} from '@repo/types';

/**
 * Every word the change list says, in one place.
 *
 * The sibling `revision-sentences.ts` exists for the same reason and this follows it: prose that
 * lives beside the markup gets edited by whoever is nearest, and a claim about what the product
 * knows is not a styling decision. These sentences carry the epic's central honesty — that a class
 * nobody could assess is a **different fact** from a class with nothing in it — so they are
 * testable in isolation rather than only through a rendered panel.
 */

/** The heading each class carries. A planner's word, not the enum's. */
const CLASS_TITLES: Record<RevisionChangeClass, string> = {
  ADDED: 'Added',
  REMOVED: 'Removed',
  RENAMED: 'Renamed',
  RECODED: 'Code changed',
  RETYPED: 'Type changed',
  REDURATIONED: 'Duration changed',
  REDATED: 'Dates moved',
  CRITICALITY: 'Criticality changed',
  RELOGICKED: 'Logic changed',
  RECONSTRAINED: 'Constraints changed',
  RECALENDARED: 'Calendar changed',
  REPARENTED: 'Moved in the breakdown',
  RELANED: 'Lane changed',
  PROGRESSED: 'Progress reported',
};

export function classTitle(changeClass: RevisionChangeClass): string {
  return CLASS_TITLES[changeClass];
}

/**
 * Why a class could not be assessed, in a planner's words.
 *
 * **Never "no changes".** That is the whole reason this function exists: an empty list and an
 * un-looked-at list are indistinguishable on screen unless the product says which it is, and the
 * one that reads as reassuring is the one that is a lie. The snapshot case is stated as
 * **permanent for these revisions** rather than as a wait, because no backfill is possible —
 * writing today's logic into a historic snapshot would state as history a graph that baseline
 * never saw.
 */
export function notAssessableSentence(
  reason: RevisionNotAssessableReason,
  changeClass: RevisionChangeClass,
): string {
  const subject = classTitle(changeClass).toLowerCase();
  switch (reason) {
    case 'NOT_SNAPSHOTTED':
      return (
        `Not recorded for these two revisions, so ${subject} cannot be compared. ` +
        `Snapshots taken from now on will carry it; these two never will.`
      );
    case 'SIDE_NOT_SCHEDULED':
      return (
        `One of these revisions has no calculated schedule, so ${subject} cannot be compared. ` +
        `Recalculate the plan and capture a baseline to compare dates.`
      );
  }
}

/** The count line under a class heading, or null when the class was not assessed. */
export function classCountSentence(assessment: RevisionClassAssessment): string | null {
  if (assessment.notAssessableReason !== null) return null;
  if (assessment.total === 0) return 'No changes in this revision.';
  const noun = assessment.total === 1 ? 'activity' : 'activities';
  if (assessment.rows.length < assessment.total) {
    // "Showing N of M" is never the client's own arithmetic (ADR-0116 D3) — both numbers come
    // from the server, which is the only side that knows what it did not send.
    return `Showing ${String(assessment.rows.length)} of ${String(assessment.total)} ${noun}.`;
  }
  return `${String(assessment.total)} ${noun}.`;
}

/**
 * The list's own footer. Says the thing the whole epic turns on, in the place a reader will meet
 * it, rather than leaving it to be inferred from an absence.
 */
export const CHANGES_FOOTER =
  'This lists what changed between the two revisions, in programme order. It does not say which ' +
  'change moved the completion date — that cannot be answered from a comparison, because the ' +
  'effect of one edit depends on the order the edits were made in.';

/**
 * The single-line summary a screen-reader user gets when the list settles.
 *
 * It states the count of classes that could NOT be assessed as well as the count of changes,
 * because a summary that mentions only what was found implies the rest was looked at — the exact
 * inference the visible copy is careful to prevent.
 */
export function changesAnnouncement(classes: readonly RevisionClassAssessment[]): string {
  const assessed = classes.filter((c) => c.notAssessableReason === null);
  const unassessed = classes.length - assessed.length;
  const total = assessed.reduce((sum, c) => sum + c.total, 0);
  const changes =
    total === 0 ? 'No changes found' : `${String(total)} ${total === 1 ? 'change' : 'changes'}`;
  if (unassessed === 0) return `${changes} across ${String(assessed.length)} categories.`;
  return (
    `${changes} across ${String(assessed.length)} categories. ` +
    `${String(unassessed)} ${unassessed === 1 ? 'category' : 'categories'} could not be compared.`
  );
}
