import type { ResourceAssignmentSummary } from '@repo/types';

import type { CloneFieldDecision } from './clone-projection';

/**
 * What a copied **resource assignment** carries (`docs/specs/activity-copy-paste/` M4-T1).
 *
 * The same rule as the activity census, applied one level down: **a copy is the same _crew_, not the
 * same _history_.** The commitment carries — who is on this work, how much of them, at what rate,
 * shaped how, joining when — and everything that records what those people have already done does
 * not.
 *
 * **The census is compiler-enforced**, and here that matters more than it does for activities.
 * `ResourceAssignmentSummary` is where cost and earned-value fields land (ADR-0042 EV1/EV4a), so a
 * field added to it later is disproportionately likely to be one that a copy must NOT carry —
 * copying an `actualCost` would give a brand-new assignment money already spent on it. Typing this
 * `Record<keyof ResourceAssignmentSummary, …>` makes that a build failure rather than a discovery.
 */
export const ASSIGNMENT_FIELD_DECISIONS: Record<
  keyof ResourceAssignmentSummary,
  CloneFieldDecision
> = {
  // ---- Identity -------------------------------------------------------------------------------
  id: { disposition: 'withheld', reason: 'The server mints the clone its own id.' },
  activityId: {
    disposition: 'withheld',
    reason: 'Implied by the route — the assignment is posted under the CLONE, not the source.',
  },
  version: {
    disposition: 'withheld',
    reason: 'Optimistic-lock counter; a newly created row starts at version 1.',
  },
  createdAt: { disposition: 'withheld', reason: 'Server-stamped when the clone is created.' },
  updatedAt: { disposition: 'withheld', reason: 'Server-stamped when the clone is created.' },

  // ---- What the commitment IS -----------------------------------------------------------------
  resourceId: {
    disposition: 'carried',
    reason:
      'The whole point: a copy of the work is a copy of who does it. The resource pool is one ' +
      'org-global pool (ADR-0053 §3), so the id is valid for any activity in the org.',
  },
  budgetedUnits: {
    disposition: 'carried',
    reason: 'How much of this resource the work needs — a plan, not a record of what happened.',
  },
  unitsPerHour: {
    disposition: 'carried',
    reason:
      'The driving assignment’s rate (ADR-0040). Dropping it would break the triad ' +
      'Units = Duration × Units/Time for the clone while the source keeps it — a copy that ' +
      'schedules its resource differently from the thing it was copied from.',
  },
  isDriving: {
    disposition: 'carried',
    reason:
      'Which resource’s calendar a RESOURCE_DEPENDENT activity schedules on (ADR-0039). The ' +
      'source already satisfies exactly-one-driver, so a faithful copy does too — asserted in the ' +
      'projection test rather than assumed.',
  },
  curveType: {
    disposition: 'carried',
    reason:
      'The named loading curve (ADR-0044). Shapes the histogram only — no CPM date, no ' +
      'levelling — but it is part of how this work is planned to be resourced.',
  },
  lagMinutes: {
    disposition: 'carried',
    reason:
      'When this resource joins, relative to the activity starting (ADR-0071). A scheduling fact ' +
      'about the commitment, and unsigned, so there is nothing to shift.',
  },

  // ---- What already happened ------------------------------------------------------------------
  actualUnits: {
    disposition: 'withheld',
    reason:
      'Quantity actually delivered (ADR-0042 EV1). A new assignment has delivered nothing; ' +
      'carrying it would earn value on work that has not started.',
  },
  actualCost: {
    disposition: 'withheld',
    reason: 'Money already spent. Copying it would spend it twice, in the report if not in fact.',
  },
  budgetedCost: {
    disposition: 'withheld',
    reason:
      'Deliberately withheld even though it is a budget rather than an actual. It is ' +
      'conditionally returned — `null` for a caller without `cost:read` (ADR-0042 EV4a) — so the ' +
      'client CANNOT distinguish "unset" from "not permitted to see". Sending the value we were ' +
      'given would write 0 for a Contributor and the real figure for a Planner, making the copy’s ' +
      'budget depend on who pressed the button. Left unset, the server derives it from ' +
      '`budgetedUnits × costPerUnit` at read time, which is the same answer for everybody.',
  },
};

/** The body `POST …/activities/:id/assignments` accepts, restricted to what a copy sends. */
export interface AssignmentCloneBody {
  readonly resourceId: string;
  readonly budgetedUnits: number;
  readonly unitsPerHour?: number;
  readonly isDriving: boolean;
  readonly curveType: ResourceAssignmentSummary['curveType'];
  readonly lagMinutes: number;
}

/**
 * Project one source assignment onto the body its clone is created with.
 *
 * Written **from** {@link ASSIGNMENT_FIELD_DECISIONS} rather than beside it, so the table and the
 * code cannot disagree — the failure being guarded is silent, since an assignment that quietly
 * dropped its rate or its curve renders identically on every screen that lists it.
 */
export function projectAssignment(source: ResourceAssignmentSummary): AssignmentCloneBody {
  return {
    resourceId: source.resourceId,
    budgetedUnits: source.budgetedUnits,
    // Omitted rather than sent as null: `unitsPerHour` NULL is what makes the ADR-0040 triad inert,
    // and the DTO's `@IsOptional()` treats absent and null differently from 0.
    ...(source.unitsPerHour === null ? {} : { unitsPerHour: source.unitsPerHour }),
    isDriving: source.isDriving,
    curveType: source.curveType,
    lagMinutes: source.lagMinutes,
  };
}
