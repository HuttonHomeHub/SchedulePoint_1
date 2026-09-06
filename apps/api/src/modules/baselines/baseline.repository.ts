import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActivityType,
  type Baseline,
  type ConstraintType,
  type DependencyType,
  type LagCalendarSource,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { CriticalityRule } from '../schedule/criticality-rule';
import type { PlanCalendarInput } from '../schedule/plan-calendar';

import type { BaselineWithActivities, BaselineWithCount } from './dto/baseline-response.dto';

/** A live activity projected to the fields a baseline snapshot freezes. */
export interface CaptureActivityRow {
  id: string;
  code: string | null;
  name: string;
  type: ActivityType;
  durationMinutes: number;
  earlyStart: Date | null;
  earlyFinish: Date | null;
  lateStart: Date | null;
  lateFinish: Date | null;
  totalFloat: number | null;
  isCritical: boolean;
  /**
   * The activity's budgeted cost frozen at capture (EV1, ADR-0042 — the ADR-0025 amendment), in
   * integer minor units: Σ over its active assignments `(budgetedCost ?? round(budgetedUnits ×
   * costPerUnit))` + the activity's `budgetedExpense`. A plan with no cost data captures `0` (a real
   * "no budget", distinct from the SQL NULL a pre-EV baseline carries — which the EV read flags as
   * `costBaselineMissing`), so a baseline captured now ALWAYS stores an integer, never NULL.
   */
  budgetedCost: number;
  /**
   * The activity-expense HALF of {@link budgetedCost}, frozen separately (ADR-0071 M3 / CQ-1 B).
   *
   * Stated rather than derived as `budgetedCost − Σ(components)`: that subtraction is exact integer
   * arithmetic today and becomes silently wrong the day the total is computed by a rule it does not
   * know about. One number is cheaper than that risk.
   */
  budgetedExpense: number;
  /**
   * This activity's cost DECOMPOSITION at capture (ADR-0071 M3) — one entry per active assignment,
   * carrying the same per-assignment expression {@link budgetedCost} sums, so the components add up
   * to the total by construction rather than by a second calculation that could disagree.
   *
   * The **lag is frozen with the cost**, not read live at EV time: a snapshot holding frozen money
   * but a live window would time-phase that money through a window somebody edited afterwards — the
   * drift ADR-0025's copy-not-reference rule exists to prevent, one field along.
   */
  assignments: {
    sourceAssignmentId: string;
    sourceResourceId: string;
    budgetedCost: number;
    lagMinutes: number;
  }[];
  /**
   * **The frozen SHAPE of the activity** — how the plan was built, as distinct from where the work
   * landed (the revision-snapshot extension, ADR-0126).
   *
   * Every one of these is REQUIRED here while the column it lands in is nullable, and that
   * asymmetry is deliberate. The column is nullable because a baseline captured before the
   * extension has no value for it and never will; this interface describes a capture happening
   * NOW, which always has one. Making them optional would let a future capture path omit a field
   * silently and write a NULL that a reader cannot tell from "never recorded" — the exact absence
   * this whole epic exists to remove. `laneIndex` and `percentComplete` are `number`, not
   * `number | null`, for the same reason: the live columns are NOT NULL, so there is nothing to
   * pass through.
   */
  laneIndex: number;
  parentId: string | null;
  calendarId: string | null;
  constraintType: ConstraintType | null;
  constraintDate: Date | null;
  secondaryConstraintType: ConstraintType | null;
  secondaryConstraintDate: Date | null;
  percentComplete: number;
  actualStart: Date | null;
  actualFinish: Date | null;
}

/**
 * A live dependency projected to the fields a baseline snapshot freezes (ADR-0126).
 *
 * All four value fields are required, matching the four no-default columns on
 * `baseline_dependencies`: a capture path that forgot `type` would otherwise freeze every edge in
 * the plan as Finish-to-Start, and a change list reading that snapshot would report a
 * finish-to-finish link as having been re-typed by somebody. The compiler is the guard.
 */
