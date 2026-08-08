import type { ActivitySummary } from '@repo/types';

import { freeCopyName } from './clone-naming';

/**
 * What a copy carries, and what it does not (`docs/specs/activity-copy-paste/` §2, M0-T3).
 *
 * The rule, stated once so every row below follows from it: **a copy is the same _work_, not the
 * same _history_ and not the same _commitments_.**
 *
 * **{@link CLONE_FIELD_DECISIONS} is the census, and it is compiler-enforced.** It is typed
 * `Record<keyof ActivitySummary, …>`, so a field added to `ActivitySummary` later **fails the
 * build** until somebody decides what a copy does with it. That is the whole point of this module
 * existing separately: the failure this guards against is silent — a copy that quietly drops a
 * definition field looks correct on every screen, and the planner finds out weeks later when the
 * clone schedules differently from the thing it was copied from.
 *
 * {@link projectClone} is written **from** the census rather than beside it, so the table and the
 * code cannot disagree.
 */

/** What happens to one field when an activity is copied. */
export type CloneDisposition =
  /** Sent to `POST …/activities` unchanged. */
  | 'carried'
  /** Sent, but computed by the paste rather than read from the source. */
  | 'transformed'
  /** Not sent. Either the create DTO refuses it, or copying it would be a falsehood. */
  | 'withheld';

export interface CloneFieldDecision {
  readonly disposition: CloneDisposition;
  /** Why. Read by nobody at runtime; read by everybody who wonders in six months. */
  readonly reason: string;
}

/**
 * Every field of {@link ActivitySummary}, classified. **Adding a field to that type breaks this
 * object**, which is the gate.
 */
