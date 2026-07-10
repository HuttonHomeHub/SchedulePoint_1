import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityType, type Baseline } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { BaselineWithActivities, BaselineWithCount } from './dto/baseline-response.dto';

/** A live activity projected to the fields a baseline snapshot freezes. */
export interface CaptureActivityRow {
  id: string;
  code: string | null;
  name: string;
  type: ActivityType;
  durationDays: number;
  earlyStart: Date | null;
  earlyFinish: Date | null;
  lateStart: Date | null;
  lateFinish: Date | null;
  totalFloat: number | null;
  isCritical: boolean;
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
          durationDays: a.durationDays,
          baselineStart: a.earlyStart,
          baselineFinish: a.earlyFinish,
          lateStart: a.lateStart,
          lateFinish: a.lateFinish,
          totalFloat: a.totalFloat,
          isCritical: a.isCritical,
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
  loadActiveActivitiesForCapture(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CaptureActivityRow[]> {
    return db.activity.findMany({
      where: { organizationId, planId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        durationDays: true,
        earlyStart: true,
        earlyFinish: true,
        lateStart: true,
        lateFinish: true,
        totalFloat: true,
        isCritical: true,
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
