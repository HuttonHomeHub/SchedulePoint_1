import { Injectable } from '@nestjs/common';
import type { PlanStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { expiredInvitationWhere, liveInvitationWhere } from '../invitations/invitation-predicates';

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
   * When this plan's schedule was last computed, or `null` if it never has been.
   *
   * **`null` is a state, not a missing value.** "Never calculated" and "calculated and then
   * edited" are different facts a planner acts on differently, and collapsing them into one
   * "stale" flag is the absence-a-reader-cannot-distinguish-from-a-fact defect (ADR-0073 C3.1).
   */
  scheduleComputedAt: Date | null;
  /**
   * Whether the plan has been touched since that computation — so the dates on it are the engine's
   * answer to an older question.
   *
   * **Derived here in TypeScript rather than as a fourth SQL column, and that is deliberate.** The
   * comparison is `changedAt > scheduleComputedAt`, and `changedAt` is the `GREATEST(...)` the
   * query already computes. PostgreSQL cannot reference a select-list alias from the same select
   * list, so an SQL form would have to REPEAT that three-term expression — two copies of the rule
   * for what "changed" means, drifting invisibly the first time one is edited (the ADR-0065
   * `routeOrthogonal` argument). One expression, compared once.
   *
   * It is a SERVER fact all the same: the client is told the answer, never the inputs plus the
   * rule, because "has this been edited since it was calculated" is a scheduling question and
   * `apps/web` has no business holding a second opinion about it.
   */
  editedSinceCalculated: boolean;
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
/**
 * Where one plan stands, read entirely from persisted columns.
 *
 * **The CPM engine is not called and not imported** — every field here is a column the last
 * recalculation wrote (`is_critical`, `early_finish`, the four produce-and-flag booleans) or a
 * baseline's denormalised `captured_project_finish`. So the ADR-0034 recalculation parity gate is
 * untouched **by construction** rather than by argument, and
 * `plan-standing-engine-free.structural.spec.ts` says so in a test rather than in this sentence.
 */
export interface PlanStandingRow {
  planId: string;
  planName: string;
  projectName: string;
  clientName: string;
  status: PlanStatus;
  scheduleComputedAt: Date | null;
  editedSinceCalculated: boolean;
  /** `MAX(early_finish)`. Null when the plan has no active activities, or was never calculated. */
  projectFinish: string | null;
  activityCount: number;
  /** The active baseline's frozen project finish, if there is an active baseline carrying one. */
  baselineFinish: string | null;
  baselineName: string | null;
  /** The factor that baseline froze, for converting a working-time walk into days (ADR-0068). */
  baselineHoursPerDayMinutes: number | null;
  /** The plan's calendar, so movement can be walked on it. Null means all-days-work. */
  planCalendarId: string | null;
  constraintViolatedCount: number;
  loeNoSpanCount: number;
  resourceDriverMissingCount: number;
  visualConflictCount: number;
}

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
        schedule_computed_at: Date | null;
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
             p.schedule_computed_at AS schedule_computed_at,
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
      scheduleComputedAt: row.schedule_computed_at,
      // A plan that has never been calculated is NOT "edited since" — there is no since. It is its
      // own state, and the row says so in its own words rather than through this flag.
      editedSinceCalculated:
        row.schedule_computed_at !== null &&
        row.changed_at.getTime() > row.schedule_computed_at.getTime(),
      changedByUserId: row.changed_by,
    }));
  }

  /**
   * The plans whose edit-lock (ADR-0028) this caller currently holds, with any pending
   * peer request. Expiry is evaluated against `now()` server-side, exactly as the lock
   * module does — a lease that has lapsed is not held, whatever the row says.
   */

  /**
   * Where each of the named plans stands: its finish, its movement against the active baseline, and
   * the counts the last recalculation flagged.
   *
   * **One query for N plans, never one per plan.** The aggregate is grouped over `activities` and
   * the baseline is a `LEFT JOIN LATERAL … LIMIT 1` — a one-row-per-plan indexed lookup on
   * `uq_baselines_plan_active`, never a read of `baseline_activities`. `captured_project_finish` is
   * a denormalised plan-level date whose own schema comment says it exists so a list renders
   * without loading snapshot rows; this is that reader.
   *
   * **The counting columns are read exactly as `ScheduleRepository.summarise` reads them**
   * (`schedule.repository.ts:375-416`) — the same `COUNT(*) FILTER (WHERE …)` over the same
   * plan-scoped, `deleted_at IS NULL` set. Two aggregates over the same columns that disagreed
   * would be the ADR-0065 `routeOrthogonal` defect: each right alone, differing only for somebody
   * who opened one plan's summary and the landing in the same minute.
   *
   * **No movement is computed here.** This returns the two dates and the frozen day factor; turning
   * them into working days needs the plan's calendar walker, which is the service's job (ADR-0024's
   * port pattern). A repository that resolved calendars would be doing scheduling.
   *
   * **The engine is not imported.** Every column is one the last recalculation persisted.
   */
  async findPlanStanding(params: {
    organizationId: string;
    planIds: readonly string[];
  }): Promise<PlanStandingRow[]> {
    const { organizationId, planIds } = params;
    if (planIds.length === 0) return [];

    const rows = await this.prisma.$queryRaw<
      Array<{
        plan_id: string;
        plan_name: string;
        project_name: string;
        client_name: string;
        status: PlanStatus;
        schedule_computed_at: Date | null;
        last_touched_at: Date;
        project_finish: string | null;
        activity_count: bigint;
        baseline_finish: string | null;
        baseline_name: string | null;
        baseline_hours_per_day_minutes: number | null;
        plan_calendar_id: string | null;
        constraint_violated_count: bigint;
        loe_no_span_count: bigint;
        resource_driver_missing_count: bigint;
        visual_conflict_count: bigint;
      }>
    >`
      SELECT p.id                   AS plan_id,
             p.name                 AS plan_name,
             pr.name                AS project_name,
             cl.name                AS client_name,
             p.status               AS status,
             p.schedule_computed_at AS schedule_computed_at,
             p.calendar_id          AS plan_calendar_id,
             -- The same three-source "changed" rule the recently-changed read uses, so the two
             -- sections cannot disagree about whether a plan has been touched.
             GREATEST(
               p.updated_at,
               COALESCE(a.last_activity_at, 'epoch'::timestamptz),
               COALESCE(d.at, 'epoch'::timestamptz)
             )                      AS last_touched_at,
             to_char(a.project_finish, 'YYYY-MM-DD') AS project_finish,
             COALESCE(a.activity_count, 0)             AS activity_count,
             COALESCE(a.constraint_violated_count, 0)  AS constraint_violated_count,
             COALESCE(a.loe_no_span_count, 0)          AS loe_no_span_count,
             COALESCE(a.resource_driver_missing_count, 0) AS resource_driver_missing_count,
             COALESCE(a.visual_conflict_count, 0)      AS visual_conflict_count,
             to_char(b.captured_project_finish, 'YYYY-MM-DD') AS baseline_finish,
             b.name                 AS baseline_name,
             b.hours_per_day_minutes AS baseline_hours_per_day_minutes
        FROM plans p
        JOIN projects pr ON pr.id = p.project_id
        JOIN clients  cl ON cl.id = pr.client_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)                                        AS activity_count,
                 MAX(act.early_finish)                           AS project_finish,
                 MAX(act.updated_at)                             AS last_activity_at,
                 COUNT(*) FILTER (WHERE act.constraint_violated)  AS constraint_violated_count,
                 COUNT(*) FILTER (WHERE act.loe_no_span)          AS loe_no_span_count,
                 COUNT(*) FILTER (WHERE act.resource_driver_missing)
                                                                  AS resource_driver_missing_count,
                 COUNT(*) FILTER (WHERE act.visual_conflict)      AS visual_conflict_count
            FROM activities act
           WHERE act.plan_id = p.id AND act.deleted_at IS NULL
        ) a ON true
        LEFT JOIN LATERAL (
          SELECT dep.updated_at AS at
            FROM dependencies dep
           WHERE dep.plan_id = p.id AND dep.deleted_at IS NULL
           ORDER BY dep.updated_at DESC
           LIMIT 1
        ) d ON true
        -- At most one active baseline per plan is guaranteed by uq_baselines_plan_active; the
        -- LIMIT is belt-and-braces so a future relaxation degrades to "one of them" rather than to
        -- duplicate plan rows silently doubling the section.
        LEFT JOIN LATERAL (
          SELECT bl.name, bl.captured_project_finish, bl.hours_per_day_minutes
            FROM baselines bl
           WHERE bl.plan_id = p.id AND bl.is_active AND bl.deleted_at IS NULL
           LIMIT 1
        ) b ON true
       WHERE p.organization_id = ${organizationId}::uuid
         AND p.id = ANY(${[...planIds]}::uuid[])
         AND p.deleted_at IS NULL
         AND p.status <> 'ARCHIVED'::"PlanStatus"
    `;

    return rows.map((row) => ({
      planId: row.plan_id,
      planName: row.plan_name,
      projectName: row.project_name,
      clientName: row.client_name,
      status: row.status,
      scheduleComputedAt: row.schedule_computed_at,
      editedSinceCalculated:
        row.schedule_computed_at !== null &&
        row.last_touched_at.getTime() > row.schedule_computed_at.getTime(),
      projectFinish: row.project_finish,
      activityCount: Number(row.activity_count),
      baselineFinish: row.baseline_finish,
      baselineName: row.baseline_name,
      baselineHoursPerDayMinutes: row.baseline_hours_per_day_minutes,
      planCalendarId: row.plan_calendar_id,
      constraintViolatedCount: Number(row.constraint_violated_count),
      loeNoSpanCount: Number(row.loe_no_span_count),
      resourceDriverMissingCount: Number(row.resource_driver_missing_count),
      visualConflictCount: Number(row.visual_conflict_count),
    }));
  }

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

  /**
   * How many invitations are still awaiting an answer, split into the two facts a reader can act
   * on differently: one they can chase, and one they must re-send.
   *
   * **Both are counted against ONE instant**, taken once here and passed to both predicates. Two
   * instants would let an invitation expiring between them land in neither count or in both, and
   * the landing would print a total that disagrees with the list it sends the reader to — which is
   * the whole defect this replaces.
   *
   * This method used to be `countPendingInvitations` and filtered on `status` alone: it counted
   * soft-deleted rows the list excluded, and counted lapsed ones `accept()` refuses. The predicate
   * now lives in `invitation-predicates.ts` and is the same one `InvitationRepository` uses, so the
   * count and the list cannot mean different things by `pending` again.
   */
  async countInvitations(organizationId: string): Promise<{ live: number; expired: number }> {
    const now = new Date();
    const [live, expired] = await Promise.all([
      this.prisma.invitation.count({ where: liveInvitationWhere(organizationId, now) }),
      this.prisma.invitation.count({ where: expiredInvitationWhere(organizationId, now) }),
    ]);
    return { live, expired };
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

  /**
   * Resolve remembered plan ids to their **current** names, within the caller's organisation.
   *
   * **The filter IS the authorisation**, and that is why the organisation id comes from the
   * already-resolved scope rather than from a request parameter: an id belonging to another
   * organisation matches nothing here, which is the same outcome as an id that never existed. The
   * caller cannot tell those apart, and cannot tell either from a plan that has been deleted — the
   * anti-oracle property the whole feature rests on (ADR-0098 §4.9).
   *
   * **Archived plans ARE returned**, which is a deliberate departure from `findRecentlyChanged`.
   * There, archiving is how a planner says "stop showing me this" about the organisation's work.
   * This list is the reader's own history: a planner who archives the plan they have been in all
   * morning and then cannot get back to it would be surprised by a rule that reads as tidiness.
   *
   * Order is **not** decided here. The caller's order is the browser's recency, which the server
   * has no basis to improve on, so the service re-orders by the request — this method filters.
   */
  async resolveRecentPlans(params: {
    organizationId: string;
    planIds: readonly string[];
  }): Promise<{ planId: string; planName: string; projectName: string; clientName: string }[]> {
    const { organizationId, planIds } = params;
    if (planIds.length === 0) return [];

    const rows = await this.prisma.plan.findMany({
      where: {
        id: { in: [...planIds] },
        organizationId,
        deletedAt: null,
        // A plan whose project or client has been deleted is unreachable, so it must not be
        // offered — the cascade stamps the plan too, but this is stated rather than relied upon.
        project: { deletedAt: null, client: { deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    });

    return rows.map((row) => ({
      planId: row.id,
      planName: row.name,
      projectName: row.project.name,
      clientName: row.project.client.name,
    }));
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
