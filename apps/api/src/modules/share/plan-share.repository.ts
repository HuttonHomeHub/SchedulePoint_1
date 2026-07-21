import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type PlanShare, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access for `plan_shares` (Stage F, ADR-0051) — the External-Guest per-plan
 * share grants. A share link is a revocable, optionally-expiring, READ-ONLY bearer
 * grant to EXACTLY ONE plan (ADR-0051 §1). This repository centralises the soft-delete
 * filter (`deleted_at IS NULL`) and the liveness predicate the guest guard needs.
 *
 * Scope/IDOR and permission checks are the caller's job (the F-M2 ShareService does
 * `resolveScope` + `assertCan('plan:share')` and copies `organization_id` from the
 * resolved plan before calling {@link create}); this repository owns only data access.
 * The parent-driven cascade soft-delete is owned by the shared
 * {@link ../../common/hierarchy/hierarchy-lifecycle.service HierarchyLifecycleService}
 * (F-M1 Task 4), which sweeps a plan's live links by `plan_id` under the plan's
 * `delete_batch_id` with a plain `updateMany` — NOT a method here (the Note precedent:
 * the sweep is a join-free `updateMany` on the transaction handle).
 *
 * No NestJS module is wired yet — this is the F-M1 (dark) data layer; the management
 * endpoints (F-M2) and guest read path (F-M3) consume it later.
 */
@Injectable()
export class PlanShareRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.PlanShareWhereInput = {}): Prisma.PlanShareWhereInput {
    return { ...where, deletedAt: null };
  }

  /**
   * Insert a new share grant. `organization_id` MUST have been copied from the resolved
   * plan by the caller (never client input — the denormalised-scope invariant), and
   * `token_hash` MUST be the SHA-256 hex of the freshly-minted raw token (the raw value
   * is returned to the caller once and never stored).
   */
  create(
    data: Prisma.PlanShareUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanShare> {
    return db.planShare.create({ data });
  }

  /**
   * Resolve a bearer token's hash to its LIVE grant, evaluated against now(): the row
   * matches `token_hash`, is not revoked (`revoked_at IS NULL`), is not soft-deleted
   * (`deleted_at IS NULL`), and is unexpired (`expires_at IS NULL OR expires_at > now()`).
   * Backed by the unique `token_hash` index. Returns `null` on any miss.
   *
   * NOTE — the live-PLAN re-check is DELIBERATELY NOT done here. ADR-0051 §5 also requires
   * the referenced plan to be active (`plans.deleted_at IS NULL`); the `ShareTokenGuard`
   * (F-M1 Task 3) performs that re-check because it loads the plan anyway to build the
   * `GuestPrincipal`. This method answers only "is the grant ROW itself live?".
   */
  findLiveByTokenHash(
    tokenHash: string,
    now: Date = new Date(),
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanShare | null> {
    return db.planShare.findFirst({
      where: this.active({
        tokenHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      }),
    });
  }

  /**
   * A plan's ACTIVE (not soft-deleted) share links, newest-first — the management list
   * (F-M2). Scoped by org + plan (anti-IDOR: the caller passes the resolved plan's
   * `organization_id`). Served by the `idx_plan_shares_plan_id` partial index (an
   * in-memory sort on `created_at DESC` at the tiny per-plan link count). Includes both
   * live and revoked-but-not-deleted links (the list shows revoked links too).
   */
  listActiveByPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanShare[]> {
    return db.planShare.findMany({
      where: this.active({ organizationId, planId }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * An active share link scoped to its organisation (anti-IDOR) — the management item
   * lookup (F-M2 revoke/read). Includes revoked links (they are still active rows).
   */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanShare | null> {
    return db.planShare.findFirst({ where: this.active({ id, organizationId }) });
  }

  /**
   * Revoke a link — the one-way live → dead transition (ADR-0051 §5): stamp `revoked_at`
   * = now() and `updated_by`, bumping `version`. Guarded on `deleted_at IS NULL AND
   * revoked_at IS NULL` so it is idempotent (a second revoke, or revoking a deleted /
   * unknown row, matches 0 and never moves an existing `revoked_at`). Returns rows
   * changed (`0` = already revoked / gone). Effect is immediate — the guard resolves live
   * on the next guest request (no token cache in v1).
   */
  async setRevoked(
    id: string,
    organizationId: string,
    actorId: string,
    now: Date = new Date(),
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.planShare.updateMany({
      where: this.active({ id, organizationId, revokedAt: null }),
      data: { revokedAt: now, updatedBy: actorId, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * Best-effort COALESCED guest-access telemetry (ADR-0051 §7): stamp `last_accessed_at`
   * without bumping `version` or `updated_at` semantics-of-an-edit (a derived-vs-edited
   * separation, like the engine columns). Called at most once per short interval per link
   * by the guest read path (F-M3). Guarded on `deleted_at IS NULL`.
   */
  async touchLastAccessed(
    id: string,
    now: Date = new Date(),
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.planShare.updateMany({
      where: this.active({ id }),
      data: { lastAccessedAt: now },
    });
    return result.count;
  }

  /**
   * Soft-delete a single link directly (its OWN fresh batch id — the dependency-leaf /
   * note precedent), distinct from the plan-driven cascade batch so a later plan restore
   * never resurrects an individually-deleted link. Guarded on `deleted_at IS NULL` for
   * idempotency. Returns rows changed (0 = already gone). (Reserved for a future
   * hard-delete management action; not wired in F-M1.)
   */
  async softDelete(
    id: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.planShare.updateMany({
      where: this.active({ id, organizationId }),
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
    return result.count;
  }
}