export const CLONE_FIELD_DECISIONS: Record<keyof ActivitySummary, CloneFieldDecision> = {
  // ---- Identity -----------------------------------------------------------------------------
  id: { disposition: 'withheld', reason: 'The server mints the clone its own id.' },
  planId: { disposition: 'withheld', reason: 'Implied by the route; a copy is same-plan in v1.' },
  version: {
    disposition: 'withheld',
    reason: 'Optimistic-lock counter; a newly created row starts at version 1.',
  },
  createdAt: { disposition: 'withheld', reason: 'Server-stamped when the clone is created.' },
  updatedAt: { disposition: 'withheld', reason: 'Server-stamped when the clone is created.' },

  // ---- What the work IS ---------------------------------------------------------------------
  name: {
    disposition: 'transformed',
    reason:
      'Unique per plan (uq_activities_plan_name); reusing it is a 409 whose message names nothing. ' +
      'The copy-name rule is a correctness requirement, not a preference.',
  },
  code: {
    disposition: 'withheld',
    reason:
      'Also unique per plan. A suffixed code (A1010-2) corrupts a real numbering scheme; a blank ' +
      'code is honestly absent and is set once by the planner.',
  },
  description: {
    disposition: 'carried',
    reason: 'Part of what this work is, not of what happened.',
  },
  type: { disposition: 'carried', reason: 'Part of what this work is, not of what happened.' },
  durationType: {
    disposition: 'carried',
    reason: 'Part of what this work is, not of what happened.',
  },
  accrualType: {
    disposition: 'carried',
    reason: 'Part of what this work is, not of what happened.',
  },
  percentCompleteType: {
    disposition: 'carried',
    reason: 'Which kind of percent this activity is measured by — a definition, not a value.',
  },
  scheduleAsLateAsPossible: {
    disposition: 'carried',
    reason: 'Part of what this work is, not of what happened.',
  },
  levelingPriority: {
    disposition: 'carried',
    reason: 'Part of what this work is, not of what happened.',
  },
  durationMinutes: {
    disposition: 'carried',
    reason:
      'MINUTES, never days: a durationDays round-trip flattens a four-hour activity to zero ' +
      '(ADR-0070 §5; `commands.ts` makes the same point about the resize inverse).',
  },
  durationDays: {
    disposition: 'withheld',
    reason:
      'Derived from durationMinutes and the calendar hours-per-day (ADR-0068). Sending both would ' +
      'let a rounded value win over the exact one.',
  },
  calendarId: {
    disposition: 'carried',
    reason:
      'The calendar is part of how the work is measured. An ARCHIVED calendar makes the create ' +
      '422 (ADR-0053 §4), which the caller pre-checks and refuses by name — never substitutes.',
  },
  budgetedExpense: {
    disposition: 'carried',
    reason:
      'Same work, same budget. Safe ONLY because cost:read and activity:create are the same role ' +
      'set today; a structural test pins that, so the day it changes the build fails rather than ' +
      'the budget silently vanishing.',
  },

  // ---- Placement — decided by the paste, not read from the source ----------------------------
  laneIndex: {
    disposition: 'transformed',
    reason: 'Layout, not definition. The paste places the clone below everything.',
  },
  parentId: {
    disposition: 'transformed',
    reason:
      'Remapped when the parent is in the copied set, carried verbatim when it is not — so a leaf ' +
      'duplicate stays in its band and a band duplicate’s members join the CLONED band.',
  },
  constraintType: {
    disposition: 'transformed',
    reason: 'Carried, with its date shifted by the paste offset.',
  },
  constraintDate: {
    disposition: 'transformed',
    reason: 'Shifted by the paste offset, so a fragnet pasted four weeks later carries its SNET.',
  },
  secondaryConstraintType: {
    disposition: 'transformed',
    reason: 'As the primary constraint — carried, with its date shifted by the paste offset.',
  },
  secondaryConstraintDate: {
    disposition: 'transformed',
    reason: 'As the primary constraint — shifted by the paste offset.',
  },
  visualStart: {
    disposition: 'transformed',
    reason: 'In VISUAL mode the placement IS the decision the paste is making (ADR-0033).',
  },

  // ---- History — a copy never claims it ------------------------------------------------------
  status: {
    disposition: 'withheld',
    reason: 'History — and the create DTO accepts none of it, so this is structural.',
  },
  percentComplete: {
    disposition: 'withheld',
    reason:
      'History — and it would MOVE the clone’s dates through the data-date floor and corrupt ' +
      'Earned Value.',
  },
  actualStart: {
    disposition: 'withheld',
    reason: 'An actual — it happened to the source, not this.',
  },
  actualFinish: {
    disposition: 'withheld',
    reason: 'An actual — it happened to the source, not this.',
  },
  actualExpense: {
    disposition: 'withheld',
    reason: 'An actual — money spent on the source, not on this.',
  },
  remainingDurationDays: {
    disposition: 'withheld',
    reason: 'A progress value, and a derived one.',
  },
  remainingDurationMinutes: {
    disposition: 'withheld',
    reason: 'A progress value; the clone has its whole duration remaining.',
  },
  suspendDate: { disposition: 'withheld', reason: 'A record of what happened to THAT instance.' },
  resumeDate: { disposition: 'withheld', reason: 'A record of what happened to THAT instance.' },
  physicalPercentComplete: {
    disposition: 'withheld',
    reason: 'A progress value — physical percent earned on the source.',
  },
  expectedFinish: {
    disposition: 'withheld',
    reason:
      'A target for THIS instance’s remaining work (ADR-0035 §9) — meaningless on work not yet ' +
      'started, and it would move the clone’s dates.',
  },

  // ---- Commitments the copy is not party to --------------------------------------------------
  externalEarlyStart: {
    disposition: 'withheld',
    reason:
      'An inter-project interface commitment bound to THAT activity (ADR-0043). Carrying it would ' +
      'silently clamp the clone against an agreement nobody made about it.',
  },
  externalLateFinish: {
    disposition: 'withheld',
    reason: 'As externalEarlyStart — an interface commitment the copy is not party to.',
  },

  // ---- Engine-owned — structurally unsendable -------------------------------------------------
  earlyStart: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  earlyFinish: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  lateStart: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  lateFinish: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  totalFloat: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  freeFloat: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  isCritical: { disposition: 'withheld', reason: 'CPM output; the next recalculation writes it.' },
  isNearCritical: {
    disposition: 'withheld',
    reason: 'CPM output; the next recalculation writes it.',
  },
  constraintViolated: { disposition: 'withheld', reason: 'Engine flag, never accepted as input.' },
  externalDriven: { disposition: 'withheld', reason: 'Engine flag, never accepted as input.' },
  loeNoSpan: { disposition: 'withheld', reason: 'Engine flag, never accepted as input.' },
  resourceDriverMissing: {
    disposition: 'withheld',
    reason: 'Engine flag, never accepted as input.',
  },
  visualEffectiveStart: { disposition: 'withheld', reason: 'Engine output (ADR-0033 pass two).' },
  visualEffectiveFinish: {
    disposition: 'withheld',
    reason: 'Engine output of the ADR-0033 second pass.',
  },
  visualConflict: { disposition: 'withheld', reason: 'Engine flag from the ADR-0033 second pass.' },
  visualDriftDays: {
    disposition: 'withheld',
    reason: 'Engine output of the ADR-0033 second pass.',
  },
  leveledStart: { disposition: 'withheld', reason: 'Levelling output (ADR-0041), engine-owned.' },
  leveledFinish: { disposition: 'withheld', reason: 'Levelling output (ADR-0041), engine-owned.' },
  levelingDelayDays: {
    disposition: 'withheld',
    reason: 'Levelling output (ADR-0041), engine-owned.',
  },
  levelingWindowExceeded: {
    disposition: 'withheld',
    reason: 'Levelling flag (ADR-0041), engine-owned.',
  },
  selfOverAllocated: {
    disposition: 'withheld',
    reason: 'Levelling flag (ADR-0041), engine-owned.',
  },
};

