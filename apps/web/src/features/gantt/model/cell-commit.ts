import type { ActivitySummary } from '@repo/types';

import type { GanttCellKey } from './cell-edit';

import { durationWriteFields } from '@/features/activities/model/duration-field';
import { ApiFetchError } from '@/lib/api/client';

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
 * The PATCH fragment for one cell, or `null` when the text is not something we should send.
 *
 * Returning `null` rather than throwing keeps "the planner typed nonsense" a local, recoverable
 * state instead of an exception crossing a component boundary — and it is what
 * `durationWriteFields` already does for the same reason.
 */
export function cellWriteFields(
  key: GanttCellKey,
  text: string,
  hoursPerDay: number | undefined,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  switch (key) {
    case 'name':
      // The API bounds the length; an empty name is the one case worth refusing here, because it is
      // the one a planner reaches by pressing Enter on a cleared cell rather than by typing.
      return trimmed === '' ? null : { name: trimmed };

    case 'duration':
      // Exactly one of `durationDays` / `durationMinutes` — sending both is a 422 by design
      // (`@IsMutuallyExclusiveWith`), which is why this helper returns a union rather than an object
      // with two optional keys. Reused, not reimplemented: it already carries ADR-0070's rule that
      // `hoursPerDay` is required to mean anything, and degrades to whole days without it.
      return durationWriteFields(trimmed, hoursPerDay);

    case 'percentComplete': {
      // A progress write (ADR-0060 Q-C) — not pen-gated, and deliberately a different scope from
      // everything else on the row.
      const value = Number(trimmed.replace(/%$/, ''));
      if (!Number.isFinite(value) || value < 0 || value > 100) return null;
      return { percentComplete: value };
    }

    case 'earlyStart':
    case 'earlyFinish':
      // Q2. A typed date writes the CONSTRAINT a drag writes, never a computed column — the engine
      // owns `earlyStart`, and a client that PATCHed it would be asserting an answer rather than an
      // input. Wired in M2-T3b with the constraint note; refused here until then rather than sent
      // somewhere plausible, because a silently-wrong write is worse than a refusal.
      return null;
  }
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
  update,
}: {
  activity: ActivitySummary;
  key: GanttCellKey;
  text: string;
  hoursPerDay: number | undefined;
  update: UpdateActivityFieldsFn;
}): Promise<CellCommitResult> {
  const fields = cellWriteFields(key, text, hoursPerDay);
  if (fields === null) {
    return {
      ok: false,
      failure: { message: 'That value is not something this cell accepts.', stale: false },
    };
  }

  try {
    const updated = await update({
      activityId: activity.id,
      version: activity.version,
      patch: fields,
    });
    return { ok: true, activity: updated };
  } catch (error) {
    return { ok: false, failure: describeCommitFailure(error) };
  }
}
