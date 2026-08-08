import type { ClonePlan } from './clone-graph';

/**
 * What the band-copy confirmation says (`docs/specs/activity-copy-paste/` M2-T2).
 *
 * **The counts are read off the plan, never recounted.** `planClone` has already decided which
 * activities and which links the write will make; a second count taken from the selection would
 * drift the moment the two disagreed — and it would drift *quietly*, because a confirmation nobody
 * checks against the result is a sentence, not a gate. The parameter is the `ClonePlan` itself so
 * there is nothing else it could count.
 *
 * **The not-copied list is part of the confirmation, not a footnote.** A planner who duplicates a
 * band and later finds the progress gone has been misled by omission; ADR-0073's whole argument is
 * that a fact nobody can find is a fact the product does not have. Saying it before the write is
 * cheaper than explaining it afterwards.
 */
export interface BandCopyCopy {
  readonly title: string;
  readonly description: string;
}

export function bandCopyConfirmation(summaryName: string, plan: ClonePlan): BandCopyCopy {
  // The summary is in `creates` too, so the band's *contents* are one fewer.
  const memberCount = Math.max(0, plan.creates.length - 1);
  const linkCount = plan.links.length;

  const members =
    memberCount === 0
      ? 'which is empty'
      : memberCount === 1
        ? 'and the 1 activity in it'
        : `and the ${String(memberCount)} activities in it`;

  const links =
    linkCount === 0
      ? ''
      : linkCount === 1
        ? ', with the 1 link between them'
        : `, with the ${String(linkCount)} links between them`;

  return {
    title: `Duplicate “${summaryName}”?`,
    description:
      `This copies “${summaryName}” ${members}${links}, with their resource assignments and ` +
      'weighted steps. ' +
      // Named individually rather than as "some fields": a planner cannot act on a category.
      // The list shrank when M4 landed: assignments and steps moved from "not copied" to copied,
      // and a confirmation that still said otherwise would be a false statement on the one screen
      // whose job is to say what is about to happen.
      'Progress and notes are not copied — the copy is the same work, not the same history.',
  };
}
