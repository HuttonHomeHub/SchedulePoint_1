import type { LevellingApplication, LevellingApplicationItem } from '@repo/types';

import type { ActivityPlacement } from '@/features/undo-redo';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * **Apply levelled dates — what the client derives from the preview** (`docs/specs/apply-levelled-dates/`
 * T2.2, T2.3). Pure, so the dialog's copy and the undo step's rows are checked without mounting a
 * dialog or a workspace.
 *
 * Nothing here decides which bars move. The server did that with the engine as the oracle (spec §4.6)
 * and the client's only job is to send `rows` unchanged and to describe them truthfully.
 */

/** The batch route's cap (`@ArrayMaxSize(2000)`, `update-placements.dto.ts`); one step cannot exceed it. */
export const APPLY_LEVELLING_LIMIT = 2000;

/**
 * The sentence shown instead of the list when the preview is over {@link APPLY_LEVELLING_LIMIT}.
 * It states the real count against the limit and says nothing was written; no way forward is named
 * because the product has none (there is no way to level part of a plan).
 */
export function applyLevellingTooMany(count: number): string {
  return `Nothing was changed. Levelling would move ${count.toLocaleString()} activities, and one step can apply at most ${APPLY_LEVELLING_LIMIT.toLocaleString()}.`;
}

/**
 * The stale-version sentence for this write. The batch is all-or-nothing, so "nothing was moved" is
 * a fact and not a hedge, and the dialog offers a fresh preview beside it.
 */
export const APPLY_LEVELLING_CONFLICT =
  'This plan changed since you opened it — nothing was moved. Check the list again before you apply.';

/** The undo step's label (`docs/specs/apply-levelled-dates/` US-1). */
export function applyLevellingLabel(count: number): string {
  return `Apply levelled dates (${String(count)} ${count === 1 ? 'activity' : 'activities'})`;
}

/** The announcement owed once the write has landed — an event, so it is said once (ADR-0132). */
export function applyLevellingAnnouncement(count: number): string {
  return count === 1
    ? 'Moved 1 activity to its levelled date.'
    : `Moved ${String(count)} activities to their levelled dates.`;
}

