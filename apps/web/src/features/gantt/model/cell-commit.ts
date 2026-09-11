import type { ActivitySummary, SchedulingMode } from '@repo/types';

import type { GanttCellKey } from './cell-edit';

import { durationWriteFields } from '@/features/activities/model/duration-field';
import { ApiFetchError } from '@/lib/api/client';
import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';
import { parseCalendarDate } from '@/lib/format-date';

/**
 * **Turning a typed cell into the write the workspace already makes.**
 *
 * The cells do **not** own a fetch. They build the same PATCH body the activity editor builds and
 * hand it to the workspace's `useUpdateActivityFields` mutation, so every guarantee that path
 * already has arrives here unchanged and for free: the ADR-0028 pen's 423, the optimistic `version` 409, the
 * ADR-0048 undo record, and the ADR-0032 coalesced recalculation that redraws the chart afterwards.
 *
 * That is spec F5's argument one field along, and it is the reason this file is thirty lines rather
 * than three hundred. A private `fetch` here would be a second write path to the same resource,
 * which is how one surface comes to skip a guard the other enforces — and the guard most likely to
 * be skipped is the pen, because it is the one that only fails when somebody else is working.
 *
 * **`version` is always sent.** A grid is the surface where two people are most likely to be typing
 * at once, so the optimistic check is not optional decoration: without it the last write wins
 * silently, and the planner whose edit vanished has no way to know it happened.
 */

/**
 * What a commit needs from the caller — the mutation, injected, so this is unit-testable.
 *
 * Shaped for **`useUpdateActivityFields`**, the partial PATCH (ADR-0060 §4), not for
 * `useUpdateActivity`. I reached for the latter first because it is the one the workspace already
 * holds; it takes an `ActivityDefinitionInput` and runs it through `updateBody`, i.e. it sends the
 * **whole definition**. Committing one cell through it would post a full definition assembled from
 * whatever the client happened to have — a rename could quietly rewrite a constraint. `…Fields`
 * exists precisely because ADR-0060's per-scope save needed a slice, and a cell is that argument at
 * its smallest.
 */
export type UpdateActivityFieldsFn = (input: {
  activityId: string;
  version: number;
  patch: Record<string, unknown>;
}) => Promise<ActivitySummary>;

/** A refusal, already turned into a sentence a planner can act on. */
export interface CellCommitFailure {
  message: string;
  /** True when the row we hold is stale, so the caller should refetch rather than retry. */
  stale: boolean;
}

export type CellCommitResult =
  { ok: true; activity: ActivitySummary } | { ok: false; failure: CellCommitFailure };

/**
 * What a cell needs to know beyond its own text.
 *
 * The date keys need all three: the mode decides whether a typed `Start` hand-places or pins
 * (ADR-0134 D1/D2), the source decides which of the three persisted date pairs the cell is showing,
 * and the activity carries the span the arithmetic keeps one end of.
 */
export interface CellWriteContext {
  activity: ActivitySummary;
  hoursPerDay: number | undefined;
  schedulingMode: SchedulingMode;
  barDateSource: BarDateSource;
}

/**
 * The PATCH fragment for one cell, or a **named** refusal.
 *
 * It was `Record<string, unknown> | null`, with every refusal collapsing into one sentence at the
 * call site: _"That value is not something this cell accepts."_ That is adequate for a name or a
 * percentage, where the only way to fail is to type nonsense, and it is not adequate for a date:
 * ADR-0134 D4 refuses a perfectly well-formed date on a `MANDATORY_*` activity, and a planner told
 * only that their value was unacceptable would retype the same value.
 *
 * Refusals still travel as values rather than exceptions — "the planner typed nonsense" is a local,
 * recoverable state, and an exception crossing a component boundary would bypass the cell's own
 * error display.
 */
export type CellWrite =
  { ok: true; fields: Record<string, unknown> } | { ok: false; reason: string };

/** The sentence a refusal with nothing more specific to say falls back to. */
const GENERIC_REFUSAL = 'That value is not something this cell accepts.';

