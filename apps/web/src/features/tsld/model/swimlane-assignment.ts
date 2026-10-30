import { NO_SWIMLANE_LABEL } from '../render/project-swimlanes';

import { swimlanePlace, type SwimlaneLaneFacts } from './reposition-announcement';

/**
 * **Move to swimlane…** as the surfaces that offer it see it (swimlanes M2-T10, ui-architecture C10):
 * the selection bar (one or many), the activity editor, and later the table and the Gantt. They share
 * one shape so they cannot disagree about what a swimlane choice is, and none of them imports the
 * swimlanes feature or the panel's planning — the host supplies this and they only render it.
 */
export interface SwimlaneChoice {
  /** The swimlane's id, or `null` for "No swimlane". */
  readonly id: string | null;
  readonly name: string;
}

export interface SwimlaneAssignOutcome {
  /** False when nothing was written (a refusal, a stale version, a lost pen). */
  readonly applied: boolean;
  readonly conflict: string | null;
  readonly refreshable?: boolean;
  /** How many activities changed swimlane. Absent when nothing was written. */
  readonly moved?: number;
  /** Where the first of them landed, for the sentence. */
  readonly landed?: SwimlaneLaneFacts;
}

export interface SwimlaneAssignment {
  /**
   * Whether the diagram is drawing swimlanes. The selection bars shade the move while it is not (a
   * move the planner cannot see land; {@link SWIMLANES_OFF_MOVE_REASON} says how to turn them on),
   * the editor keeps it with a hint, and the sentence leaves out the lane clause.
   */
  readonly shown: boolean;
  /** The plan's swimlanes in their order, then "No swimlane". */
  readonly choices: readonly SwimlaneChoice[];
  /** A standing sentence under the choices, for a source whose list is not every place work could go. */
  readonly note?: string;
  /** The swimlane an activity is drawn in now (`null`: none). */
  readonly currentOf: (activityId: string) => string | null;
  /**
   * File `ids` in `target` as one write and one undo step. Resolves with the outcome rather than
   * rejecting for a refusal; a real failure rejects.
   */
  readonly assign: (
    ids: readonly string[],
    target: string | null,
  ) => Promise<SwimlaneAssignOutcome>;
}

export const MOVE_TO_SWIMLANE_LABEL = 'Move to swimlane…';
/** Why the selection bars' Move to swimlane… is shaded while swimlanes are off (ADR-0082, ADR-0204). */
export const SWIMLANES_OFF_MOVE_REASON =
  'Turn on Swimlanes in View to move activities between them.';
/**
 * Why a swimlane is not assigned by hand while the plan's swimlanes come from the WBS (US-4, ADR-0083),
 * and what moves an activity instead: a shaded control that gives no way on is a dead end (ADR-0204).
 */
export const SWIMLANES_FOLLOW_WBS_REASON =
  'Swimlanes follow the WBS in this plan. To move an activity, file it under another summary in Breakdown.';
/**
 * Why the activity editor's Swimlane field is read-only while the swimlanes are made from a code, and
 * where the value is written: the Codes section of the same tab. Lives beside the grids' sentence so the
 * two cannot drift; `features/tsld` imports no feature, so the swimlanes feature imports this.
 */
export const swimlanesFollowCodeEditorReason = (typeName: string): string =>
  `Swimlanes follow ${typeName} in this plan. Change it under Codes on this tab.`;

/**
 * What the Move to swimlane… control says under a code source about a value that is not listed: its
 * choices are the swimlanes drawn, so one nobody uses yet is set with Set code… (owner decision).
 */
export const CODE_MOVE_NOT_LISTED_NOTE = 'Need a swimlane that isn’t listed? Use Set code…';

/**
 * Why a grid's Swimlane cell is read-only while the plan's swimlanes are made from a code, and where the
 * value is written instead (`m4-ui-design.md` §6.2, ADR-0204). Named for the type, because "its code"
 * would not tell a planner with six types which one the swimlanes follow.
 */
