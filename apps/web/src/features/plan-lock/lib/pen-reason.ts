import type { PlanEditLockActor } from '@repo/types';

import { lockCopy } from './lock-copy';

/**
 * **Why a pen-gated control is shut, as a sentence the reader can act on** (`docs/TECH_DEBT.md`
 * #115).
 *
 * The app had one sentence for this state — "Start editing to …" — repeated at nine sites. It is
 * right in the common case, where the plan is open, nobody holds the pen, and **Start editing** is
 * on screen. It is **wrong when a peer holds the pen**: that reader sees **Request control** and no
 * Start editing button at all, so the app names a control they do not have and stays silent about
 * the one that would help.
 *
 * Found by the ADR-0082 journey step, which asserts both facts within a few lines of each other —
 * the same page showing "Request control" and the row menu explaining the refusal with "Start
 * editing to change this activity."
 *
 * **A builder, not a constant**, and this is the part a shared string could not have delivered: the
 * nine sites do not say the same thing. They say "…to add activities", "…to auto-arrange", "…to
 * recalculate", "…to change the scheduling mode", "…to snap placements". The verb is the point —
 * a sentence that dropped it would be a regression dressed as consolidation. So each caller passes
 * its own action phrase and gets the right frame around it.
 *
 * ADR-0060 records what happens if you branch this on a guess rather than on state: an earlier
 * draft invented "Someone else is editing this plan. Take over the edit lock…", which was **false**
 * whenever nobody held the pen. That is why `holder` is a parameter — the caller must know, and a
 * null holder yields the Start-editing frame rather than a hedge.
 */
export function penReason(action: string, holder: PlanEditLockActor | null): string {
  // `lockCopy.heldByOther` already renders "<First name> is editing this plan." and is the sentence
  // the pen banner shows, so the two surfaces cannot describe one state two ways.
  return holder
    ? `${lockCopy.heldByOther(holder)} Request control to ${action}.`
    : `Start editing to ${action}.`;
}
