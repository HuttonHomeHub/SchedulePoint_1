import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type Note, Prisma } from '@prisma/client';
import type { ActivityNoteCount } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';

/** Rows per page of an export's note read; small enough that a page of 5,000-character notes is modest. */
const EXPORT_READ_PAGE = 500;

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

  /**
   * Insert a batch of brand-new notes inside the caller's transaction (the schedule-interchange commit,
   * ADR-0050). Ids and `createdAt` are supplied so the caller can order the thread deterministically; all
   * rows are new, so there is no optimistic-lock or audit ceremony beyond the create defaults. One
   * `createMany` keeps the statement count independent of the number of notes — the import runs inside a
   * single interactive transaction with a time budget.
   */
  async createManyForImport(
    rows: readonly Prisma.NoteCreateManyInput[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.note.createMany({ data: [...rows] });
  }

  /**
   * The active notes an export can carry: a plan's ACTIVITY notes whose activity is itself live. A note on
   * a soft-deleted activity is deleted with it, so it must neither take a slot under the cap nor be
   * counted as left out.
   */
  private exportableActivityNotes(organizationId: string, planId: string): Prisma.NoteWhereInput {
    return this.active({
      organizationId,
      planId,
      entityType: 'ACTIVITY',
      activity: { deletedAt: null },
    });
  }

  /**
   * A plan's exportable ACTIVITY notes, oldest first (schedule interchange). Only the columns the file
   * needs are read, never the author, so nothing about who wrote a note can reach a file. Ordered by
   * `created_at, id` — the plan's `(plan_id, created_at, id)` index — so the order a thread reads in is
   * the order the file carries.
   *
   * **Bounded in rows and in bytes, and paged**, so a plan holding a great many large notes cannot make
   * one export hold them all in memory: reading stops at `maxNotes` rows or once the summed body size
   * would pass `maxBytes`, with `truncated` saying so. At most one page beyond the budget is ever held.
   */
  async findActiveActivityNotesForExport(
    organizationId: string,
    planId: string,
    limits: { maxNotes: number; maxBytes: number },
  ): Promise<{ notes: { activityId: string; body: string }[]; truncated: boolean }> {
    const where = this.exportableActivityNotes(organizationId, planId);
    const notes: { activityId: string; body: string }[] = [];
    let bytes = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.note.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: EXPORT_READ_PAGE,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        select: { id: true, activityId: true, body: true },
      });
      for (const row of page) {
        if (row.activityId === null) continue;
        const size = Buffer.byteLength(row.body, 'utf8');
        if (notes.length >= limits.maxNotes || bytes + size > limits.maxBytes) {
          return { notes, truncated: true };
        }
        notes.push({ activityId: row.activityId, body: row.body });
        bytes += size;
      }
      const last = page[page.length - 1];
      if (page.length < EXPORT_READ_PAGE || last === undefined) return { notes, truncated: false };
      cursor = last.id;
    }
  }

  /**
   * How many notes of one kind a plan holds, for the export report's "not written" counts. ACTIVITY
   * counts the same population the export read draws from, so the subtraction is like for like.
   */
  countActiveForPlan(
    organizationId: string,
    planId: string,
    entityType: 'PLAN' | 'ACTIVITY',
  ): Promise<number> {
    return this.prisma.note.count({
      where:
        entityType === 'ACTIVITY'
          ? this.exportableActivityNotes(organizationId, planId)
          : this.active({ organizationId, planId, entityType }),
    });
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

  /** Shared keyset page — newest-first (created_at DESC, id DESC).
   *
   * soft-delete: any-state — the `where` is passed in, and every caller builds it with
   * `this.active(...)`; the filter is stated at the caller, not here. */
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
