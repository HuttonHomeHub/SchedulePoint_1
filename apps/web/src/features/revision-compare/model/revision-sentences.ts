import type {
  CrossPlanCorrelation,
  CrossPlanRevisionCompare,
  CrossPlanRevisionFrame,
  CrossPlanRevisionPlan,
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
  // Reachable only when comparing two SEPARATELY IMPORTED plans, which are matched on activity
  // code. The sentence names the cause a planner can act on — the codes — rather than the
  // mechanism, because "no common activities" reads as "these plans are unrelated" when the far
  // commoner truth is that one of the two files was exported without them.
  NO_COMMON_ACTIVITIES:
    'These two plans share no activity codes, so there is no pair of activities to measure ' +
    'between. Check that both were exported with their activity IDs.',
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
 * Why the criticality delta cannot be stated at all.
 *
 * The server withholds the four row sets when either revision was never calculated, because
 * `isCritical` defaults false there and comparing against it would report every activity that WAS
 * critical as having left the critical path — each row technically true, the picture false. This
 * is the sentence that goes in their place.
 */
export function criticalPathUnavailable(
  reason: 'SIDE_NOT_SCHEDULED' | 'NO_COMMON_CODES' | null,
): string | null {
  // Two reasons, two sentences, and never one standing in for the other. `NO_COMMON_CODES` is
  // rendered by the panel as its own notice ABOVE the delta, so it must not also produce a
  // "recalculate the plan" instruction that would send a reader to fix the wrong thing.
  if (reason === null) return null;
  if (reason === 'NO_COMMON_CODES') {
    return 'These two plans share no activity codes, so there is no critical path to compare.';
  }
  return (
    'One of these revisions was never calculated, so there is no critical path to compare ' +
    'against. Recalculate the plan and capture a baseline from it.'
  );
}

/**
 * The membership context — the denominator without which "7 entered the critical path" could be
 * 7 of 10 or 7 of 400.
 *
 * These two counts were computed, transmitted and named in the spec's own user-flow diagram, and
 * rendered by nothing until the M4 ux review asked where they were: the ADR-0081 shape at field
 * granularity.
 */
export function membershipSentence(critical: number, nonCritical: number): string {
  const total = critical + nonCritical;
  return `${critical} of ${total} activities on both revisions were critical in both, ${nonCritical} in neither.`;
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
export function comparisonAnnouncement(
  compare: RevisionCompare | CrossPlanRevisionCompare,
  levelResources = false,
): string {
  /**
   * **Cross-plan the coverage is spoken FIRST, matching the visual order** — and for the same
   * reason it is rendered first: every count after it is worth exactly what it says they are. A
   * screen-reader user hearing "12 left the critical path" with no coverage has been handed the
   * confident half of a comparison whose denominator they cannot see.
   */
  const coverage = 'correlation' in compare ? `${correlationSentence(compare.correlation)} ` : '';
  const unavailable = criticalPathUnavailable(compare.criticalPath.notAssessableReason);
  if (unavailable !== null) return `${coverage}${unavailable}`;
  const { enteredTotal, leftTotal, addedTotal, removedTotal } = compare.criticalPath;
  const parts: string[] = [];
  // **Every count is the server's TRUE total, never a returned array's length.** All four row sets
  // are capped, so `added.length` would under-report on exactly the plan this feature is for — and
  // in the live region, which is the only channel a screen-reader user has, so the undercount would
  // be both silent and unaccompanied by the "showing N of M" a sighted reader gets.
  if (enteredTotal > 0) parts.push(`${enteredTotal} entered the critical path`);
  if (leftTotal > 0) parts.push(`${leftTotal} left it`);
  if (addedTotal > 0) parts.push(`${addedTotal} added`);
  if (removedTotal > 0) parts.push(`${removedTotal} removed`);
  const subject = `${sideTitle(compare.from)} compared with ${sideTitle(compare.to)}`;
  const headline =
    parts.length === 0
      ? `${coverage}${subject}: no activity entered or left the critical path.`
      : `${coverage}${subject}: ${parts.join(', ')}.`;

  // **The caveats that can invalidate these very numbers are spoken WITH them.** A sighted reader
  // meets the settings warning as a strip immediately above the counts; the announcement is the
  // only automatic channel a screen-reader user has, and speaking the numbers alone told them the
  // confident half and withheld the qualifying half — on a feature whose whole premise is saying
  // what it does and does not know (the M4 accessibility review's finding).
  const caveats = [
    settingsCaveat(compare.settingsVerdict),
    levelResources ? LEVELLING_CAVEAT : null,
  ]
    .filter((c): c is string => c !== null)
    .join(' ');
  return caveats === '' ? headline : `${headline} ${caveats}`;
}

/** "Showing 200 of 412" — the cap and the true total both from the payload, never a local constant. */
export function truncationNote(shown: number, total: number, cap: number): string | null {
  return total > shown ? `Showing the first ${cap} of ${total}.` : null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Comparing two SEPARATELY IMPORTED plans** — the sentences the cross-plan case needs and the
 * same-plan case does not.
 *
 * They live here, in the ONE sentences module, for the reason this file exists: the panel and the
 * printed document both read them, and two copies of a caveat are how a screen and a handover
 * artefact come to say different things about the same comparison.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** A plan named the way a reader needs it when there are two on screen: the plan, then its project. */
export function planLabel(plan: CrossPlanRevisionPlan): string {
  return `${plan.name} (${plan.projectName})`;
}

/**
 * **How well the two plans matched — the sentence a reader checks before believing anything else.**
 *
 * It leads with `matched`, because every number below the coverage block is worth exactly what
 * this says it is. The unmatched counts are stated as a possibility rather than a fact: matching on
 * code cannot tell a removed activity from a re-coded one, and asserting either would be a claim
 * the product cannot make.
 */
export function correlationSentence(correlation: CrossPlanCorrelation): string {
  const { matched, fromUnmatched, toUnmatched } = correlation;
  const activity = matched === 1 ? 'activity' : 'activities';
  if (fromUnmatched === 0 && toUnmatched === 0) {
    return `All ${String(matched)} ${activity} matched by activity code.`;
  }
  const parts: string[] = [];
  if (fromUnmatched > 0) parts.push(`${String(fromUnmatched)} only in the earlier plan`);
  if (toUnmatched > 0) parts.push(`${String(toUnmatched)} only in the later one`);
  return `${String(matched)} ${activity} matched by activity code; ${parts.join(' and ')}.`;
}

/**
 * The uncoded sentence — **its own, because an uncoded row is a THIRD state**.
 *
 * It is neither added nor removed: the product does not know which, so it is excluded from the
 * comparison and counted. Collapsing it into the unmatched counts would be the ADR-0073 C1 defect —
 * two different facts arriving in one channel as one.
 */
export function uncodedSentence(correlation: CrossPlanCorrelation): string | null {
  const total = correlation.fromUncoded + correlation.toUncoded;
  if (total === 0) return null;
  const row = total === 1 ? 'activity has' : 'activities have';
  return (
    `${String(total)} ${row} no activity code, so ${total === 1 ? 'it is' : 'they are'} not ` +
    'compared at all — not counted as added, and not as removed.'
  );
}

/**
 * **The re-code caveat**, rendered wherever added or removed rows are.
 *
 * This is the one honest limit of matching on code, and it is stated rather than left for a
 * planner to discover: an activity whose code changed between the two exports looks exactly like
 * one activity removed and a different one added. The product cannot tell them apart and does not
 * pretend to.
 */
export const RECODE_CAVEAT =
  'These two plans are matched on activity code, so an activity whose code changed between the ' +
  'two looks the same as one removed and another added.';

/**
 * The measurement frame — **named because two plans need not share one**.
 *
 * Same-plan this goes without saying and is deliberately not said. Across two plans the movement
 * is measured on the earlier plan's calendar with its hours-per-day, and a number with no frame
 * beside it is a number the reader cannot check.
 */
export function frameSentence(frame: CrossPlanRevisionFrame): string {
  const calendar = frame.calendarName ?? 'a calendar where every day works';
  return `Movement is measured in working days on ${frame.planName}'s calendar (${calendar}).`;
}

/**
 * **No codes in common** — a real answer, and the sentence says what to do about it.
 *
 * The commonest cause by far is an export written without activity IDs, not two unrelated
 * programmes, so the sentence leads with the check a planner can actually make. It names both
 * plans, because with two on screen a reader cannot infer which one is missing them.
 */
export function noCommonCodesSentence(compare: CrossPlanRevisionCompare): string {
  return (
    `${planLabel(compare.fromPlan)} and ${planLabel(compare.toPlan)} share no activity codes, ` +
    'so there is nothing to compare between them. Check that both were exported with their ' +
    'activity IDs.'
  );
}

/**
 * Why a row carries no "show me" control: it is not in the plan on screen.
 *
 * Stated as a plain sentence rather than a shaded button, which is ADR-0082's discriminator — the
 * action does not apply to the object, so it is omitted, and what is owed is an explanation of the
 * absence rather than a control that refuses.
 */
export function otherPlanRowNote(planName: string): string {
  return `Only in ${planName}`;
}