export interface CaptureDependencyRow {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagMinutes: number;
  lagCalendar: LagCalendarSource;
  isDriving: boolean;
}

/** The baseline row to insert, plus the already-projected snapshot rows. */
export interface CaptureInput {
  organizationId: string;
  planId: string;
  name: string;
  isActive: boolean;
  dataDate: Date | null;
  capturedProjectFinish: Date | null;
  /** The plan calendar's hours-per-day at capture, in minutes (ADR-0068 §5). */
  hoursPerDayMinutes: number;
  /**
   * The criticality rule this snapshot's `is_critical`/`total_float` were COMPUTED under
   * (ADR-0125 / CQ-1) — copied from the plan's ENGINE-OWNED `schedule_critical_*` mirrors, never
   * from its client-settable options. ONE nullable object rather than four nullable fields, so the
   * compiler enforces all-or-none: `null` means the plan's last recalculation predates the mirror
   * and the rule is unrecoverable, which is the all-NULL sentinel the four columns store.
   */
  criticalityRule: CriticalityRule | null;
  actorId: string;
  activities: CaptureActivityRow[];
  /**
   * The plan's frozen logic. Written unconditionally — INCLUDING when the plan has no dependencies
   * at all, which is why the capture sets `revisionSnapshotLevel: 'FULL'` outside this array's
   * emptiness check. Zero rows on a FULL baseline means "there genuinely were none"; zero rows on
   * a NONE baseline means "nobody looked". A row count cannot tell those apart, and the
   * discriminator is the only thing that can (the `costSnapshotLevel` precedent, ADR-0071 M3).
   */
  dependencies: CaptureDependencyRow[];
}

/**
 * Data-access for baselines (ADR-0008, ADR-0025). Centralises the soft-delete filter
 * so no read forgets `deletedAt: null`; write methods accept an optional transaction
 * client. A baseline's snapshot rows are inserted in one batched `createMany` inside
 * the caller's (locked) transaction, so a capture is one consistent write. Item
 * lookups are scoped by organisation AND plan (anti-IDOR). Because snapshot rows only
 * ever soft-delete as part of their parent baseline's cascade, an ACTIVE baseline
 * always has all of its snapshot rows active — so a plain relation count is exact.
 */
