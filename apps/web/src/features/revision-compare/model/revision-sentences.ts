import type {
  RevisionCompare,
  RevisionCompletion,
  RevisionCompletionReason,
  RevisionSettingsVerdict,
  RevisionSide,
} from '@repo/types';

/**
 * **The comparison's prose, derived here rather than in the component.**
 *
 * Every one of these is a sentence a planner reads and may act on, so each is testable without
 * mounting anything — and the rule the whole epic turns on is enforced in one place: **a reason
 * code never reaches the screen**. `PLAN_NOT_SCHEDULED` on a panel is a defect; "This plan has not
 * been calculated yet, so there is no completion date to compare." is the product.
 *
 * The second rule, and the reason this file exists at all: **two different facts never collapse
 * into one message**. "This plan has no baselines" and "nothing entered or left the critical path"
 * are distinct in the visible copy AND in the live region — the ADR-0073 C1 defect, where an audit
 * log said "Showing 0 events" for both "nothing recorded yet" and "nothing matches your filter",
 * collapsing the distinction in the one channel a screen-reader user has.
 */

/** How a side is named in running prose. The live side is LABELLED as live, never left blank. */
export function sideLabel(side: RevisionSide): string {
  return side.kind === 'LIVE' ? 'the plan as it stands now' : (side.name ?? 'an unnamed revision');
}

/** The same, capitalised for a control's label or a heading. */
export function sideTitle(side: RevisionSide): string {
  return side.kind === 'LIVE' ? 'Live' : (side.name ?? 'Unnamed revision');
}

const COMPLETION_REASONS: Record<RevisionCompletionReason, string> = {
  PLAN_NOT_SCHEDULED:
    'One of these revisions has no computed finish date, so there is nothing to compare. ' +
    'Recalculate the plan and try again.',
  CARRIER_REMOVED:
    'The activity that finished last in the earlier revision is not in the later one, so there ' +
    'is no pair of dates to measure. What entered and left the critical path is still shown below.',
};

/**
 * The completion statement — a number, the carrier BY NAME, and the frame the number is measured
 * in, in one sentence.
 *
 * The carrier is named because it is **not exact**: both sides persist a date, so under a same-day
 * tie this can pick a different activity than the engine's own minute-denominated rule would. A
 * planner who can see which activity the number is about can check it; one who cannot has to trust
 * a figure whose provenance the product declined to state. Do not "simplify" this by dropping the
 * name.
 */
export function completionSentence(completion: RevisionCompletion): string {
  if (!completion.assessable) {
    return completion.reason === null
      ? 'The completion movement could not be measured.'
      : COMPLETION_REASONS[completion.reason];
  }
  const carrier = completion.carrierName ?? 'the last activity';
  const days = completion.movementDays;
  if (days === null) {
    return `${carrier} finished last in the earlier revision, but one of its dates is missing, so the movement cannot be measured.`;
  }
  if (days === 0) {
    return `${carrier} finished last in the earlier revision and finishes on the same day now — no movement, measured in working days on the plan calendar.`;
  }
  const magnitude = Math.abs(days);
  const unit = magnitude === 1 ? 'working day' : 'working days';
  return days > 0
    ? `${carrier} finished last in the earlier revision and now finishes ${magnitude} ${unit} later, measured on the plan calendar.`
    : `${carrier} finished last in the earlier revision and now finishes ${magnitude} ${unit} earlier, measured on the plan calendar.`;
}

/**
 * The carrier-changed note, when a DIFFERENT activity now finishes last.
 *
 * A fact a planner wants and **not a cause** — it says which activity now finishes last, never
 * that it is why the job moved.
 */
export function carrierChangedSentence(completion: RevisionCompletion): string | null {
  if (!completion.carrierChanged || completion.newSideCarrierName === null) return null;
  return `A different activity finishes last now: ${completion.newSideCarrierName}.`;
}

