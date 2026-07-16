import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Activity,
  type ActivityStatus,
  type ActivityType,
  type ConstraintType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Fields an activity update may change (already converted to DB-ready values).
 * Split into DEFINITION fields (name/logic/graphics — Planner-owned) and PROGRESS
 * fields (status/%/actuals — Contributor-owned via the progress endpoint); the
 * repository is agnostic to the split, but the two callers each send only their
 * half. CPM output columns are engine-owned and never patched here.
 */
export interface ActivityPatch {
  // Definition
  name?: string;
  code?: string | null;
  description?: string | null;
  type?: ActivityType;
  durationMinutes?: number;
  constraintType?: ConstraintType | null;
  constraintDate?: Date | null;
  /** Secondary constraint (ADR-0035 §10): drives the backward pass; paired like the primary. */
  secondaryConstraintType?: ConstraintType | null;
  secondaryConstraintDate?: Date | null;
  /** The activity's own working-time calendar (ADR-0037, M5); null inherits the plan default. */
  calendarId?: string | null;
  laneIndex?: number;
  /** As-Late-As-Possible placement preference (ADR-0035 §11): display-only, never the pure passes. */
  scheduleAsLateAsPossible?: boolean;
  /** Visual-Planning placement (ADR-0033): hand-placed start, or null to clear it. */
  visualStart?: Date | null;
  // Progress
  status?: ActivityStatus;
  percentComplete?: number;
  actualStart?: Date | null;
  actualFinish?: Date | null;
  /** Explicit remaining work in minutes (M2, ADR-0035); null derives it from percent complete. */
  remainingDurationMinutes?: number | null;
  /** Suspend / resume dates (M2, ADR-0035 §4); resume floors the remaining work. */
  suspendDate?: Date | null;
  resumeDate?: Date | null;
  /** Expected-finish target (M4, ADR-0035 §9); resizes remaining work when the plan option is on. */
  expectedFinish?: Date | null;
}

/**
 * Data-access for activities (ADR-0008) — the leaf of the Client → Project →
 * Plan → Activity hierarchy. Centralises the soft-delete filter so no read
 * forgets `deletedAt: null`. Item lookups are scoped by organisation
 * (anti-IDOR); the list is scoped by both organisation and parent plan.
 * Delete/restore are handled by the shared HierarchyLifecycleService, so this
 * repository only covers create/read/update.
 */
@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ActivityWhereInput = {}): Prisma.ActivityWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ActivityUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity> {
    return db.activity.create({ data });
  }

  /** An active activity scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    return db.activity.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** An activity in an organisation in ANY state (active or soft-deleted) — used
   * to scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    return db.activity.findFirst({ where: { id, organizationId } });
  }

  /** A page of a plan's active activities (keyset cursor by id). */
  findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      where: this.active({ organizationId: params.organizationId, planId: params.planId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. Returns rows changed — `0` means a version conflict or the row is
   * gone, which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: ActivityPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.activity.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * Batch lane-position write in ONE `unnest` statement (TSLD M4): move each `{id, laneIndex,
   * version}` to its new lane, matching by id AND `version` (per-row optimistic lock) and
   * re-asserting the plan/org/active scope in the WHERE — so a stale or cross-plan/cross-tenant
   * id can never write. Bumps `version`/`updated_at`/`updated_by` (a user edit, unlike the
   * engine's lock-bypassing write). Returns rows changed; the caller compares it to the batch
   * size and, on a shortfall, rolls the transaction back — a partial move never persists. Mirrors
   * {@link ScheduleRepository.writeResults}'s single-round-trip shape (avoids a 2,000-row loop
   * exceeding Prisma's interactive-transaction timeout).
   */
  async updateLanePositions(
    organizationId: string,
    planId: string,
    positions: readonly { id: string; laneIndex: number; version: number }[],
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    if (positions.length === 0) return 0;
    const ids = positions.map((p) => p.id);
    const laneIndexes = positions.map((p) => p.laneIndex);
    const versions = positions.map((p) => p.version);

    return db.$executeRaw`
      UPDATE activities AS a
      SET lane_index = v.lane_index,
          version = a.version + 1,
          updated_by = ${updatedBy}::text,
          updated_at = now()
      FROM unnest(
        ${ids}::uuid[],
        ${laneIndexes}::int[],
        ${versions}::int[]
      ) AS v(id, lane_index, version)
      WHERE a.id = v.id
        AND a.version = v.version
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
    `;
  }
}
