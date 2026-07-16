import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActivityType,
  type ConstraintType,
  type DependencyType,
  type LagCalendarSource,
} from '@prisma/client';

import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import { PrismaService } from '../../prisma/prisma.service';

import { MINUTES_PER_DAY } from './day-compat-calendar';
import type { EngineEdgeResult, EngineResult } from './engine';

/** The minimal activity shape the CPM engine reads (a plan's active nodes). */
export interface ScheduleActivityRow {
  id: string;
  durationMinutes: number;
  type: ActivityType;
  constraintType: ConstraintType | null;
  constraintDate: Date | null;
  /** Secondary constraint (ADR-0035 §10, M4): drives the backward pass only. */
  secondaryConstraintType: ConstraintType | null;
  secondaryConstraintDate: Date | null;
  /** Visual Planning hand-placement (ADR-0033); advisory input to the effective-Visual pass. */
  visualStart: Date | null;
  /** As-Late-As-Possible placement preference (ADR-0035 §11, M4): display-only, never the pure passes. */
  scheduleAsLateAsPossible: boolean;
  /** The activity's own calendar (ADR-0037, M5); null inherits the plan default. Resolved to a
   * port in the service and attached per-activity to the engine. */
  calendarId: string | null;
  /** Progress actuals (M2, ADR-0035 §1). The engine freezes a complete activity on these and
   * reschedules an in-progress one's remaining work. */
  actualStart: Date | null;
  actualFinish: Date | null;
  /** Reported progress; the service resolves the engine's `remainingMinutes` from
   * `remainingDurationMinutes` (explicit) else `durationMinutes × (1 − percentComplete)`. */
  percentComplete: number;
  remainingDurationMinutes: number | null;
  /** Resume date for a suspended in-progress activity (M2, ADR-0035 §4); floors the remaining work. */
  resumeDate: Date | null;
  /** Expected-finish target (M4, ADR-0035 §9); resizes remaining work when the plan option is on. */
  expectedFinish: Date | null;
}

/** The minimal dependency shape the CPM engine reads (a plan's active edges). */
export interface ScheduleEdgeRow {
  /** The dependency id — carried so the engine's per-edge driving flag can be written back. */
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagMinutes: number;
  /** The calendar the lag is measured on (ADR-0036 §6, M3); resolved to a port in the service. */
  lagCalendar: LagCalendarSource;
}

/**
 * A plan's calendar as the engine needs it: the weekly shift windows + active dated
 * exceptions with their replacement windows (ADR-0036 §2). Loaded as three batched
 * reads (calendar row, shift rows, exceptions joined to windows) — never per-window.
 */
export interface ScheduleCalendarRow {
  shifts: { weekday: number; startMinute: number; endMinute: number }[];
  exceptions: {
    startDate: Date;
    endDate: Date;
    windows: { startMinute: number; endMinute: number }[];
  }[];
}

/** The read-side aggregate over a plan's persisted engine columns (C1). */
export interface ScheduleAggregate {
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  /** Activities a mandatory pin drove into a broken relationship (ADR-0035 §7). */
  constraintViolationCount: number;
  /** Soft constraint warnings (today N15: a SNET dated before the data date). ADR-0035 §12. */
  constraintWarningCount: number;
  /** Max inclusive `early_finish` as `YYYY-MM-DD`; null if never calculated. */
  projectFinish: string | null;
}

