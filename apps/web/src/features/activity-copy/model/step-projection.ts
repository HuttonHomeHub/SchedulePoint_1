import type { ActivityStep, ActivityStepInput } from '@repo/types';

import type { CloneFieldDecision } from './clone-projection';

/**
 * What a copied **weighted step** carries (`docs/specs/activity-copy-paste/` M4-T2).
 *
 * The activity census's rule, one level down again: **the step definition carries, the progress
 * against it does not.** A step list is how this work is broken down and how the pieces are
 * weighted — a plan. What percentage of each piece is done is history, and the copy has none.
 *
 * **Zeroing `percentComplete` is a correctness requirement, not tidiness.** When an activity has
 * steps, its PHYSICAL %-complete rolls up as `Σ(wᵢ·pᵢ)/Σ(wᵢ)` and **wins over** the manual
 * `physicalPercentComplete` field (ADR-0044 §2, N27). The activity census already withholds that
 * manual field — so carrying the step percents would let progress in through the back door the
 * create DTO closes: a brand-new copy reporting 60% physical complete, earning value (ADR-0042),
 * with nothing on the activity itself to explain where the number came from.
 */
export const STEP_FIELD_DECISIONS: Record<keyof ActivityStep, CloneFieldDecision> = {
  id: { disposition: 'withheld', reason: 'The server mints the clone its own id.' },
  activityId: {
    disposition: 'withheld',
    reason: 'Implied by the route — steps are PUT under the CLONE, not the source.',
  },
  seq: {
    disposition: 'withheld',
    reason:
      'Assigned contiguously by the server from the order of the list, so it is expressed by ' +
      'position rather than sent. Sending it would let the two disagree.',
  },
  version: {
    disposition: 'withheld',
    reason: 'The PUT carries the parent ACTIVITY’s version, not a per-step one.',
  },
  createdAt: { disposition: 'withheld', reason: 'Server-stamped when the clone is created.' },
  updatedAt: { disposition: 'withheld', reason: 'Server-stamped when the clone is created.' },

  name: { disposition: 'carried', reason: 'What this piece of the work is.' },
  weight: {
    disposition: 'carried',
    reason:
      'How much of the activity this piece represents — the breakdown itself. Dropping it would ' +
      'leave all-zero weights, which silently falls back to the manual physical % (N27).',
  },
  percentComplete: {
    disposition: 'transformed',
    reason:
      'Zeroed, always. Steps roll up to PHYSICAL %-complete and win over the manual field ' +
      '(ADR-0044 N27), so carrying these would give the copy earned value it has not earned — ' +
      'through the back door the activity create DTO closes.',
  },
};

/**
 * Project a source activity's steps onto the list its clone is created with.
 *
 * Order is preserved from the source's `seq`, sorted explicitly rather than trusted: the server
 * assigns `seq` from list position, so a list that arrived in a different order would silently
 * renumber the breakdown. Returns `null` when there is nothing to send, so a caller can skip the
 * request entirely rather than PUT an empty list — which would be a write, and a `version` bump, for
 * an activity that has no steps either way.
 */
export function projectSteps(source: readonly ActivityStep[]): ActivityStepInput[] | null {
  if (source.length === 0) return null;
  return [...source]
    .sort((a, b) => a.seq - b.seq)
    .map((step) => ({ name: step.name, weight: step.weight, percentComplete: 0 }));
}
