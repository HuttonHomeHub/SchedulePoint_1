import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActivityType,
  type ConstraintType,
  type DependencyType,
} from '@prisma/client';

import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import { PrismaService } from '../../prisma/prisma.service';

import type { EngineResult } from './engine';

/** The minimal activity shape the CPM engine reads (a plan's active nodes). */
export interface ScheduleActivityRow {
  id: string;
  durationDays: number;
  type: ActivityType;
  constraintType: ConstraintType | null;
  constraintDate: Date | null;
}

/** The minimal dependency shape the CPM engine reads (a plan's active edges). */
export interface ScheduleEdgeRow {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

/**
 * Data-access for CPM recalculation (ADR-0022). It does three things, all under
 * the caller's transaction: take the plan-scoped write lock (shared with the
 * dependency cycle check, ADR-0021), load the plan's active nodes and edges for
 * the engine, and write the engine's results back with a single **batched raw
 * UPDATE** that touches ONLY the seven engine-owned columns — never `version`,
 * `updated_at`, or `updated_by`, so a recalculation cannot collide with, or be
 * mistaken for, a definition/progress edit.
 */
@Injectable()
export class ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Serialise this plan's schedule writes (ADR-0021/0022). Call inside a tx. */
  lockPlanForWrite(planId: string, db: Prisma.TransactionClient): Promise<void> {
    return acquirePlanWriteLock(db, planId);
  }

  /** A plan's active activities, projected to what the engine needs. */
  loadActivities(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ScheduleActivityRow[]> {
    return db.activity.findMany({
      where: { organizationId, planId, deletedAt: null },
      select: {
        id: true,
        durationDays: true,
        type: true,
        constraintType: true,
        constraintDate: true,
      },
    });
  }

  /** A plan's active dependency edges, projected to what the engine needs. */
  loadEdges(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ScheduleEdgeRow[]> {
    return db.activityDependency.findMany({
      where: { organizationId, planId, deletedAt: null },
      select: { predecessorId: true, successorId: true, type: true, lagDays: true },
    });
  }

  /**
   * Persist the engine's per-activity results in one statement via `unnest`,
   * matching each row by id and re-asserting the plan/org/active scope (so a stale
   * id can never write across a plan or tenant). Sets only the seven engine
   * columns; a no-op for an empty result set.
   */
  async writeResults(
    organizationId: string,
    planId: string,
    results: readonly EngineResult[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (results.length === 0) return;

    const ids = results.map((r) => r.activityId);
    const earlyStart = results.map((r) => r.earlyStart);
    const earlyFinish = results.map((r) => r.earlyFinish);
    const lateStart = results.map((r) => r.lateStart);
    const lateFinish = results.map((r) => r.lateFinish);
    const totalFloat = results.map((r) => r.totalFloat);
    const isCritical = results.map((r) => r.isCritical);
    const isNearCritical = results.map((r) => r.isNearCritical);

    const updated = await db.$executeRaw`
      UPDATE activities AS a
      SET
        early_start = v.early_start,
        early_finish = v.early_finish,
        late_start = v.late_start,
        late_finish = v.late_finish,
        total_float = v.total_float,
        is_critical = v.is_critical,
        is_near_critical = v.is_near_critical
      FROM unnest(
        ${ids}::uuid[],
        ${earlyStart}::date[],
        ${earlyFinish}::date[],
        ${lateStart}::date[],
        ${lateFinish}::date[],
        ${totalFloat}::int[],
        ${isCritical}::boolean[],
        ${isNearCritical}::boolean[]
      ) AS v(
        id, early_start, early_finish, late_start, late_finish,
        total_float, is_critical, is_near_critical
      )
      WHERE a.id = v.id
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
    `;

    // Loads and this write share one locked snapshot, so every computed id must
    // match an in-scope row. A shortfall means a stale/cross-scope id silently
    // no-op'd — a broken invariant; fail loud rather than half-write (ADR-0022).
    if (updated !== results.length) {
      throw new Error(
        `Schedule write affected ${updated} rows but expected ${results.length} for plan ${planId}.`,
      );
    }
  }
}
