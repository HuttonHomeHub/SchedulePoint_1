/**
 * The words for a plan whose swimlanes are made from a code (p6-activity-codes M4). Written once so the
 * editor's field, the Activities table and the Gantt's cell say the same thing about the same fact, and
 * each names the type, because "its code" would not tell a planner with six types which one it follows.
 */

/**
 * The activity editor's read-only Swimlane field (`m4-ui-design.md` §5.3, ADR-0083): why it cannot be
 * edited on this tab, and where the activity's value is. Two controls on one tab writing the same fact —
 * one saving at once, one holding unsaved working state — would leave the Codes section's version stale
 * and its Save refused, so the swimlane is changed there and shown here.
 */
export const codeSwimlaneEditorReason = (typeName: string): string =>
  `Swimlanes follow ${typeName} in this plan. Change it under Codes above.`;