/**
 * Data-access for CPM recalculation (ADR-0022). It does three things, all under
 * the caller's transaction: take the plan-scoped write lock (shared with the
 * dependency cycle check, ADR-0021), load the plan's active nodes and edges for
 * the engine, and write the engine's results back with a single **batched raw
 * UPDATE** that touches ONLY the thirteen engine-owned columns — never `version`,
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
        durationMinutes: true,
        type: true,
        constraintType: true,
        constraintDate: true,
        secondaryConstraintType: true,
        secondaryConstraintDate: true,
        visualStart: true,
        scheduleAsLateAsPossible: true,
        calendarId: true,
        actualStart: true,
        actualFinish: true,
        percentComplete: true,
        remainingDurationMinutes: true,
        resumeDate: true,
        expectedFinish: true,
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
        constraint_violation_count: bigint;
        constraint_warning_count: bigint;
        project_finish: string | null;
      }>
    >`
      SELECT
        COUNT(*) AS activity_count,
        COUNT(*) FILTER (WHERE is_critical) AS critical_count,
        COUNT(*) FILTER (WHERE is_near_critical) AS near_critical_count,
        -- Produce-and-flag: the engine-written flag (ADR-0035 §7), read back like is_critical.
        COUNT(*) FILTER (WHERE constraint_violated) AS constraint_violation_count,
        -- N15 (ADR-0035 §12): a SNET dated before the plan's data date — derived from inputs, so it
        -- matches the engine's own count without a stored column. A null data date yields no warning.
        COUNT(*) FILTER (
          WHERE constraint_type = 'SNET'
            AND constraint_date < (SELECT planned_start FROM plans WHERE id = ${planId}::uuid)
        ) AS constraint_warning_count,
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
      constraintViolationCount: Number(row.constraint_violation_count),
      constraintWarningCount: Number(row.constraint_warning_count),
      projectFinish: row.project_finish,
    };
  }

  /**
   * A plan's calendar shift windows plus its ACTIVE exceptions and their replacement
   * windows, date-ordered — part of the recalculate snapshot (M5, ADR-0024/0036). Emits
   * batched reads (the calendar row, its shift rows, then the exceptions joined to their
   * windows — never a query-per-window). Scoped by org (anti-IDOR) and `deletedAt: null`;
   * returns null if the calendar is missing or soft-deleted, so the service falls back to
   * all-days-work.
   */
  async loadPlanCalendar(
    organizationId: string,
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ScheduleCalendarRow | null> {
    const calendar = await db.calendar.findFirst({
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
   * Persist the engine's per-activity results in one statement via `unnest`,
   * matching each row by id and re-asserting the plan/org/active scope (so a stale
   * id can never write across a plan or tenant). Sets only the thirteen engine
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
    // The engine works in minutes (ADR-0036); the day-denominated public columns
    // `total_float` / `visual_drift_days` are kept unchanged (ADR-0036 §7) by dividing
    // by the fixed M = 1440 factor. Exact for the full-day compat calendar (M1).
    const totalFloat = results.map((r) => Math.round(r.totalFloat / MINUTES_PER_DAY));
    // Free float (M6-F1, ADR-0035 §17–§20) — engine-owned like total_float, day-denominated (ADR-0036 §7).
    const freeFloat = results.map((r) => Math.round(r.freeFloat / MINUTES_PER_DAY));
    const isCritical = results.map((r) => r.isCritical);
    const isNearCritical = results.map((r) => r.isNearCritical);
    const constraintViolated = results.map((r) => r.constraintViolated);
    // Effective-Visual outputs (ADR-0033) — written by the same batch as the CPM columns, so they
    // stay engine-owned and out of the version/updated_at optimistic-lock path.
    const visualEffectiveStart = results.map((r) => r.visualEffectiveStart);
    const visualEffectiveFinish = results.map((r) => r.visualEffectiveFinish);
    const visualConflict = results.map((r) => r.visualConflict);
    const visualDriftDays = results.map((r) =>
      r.visualDriftMinutes === null ? null : Math.round(r.visualDriftMinutes / MINUTES_PER_DAY),
    );

    const updated = await db.$executeRaw`
      UPDATE activities AS a
      SET
        early_start = v.early_start,
        early_finish = v.early_finish,
        late_start = v.late_start,
        late_finish = v.late_finish,
        total_float = v.total_float,
        free_float = v.free_float,
        is_critical = v.is_critical,
        is_near_critical = v.is_near_critical,
        constraint_violated = v.constraint_violated,
        visual_effective_start = v.visual_effective_start,
        visual_effective_finish = v.visual_effective_finish,
        visual_conflict = v.visual_conflict,
        visual_drift_days = v.visual_drift_days
      FROM unnest(
        ${ids}::uuid[],
        ${earlyStart}::date[],
        ${earlyFinish}::date[],
        ${lateStart}::date[],
        ${lateFinish}::date[],
        ${totalFloat}::int[],
        ${freeFloat}::int[],
        ${isCritical}::boolean[],
        ${isNearCritical}::boolean[],
        ${constraintViolated}::boolean[],
        ${visualEffectiveStart}::date[],
        ${visualEffectiveFinish}::date[],
        ${visualConflict}::boolean[],
        ${visualDriftDays}::int[]
      ) AS v(
        id, early_start, early_finish, late_start, late_finish,
        total_float, free_float, is_critical, is_near_critical, constraint_violated,
        visual_effective_start, visual_effective_finish, visual_conflict, visual_drift_days
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