/** Where the paste puts one clone, and how far in time it moves. */
export interface ClonePlacement {
  /** The lane the clone lands in. */
  readonly laneIndex: number;
  /** The clone's parent — already remapped by the caller (see `clone-graph`). */
  readonly parentId: string | null;
  /**
   * Whole calendar days to shift every date the clone carries. `0` for a duplicate in place.
   * Calendar days, matching the canvas x-axis, not working days.
   */
  readonly offsetDays: number;
  /**
   * The plan's scheduling mode. EARLY pins the clone with an `SNET`; VISUAL writes a `visualStart`
   * and pins nothing — the ADR-0033 split, applied here rather than re-decided per call site.
   */
  readonly mode: 'EARLY' | 'VISUAL';
  /**
   * The clone's anchor date (`YYYY-MM-DD`), already offset — the source's early start for a
   * duplicate in place. Null when the source has never been scheduled, in which case the clone is
   * placed by logic alone and nothing is pinned.
   */
  readonly anchorDate: string | null;
}

/** The body `POST …/plans/:planId/activities` is given for one clone. */
export interface CloneCreateBody {
  readonly name: string;
  readonly description?: string;
  readonly type: ActivitySummary['type'];
  readonly durationMinutes: number;
  readonly durationType: ActivitySummary['durationType'];
  readonly percentCompleteType: ActivitySummary['percentCompleteType'];
  readonly accrualType: ActivitySummary['accrualType'];
  readonly scheduleAsLateAsPossible: boolean;
  readonly levelingPriority?: number;
  readonly calendarId?: string;
  readonly parentId?: string;
  readonly laneIndex: number;
  readonly constraintType?: ActivitySummary['constraintType'];
  readonly constraintDate?: string;
  readonly secondaryConstraintType?: ActivitySummary['secondaryConstraintType'];
  readonly secondaryConstraintDate?: string;
  readonly visualStart?: string;
  readonly budgetedExpense?: number;
}

/** Shift a `YYYY-MM-DD` day by whole calendar days. UTC, so no zone can move it a day. */
export function shiftIsoDay(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * The create body for one clone.
 *
 * `laneIndex` rides in **this** call. `POST …/activities` has always accepted it
 * (`create-activity.dto.ts:290-296`); the web body builder simply never sent it, which is why
 * `deleteActivityCommand`'s inverse issues a second relane call under a docblock reading "the
 * create endpoint doesn't take a lane". That claim is about the client, not the API — checked
 * before this was written, because believing it would have cost every clone an extra round trip
 * and a window where the clone sits in the wrong lane.
 */
export function projectClone(
  source: ActivitySummary,
  options: { readonly name: string; readonly placement: ClonePlacement },
): CloneCreateBody {
  const { placement } = options;
  const shift = (iso: string): string => shiftIsoDay(iso, placement.offsetDays);

  return {
    name: options.name,
    ...(source.description === null ? {} : { description: source.description }),
    type: source.type,
    durationMinutes: source.durationMinutes,
    durationType: source.durationType,
    percentCompleteType: source.percentCompleteType,
    accrualType: source.accrualType,
    scheduleAsLateAsPossible: source.scheduleAsLateAsPossible,
    ...(source.levelingPriority === null ? {} : { levelingPriority: source.levelingPriority }),
    ...(source.calendarId === null ? {} : { calendarId: source.calendarId }),
    ...(placement.parentId === null ? {} : { parentId: placement.parentId }),
    laneIndex: placement.laneIndex,
    ...(source.constraintType === null || source.constraintDate === null
      ? {}
      : {
          constraintType: source.constraintType,
          constraintDate: shift(source.constraintDate),
        }),
    ...(source.secondaryConstraintType === null || source.secondaryConstraintDate === null
      ? {}
      : {
          secondaryConstraintType: source.secondaryConstraintType,
          secondaryConstraintDate: shift(source.secondaryConstraintDate),
        }),
    // The placement pin. EARLY pins an SNET at the anchor; VISUAL writes a visualStart and pins
    // nothing — one mode-aware rule rather than a decision repeated at each call site (ADR-0033).
    ...(placement.anchorDate === null
      ? {}
      : placement.mode === 'VISUAL'
        ? { visualStart: placement.anchorDate }
        : source.constraintType === null
          ? { constraintType: 'SNET' as const, constraintDate: placement.anchorDate }
          : {}),
    ...(source.budgetedExpense === null ? {} : { budgetedExpense: source.budgetedExpense }),
  };
}

/** A convenience for the common single duplicate: the free name, then the body. */
export function projectDuplicate(
  source: ActivitySummary,
  usedNames: ReadonlySet<string>,
  placement: ClonePlacement,
): CloneCreateBody {
  return projectClone(source, { name: freeCopyName(source.name, usedNames), placement });
}
