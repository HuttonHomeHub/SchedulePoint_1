import { Injectable } from '@nestjs/common';
import type { PlanStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * A plan in the organisation, with the instant it was last touched by ANY of the three
 * sources a planner would call "a change" — the plan row itself, its activities, or its
 * dependencies.
 */
export interface RecentlyChangedRow {
  planId: string;
  planName: string;
  projectId: string;
  projectName: string;
  clientName: string;
  status: PlanStatus;
  changedAt: Date;
  /**
   * The `updated_by` of whichever source won the `GREATEST(...)`, or null. A Better Auth
   * user id (opaque TEXT), NOT yet a name — resolving it to a name is a separate,
   * org-scoped step, which is what stops this endpoint turning an arbitrary user id into
   * a display name.
   */
  changedByUserId: string | null;
}

/** A plan whose pen this caller holds, with any pending peer request on it. */
export interface HeldLockRow {
  planId: string;
  planName: string;
  requestedByUserId: string | null;
}

/**
 * Data access for the organisation overview.
 *
 * **The ordering key is `GREATEST(plan, latest activity, latest dependency)` and not
 * `plans.updated_at`** — spec §0.1's finding, and the reason for the two partial indexes
 * added by `20260818220000_overview_recently_changed_indexes`. Editing an activity does
 * not stamp its plan (`ScheduleRepository.writeResults` deliberately does not either,
 * ADR-0022), so a `plans.updated_at` ordering would rank a plan somebody has been working
 * in all morning below one whose name was corrected last week. There is a unit test that
 * fails against that naive ordering.
 *
 * The laterals run **once per active plan in the organisation**, so the cost is O(plans)
 * and not O(activities) — which is what the outer cap exists to bound. Measured on the
 * real schema before and after the indexes; the numbers are in the migration's comment.
 *
 * Every interpolation below is a Prisma parameter. SQL is never string-built
 * (`docs/SECURITY_STANDARDS.md`).
 */
@Injectable()
export class OverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The organisation's most recently changed plans, newest first.
   *
   * `status <> 'ARCHIVED'` rather than `= 'ACTIVE'`: a DRAFT plan is work in progress and
   * belongs on this list. Archived is the one status a planner has explicitly said they
   * are done with.
   */
  async findRecentlyChanged(params: {
    organizationId: string;
    take: number;
  }): Promise<RecentlyChangedRow[]> {
    const { organizationId, take } = params;

    const rows = await this.prisma.$queryRaw<
      Array<{
        plan_id: string;
        plan_name: string;
        project_id: string;
        project_name: string;
        client_name: string;
        status: PlanStatus;
        changed_at: Date;
        changed_by: string | null;
      }>
    >`
      SELECT p.id            AS plan_id,
             p.name          AS plan_name,
             pr.id           AS project_id,
             pr.name         AS project_name,
             cl.name         AS client_name,
             p.status        AS status,
             GREATEST(
               p.updated_at,
               COALESCE(a.at, 'epoch'::timestamptz),
               COALESCE(d.at, 'epoch'::timestamptz)
             )               AS changed_at,
             -- Attribution follows whichever source won. Ties resolve plan → activity →
             -- dependency, which is arbitrary but total: a tie means the same instant,
             -- so no ordering of the three is more correct than another, and picking one
             -- deterministically is what stops the row's name flickering between reloads.
             CASE
               WHEN p.updated_at >= COALESCE(a.at, 'epoch'::timestamptz)
                AND p.updated_at >= COALESCE(d.at, 'epoch'::timestamptz) THEN p.updated_by
               WHEN COALESCE(a.at, 'epoch'::timestamptz) >= COALESCE(d.at, 'epoch'::timestamptz)
                 THEN a.by
               ELSE d.by
             END             AS changed_by
        FROM plans p
        JOIN projects pr ON pr.id = p.project_id
        JOIN clients  cl ON cl.id = pr.client_id
        LEFT JOIN LATERAL (
          SELECT act.updated_at AS at, act.updated_by AS by
            FROM activities act
           WHERE act.plan_id = p.id AND act.deleted_at IS NULL
           ORDER BY act.updated_at DESC
           LIMIT 1
        ) a ON true
        LEFT JOIN LATERAL (
          SELECT dep.updated_at AS at, dep.updated_by AS by
            FROM dependencies dep
           WHERE dep.plan_id = p.id AND dep.deleted_at IS NULL
           ORDER BY dep.updated_at DESC
           LIMIT 1
        ) d ON true
       WHERE p.organization_id = ${organizationId}::uuid
         AND p.deleted_at IS NULL
         AND p.status <> 'ARCHIVED'::"PlanStatus"
       ORDER BY changed_at DESC, p.id ASC
       LIMIT ${take}
    `;

    return rows.map((row) => ({
      planId: row.plan_id,
      planName: row.plan_name,
      projectId: row.project_id,
      projectName: row.project_name,
      clientName: row.client_name,
      status: row.status,
      changedAt: row.changed_at,
      changedByUserId: row.changed_by,
    }));
  }

  /**
   * The plans whose edit-lock (ADR-0028) this caller currently holds, with any pending
   * peer request. Expiry is evaluated against `now()` server-side, exactly as the lock
   * module does — a lease that has lapsed is not held, whatever the row says.
   */
  async findHeldLocks(params: {
    organizationId: string;
    userId: string;
    take: number;
  }): Promise<HeldLockRow[]> {
    const { organizationId, userId, take } = params;

    const locks = await this.prisma.planLock.findMany({
      where: {
        organizationId,
        holderUserId: userId,
        expiresAt: { gt: new Date() },
        plan: { deletedAt: null },
      },
      select: {
        planId: true,
        requestedByUserId: true,
        plan: { select: { name: true } },
      },
      // Requested-first is the service's job (it is a presentation rank, not a storage
      // one); here the order is deterministic so the list does not shuffle between loads.
      orderBy: [{ acquiredAt: 'asc' }, { planId: 'asc' }],
      take,
    });

    return locks.map((lock) => ({
      planId: lock.planId,
      planName: lock.plan.name,
      requestedByUserId: lock.requestedByUserId,
    }));
  }

  /** How many invitations are still awaiting an answer. */
  async countPendingInvitations(organizationId: string): Promise<number> {
    return this.prisma.invitation.count({
      where: { organizationId, status: 'PENDING' },
    });
  }

  /**
   * How many soft-deleted clients, projects and plans are close enough to their retention
   * deadline to be worth telling somebody about.
   *
   * Counted across all three hierarchy tables, because the reader's question is "is any of
   * my deleted work about to go" and not "which table is it in". `deletedAt` is the clock
   * the expiry itself uses (ADR-0096 D2), so this count and that sweep read the same field
   * — a count derived from anything else would drift away from the thing it describes.
   *
   * Only called when retention is armed: on an unarmed host nothing expires at all, so
   * this number would be a deadline the product does not keep.
   */
  async countExpiringDeleted(params: { organizationId: string; before: Date }): Promise<number> {
    const { organizationId, before } = params;
    const where = { organizationId, deletedAt: { not: null, lt: before } } as const;

    const [clients, projects, plans] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.project.count({ where }),
      this.prisma.plan.count({ where }),
    ]);

    return clients + projects + plans;
  }

  /** Whether the organisation holds any active client — the "brand new" test. */
  async hasActiveClients(organizationId: string): Promise<boolean> {
    const found = await this.prisma.client.findFirst({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  /** Whether the organisation holds any active, non-archived plan. */
  async hasActivePlans(organizationId: string): Promise<boolean> {
    const found = await this.prisma.plan.findFirst({
      where: { organizationId, deletedAt: null, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Resolve user ids to display names **through the organisation's membership**, never
   * through `users` directly.
   *
   * That join is the control, not a convenience: resolving through `users` would let this
   * endpoint turn any user id in the system into a display name. An id that is not a
   * current member of THIS organisation resolves to nothing and the caller renders
   * "a former member" — which is also the honest answer, since somebody who has left is
   * exactly who a missing row usually is.
   */
  async resolveMemberNames(params: {
    organizationId: string;
    userIds: string[];
  }): Promise<Map<string, string>> {
    const { organizationId, userIds } = params;
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();

    const members = await this.prisma.orgMember.findMany({
      where: { organizationId, userId: { in: unique } },
      select: { userId: true, user: { select: { name: true } } },
    });

    return new Map(members.map((member) => [member.userId, member.user.name]));
  }
}