@Injectable()
export class BaselineRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.BaselineWhereInput = {}): Prisma.BaselineWhereInput {
    return { ...where, deletedAt: null };
  }

  /**
   * Insert a baseline and its frozen activity snapshot rows. Must run inside the
   * caller's transaction (the plan write-lock is already held): the baseline row first
   * (so a duplicate name / second-active surfaces as P2002 before the bulk insert),
   * then the snapshot rows in one `createMany`. Returns the created baseline; the
   * caller knows the activity count from the input.
   */
  async createWithSnapshot(input: CaptureInput, db: Prisma.TransactionClient): Promise<Baseline> {
    const baseline = await db.baseline.create({
      data: {
        organizationId: input.organizationId,
        planId: input.planId,
        name: input.name,
        isActive: input.isActive,
        dataDate: input.dataDate,
        capturedProjectFinish: input.capturedProjectFinish,
        hoursPerDayMinutes: input.hoursPerDayMinutes,
        // ADR-0071 M3 / CQ-1 (B). Written unconditionally, including when the plan has NO
        // assignments at all: that is the whole point of the discriminator. Zero component rows
        // then means "there genuinely were none, and this snapshot is complete", which Earned
        // Value must read as EXACT — the opposite of what zero rows means on a baseline captured
        // before this existed. A row count cannot tell those apart; this column is the only thing
        // that can, so it must never be conditional on there being something to count.
        costSnapshotLevel: 'ASSIGNMENT',
        // ADR-0125 / CQ-1. Written unconditionally, exactly as costSnapshotLevel above is and for
        // the same reason: a CONDITIONAL write is how a NULL meaning "the rule is unknowable"
        // becomes indistinguishable from a NULL meaning "we happened not to set it this time".
        // `?? null` here defaults to the SENTINEL, never to a value — `?? 'TOTAL_FLOAT'` / `?? 0`
        // is the forbidden form, because it manufactures a rule nothing ever ran under.
        // ADR-0126. Written unconditionally, exactly as `costSnapshotLevel` above is: this capture
        // reads and freezes the shape of every activity and every edge, so it IS full — whether or
        // not the plan happens to contain any logic to freeze. Making it conditional on
        // `dependencies.length` is the trap the sibling comment above describes, one column along.
        revisionSnapshotLevel: 'FULL',
        criticalPathDefinition: input.criticalityRule?.criticalPathDefinition ?? null,
        criticalFloatThresholdMinutes: input.criticalityRule?.criticalFloatThresholdMinutes ?? null,
        totalFloatMode: input.criticalityRule?.totalFloatMode ?? null,
        makeOpenEndsCritical: input.criticalityRule?.makeOpenEndsCritical ?? null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });
    if (input.activities.length > 0) {
      await db.baselineActivity.createMany({
        data: input.activities.map((a) => ({
          organizationId: input.organizationId,
          baselineId: baseline.id,
          sourceActivityId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          // Both live and baseline durations are working-minutes now (ADR-0036) — a
          // direct copy keeps the frozen snapshot faithful (ADR-0025), no ×1440.
          durationMinutes: a.durationMinutes,
          baselineStart: a.earlyStart,
          baselineFinish: a.earlyFinish,
          lateStart: a.lateStart,
          lateFinish: a.lateFinish,
          totalFloat: a.totalFloat,
          isCritical: a.isCritical,
          // The cost baseline frozen at capture (EV1, ADR-0042 / the ADR-0025 amendment) — an
          // integer minor-unit budget, computed by the service-side load below.
          budgetedCost: a.budgetedCost,
          // The activity-expense component of that total (ADR-0071 M3), so the decomposition is
          // stated rather than recovered by subtracting the assignment rows.
          budgetedExpense: a.budgetedExpense,
          // The frozen SHAPE (ADR-0126). Copied field for field, no derivation: a snapshot that
          // computed anything would be recording a rule rather than a fact.
          laneIndex: a.laneIndex,
          parentId: a.parentId,
          calendarId: a.calendarId,
          constraintType: a.constraintType,
          constraintDate: a.constraintDate,
          secondaryConstraintType: a.secondaryConstraintType,
          secondaryConstraintDate: a.secondaryConstraintDate,
          percentComplete: a.percentComplete,
          actualStart: a.actualStart,
          actualFinish: a.actualFinish,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        })),
      });
      // The cost decomposition (ADR-0071 M3). Same transaction as the baseline row and the activity
      // rows, so the `ASSIGNMENT` discriminator and the rows it promises are never separately
      // visible — the pairing cannot be a database CHECK (different tables), so this transaction is
      // where the invariant actually lives.
      const components = input.activities.flatMap((a) =>
        a.assignments.map((asg) => ({
          organizationId: input.organizationId,
          baselineId: baseline.id,
          sourceAssignmentId: asg.sourceAssignmentId,
          sourceActivityId: a.id,
          sourceResourceId: asg.sourceResourceId,
          budgetedCost: asg.budgetedCost,
          lagMinutes: asg.lagMinutes,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        })),
      );
      if (components.length > 0) await db.baselineAssignment.createMany({ data: components });
    }
    // **Outside the `activities.length` block on purpose.** An edge set cannot be non-empty when
    // the activity set is (an edge names two activities), so nesting it would be harmless today
    // and would silently become a bug the day the guard above changes for an unrelated reason.
    // The level written above is already unconditional; this is the rows it promises.
    if (input.dependencies.length > 0) {
      await db.baselineDependency.createMany({
        data: input.dependencies.map((d) => ({
          organizationId: input.organizationId,
          baselineId: baseline.id,
          sourceDependencyId: d.id,
          // The ENDPOINTS in the SOURCE activity id space — the same space
          // `baseline_activities.source_activity_id` lives in, so the change list joins id to id
          // with no lookup through this table's own primary keys (ADR-0126).
          sourcePredecessorId: d.predecessorId,
          sourceSuccessorId: d.successorId,
          type: d.type,
          lagMinutes: d.lagMinutes,
          lagCalendar: d.lagCalendar,
          isDriving: d.isDriving,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        })),
      });
    }
    return baseline;
  }

  /**
   * A plan's active live activities projected to the snapshot fields — the capture
   * source. Scoped by org (anti-IDOR) and plan; read inside the locked capture tx so
   * it is a consistent snapshot (never taken mid-recalculation).
   */
  async loadActiveActivitiesForCapture(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CaptureActivityRow[]> {
    const rows = await db.activity.findMany({
      where: { organizationId, planId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        durationMinutes: true,
        earlyStart: true,
        earlyFinish: true,
        lateStart: true,
        lateFinish: true,
        totalFloat: true,
        isCritical: true,
        // Cost baseline inputs (EV1, ADR-0042): the activity-level lump-sum plus each active
        // assignment's budget (explicit override or `budgetedUnits × costPerUnit`). Loaded inside
        // the locked capture tx so the frozen budget is consistent with the frozen dates.
        budgetedExpense: true,
        // The SHAPE inputs (ADR-0126) — how the plan was built, read in the same locked
        // transaction as the dates so the two describe one moment.
        laneIndex: true,
        parentId: true,
        calendarId: true,
        constraintType: true,
        constraintDate: true,
        secondaryConstraintType: true,
        secondaryConstraintDate: true,
        percentComplete: true,
        actualStart: true,
        actualFinish: true,
        assignments: {
          where: { deletedAt: null, resource: { deletedAt: null } },
          select: {
            id: true,
            resourceId: true,
            budgetedCost: true,
            budgetedUnits: true,
            // Frozen alongside the cost (ADR-0071 M3) — see CaptureActivityRow.assignments.
            lagMinutes: true,
            resource: { select: { costPerUnit: true } },
          },
        },
      },
    });
    return rows.map(({ budgetedExpense, assignments, ...rest }) => ({
      ...rest,
      budgetedCost: computeBudgetedCost(budgetedExpense, assignments),
      budgetedExpense: Number(budgetedExpense ?? 0n),
      assignments: assignments.map((a) => ({
        sourceAssignmentId: a.id,
        sourceResourceId: a.resourceId,
        // The SAME expression computeBudgetedCost sums, deliberately — two spellings of one number
        // is how a decomposition stops adding up to its own total.
        budgetedCost: assignmentBudgetedCost(a),
        lagMinutes: a.lagMinutes,
      })),
    }));
  }

  /**
   * A plan's active dependencies projected to the snapshot fields — the logic half of a capture
   * (ADR-0126). Scoped by org (anti-IDOR) and plan, and read inside the SAME locked transaction as
   * {@link loadActiveActivitiesForCapture}, which is what makes the frozen graph and the frozen
   * dates describe one moment rather than two.
   *
   * **Both endpoints are filtered on being live**, not just the edge. A dependency whose endpoint
   * was soft-deleted is unreachable from the plan the capture is freezing, and storing it would put
   * an edge in the snapshot naming an activity the snapshot does not contain — which the change
   * list would then have to render as a link to nothing. The service invariant that every endpoint
   * equals some `baseline_activities.source_activity_id` of the same baseline is enforced HERE, in
   * the one query, rather than by a foreign key the ADR-0025 copy-not-reference rule forbids.
   */
  loadActiveDependenciesForCapture(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CaptureDependencyRow[]> {
    return db.activityDependency.findMany({
      where: {
        organizationId,
        planId,
        deletedAt: null,
        predecessor: { deletedAt: null },
        successor: { deletedAt: null },
      },
      select: {
        id: true,
        predecessorId: true,
        successorId: true,
        type: true,
        lagMinutes: true,
        lagCalendar: true,
        isDriving: true,
      },
    });
  }

  /** The plan's active comparison baseline, or null when it has none — the variance source. */
  findActiveBaselineByPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Baseline | null> {
    return db.baseline.findFirst({
      where: this.active({ organizationId, planId, isActive: true }),
    });
  }

  /** A baseline's frozen snapshot rows projected to the fields variance needs. */
  loadSnapshotRowsForVariance(
    baselineId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      sourceActivityId: string;
      code: string | null;
      name: string;
      baselineStart: Date | null;
      baselineFinish: Date | null;
      totalFloat: number | null;
    }[]
  > {
    return db.baselineActivity.findMany({
      where: { baselineId, deletedAt: null },
      select: {
        sourceActivityId: true,
        code: true,
        name: true,
        baselineStart: true,
        baselineFinish: true,
        totalFloat: true,
      },
    });
  }

  /**
   * A baseline's frozen snapshot rows projected to the fields the REVISION DELTA needs.
   *
   * **Separate from `loadSnapshotRowsForVariance` above rather than a widening of it.** That
   * projection omits `isCritical` and `type`, which are precisely the two the delta turns on:
   * criticality is what "entered" and "left" mean, and `type` is what excludes a `WBS_SUMMARY`
   * from those sets and from carrier selection.
   *
   * The plan justified not widening it as "three existing readers depend on its contract". That was
   * FALSE — measured 2026-09-05, there is one caller and one consumer — and the decision is kept on
   * the reason that holds: a shared projection would load two columns the variance path never reads,
   * on every variance call, to spare one duplicated `select`.
   *
   * One indexed read, on the existing `@@index([baselineId, sourceActivityId])`.
   *
   * **Org-scoped in the QUERY, not by the caller's discipline** — the M4 security review's finding,
   * folded. Its sibling `loadSnapshotRowsForVariance` takes a bare `baselineId` and is safe only
   * because its one call site resolved that id through `findActiveByIdInPlan` first; nothing
   * compiles or fails if a later caller does not. That sibling is deliberately left alone (its
   * contract is not this epic's to change), but the NEW loader does not inherit the weakness: a
   * baseline id belonging to another organisation returns no rows here even if a future call site
   * forgets to check, so the uniform 404 upstream stops depending on somebody remembering.
   */
  loadSnapshotRowsForDelta(
    baselineId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      sourceActivityId: string;
      code: string | null;
      name: string;
      type: ActivityType;
      durationMinutes: number;
      isCritical: boolean;
      totalFloat: number | null;
      baselineStart: Date | null;
      baselineFinish: Date | null;
      laneIndex: number | null;
      parentId: string | null;
      calendarId: string | null;
      constraintType: ConstraintType | null;
      constraintDate: Date | null;
      secondaryConstraintType: ConstraintType | null;
      secondaryConstraintDate: Date | null;
      percentComplete: number | null;
      actualStart: Date | null;
      actualFinish: Date | null;
    }[]
  > {
    return db.baselineActivity.findMany({
      where: { baselineId, organizationId, deletedAt: null },
      select: {
        sourceActivityId: true,
        code: true,
        name: true,
        type: true,
        durationMinutes: true,
        isCritical: true,
        totalFloat: true,
        baselineStart: true,
        baselineFinish: true,
        // The frozen SHAPE (ADR-0126). Selected unconditionally, including from a NONE-level
        // baseline where every one of them is NULL: the caller decides whether they mean anything
        // by reading `revision_snapshot_level`, and branching the SELECT on the level would make
        // this read's own shape depend on the answer it is trying to supply.
        laneIndex: true,
        parentId: true,
        calendarId: true,
        constraintType: true,
        constraintDate: true,
        secondaryConstraintType: true,
        secondaryConstraintDate: true,
        percentComplete: true,
        actualStart: true,
        actualFinish: true,
      },
    });
  }

  /**
   * A plan's active live activities projected to the fields the REVISION DELTA needs — the live
   * side's counterpart to {@link loadSnapshotRowsForDelta}, carrying the same facts so both project
   * to one row shape and the pure delta cannot tell them apart.
   *
   * Org-scoped and soft-delete filtered, like every read in this repository.
   */
  loadActiveActivitiesForDelta(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      id: string;
      code: string | null;
      name: string;
      type: ActivityType;
      durationMinutes: number;
      isCritical: boolean;
      totalFloat: number | null;
      earlyStart: Date | null;
      earlyFinish: Date | null;
      laneIndex: number;
      parentId: string | null;
      calendarId: string | null;
      constraintType: ConstraintType | null;
      constraintDate: Date | null;
      secondaryConstraintType: ConstraintType | null;
      secondaryConstraintDate: Date | null;
      percentComplete: number;
      actualStart: Date | null;
      actualFinish: Date | null;
    }[]
  > {
    return db.activity.findMany({
      where: { organizationId, planId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        durationMinutes: true,
        isCritical: true,
        totalFloat: true,
        earlyStart: true,
        earlyFinish: true,
        // The live plan's shape — the counterpart of the frozen columns above. The live side is
        // ALWAYS fully recorded: it IS the plan, so `bothSnapshotted` turns only on the frozen
        // side(s).
        laneIndex: true,
        parentId: true,
        calendarId: true,
        constraintType: true,
        constraintDate: true,
        secondaryConstraintType: true,
        secondaryConstraintDate: true,
        percentComplete: true,
        actualStart: true,
        actualFinish: true,
      },
    });
  }

  /**
   * A baseline's frozen LOGIC, projected for the change list (ADR-0126).
   *
   * Org-scoped in the query, like {@link loadSnapshotRowsForDelta} and for the same reason: a
   * baseline id belonging to another organisation returns no rows here even if a future call site
   * forgets to check. One indexed read on `(baseline_id, source_dependency_id)`.
   *
   * `is_driving` is frozen in the table and deliberately NOT projected — see {@link RevisionEdge}.
   */
  loadSnapshotDependenciesForDelta(
    baselineId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      sourceDependencyId: string;
      sourcePredecessorId: string;
      sourceSuccessorId: string;
      type: DependencyType;
      lagMinutes: number;
      lagCalendar: LagCalendarSource;
    }[]
  > {
    return db.baselineDependency.findMany({
      where: { baselineId, organizationId, deletedAt: null },
      select: {
        sourceDependencyId: true,
        sourcePredecessorId: true,
        sourceSuccessorId: true,
        type: true,
        lagMinutes: true,
        lagCalendar: true,
      },
    });
  }

  /** The live plan's logic — the live side's counterpart to the loader above. */
  loadActiveDependenciesForDelta(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      id: string;
      predecessorId: string;
      successorId: string;
      type: DependencyType;
      lagMinutes: number;
      lagCalendar: LagCalendarSource;
    }[]
  > {
    return db.activityDependency.findMany({
      where: {
        organizationId,
        planId,
        deletedAt: null,
        predecessor: { deletedAt: null },
        successor: { deletedAt: null },
      },
      select: {
        id: true,
        predecessorId: true,
        successorId: true,
        type: true,
        lagMinutes: true,
        lagCalendar: true,
      },
    });
  }

  /**
   * The organisation's calendar names, for rendering a "Calendar changed" row.
   *
   * Returned as id → name pairs for the whole org rather than resolved per activity: a comparison
   * names at most a handful of calendars and the library is small, so one read beats N. A calendar
   * DELETED since capture is simply absent, which is the expected outcome of the snapshot holding
   * correlation ids and no foreign keys (ADR-0025) — the classifier states it in words rather than
   * printing a UUID.
   */
  loadCalendarNames(
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; name: string }[]> {
    return db.calendar.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  /** A plan's active live activities projected to the fields variance needs, in a stable order. */
  loadActiveActivitiesForVariance(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<
    {
      id: string;
      code: string | null;
      name: string;
      earlyStart: Date | null;
      earlyFinish: Date | null;
      totalFloat: number | null;
    }[]
  > {
    return db.activity.findMany({
      where: { organizationId, planId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        earlyStart: true,
        earlyFinish: true,
        totalFloat: true,
      },
    });
  }

  /**
   * A plan's calendar shift windows plus its ACTIVE exceptions and their replacement
   * windows, for building the working-time calendar variance is measured on (M5,
   * ADR-0024/0036). Scoped by org (anti-IDOR); null if the calendar is missing/
   * soft-deleted (→ all-days-work).
   */
  loadPlanCalendar(
    organizationId: string,
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<(PlanCalendarInput & { name: string }) | null> {
    return db.calendar.findFirst({
      where: { id: calendarId, organizationId, deletedAt: null },
      select: {
        // Only so a `CALENDAR_HAS_NO_WORKING_TIME` rejection can name the calendar to fix,
        // matching `ScheduleRepository.loadPlanCalendar`. The engine never reads it.
        name: true,
        shifts: {
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
          select: { weekday: true, startMinute: true, endMinute: true },
        },
        exceptions: {
          where: { deletedAt: null },
          orderBy: [{ startDate: 'asc' }],
          select: {
            startDate: true,
            endDate: true,
            windows: {
              orderBy: [{ startMinute: 'asc' }],
              select: { startMinute: true, endMinute: true },
            },
          },
        },
      },
    });
  }

  /** Count a plan's active baselines — used to decide whether a capture is the first (auto-active). */
  countActiveByPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.baseline.count({ where: this.active({ organizationId, planId }) });
  }

  /** An active baseline scoped to its org + plan (anti-IDOR); existence/scope check. */
  findActiveByIdInPlan(
    id: string,
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Baseline | null> {
    return db.baseline.findFirst({ where: this.active({ id, organizationId, planId }) });
  }

  /** An active baseline with its snapshot-row count — the summary shape for a single read. */
  async findActiveWithCountByIdInPlan(
    id: string,
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<(Baseline & { activityCount: number }) | null> {
    const row = await db.baseline.findFirst({
      where: this.active({ id, organizationId, planId }),
      include: { _count: { select: { activities: true } } },
    });
    if (!row) return null;
    const { _count, ...baseline } = row;
    return { ...baseline, activityCount: _count.activities };
  }

  /**
   * Clear the plan's current active baseline (`is_active = false`), scoped to org +
   * plan. Runs first in an activate flip (before setting the target), so the
   * one-active partial unique is never momentarily violated. Idempotent.
   */
  async clearActive(
    organizationId: string,
    planId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    await db.baseline.updateMany({
      where: this.active({ organizationId, planId, isActive: true }),
      data: { isActive: false, updatedBy: actorId, version: { increment: 1 } },
    });
  }

  /**
   * Set a baseline active, scoped to org + plan. Returns rows changed — `0` means the
   * baseline is gone (deleted concurrently), which the service maps to 404. Must run
   * AFTER {@link clearActive} in the same transaction.
   */
  async setActive(
    id: string,
    organizationId: string,
    planId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await db.baseline.updateMany({
      where: this.active({ id, organizationId, planId }),
      data: { isActive: true, updatedBy: actorId, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * Soft-delete a baseline and its snapshot rows under one batch id, in the caller's
   * transaction. The `deletedAt: null` guards make it idempotent under a concurrent
   * delete. The caller must have verified scope + authorisation.
   */
  async softDeleteWithSnapshot(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<string> {
    const batchId = randomUUID();
    const stamp = { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId };
    await db.baselineActivity.updateMany({
      where: { baselineId: id, deletedAt: null },
      data: stamp,
    });
    // The cost decomposition rides the SAME batch (ADR-0071 M3). Left behind, its rows would stay
    // active under a deleted parent — invisible to every read, and restored out of step with the
    // activity rows they belong to, since restore is batch-cohesion-guarded.
    await db.baselineAssignment.updateMany({
      where: { baselineId: id, deletedAt: null },
      data: stamp,
    });
    // The frozen logic rides the SAME batch too (the revision-snapshot extension). This is the
    // FOURTH cascade site for a baseline's snapshot children and the one that is easy to miss: the
    // other three live in `HierarchyLifecycleService` (its delete sweep, shared by the client,
    // project and plan paths, and its `restoreBatch`), and this is the direct "delete THIS
    // baseline" path, which no hierarchy delete goes through. Missing here, the edges would stay
    // active under a deleted parent and — because restore is keyed on `delete_batch_id` — would
    // never come back with it.
    await db.baselineDependency.updateMany({
      where: { baselineId: id, deletedAt: null },
      data: stamp,
    });
    await db.baseline.updateMany({ where: { id, deletedAt: null }, data: stamp });
    // Returned so the caller's audit row can carry it (ADR-0073 C3.2). The batch is what ties the
    // baseline to the snapshot rows that went with it, which is the same thread every other
    // deletion in the log names.
    return batchId;
  }

  /** An active baseline with its frozen activity rows (source-id ordered) — the read shape. */
  async findActiveDetailByIdInPlan(
    id: string,
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<BaselineWithActivities | null> {
    return db.baseline.findFirst({
      where: this.active({ id, organizationId, planId }),
      include: {
        activities: { where: { deletedAt: null }, orderBy: [{ sourceActivityId: 'asc' }] },
      },
    });
  }

  /**
   * A page of a plan's active baselines with their snapshot-row counts (keyset cursor
   * by id, ordered by capture recency). `order` sorts by `createdAt` (newest-first by
   * default) then `id` for a deterministic cursor.
   */
  async findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
    order: 'asc' | 'desc';
  }): Promise<BaselineWithCount[]> {
    const rows = await this.prisma.baseline.findMany({
      where: this.active({ organizationId: params.organizationId, planId: params.planId }),
      orderBy: [{ createdAt: params.order }, { id: params.order }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { _count: { select: { activities: true } } },
    });
    return rows.map(({ _count, ...baseline }) => ({
      ...baseline,
      activityCount: _count.activities,
    }));
  }
}

/**
 * The activity's budgeted cost at capture in integer minor units (EV1, ADR-0042 / the ADR-0025
 * amendment) — mirrors the EV read-model's leaf BAC (`earned-value.ts`): the activity-level
 * `budgetedExpense` (0 when null) plus, per active assignment, its explicit `budgetedCost` override
 * or the derived `round(budgetedUnits × (costPerUnit ?? 0))`. Money is `BIGINT` (→ `Number`); units
 * and the cost rate are `Decimal(18,4)` (→ `toNumber`). Always returns an integer (0 for no cost).
 */
/**
 * ONE assignment's budget in minor units: the explicit override, else `budgetedUnits × costPerUnit`
 * (ADR-0040's rate-on-the-assignment precedent). Extracted so the frozen components and the frozen
 * total are the same arithmetic — a decomposition computed a second way is a decomposition that can
 * stop summing to its own total without anything failing.
 */
function assignmentBudgetedCost(a: {
  budgetedCost: bigint | null;
  budgetedUnits: Prisma.Decimal;
  resource: { costPerUnit: Prisma.Decimal | null };
}): number {
  return a.budgetedCost !== null
    ? Number(a.budgetedCost)
    : Math.round(a.budgetedUnits.toNumber() * (a.resource.costPerUnit?.toNumber() ?? 0));
}

function computeBudgetedCost(
  budgetedExpense: bigint | null,
  assignments: {
    budgetedCost: bigint | null;
    budgetedUnits: Prisma.Decimal;
    resource: { costPerUnit: Prisma.Decimal | null };
  }[],
): number {
  let cost = Number(budgetedExpense ?? 0n);
  for (const a of assignments) {
    cost += assignmentBudgetedCost(a);
  }
  return cost;
}