const refuse = (reason: string): CellWrite => ({ ok: false, reason });
const write = (fields: Record<string, unknown>): CellWrite => ({ ok: true, fields });

export function cellWriteFields(key: GanttCellKey, text: string, ctx: CellWriteContext): CellWrite {
  const trimmed = text.trim();
  switch (key) {
    case 'name':
      // The API bounds the length; an empty name is the one case worth refusing here, because it is
      // the one a planner reaches by pressing Enter on a cleared cell rather than by typing.
      return trimmed === '' ? refuse('A name cannot be empty.') : write({ name: trimmed });

    // Exactly one of `durationDays` / `durationMinutes` — sending both is a 422 by design
    // (`@IsMutuallyExclusiveWith`), which is why this helper returns a union rather than an object
    // with two optional keys. Reused, not reimplemented: it already carries ADR-0070's rule that
    // `hoursPerDay` is required to mean anything, and degrades to whole days without it.
    //
    // The comment sits ABOVE the `case` rather than trailing it: Prettier reflows a trailing
    // comment on a `case` by folding every following comment line onto it, which produced one
    // 180-character line with the clauses in the wrong order. Correct code, unreadable comment.
    case 'duration': {
      const fields = durationWriteFields(trimmed, ctx.hoursPerDay);
      return fields === null ? refuse(GENERIC_REFUSAL) : write(fields);
    }

    case 'percentComplete': {
      // A progress write (ADR-0060 Q-C) — not pen-gated, and deliberately a different scope from
      // everything else on the row.
      const value = Number(trimmed.replace(/%$/, ''));
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return refuse('Enter a percentage between 0 and 100.');
      }
      return write({ percentComplete: value });
    }

    case 'earlyStart':
    case 'earlyFinish':
      return dateWriteFields(key, trimmed, ctx);
  }
}

/** Calendar days between two `YYYY-MM-DD` days. Positive when `to` is later. */
function calendarDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * **A typed date writes what the equivalent canvas gesture writes** — ADR-0134, and every branch
 * below mirrors `use-plan-workspace-model.ts:1179-1216` rather than inventing a grid semantic.
 *
 * The arithmetic is the canvas's too, read from `TsldPanel.tsx:165-168` rather than recalled:
 * `durationDays = finish − newStart + 1`, **calendar days, inclusive**. It is not a working-day
 * walk, and it cannot be — the client holds no calendar — which is exactly as true of dragging a
 * bar's edge today. The engine re-derives the real span on the next recalculation.
 */
