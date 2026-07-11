import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActivityType,
  type ConstraintType,
  type DependencyType,
} from '@prisma/client';

import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import { PrismaService } from '../../prisma/prisma.service';

import type { EngineEdgeResult, EngineResult } from './engine';

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
  /** The dependency id — carried so the engine's per-edge driving flag can be written back. */
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

/** A plan's calendar as the engine needs it: the weekly mask + active dated exceptions. */
export interface ScheduleCalendarRow {
  workingWeekdays: number;
  exceptions: { date: Date; isWorking: boolean }[];
}

/** The read-side aggregate over a plan's persisted engine columns (C1). */
export interface ScheduleAggregate {
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  parkedConstraintCount: number;
  /** Max inclusive `early_finish` as `YYYY-MM-DD`; null if never calculated. */
  projectFinish: string | null;
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

  /**
   * A single grouped aggregate over a plan's active activities' persisted engine
   * columns — no recompute, no N+1. `early_finish` is cast to text so the date
   * crosses the boundary as `YYYY-MM-DD` with no timezone reinterpretation.
   */
  async summarise(organizationId: string, planId: string): Promise<ScheduleAggregate> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        activity_count: bigint;
        critical_count: bigint;
        near_critical_count: bigint;
        parked_constraint_count: bigint;
        project_finish: string | null;
      }>
    >`
      SELECT
        COUNT(*) AS activity_count,
        COUNT(*) FILTER (WHERE is_critical) AS critical_count,
        COUNT(*) FILTER (WHERE is_near_critical) AS near_critical_count,
        COUNT(*) FILTER (
          WHERE constraint_type IN ('MANDATORY_START', 'MANDATORY_FINISH')
        ) AS parked_constraint_count,
        to_char(MAX(early_finish), 'YYYY-MM-DD') AS project_finish
      FROM activities
      WHERE plan_id = ${planId}::uuid
        AND organization_id = ${organizationId}::uuid
        AND deleted_at IS NULL
    `;
    const row = rows[0]!;
    return {
      activityCount: Number(row.activity_count),
      criticalCount: Number(row.critical_count),
      nearCriticalCount: Number(row.near_critical_count),
      parkedConstraintCount: Number(row.parked_constraint_count),
      projectFinish: row.project_finish,
    };
  }

  /**
   * A plan's calendar (`working_weekdays`) plus its ACTIVE exceptions, date-ordered —
   * part of the recalculate snapshot (M5, ADR-0024). One Prisma call (with
   * `previewFeatures = []`, no `relationJoins`, it emits two short round trips: the
   * calendar row, then a single batched exceptions read — never a query-per-exception).
   * Scoped by org (anti-IDOR) and `deletedAt: null`; returns null if the calendar is
   * missing or soft-deleted, so the service falls back to all-days-work.
   */
  async loadPlanCalendar(
    organizationId: string,
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ScheduleCalendarRow | null> {
    const calendar = await db.calendar.findFirst({
      where: { id: calendarId, organizationId, deletedAt: null },
      select: {
        workingWeekdays: true,
        exceptions: {
          where: { deletedAt: null },
          orderBy: [{ date: 'asc' }],
          select: { date: true, isWorking: true },
        },
      },
    });
    return calendar ?? null;
  }

  /** A plan's active dependency edges, projected to what the engine needs. */
  loadEdges(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ScheduleEdgeRow[]> {
    return db.activityDependency.findMany({
      where: { organizationId, planId, deletedAt: null },
      select: { id: true, predecessorId: true, successorId: true, type: true, lagDays: true },
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

  /**
   * Persist the engine's per-edge driving flags in one `unnest` UPDATE, keyed by
   * dependency id and re-asserting the plan/org/active scope. Like {@link writeResults}
   * this sets ONLY the engine-owned `is_driving` column — never `version`/`updated_at`/
   * `updated_by` — so a recalculation stays invisible to optimistic locking (ADR-0022).
   * A no-op for an empty edge set.
   */
  async writeDrivingFlags(
    organizationId: string,
    planId: string,
    edges: readonly EngineEdgeResult[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (edges.length === 0) return;

    const ids = edges.map((e) => e.edgeId);
    const isDriving = edges.map((e) => e.isDriving);

    const updated = await db.$executeRaw`
      UPDATE dependencies AS d
      SET is_driving = v.is_driving
      FROM unnest(
        ${ids}::uuid[],
        ${isDriving}::boolean[]
      ) AS v(id, is_driving)
      WHERE d.id = v.id
        AND d.plan_id = ${planId}::uuid
        AND d.organization_id = ${organizationId}::uuid
        AND d.deleted_at IS NULL
    `;

    // Same locked-snapshot invariant as writeResults: every computed edge id must
    // match an in-scope active row, or a stale/cross-scope id silently no-op'd.
    if (updated !== edges.length) {
      throw new Error(
        `Driving-flag write affected ${updated} rows but expected ${edges.length} for plan ${planId}.`,
      );
    }
  }
}