export const swimlanesFollowCodeReason = (typeName: string): string =>
  `Swimlanes follow ${typeName} in this plan. Change it with Set code… or the editor’s Codes.`;
/** What a swimlane column's cell reads under the WBS source: the rule, stated once per surface (US-4). */
export const FOLLOWS_WBS_LABEL = 'Follows the WBS';

/**
 * What a grid's Swimlane column is told about the plan's swimlanes (swimlanes M4-T1, M4-T2). The host
 * composes it, so the table and the Gantt learn nothing of how a swimlane is stored or written: with
 * hand-made swimlanes it carries the one assignment the selection bars and the editor also use; with
 * swimlanes that follow the WBS the column is read-only with its reason, and with swimlanes made from a
 * code it names the value (the same assignment, whose choices are the bands) and is read-only too: the
 * cell is a code cell, written by Set code… and the editor's Codes. One type, so the two grids cannot
 * drift apart when a source is added.
 */
export type SwimlaneColumnSource =
  | { source: 'MANUAL'; assignment: SwimlaneAssignment }
  | { source: 'WBS' }
  | { source: 'ACTIVITY_CODE'; assignment: SwimlaneAssignment; typeName: string };
export const MOVE_TO_SWIMLANE_FIELD = 'Move to';
export const MOVE_BUTTON_LABEL = 'Move';

export const NO_SWIMLANE_CHOICE_LABEL = NO_SWIMLANE_LABEL;

/**
 * The plural bar's gate for Move to swimlane…: shaded with the lens's way out while swimlanes are off
 * (a reader can act on that from here), else with the pen's own verdict (ADR-0082, ADR-0204).
 */
export function moveToSwimlaneGate(
  assignment: Pick<SwimlaneAssignment, 'shown'>,
  write: { writable: boolean; reason: string | null },
): { writable: boolean; reason: string | null } {
  if (!assignment.shown) return { writable: false, reason: SWIMLANES_OFF_MOVE_REASON };
  return { writable: write.writable, reason: write.writable ? null : write.reason };
}

const activities = (n: number): string => (n === 1 ? '1 activity' : `${String(n)} activities`);

/** What the live region says once the write has landed. Names the destination, never just a count. */
export function swimlaneAssignedAnnouncement(args: {
  readonly names: readonly string[];
  readonly count: number;
  readonly target: string;
  readonly landed: SwimlaneLaneFacts | undefined;
}): string {
  const { names, count, target, landed } = args;
  if (count === 1 && names[0] !== undefined) {
    // With swimlanes not drawn there is no lane to speak of: the short form names the swimlane only.
    return `Moved “${names[0]}” to ${landed !== undefined ? swimlanePlace(landed) : target}.`;
  }
  return `${activities(count)} moved to ${target}.`;
}

/** What the status line says once a move has landed (and the live region has already said it). */
export const movedStatus = (target: string): string => `Moved to ${target}.`;

/** The prompt before anything is chosen. */
export const choosePrompt = (selected: number): string =>
  selected === 1 ? 'Choose where to move it.' : 'Choose where to move them.';

/** A write that came back refused without saying why (a lost pen, a no-op). */
export const NOT_MOVED_REASON = 'Nothing was moved. Try again.';

/** What a rejected move says when the error carries no message (the control and the Gantt cell share it). */
export const SWIMLANE_MOVE_FAILED = 'Couldn’t move the activities.';

/** The refusal a stale write gets, which only a fresh read cures. */
export const withReload = (conflict: string): string => `${conflict} Reload and try again.`;

/** The status line under the control: what pressing Move will do, in one sentence. */
export function moveToSwimlaneStatus(args: {
  readonly selected: number;
  readonly willMove: number;
  readonly target: string;
}): string {
  const { selected, willMove, target } = args;
  if (willMove === 0) {
    return selected === 1 ? `It is already in ${target}.` : `All of them are already in ${target}.`;
  }
  return `${activities(willMove)} will move to ${target}, keeping their dates. Undo puts ${willMove === 1 ? 'it' : 'them'} back.`;
}
