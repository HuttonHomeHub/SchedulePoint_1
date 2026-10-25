/**
 * The words for a plan whose swimlanes follow its WBS (swimlanes M3-T1). Written once so the editor's
 * field, the gutter's shaded rows and the manage dialog say the same thing about the same fact.
 */

/**
 * The editor's read-only Swimlane field (feature-spec US-4, ADR-0083): why it cannot be edited here,
 * and what moves the activity instead. A shaded field that gives no way on is a dead end (ADR-0204).
 */
export const WBS_SWIMLANES_REASON =
  'Swimlanes follow the WBS in this plan. To move this activity, file it under another summary in Breakdown.';

/**
 * Why the gutter's rename, move and delete are shaded. The summary is where a swimlane's name and order
 * live, and the Swimlanes… command (in the gutter's corner, and in View ▸ Structure) is where the source
 * is changed back; that command is never shaded by this reason, so the sentence cannot send a reader to
 * a control it has shut.
 */
export const WBS_GUTTER_REASON =
  'Swimlanes follow the WBS in this plan. Rename or move the summaries to change them, or choose Swimlanes… to make them by hand.';