/** Counts and agrees a noun: `plural(2, 'activity', 'activities')` is "2 activities". */
export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function pick(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** The section that names the bars which follow their links, and the read-out line beside it. */
export const FOLLOWING_SECTION_TITLE = 'Will move with their links';
export const FOLLOWING_SECTION_DESCRIPTION =
  'These have no date of their own, so nothing is saved for them. They move with their links once the bars above are applied.';

/**
 * One wording source for the follower sentence, so the read-out line and the section's own copy
 * cannot drift: "1 other activity will move with the work before it; no date is set for it."
 */
export function followingLinksText(count: number): string {
  return `${plural(count, 'other activity', 'other activities')} will move with the work before ${pick(count, 'it', 'them')}; no ${pick(count, 'date is', 'dates are')} set for ${pick(count, 'it', 'them')}.`;
}

/**
 * Why a bar moves, as words: the reason is the one thing that tells a planner whether the move is the
 * resource's doing or a consequence of an earlier move, so it is a column of text and not a colour or
 * an icon (WCAG 1.4.1).
 */
export function levellingReasonText(reason: LevellingApplicationItem['reason']): string {
  return reason === 'RESOURCE' ? 'A resource delays it' : 'The work before it moved';
}

/**
 * The before, after and version map one apply needs for its undo step — the shape
 * `bulkPlacementCommand` takes.
 *
 * `before` is built from the preview's `items`, **not from the activities cache**: the cache can move
 * between the preview and the write, and the prior placement the planner must get back is the one the
 * preview described, **including null** for a bar that was never hand-placed. The constraint is
 * carried as stored on the row, unchanged in both directions (CQ-1: applying writes `visualStart`
 * and nothing else). `laneIndex` is null in both, which the batch writes as "leave the lane alone".
 *
 * Throws when a row has no item, because guessing a prior placement would restore the wrong one.
 */
export function levellingApplicationSnapshots(application: LevellingApplication): {
  before: ActivityPlacement[];
  after: ActivityPlacement[];
  versions: Map<string, number>;
} {
  const itemsById = new Map(application.items.map((item) => [item.id, item] as const));
  const before: ActivityPlacement[] = [];
  const after: ActivityPlacement[] = [];
  const versions = new Map<string, number>();
  for (const row of application.rows) {
    const item = itemsById.get(row.id);
    if (item === undefined) {
      throw new Error(`The levelling preview has a row for ${row.id} and no description of it.`);
    }
    before.push({
      id: row.id,
      constraintType: row.constraintType,
      constraintDate: row.constraintDate,
      visualStart: item.beforeVisualStart,
      laneIndex: null,
    });
    after.push({
      id: row.id,
      constraintType: row.constraintType,
      constraintDate: row.constraintDate,
      visualStart: row.visualStart,
      laneIndex: null,
    });
    versions.set(row.id, row.version);
  }
  return { before, after, versions };
}

export type ApplyLevellingLineKey =
  'finish' | 'following' | 'remaining' | 'moves' | 'hand-placed' | 'next-day' | 'later-than-bound';

/** One sentence of the dialog's read-out, with the preview field that drives it. */
export interface ApplyLevellingLine {
  /** Stable, for the tests and the journey to find the sentence without matching prose. */
  readonly key: ApplyLevellingLineKey;
  readonly text: string;
}

/**
 * The consequences the dialog states before it asks, **one preview field per sentence** so a line
 * cannot say more than the response does. The plan finish and what remains come first because they
 * are the answer to "what does this do to my plan"; the one the plan flags as the risk is
 * `remaining`: "nothing left to move" is only said when `remainingAfterApply` is 0.
 *
 * The bars that follow their links get a sentence as well as a section: they are not in the count
 * above, so without it the total would read as the whole of what changes.
 *
 * The bars left to their links and the hand-placed bars in conflict are not sentences here: each has
 * a section of its own whose header and count say the same thing, and a second wording drifts.
 *
 * Empty for a preview with nothing to write — the dialog has its own "nothing to apply" state and
 * says it once.
 */
export function applyLevellingLines(application: LevellingApplication): ApplyLevellingLine[] {
  const lines: ApplyLevellingLine[] = [];
  const moving = application.items;
  if (moving.length === 0) return lines;

  const { projectFinishBefore: before, projectFinishAfter: after } = application;
  if (before !== null && after !== null) {
    lines.push({
      key: 'finish',
      text:
        before === after
          ? `The plan finish stays ${formatCalendarDate(after)}.`
          : `The plan finish moves from ${formatCalendarDate(before)} to ${formatCalendarDate(after)}.`,
    });
  }

  const remaining = application.remainingAfterApply;
  lines.push({
    key: 'remaining',
    text:
      remaining === 0
        ? 'Resource levelling will have nothing left to move.'
        : `${plural(remaining, 'activity', 'activities')} will still need the same resource at the same time. You can apply again to sort ${pick(remaining, 'it', 'them')} out.`,
  });

  lines.push({
    key: 'moves',
    text: `${plural(moving.length, 'activity', 'activities')} will move to ${pick(moving.length, 'its', 'their')} levelled ${pick(moving.length, 'date', 'dates')}.`,
  });

  // The two counts add up to the one above, so the section headers below read as its parts.
  const placed = moving.filter((item) => item.wasPlaced).length;
  if (placed > 0) {
    const own = moving.length - placed;
    lines.push({
      key: 'hand-placed',
      text:
        own === 0
          ? `${placed === 1 ? 'It was' : `All ${String(placed)} were`} placed by hand.`
          : `${own === 1 ? '1 moves on its own' : `${String(own)} move on their own`} and ${placed === 1 ? '1 was' : `${String(placed)} were`} placed by hand.`,
    });
  }

  const rounded = moving.filter((item) => item.roundedToNextDay).length;
  if (rounded > 0) {
    lines.push({
      key: 'next-day',
      text: `${rounded === 1 ? '1 of them starts' : `${String(rounded)} of them start`} on the next working day, because the resource is only free part-way through a day.`,
    });
  }

  // Straight after the moves it is counted beside: these bars are not in that count, so the line reads
  // as what else changes. Before the deadline warning, matching the spoken order (moves, then this).
  const following = application.followingLinks.length;
  if (following > 0) {
    lines.push({ key: 'following', text: followingLinksText(following) });
  }

  const bound = application.laterThanBoundIntroduced;
  if (bound > 0) {
    lines.push({
      key: 'later-than-bound',
      text: `${plural(bound, 'activity', 'activities')} will finish after a deadline ${pick(bound, 'it currently meets', 'they currently meet')}.`,
    });
  }

  return lines;
}

/**
 * What a screen reader is told once the preview settles: what moves, then the two things a planner
 * decides on. One sentence per line, so it cannot say more than the list does.
 */
export function applyLevellingSummary(lines: ApplyLevellingLine[]): string {
  const order: ApplyLevellingLineKey[] = ['moves', 'following', 'finish', 'remaining'];
  return order
    .flatMap((key) => lines.filter((line) => line.key === key).map((line) => line.text))
    .join(' ');
}
