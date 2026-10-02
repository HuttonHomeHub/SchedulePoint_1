import type { ActivitySummary } from '@repo/types';

import { startEdgeFrozenReason } from './bar-drag';
import type { GanttCellKey } from './cell-edit';

import { durationWriteFields } from '@/features/activities/model/duration-field';
import { spanToPlacement } from '@/features/gantt/layout/drag-day';
import { addCalendarDays, daysBetween } from '@/features/tsld/render/working-time';
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
  barDateSource: BarDateSource;
  /** The plan's `plannedStart` — the origin the working-day predicate is keyed to. */
  plannedStartIso: string | null;
  /**
   * Whether a day offset from `plannedStartIso` is worked, on the plan calendar. Null while the
   * calendar has not loaded, which falls back to the calendar span (ADR-0170 D2).
   */
  isWorkingDay: ((dayOffset: number) => boolean) | null;
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

/**
 * **A typed date writes what the equivalent canvas gesture writes** — ADR-0134, and every branch
 * below mirrors `use-plan-workspace-model.ts:1179-1216` rather than inventing a grid semantic.
 *
 * The arithmetic is the diagram's too: the drawn span is converted with `drawnSpanPlacement` on the
 * plan's working-day predicate (`spanToPlacement`, ADR-0170 D2), because `durationDays` is a
 * WORKING-day field. This docblock said "calendar days … the client holds no calendar" until
 * ADR-0170, which was false from the day the diagram's weekend fix shipped, and a five-day task
 * finished over a weekend came back two days off the date typed. A typed start is rolled forward
 * to a working day, as the diagram's resize does; with no calendar loaded the calendar span is
 * written, for that window only.
 */
function dateWriteFields(
  key: 'earlyStart' | 'earlyFinish',
  trimmed: string,
  { activity, barDateSource, plannedStartIso, isWorkingDay }: CellWriteContext,
): CellWrite {
  // **The Late overlay is read-only by ADR-0033**, so the dates on screen are not inputs at all —
  // writing from them would take a planner's typed value and apply it to a different pair of
  // columns than the ones they were reading. `cell-gate.ts` should already keep the cell shut;
  // this is the second lock, because "should already" is how #290 shipped.
  if (barDateSource === 'late') {
    return refuse('Late dates are a read-only overlay. Turn it off to edit dates.');
  }

  // **A started or finished activity has no start to move** (ADR-0170 D3): the engine draws it from
  // its actual and ignores a hand-placed start, so the write would save an inert placement,
  // change the duration and move the FINISH. The handle is withheld for the same reason, from the
  // same function, so the cell and the bar cannot disagree about it.
  if (key === 'earlyStart' && Boolean(activity.actualStart ?? activity.actualFinish)) {
    return refuse(startEdgeFrozenReason());
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

  // Days count from `plannedStart`, the origin the predicate is keyed to. With no predicate the
  // origin is irrelevant (a calendar span), so the span's own start serves.
  const workingDays = plannedStartIso !== null ? isWorkingDay : null;
  const placementFor = (
    startIso: string,
    finishIso: string,
  ): { startIso: string; durationDays: number } => {
    const origin = plannedStartIso !== null && workingDays !== null ? plannedStartIso : startIso;
    const placement = spanToPlacement({
      startDay: daysBetween(origin, startIso),
      endDay: daysBetween(origin, finishIso),
      isWorkingDay: workingDays,
    });
    return {
      startIso: addCalendarDays(origin, placement.startDay),
      durationDays: placement.durationDays,
    };
  };

  if (key === 'earlyFinish') {
    // **D3 — a typed `Finish` writes a DURATION and no constraint at all.** This
    // is the branch a reader expects to be `FNLT` and is not. A finish-edge resize "spreads
    // neither field, leaving the stored constraint round-tripped verbatim"; a typed finish does
    // the same, so the two surfaces cannot come to mean different things.
    //
    // Its honest consequence, which ADR-0134 states rather than leaving to be discovered: with no
    // constraint and no placement the start is computed, so a later recalculation can move it and
    // carry this finish with it. The typed finish is not a pin — exactly as true of the drag.
    if (daysBetween(start, typed) < 0) return refuse('The finish cannot be before the start.');
    const { durationDays } = placementFor(start, typed);
    return write({ durationDays });
  }

  if (daysBetween(typed, finish) < 0) return refuse('The start cannot be after the finish.');
  const placed = placementFor(typed, finish);

  /**
   * **D1 — hand-place, and write NO constraint.** A placement is advisory and a constraint is not;
   * the effective-Visual pass pins the bar afterwards, exactly as it does for a reposition drop.
   *
   * **ADR-0134 D2's `SNET` branch is deleted with the mode** (M-F-T3/T6). It existed because in
   * Early mode a start is computed, so pinning was the only honest way to move it — and the
   * pinning overwrote whatever constraint the row carried, which is the same write the drag has
   * stopped making one file over. A typed start and a dragged start now mean one thing, which is
   * what ADR-0134 D1 asked of them in the first place: "a typed date writes the constraint a drag
   * writes."
   */
  return write({ visualStart: placed.startIso, durationDays: placed.durationDays });
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
  barDateSource,
  plannedStartIso,
  isWorkingDay,
  update,
}: {
  activity: ActivitySummary;
  key: GanttCellKey;
  text: string;
  hoursPerDay: number | undefined;
  barDateSource: BarDateSource;
  plannedStartIso: string | null;
  isWorkingDay: ((dayOffset: number) => boolean) | null;
  update: UpdateActivityFieldsFn;
}): Promise<CellCommitResult> {
  const result = cellWriteFields(key, text, {
    activity,
    hoursPerDay,
    barDateSource,
    plannedStartIso,
    isWorkingDay,
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
