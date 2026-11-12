import type { ActivitySummary } from '@repo/types';

import { matchingConflictFlags } from '@/features/tsld/render/conflicts';
import type { ActivityPlacement } from '@/features/undo-redo';

/**
 * **The pure half of the follow-logic offer** (placed-bar-follows-link M2, ADR-0216). What the
 * edit changed, which bars it newly left behind, the batch rows that let them follow, and the
 * sentences. Pure so each is asserted without mounting a workspace; `use-follow-logic-offer.ts`
 * decides WHEN and holds the state.
 */

/** What an activity looked like before the edit: whether it was flagged, and where it was placed. */
export interface FollowSnapshotEntry {
  readonly flagged: boolean;
  readonly visualStart: string | null;
}

export type FollowSnapshot = ReadonlyMap<string, FollowSnapshotEntry>;

type FlagRow = Pick<
  ActivitySummary,
  'constraintViolated' | 'visualConflictReason' | 'levelingWindowExceeded'
>;

/**
 * Whether the engine says this bar is placed before its logic allows. Read through
 * `matchingConflictFlags`, the one derivation the count chip, the caption and the remedy all share
 * (ADR-0094 D2), so the offer and the count cannot disagree about which bars are in the state.
 */
export function isPlacedBeforeLogic(row: FlagRow): boolean {
  return matchingConflictFlags(row).some((flag) => flag.key === 'visualEarlierThanLogic');
}

type SnapshotRow = FlagRow & Pick<ActivitySummary, 'id' | 'visualStart'>;

export function followSnapshotOf(rows: readonly SnapshotRow[]): FollowSnapshot {
  return new Map(
    rows.map((row) => [
      row.id,
      { flagged: isPlacedBeforeLogic(row), visualStart: row.visualStart },
    ]),
  );
}

type DiffRow = SnapshotRow & Pick<ActivitySummary, 'type' | 'actualStart'>;

/**
 * Whether Follow logic may be offered for this bar at all: placed, not a summary and not started.
 * One predicate for both offers, so the edit offer and the whole-plan offer cannot disagree about a
 * bar. The reasons are `strandedBy`'s: the batch route refuses a summary, and actuals freeze a
 * started bar, so clearing its placement would clear the flag and move nothing.
 */
function canFollowLogic(row: Pick<DiffRow, 'type' | 'visualStart' | 'actualStart'>): boolean {
  return row.type !== 'WBS_SUMMARY' && row.visualStart !== null && row.actualStart === null;
}

/**
 * The activities an edit **newly** left before their logic, in the order of `after`.
 *
 * A bar qualifies only when it is placed, is flagged now and was not before, is not a summary (the
 * batch route refuses one, and a summary carries no logic to strand it), and holds the placement it
 * held before the edit. That last term is what keeps a bar the planner dragged, nudged, typed a date
 * for, created by a drop or levelled out of the offer: the edit wrote its placement, so it is
 * where they put it. A bar that did not exist before the edit is excluded for the same reason.
 *
 * **A started activity is never offered.** Actuals freeze its bar and what it passes on, so Follow
 * logic would clear the flag and move nothing, and "stays where you placed it" would not be true of a
 * bar that is where it is because work began. The count chip still counts it and the selection bar's
 * own Follow logic still clears it (M0 C6; the one way to meet it is to place a bar and then report progress).
 *
 * "Worsened" is deliberately not a term: the client has no measure of the logic bound (spec §1, item 3).
 */
export function strandedBy(before: FollowSnapshot, after: readonly DiffRow[]): string[] {
  const stranded: string[] = [];
  for (const row of after) {
    if (!canFollowLogic(row) || !isPlacedBeforeLogic(row)) continue;
    const was = before.get(row.id);
    if (was === undefined || was.flagged || was.visualStart !== row.visualStart) continue;
    stranded.push(row.id);
  }
  return stranded;
}

/**
 * **Every bar the whole-plan offer would let follow** (ADR-0216 D6): placed, flagged
 * `EARLIER_THAN_LOGIC` now, not a summary, not started, in the order of `rows`. This is the standing
 * condition, so unlike `strandedBy` it has no "before".
 *
 * **It can read below the conflict chip's count, and that is deliberate.** The chip counts every
 * flagged bar, including a summary placed before the data date (which the batch route refuses) and a
 * started bar (which Follow logic could not move); the offer promises a move, so it counts only what
 * it can deliver (spec edge cases; `m0-measurement.md` C7).
 */
export function placedBeforeLogicIn<T extends DiffRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => canFollowLogic(row) && isPlacedBeforeLogic(row));
}

/** The batch route's cap on rows (`update-placements.dto.ts`); a larger set is never chunked, because a series is not atomic. */
export const FOLLOW_PLAN_LIMIT = 2000;

/** The whole-plan offer's sentence: a standing condition, so it counts and does not name. */
export function followPlanSentence(count: number): string {
  return count === 1
    ? '1 bar stays where it was placed, before its logic allows.'
    : `${String(count)} bars stay where they were placed, before their logic allows.`;
}