function dateWriteFields(
  key: 'earlyStart' | 'earlyFinish',
  trimmed: string,
  { activity, schedulingMode, barDateSource }: CellWriteContext,
): CellWrite {
  // **The Late overlay is read-only by ADR-0033**, so the dates on screen are not inputs at all —
  // writing from them would take a planner's typed value and apply it to a different pair of
  // columns than the ones they were reading. `cell-gate.ts` should already keep the cell shut;
  // this is the second lock, because "should already" is how #290 shipped.
  if (barDateSource === 'late') {
    return refuse('Late dates are a read-only overlay. Turn it off to edit dates.');
  }

  // **D4 — a `MANDATORY_*` constraint is never overwritten from a cell.** Mandatory constraints
  // break logic by design (ADR-0035 §7, produce-and-flag), so swapping one for an `SNET` changes
  // what the whole downstream chain means. That trade belongs on the activity editor, where the
  // constraint is named and its consequence is on screen — not as the side effect of typing in a
  // grid. Checked before the parse, so the reason a planner gets is about their activity rather
  // than about their typing.
  if (
    activity.constraintType === 'MANDATORY_START' ||
    activity.constraintType === 'MANDATORY_FINISH'
  ) {
    return refuse(
      'This activity has a mandatory constraint. Change it in the activity editor, where its effect on the rest of the plan is shown.',
    );
  }

  const typed = parseCalendarDate(trimmed);
  if (typed === null) {
    return refuse('Enter a date like 05 Mar 2026 or 2026-03-05.');
  }

  const { start, finish } = barDatesFor(activity, barDateSource);
  if (start === null || finish === null) {
    // Before the first recalculation there is no span to hold one end of, so there is no honest
    // duration to write. Stated rather than guessed at: a `durationDays` invented here would be a
    // claim about a schedule that does not exist yet.
    return refuse('This plan has not been calculated yet, so dates cannot be typed in.');
  }

  if (key === 'earlyFinish') {
    // **D3 — a typed `Finish` writes a DURATION, in both modes, and no constraint at all.** This
    // is the branch a reader expects to be `FNLT` and is not. A finish-edge resize "spreads
    // neither field, leaving the stored constraint round-tripped verbatim"; a typed finish does
    // the same, so the two surfaces cannot come to mean different things.
    //
    // Its honest consequence, which ADR-0134 states rather than leaving to be discovered: in Early
    // mode with no constraint the start is computed, so a later recalculation can move the start
    // and carry this finish with it. The typed finish is not a pin — exactly as true of the drag.
    const durationDays = calendarDaysBetween(start, typed) + 1;
    if (durationDays < 1) return refuse('The finish cannot be before the start.');
    return write({ durationDays });
  }

  const durationDays = calendarDaysBetween(typed, finish) + 1;
  if (durationDays < 1) return refuse('The start cannot be after the finish.');

  if (schedulingMode === 'VISUAL') {
    // **D1 — hand-place, and write NO constraint.** A placement is advisory and a constraint is
    // not; the ADR-0033 effective-Visual pass pins the bar afterwards, exactly as it does for a
    // reposition drop.
    return write({ visualStart: typed, durationDays });
  }

  // **D2 — pin it.** In Early mode the start is computed, so the only honest way to move it is an
  // `SNET` at the typed date, with the duration adjusted so the finish stays where it was.
  return write({ constraintType: 'SNET', constraintDate: typed, durationDays });
}

/**
 * Translate a refusal into a sentence, and say whether the row we hold is stale.
 *
 * The three that matter are the three the grid will actually meet. Anything else falls through to
 * the server's own message rather than a generic one — the API writes better errors than a default
 * ever could, and swallowing them is how "something went wrong" reaches a planner.
 */
export function describeCommitFailure(error: unknown): CellCommitFailure {
  if (error instanceof ApiFetchError) {
    if (error.status === 423) {
      return { message: 'Someone else is editing this plan.', stale: false };
    }
    if (error.status === 409) {
      // Stale, so a retry with the version we hold would fail identically. The caller refetches.
      return { message: 'This activity changed while you were typing.', stale: true };
    }
    return { message: error.error.message, stale: false };
  }
  return { message: 'That change could not be saved.', stale: false };
}

/**
 * Commit one cell.
 *
 * Returns a result rather than throwing: the cell-edit model has an `error` state that keeps the
 * planner's text, and an exception would bypass it.
 */
export async function commitCell({
  activity,
  key,
  text,
  hoursPerDay,
  schedulingMode,
  barDateSource,
  update,
}: {
  activity: ActivitySummary;
  key: GanttCellKey;
  text: string;
  hoursPerDay: number | undefined;
  schedulingMode: SchedulingMode;
  barDateSource: BarDateSource;
  update: UpdateActivityFieldsFn;
}): Promise<CellCommitResult> {
  const result = cellWriteFields(key, text, {
    activity,
    hoursPerDay,
    schedulingMode,
    barDateSource,
  });
  // **The refusal's own sentence, not a generic one.** ADR-0134 D4 refuses a perfectly
  // well-formed date on a mandatory-constrained activity; told only that their value was
  // unacceptable, a planner would retype the same value and meet the same wall.
  if (!result.ok) return { ok: false, failure: { message: result.reason, stale: false } };

  try {
    const updated = await update({
      activityId: activity.id,
      version: activity.version,
      patch: result.fields,
    });
    return { ok: true, activity: updated };
  } catch (error) {
    return { ok: false, failure: describeCommitFailure(error) };
  }
}
