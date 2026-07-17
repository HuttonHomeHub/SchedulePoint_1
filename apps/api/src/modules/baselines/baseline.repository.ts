import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityType, type Baseline } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
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
}

/** The baseline row to insert, plus the already-projected snapshot rows. */
export interface CaptureInput {
  organizationId: string;
  planId: string;
  name: string;
  isActive: boolean;
  dataDate: Date | null;
  capturedProjectFinish: Date | null;
  actorId: string;
  activities: CaptureActivityRow[];
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
        assignments: {
          where: { deletedAt: null, resource: { deletedAt: null } },
          select: {
            budgetedCost: true,
            budgetedUnits: true,
            resource: { select: { costPerUnit: true } },
          },
        },
      },
    });
    return rows.map(({ budgetedExpense, assignments, ...rest }) => ({
      ...rest,
      budgetedCost: computeBudgetedCost(budgetedExpense, assignments),
    }));
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
  ): Promise<PlanCalendarInput | null> {
    return db.calendar.findFirst({
      where: { id: calendarId, organizationId, deletedAt: null },
      select: {
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
  ): Promise<void> {
    const stamp = { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId };
    await db.baselineActivity.updateMany({
      where: { baselineId: id, deletedAt: null },
      data: stamp,
    });
    await db.baseline.updateMany({ where: { id, deletedAt: null }, data: stamp });
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
    cost +=
      a.budgetedCost !== null
        ? Number(a.budgetedCost)
        : Math.round(a.budgetedUnits.toNumber() * (a.resource.costPerUnit?.toNumber() ?? 0));
  }
  return cost;
}