/** Why Follow logic is shaded when more bars qualify than one write may carry (printed, ADR-0204). */
export function followPlanOverLimitReason(count: number): string {
  return `Too many to follow at once (${count.toLocaleString()}; the limit is ${FOLLOW_PLAN_LIMIT.toLocaleString()}). Follow logic still works on each bar.`;
}

type PlacementRow = Pick<
  ActivitySummary,
  'id' | 'version' | 'constraintType' | 'constraintDate' | 'visualStart'
>;

/**
 * The batch rows that let bars follow their logic: `visualStart` cleared and **nothing else**.
 *
 * Every row states the activity's whole placement (the route's complete-row rule), so the constraint
 * goes back **as stored**: omitting it is a 400, and nulling it would silently delete a commitment
 * (the ADR-0148 context defect). `laneIndex: null` is the route's "leave the lane alone".
 * `before` is the placement the undo step restores, from the same rows, so both directions carry
 * the constraint unchanged.
 */
export function followLogicRows(rows: readonly PlacementRow[]): {
  placements: (ActivityPlacement & { version: number })[];
  before: ActivityPlacement[];
  after: ActivityPlacement[];
} {
  const placementOf = (row: PlacementRow, visualStart: string | null): ActivityPlacement => ({
    id: row.id,
    constraintType: row.constraintType,
    constraintDate: row.constraintDate,
    visualStart,
    laneIndex: null,
  });
  return {
    placements: rows.map((row) => ({ ...placementOf(row, null), version: row.version })),
    before: rows.map((row) => placementOf(row, row.visualStart)),
    after: rows.map((row) => placementOf(row, null)),
  };
}

const quote = (name: string): string => `“${name}”`;

/** `“Pour slab”`, `“Pour slab” and 1 other`, `“Pour slab” and 2 others`. */
function subjectOf(subject: string, count: number): string {
  if (count <= 1) return quote(subject);
  const others = count - 1;
  return `${quote(subject)} and ${String(others)} ${others === 1 ? 'other' : 'others'}`;
}

/**
 * The edit offer's sentence — the one the strip shows and the workspace announces, from one source.
 * It names the stranded bars and says "logic", the existing word (ADR-0186 D2), never the link:
 * the bound that binds may be another link, a constraint or the data date (spec §1, item 2).
 */
export function followEditSentence(subject: string, count: number): string {
  return count <= 1
    ? `${quote(subject)} stays where you placed it, before its logic allows.`
    : `${subjectOf(subject, count)} stay where you placed them, before their logic allows.`;
}

/** What is announced once the bars have been let go (the `clearVisualPlacement` wording, pluralised). */
export function followLogicDoneSentence(subject: string, count: number): string {
  return count <= 1
    ? `${quote(subject)} now follows its logic; dates will update.`
    : `${subjectOf(subject, count)} now follow their logic; dates will update.`;
}

/** The sentence while the write and the recalculation that follows are in flight. */
export function followMovingSentence(subject: string, count: number): string {
  return count <= 1 ? `Moving ${quote(subject)}…` : `Moving ${subjectOf(subject, count)}…`;
}

/** What is announced when the planner keeps the bars where they are: the offer must not end in silence. */
export function followKeptSentence(subject: string, count: number): string {
  return count <= 1
    ? `Kept ${quote(subject)} where you placed it; it stays flagged.`
    : `Kept ${subjectOf(subject, count)} where you placed them; they stay flagged.`;
}

/** Any failure that is not a stale version or a lost pen: visible in the strip, with Try again. */
export function followFailedSentence(subject: string, count: number): string {
  return count <= 1
    ? `Couldn’t move ${quote(subject)} just now. Nothing was changed.`
    : `Couldn’t move ${subjectOf(subject, count)} just now. Nothing was changed.`;
}

/** What the two choices do, for a screen reader (the strip's visible copy is the spec's, verbatim). */
export const FOLLOW_LOGIC_DESCRIPTION =
  'Removes the hand placement, so the bar moves to where its logic puts it and follows it from then on.';
/**
 * What the whole-plan Follow logic does, for a screen reader. The last sentence is always said: the
 * count the strip shows leaves summaries and started bars out, so it can read below the conflict
 * chip's, and a reader who hears the two numbers should hear why.
 */
export const FOLLOW_PLAN_DESCRIPTION =
  'Removes the hand placement from every bar counted here, so each moves to where its logic puts it and follows it from then on. Summaries and started bars are not moved.';
/** What Dismiss does, for a screen reader: it is per bar and per session, so the bars stay flagged and a new one asks again. */
export const DISMISS_PLAN_DESCRIPTION =
  'Hides this offer for these bars for this session. The bars stay flagged.';

/** How long a strip waits for the recalculation after a successful write before it reports done (both offers). */
export const MOVING_CEILING_MS = 8000;
export const KEEP_IT_HERE_DESCRIPTION =
  'Leaves the bar where you placed it. It stays flagged as placed before its logic allows.';

/** The undo step's label. */
export function followLogicLabel(count: number): string {
  return count === 1 ? 'Follow logic' : `Follow logic for ${String(count)} activities`;
}

/** A stale version: the whole batch was refused, so "nothing was changed" is a fact and not a hedge. */
export const FOLLOW_LOGIC_CONFLICT =
  'Couldn’t follow logic: this plan changed since you opened it. Nothing was changed.';
