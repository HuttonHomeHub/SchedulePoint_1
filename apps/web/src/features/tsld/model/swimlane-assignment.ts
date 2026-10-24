import { swimlanePlace, type SwimlaneLaneFacts } from './reposition-announcement';
import { NO_SWIMLANE_LABEL } from './swimlane-lanes';

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
   * Whether the diagram is drawing swimlanes. The selection bars offer the move only then (a move
   * the planner cannot see land is the editor's to offer, with a hint saying so), and the sentence
   * leaves out the lane clause when they are not drawn.
   */
  readonly shown: boolean;
  /** The plan's swimlanes in their order, then "No swimlane". */
  readonly choices: readonly SwimlaneChoice[];
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
export const MOVE_TO_SWIMLANE_FIELD = 'Move to';
export const MOVE_BUTTON_LABEL = 'Move';

export const NO_SWIMLANE_CHOICE_LABEL = NO_SWIMLANE_LABEL;

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
