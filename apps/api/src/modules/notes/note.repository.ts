import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type Note, Prisma } from '@prisma/client';
import type { ActivityNoteCount } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';

/** Fields a note edit may change (only the body; scope/parent are immutable). */
export interface NotePatch {
  body: string;
}

/**
 * Data-access for notes (ADR-0008, ADR-0046) — attributed, time-ordered threads on plans and
 * activities. Centralises the soft-delete filter (`deleted_at IS NULL`). Threads are keyset-
 * paginated **newest-first** (`created_at DESC, id DESC`), scoped by organisation and the parent
 * (plan for PLAN notes; activity for ACTIVITY notes) — the partial thread indexes serve them. Item
 * lookups are org-scoped (anti-IDOR). Soft-delete is LOCAL here (a directly-deleted note gets its
 * own fresh batch id, the dependency-leaf precedent); a parent-driven sweep is owned by the shared
 * {@link ../../common/hierarchy/hierarchy-lifecycle.service HierarchyLifecycleService}. Author names
 * for a page are resolved in one batched user lookup (no N+1).
 */
@Injectable()
export class NoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.NoteWhereInput = {}): Prisma.NoteWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.NoteUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Note> {
    return db.note.create({ data });
  }

  /** An active note scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Note | null> {
    return db.note.findFirst({ where: this.active({ id, organizationId }) });
  }

  /**
   * A page of a plan's PLAN-type notes, newest-first. Scoped by org + plan + `entity_type = 'PLAN'`
   * (an activity note is not a plan note even though it shares the plan id). Served by the
   * (plan_id, created_at, id) composite via a backward scan.
   */
  listByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<Note[]> {
    return this.page(
      this.active({
        organizationId: params.organizationId,
        planId: params.planId,
        entityType: 'PLAN',
      }),
      params,
    );
  }

  /**
   * A page of an activity's ACTIVITY-type notes, newest-first. Scoped by org + activity. Served by
   * the `idx_notes_activity_created` partial index.
   */
  listByActivity(params: {
    organizationId: string;
    activityId: string;
    take: number;
    cursor?: string;
  }): Promise<Note[]> {
    return this.page(
      this.active({ organizationId: params.organizationId, activityId: params.activityId }),
      params,
    );
  }

  /**
   * Per-activity active-note counts for a plan in ONE grouped query (no N+1) — the badge read.
   * Scoped by org + plan + `entity_type = 'ACTIVITY'`; served by the `idx_notes_plan_activity_counts`
   * partial index. Only activities with ≥1 active note appear; `activityId` is non-null on these rows.
   */
  async countActiveByActivityForPlan(
    organizationId: string,
    planId: string,
  ): Promise<ActivityNoteCount[]> {
    const groups = await this.prisma.note.groupBy({
      by: ['activityId'],
      where: this.active({ organizationId, planId, entityType: 'ACTIVITY' }),
      _count: { _all: true },
    });
    return groups
      .filter((g): g is typeof g & { activityId: string } => g.activityId !== null)
      .map((g) => ({ activityId: g.activityId, count: g._count._all }));
  }

  /**
   * Optimistic-locked body edit. Returns rows changed — `0` means a version conflict or the row is
   * gone (→ 409). Bumps `version` and stamps `updated_by` (the author, asserted upstream).
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: NotePatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.note.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * Soft-delete a single note — stamp `deletedAt`/`deleteBatchId`/`updatedBy` under a FRESH batch id,
   * mirroring the dependency-leaf branch of HierarchyLifecycleService (a distinct batch so a later
   * parent restore never resurrects an individually-deleted note). Guarded on `deletedAt: null` so a
   * concurrent delete of the same row is idempotent. Returns rows changed (0 = already gone).
   */
  async softDelete(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.note.updateMany({
      where: this.active({ id }),
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
    return result.count;
  }

  /**
   * Resolve a set of author (Better Auth user) ids to display names in ONE query. Returns a map of
   * id→name; ids not present (deleted/unknown user) are simply absent. `created_by` is TEXT with no
   * FK, so this is a best-effort directory lookup, never an authorisation input.
   */
  async findAuthorNames(authorIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(authorIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /** Shared keyset page — newest-first (created_at DESC, id DESC). */
  private page(
    where: Prisma.NoteWhereInput,
    params: { take: number; cursor?: string },
  ): Promise<Note[]> {
    return this.prisma.note.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }
}