const SETTINGS_VERDICTS: Record<RevisionSettingsVerdict, string | null> = {
  // Silence is right here and only here: the two sides agree, and a line saying so on every
  // comparison is noise that trains a reader to skip the place the warning will appear.
  MATCH: null,
  DIFFERS:
    'These two revisions were computed under different criticality settings. Some of the ' +
    'activities below may have entered or left the critical path because the rule changed, not ' +
    'because the work did.',
  UNKNOWN:
    'One of these revisions does not record which criticality settings produced it, so this ' +
    'comparison cannot confirm the two were judged by the same rule.',
};

/**
 * The criticality-settings caveat — **three-valued, and `UNKNOWN` never renders as agreement**.
 *
 * `isCritical` is the OUTPUT of a rule, so a comparison across a changed rule reports a large,
 * real-looking set as having entered the critical path while every bar sits where it did. A
 * revision that never recorded its rule cannot be checked either way, and saying nothing would be
 * indistinguishable from saying they match.
 */
export function settingsCaveat(verdict: RevisionSettingsVerdict): string | null {
  return SETTINGS_VERDICTS[verdict];
}

/**
 * The honesty footer. Its first clause is the one the whole epic exists to be honest about, and it
 * is deliberately not softened: the product measured itself unable to attribute a movement to a
 * change, so it says what it shows and what it does not.
 */
export const HONESTY_FOOTER =
  'This shows what moved between the two revisions. It does not say what caused it: attributing ' +
  'a change in the critical path to one edit needs an ordering nobody supplied, and the same edit ' +
  'scores differently depending on where it falls in that ordering. The totals here do not depend ' +
  'on any ordering.';

/**
 * The levelling caveat (spec D6) — **one sentence rather than silence**.
 *
 * The comparison reports NETWORK criticality and float on both sides, which is the authoritative
 * pair (ADR-0041 Q2). On a levelled plan the planner may be looking at levelled bars, so the two
 * pictures can legitimately disagree, and saying nothing leaves them to discover that alone.
 */
export const LEVELLING_CAVEAT =
  'This plan levels resources. The comparison reads the network critical path, so it can differ ' +
  'from the levelled bars on the diagram.';

/**
 * The same fact for PAPER, and a sibling constant rather than a transformation of the one above.
 *
 * It differs in two ways, both deliberate. It prints **unconditionally**, because the screen's
 * reader has the diagram beside them and can see which picture they are looking at while the paper's
 * reader is somebody who was not in the room. And it is framed as what the numbers ARE rather than
 * as a warning about what they are not, for the same reason.
 *
 * Written out rather than derived by string surgery from its sibling: the first draft did exactly
 * that, and a later edit to one sentence would have produced a silently malformed one in the other
 * — on the artefact where nobody is watching, which is the ADR-0063 M5 shape.
 */
export const LEVELLING_CAVEAT_PRINT =
  'These figures read the network critical path. On a plan that levels resources, they can differ ' +
  'from the levelled bars on the diagram.';

/**
 * The one announcement, made when a comparison settles.
 *
 * "No baselines to compare" and "nothing entered or left" are DIFFERENT and stay different here,
 * because the live region is the only channel a screen-reader user has and collapsing them there
 * undoes the distinction the visible copy makes.
 */
export function comparisonAnnouncement(compare: RevisionCompare): string {
  const { enteredTotal, leftTotal, added, removed } = compare.criticalPath;
  const parts: string[] = [];
  if (enteredTotal > 0) parts.push(`${enteredTotal} entered the critical path`);
  if (leftTotal > 0) parts.push(`${leftTotal} left it`);
  if (added.length > 0) parts.push(`${added.length} added`);
  if (removed.length > 0) parts.push(`${removed.length} removed`);
  const subject = `${sideTitle(compare.from)} compared with ${sideTitle(compare.to)}`;
  return parts.length === 0
    ? `${subject}: no activity entered or left the critical path.`
    : `${subject}: ${parts.join(', ')}.`;
}

/** "Showing 200 of 412" — the cap and the true total both from the payload, never a local constant. */
export function truncationNote(shown: number, total: number, cap: number): string | null {
  return total > shown ? `Showing the first ${cap} of ${total}.` : null;
}
