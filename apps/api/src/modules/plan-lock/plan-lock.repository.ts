import { Injectable } from '@nestjs/common';
import type { PlanLock, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** A resolved actor profile for a holder / requester (never includes credentials). */
export interface LockActorRow {
  id: string;
  name: string;
  email: string;
}

/** The subset of a lock row the raw heartbeat returns (structurally a {@link PlanLock}). */
export interface HeartbeatRow {
  planId: string;
  organizationId: string;
  holderUserId: string;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
  requestedByUserId: string | null;
  requestedAt: Date | null;
}

/**
 * PlanLock data-access (ADR-0028). The only place that talks to Prisma for the
 * edit-lock. Acquire/request/hand-off/take-over all mutate the single row keyed by
 * `plan_id` and are called by the service **inside the plan advisory-lock
 * transaction**, so the read-then-write they perform can't interleave. The
 * heartbeat is the one hot-path exception: a single atomic conditional `UPDATE …
 * RETURNING` on its own connection, no advisory lock.
 */
@Injectable()
export class PlanLockRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Read the lock row for a plan (org-scoped, defensive), or null when free. */
  find(
    planId: string,
    organizationId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanLock | null> {
    return tx.planLock.findFirst({ where: { planId, organizationId } });
  }

  /**
   * Grant the lease to `holderUserId`, **clearing any pending request** — the
   * write for a fresh acquire, an expired reclaim, a steal/take-over, and a
   * hand-off (all of which change or (re)assert the holder). Upsert keyed by the
   * plan id keeps the one-row-per-plan invariant.
   */
  writeLeaseToHolder(
    tx: Prisma.TransactionClient,
    params: {
      planId: string;
      organizationId: string;
      holderUserId: string;
      now: Date;
      expiresAt: Date;
    },
  ): Promise<PlanLock> {
    const { planId, organizationId, holderUserId, now, expiresAt } = params;
    return tx.planLock.upsert({
      where: { planId },
      create: {
        planId,
        organizationId,
        holderUserId,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt,
      },
      update: {
        organizationId,
        holderUserId,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt,
        // A holder change (or reclaim) always drops a stale pending request.
        requestedByUserId: null,
        requestedAt: null,
      },
    });
  }

  /**
   * Renew the caller's OWN live lease (a re-acquire from another tab), extending
   * the lease but **preserving** any pending request so the holder still sees it.
   * Returns the rows changed (0 ⇒ the caller is not the holder).
   */
  async renewOwnLease(
    tx: Prisma.TransactionClient,
    params: {
      planId: string;
      organizationId: string;
      holderUserId: string;
      now: Date;
      expiresAt: Date;
    },
  ): Promise<number> {
    const { planId, organizationId, holderUserId, now, expiresAt } = params;
    const res = await tx.planLock.updateMany({
      where: { planId, organizationId, holderUserId },
      data: { heartbeatAt: now, expiresAt },
    });
    return res.count;
  }

  /**
   * The heartbeat hot path: atomically renew the lease **iff** the caller still
   * holds a live one. A single conditional `UPDATE … RETURNING` — no advisory lock.
   * Returns the renewed row, or null when the caller no longer holds the pen (lease
   * stolen or expired ⇒ the service raises `PLAN_EDIT_LOCK_LOST`).
   */
  async heartbeat(params: {
    planId: string;
    organizationId: string;
    holderUserId: string;
    now: Date;
    expiresAt: Date;
  }): Promise<HeartbeatRow | null> {
    const { planId, organizationId, holderUserId, now, expiresAt } = params;
    const rows = await this.prisma.$queryRaw<HeartbeatRow[]>`
      UPDATE plan_locks
      SET heartbeat_at = ${now}, expires_at = ${expiresAt}, updated_at = ${now}
      WHERE plan_id = ${planId}::uuid
        AND organization_id = ${organizationId}::uuid
        AND holder_user_id = ${holderUserId}
        AND expires_at > ${now}
      RETURNING
        plan_id AS "planId",
        organization_id AS "organizationId",
        holder_user_id AS "holderUserId",
        acquired_at AS "acquiredAt",
        heartbeat_at AS "heartbeatAt",
        expires_at AS "expiresAt",
        requested_by_user_id AS "requestedByUserId",
        requested_at AS "requestedAt"
    `;
    return rows[0] ?? null;
  }

  /** Stamp a pending peer request-control on a held lock (newest request wins). */
  async stampRequest(
    tx: Prisma.TransactionClient,
    params: { planId: string; organizationId: string; requesterId: string; now: Date },
  ): Promise<number> {
    const { planId, organizationId, requesterId, now } = params;
    const res = await tx.planLock.updateMany({
      where: { planId, organizationId },
      data: { requestedByUserId: requesterId, requestedAt: now },
    });
    return res.count;
  }

  /**
   * Delete the lock row (release). Scoped to the holder unless `holderUserId` is
   * omitted (a force-release by an override-holder). Idempotent — returns the count.
   */
  async remove(params: {
    planId: string;
    organizationId: string;
    holderUserId?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<number> {
    const { planId, organizationId, holderUserId, tx } = params;
    const db = tx ?? this.prisma;
    const res = await db.planLock.deleteMany({
      where: { planId, organizationId, ...(holderUserId ? { holderUserId } : {}) },
    });
    return res.count;
  }

  /** Resolve holder/requester profiles for the status projection (deduped, ≤ 2 ids). */
  async findActors(
    userIds: readonly string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, LockActorRow>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const users = await tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }
}
