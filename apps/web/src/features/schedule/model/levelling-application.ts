import type { LevellingApplication } from '@repo/types';

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

/** The sentence shown instead of the list when the preview is over {@link APPLY_LEVELLING_LIMIT}. */
export const APPLY_LEVELLING_TOO_MANY = `More than ${APPLY_LEVELLING_LIMIT.toLocaleString('en-GB')} activities would move; the limit for one step is ${APPLY_LEVELLING_LIMIT.toLocaleString('en-GB')}.`;

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

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function pick(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
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

/** One sentence of the dialog's read-out, with the preview field that drives it. */
export interface ApplyLevellingLine {
  /** Stable, for the tests and the journey to find the sentence without matching prose. */
  readonly key: string;
  readonly text: string;
}

/**
 * The consequences the dialog states before it asks, **one preview field per sentence** so a line
 * cannot say more than the response does. The one the plan flags as the risk is the last: "no clashes
 * left" is only said when `remainingAfterApply` is 0.
 *
 * Empty for a preview with nothing to write — the dialog has its own "nothing to apply" state and
 * says it once.
 */
export function applyLevellingLines(application: LevellingApplication): ApplyLevellingLine[] {
  const lines: ApplyLevellingLine[] = [];
  const moving = application.items;
  if (moving.length === 0) return lines;

  lines.push({
    key: 'moves',
    text: `${plural(moving.length, 'activity', 'activities')} will move to ${pick(moving.length, 'its', 'their')} levelled ${pick(moving.length, 'date', 'dates')}.`,
  });

  const placed = moving.filter((item) => item.wasPlaced).length;
  if (placed > 0) {
    lines.push({
      key: 'hand-placed',
      text: `${placed === 1 ? '1 of them was' : `${String(placed)} of them were`} placed by hand. ${pick(placed, 'Its placement is', 'Their placements are')} replaced, and Undo puts ${pick(placed, 'it', 'them')} back.`,
    });
  }

  const rounded = moving.filter((item) => item.roundedToNextDay).length;
  if (rounded > 0) {
    lines.push({
      key: 'next-day',
      text: `${rounded === 1 ? '1 of them starts' : `${String(rounded)} of them start`} on the next working day, because the resource frees up part-way through a day and a bar can only start at the beginning of one.`,
    });
  }

  const logic = application.leftToLogic.length;
  if (logic > 0) {
    lines.push({
      key: 'left-to-logic',
      text: `${plural(logic, 'activity', 'activities')} ${pick(logic, 'is', 'are')} left where ${pick(logic, 'its', 'their')} links put ${pick(logic, 'it', 'them')}, because levelling would start ${pick(logic, 'it', 'them')} before ${pick(logic, 'its', 'their')} links allow.`,
    });
  }

  const conflicting = application.conflictingPlaced.length;
  if (conflicting > 0) {
    lines.push({
      key: 'conflicting-placed',
      text: `${plural(conflicting, 'hand-placed activity', 'hand-placed activities')} will start earlier than ${pick(conflicting, 'its', 'their')} links allow once the others move.`,
    });
  }

  const bound = application.laterThanBoundIntroduced;
  if (bound > 0) {
    lines.push({
      key: 'later-than-bound',
      text: `${plural(bound, 'activity', 'activities')} will end up past a date limit ${pick(bound, 'it', 'they')} met before.`,
    });
  }

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

  lines.push({
    key: 'remaining',
    text:
      application.remainingAfterApply === 0
        ? 'Resource levelling will have nothing left to move.'
        : `${plural(application.remainingAfterApply, 'activity', 'activities')} will still clash. You can apply again.`,
  });

  return lines;
}
