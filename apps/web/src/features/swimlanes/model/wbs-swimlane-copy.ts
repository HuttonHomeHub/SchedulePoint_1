/**
 * The words for a plan whose swimlanes follow its WBS (swimlanes M3-T1). Written once so the editor's
 * field, the gutter's shaded rows and the manage dialog say the same thing about the same fact.
 */

/** The editor's read-only Swimlane field (feature-spec US-4, ADR-0083): why it cannot be edited here. */
export const WBS_SWIMLANES_REASON = 'Swimlanes follow the WBS in this plan.';

/**
 * Why the gutter's rename, move and delete are shaded. Names both ways forward, because a shaded
 * control that gives no way on is a dead end (ADR-0204): the summary is where the name and the order
 * live, and the lens's command is where the source is changed back.
 */
export const WBS_GUTTER_REASON =
  'Swimlanes follow the WBS in this plan. Rename or move the summaries to change them, or choose Swimlanes… in View to make them by hand.';
