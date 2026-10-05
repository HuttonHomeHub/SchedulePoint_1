import { Injectable } from '@nestjs/common';
import { Prisma, type Activity } from '@prisma/client';
import { CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireOrgCrossPlanLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { markScheduleInputsChanged } from '../../common/schedule-inputs/mark-schedule-inputs-changed';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityRepository } from '../activities/activity.repository';
import { daysToMinutes } from '../activities/day-factor';
import { ActivityHistoryRecorder } from '../activity-history/activity-history.recorder';
import { CalendarRepository } from '../calendars/calendar.repository';
import type { WithLagDayFactor } from '../dependencies/lag-day-factor';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { wouldCreatePlanCycle } from './cross-plan-cycle-detector';
import {
  CrossPlanDependencyRepository,
  type CrossPlanDependencyWithEndpoints,
} from './cross-plan-dependency.repository';
import { attachCrossPlanLagDayFactors } from './cross-plan-lag-calendar';
import type { CreateCrossPlanDependencyDto } from './dto/create-cross-plan-dependency.dto';

/** A cross-plan link carrying the factor its `lagDays` is measured in (#385, api-reviewer A1). */
export type CrossPlanDependencyWithFactor = WithLagDayFactor<CrossPlanDependencyWithEndpoints>;

/** Machine-readable reasons carried in a cross-plan {@link ConflictError}/{@link ValidationError}. */
export const CROSS_PLAN_DEPENDENCY_CONFLICT = {
  /** A cross-plan link with this (predecessor, successor, type) already exists (N33). */
  DUPLICATE_CROSS_PLAN_DEPENDENCY: 'DUPLICATE_CROSS_PLAN_DEPENDENCY',
  /** Adding the link would close a PLAN-level cycle — the programme graph must stay acyclic (N30, ADR-0045 §3). */
  CROSS_PLAN_CYCLE_DETECTED: 'CROSS_PLAN_CYCLE_DETECTED',
  /** Both endpoints are in the same plan — use an intra-plan dependency (N31). */
  CROSS_PLAN_SAME_PLAN: 'CROSS_PLAN_SAME_PLAN',
} as const;

/**
 * Business logic for cross-plan dependencies — the LIVE inter-project edges of the programme graph
 * (ADR-0045). Mirrors {@link ../dependencies/dependencies.service} but the edge spans TWO plans of
 * the same org. Every operation resolves the org from the caller's memberships (anti-IDOR). Create
 * loads BOTH endpoints active and in-org (a foreign/other-org/deleted id is an indistinguishable
 * 404), derives the two plan ids from them, rejects a same-plan edge (N31), and — under an
 * ORG-scoped advisory lock, inside one transaction — enforces the plan-level DAG (N30), the pen on
 * the SUCCESSOR plan (ADR-0028), and the duplicate rule (N33). Read/list reuse `dependency:read`;
 * create needs the dedicated `dependency:link_cross_plan`; delete reuses the pen on the successor
 * plan. This module is deliberately DARK: nothing in the engine or the schedule service consumes it
 * yet (the derivation seam + programme recalc are F4/F5).
 */
@Injectable()
export class CrossPlanDependenciesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly crossPlanDependencies: CrossPlanDependencyRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(CrossPlanDependenciesService.name) private readonly logger: PinoLogger,
    private readonly calendars: CalendarRepository,
    private readonly history: ActivityHistoryRecorder,
  ) {}

  /**
   * Attach each link's lag day↔minute factor before any response is built (#385 M2-T3b,
   * api-reviewer A1). The in-plan service's shape (`dependencies.service.ts`), across two plans:
   * every read of a cross-plan link divides its stored working minutes by the factor of the calendar
   * its lag is measured on, which is the factor its write multiplied by. Batched per page
   * ({@link attachCrossPlanLagDayFactors}).
   */
  private withLagDayFactors(
    rows: readonly CrossPlanDependencyWithEndpoints[],
  ): Promise<CrossPlanDependencyWithFactor[]> {
    return attachCrossPlanLagDayFactors(
      { db: this.prisma, plans: this.plans, calendars: this.calendars },
      rows,
    );
  }

  /** {@link withLagDayFactors} for one link. */
  private async withLagDayFactor(
    row: CrossPlanDependencyWithEndpoints,
  ): Promise<CrossPlanDependencyWithFactor> {
    const [decorated] = await this.withLagDayFactors([row]);
    return decorated!;
  }

  async listByPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: CrossPlanDependencyWithFactor[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.crossPlanDependencies.listBySuccessorPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return this.paginate(rows, query.limit);
  }

  async listByActivity(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: CrossPlanDependencyWithFactor[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActiveActivity(activityId, organization.id);

    const rows = await this.crossPlanDependencies.listByActivity({
      organizationId: organization.id,
      activityId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return this.paginate(rows, query.limit);
  }

  async get(
    principal: Principal,
    orgSlug: string,
    id: string,
  ): Promise<CrossPlanDependencyWithFactor> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);

    const link = await this.crossPlanDependencies.findActiveByIdInOrg(id, organization.id);
    if (!link) throw new NotFoundError('Cross-plan dependency not found.');
    return this.withLagDayFactor(link);
  }

  async create(
    principal: Principal,
    orgSlug: string,
    dto: CreateCrossPlanDependencyDto,
  ): Promise<CrossPlanDependencyWithFactor> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:link_cross_plan', organization.id);

    // Both endpoints must be active activities IN THIS ORG (anti-IDOR). A foreign/other-org/
    // deleted id is indistinguishable from missing → 404. Plan ids are DERIVED from the loaded
    // endpoints, never trusted from input.
    const predecessor = await this.loadActiveActivity(dto.predecessorActivityId, organization.id);
    const successor = await this.loadActiveActivity(dto.successorActivityId, organization.id);
    const predecessorPlanId = predecessor.planId;
    const successorPlanId = successor.planId;

    // The two endpoints must live in DIFFERENT plans — a same-plan tie is an intra-plan dependency.
    if (predecessorPlanId === successorPlanId) {
      throw new ValidationError(CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.SAME_PLAN, {
        reason: CROSS_PLAN_DEPENDENCY_CONFLICT.CROSS_PLAN_SAME_PLAN,
      });
    }

    const type = dto.type ?? 'FS';

    try {
      // Load-check-insert runs in ONE transaction under an ORG-scoped advisory lock (a DISTINCT
      // key namespace from the per-plan write lock) so the plan-level acyclicity invariant is
      // race-safe: a concurrent mirror insert in the same org is serialised behind us and its walk
      // sees our edge (ADR-0045 §3).
      const link = await this.prisma.$transaction(async (tx) => {
        await acquireOrgCrossPlanLock(tx, organization.id);
        const edges = await this.crossPlanDependencies.loadOrgAdjacency(organization.id, tx);
        if (wouldCreatePlanCycle(edges, predecessorPlanId, successorPlanId)) {
          throw new ConflictError(CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.CYCLE, {
            reason: CROSS_PLAN_DEPENDENCY_CONFLICT.CROSS_PLAN_CYCLE_DETECTED,
          });
        }
        // The successor plan is the edge's home (ADR-0045 CQ-2): assert the pen on it INSIDE the
        // advisory lock (ADR-0028) so a steal can't slip between the check and the insert.
        await this.editLock.assertHoldsPen(principal, successorPlanId, organization.id, tx);
        const duplicate = await this.crossPlanDependencies.findDuplicate(
          dto.predecessorActivityId,
          dto.successorActivityId,
          type,
          tx,
        );
        if (duplicate) {
          throw new ConflictError(CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.DUPLICATE, {
            reason: CROSS_PLAN_DEPENDENCY_CONFLICT.DUPLICATE_CROSS_PLAN_DEPENDENCY,
          });
        }
        // `lagDays` converts to working minutes on the link's lag calendar (#385, spec D4 and
        // CQ-1), exactly as an in-plan lag does (ADR-0068 §4), through the one cross-plan rule
        // that the read path and the derivation also use. The factor is resolved from the two
        // endpoint activities as just loaded, each through its OWN plan (B5), inside the
        // transaction so it reads what the insert is about to reference.
        const [resolved] = await attachCrossPlanLagDayFactors(
          { db: tx, plans: this.plans, calendars: this.calendars },
          [
            {
              organizationId: organization.id,
              lagCalendar: dto.lagCalendar ?? 'PROJECT_DEFAULT',
              predecessorId: predecessor.id,
              successorId: successor.id,
              predecessor,
              successor,
            },
          ],
        );
        const lagDayFactorMinutes = resolved!.lagDayFactorMinutes;
        const created = await this.crossPlanDependencies.create(
          {
            organizationId: organization.id,
            predecessorPlanId,
            successorPlanId,
            predecessorId: dto.predecessorActivityId,
            successorId: dto.successorActivityId,
            type,
            ...(dto.lagDays !== undefined
              ? { lagMinutes: daysToMinutes(dto.lagDays, lagDayFactorMinutes) }
              : {}),
            ...(dto.lagCalendar ? { lagCalendar: dto.lagCalendar } : {}),
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
        // Recorded last, in this transaction, on BOTH endpoints, each in its own plan's history
        // (ADR-0174 O6): an entry that cannot be written fails the create rather than leaving a gap.
        await this.history.record(tx, {
          actorUserId: principal.userId,
          scope: 'LOGIC',
          writes: this.history.crossPlanLinkWrites({
            id: created.id,
            predecessorId: created.predecessorId,
            successorId: created.successorId,
            predecessorPlanId,
            successorPlanId,
            before: null,
            after: created,
          }),
        });
        // The edge bounds the successor plan's dates and is read by the predecessor plan's
        // dependants, so both plans' figures may have moved.
        await markScheduleInputsChanged(tx, organization.id, [predecessorPlanId, successorPlanId]);
        return { ...created, lagDayFactorMinutes };
      });
      this.logger.info(
        {
          organizationId: organization.id,
          predecessorPlanId,
          successorPlanId,
          crossPlanDependencyId: link.id,
          userId: principal.userId,
        },
        'cross-plan dependency created',
      );
      return link;
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async remove(principal: Principal, orgSlug: string, id: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:link_cross_plan', organization.id);

    const existing = await this.crossPlanDependencies.findActiveByIdInOrg(id, organization.id);
    if (!existing) throw new NotFoundError('Cross-plan dependency not found.');
    // Delete is gated by the pen on the affected (successor) plan — the plan whose schedule the
    // edge bounds (ADR-0045 §6), symmetric with create.
    await this.editLock.assertHoldsPen(principal, existing.successorPlanId, organization.id);

    await this.prisma.$transaction(async (tx) => {
      // Recorded only by the transaction that made the transition: a concurrent delete that lost
      // stamps nothing, so two removes record one "removed", not two (the in-plan link's rule).
      const stamped = await this.crossPlanDependencies.softDelete(id, principal.userId, tx);
      if (stamped === 1) {
        await this.history.record(tx, {
          actorUserId: principal.userId,
          scope: 'LOGIC',
          writes: this.history.crossPlanLinkWrites({
            id,
            predecessorId: existing.predecessorId,
            successorId: existing.successorId,
            predecessorPlanId: existing.predecessorPlanId,
            successorPlanId: existing.successorPlanId,
            before: existing,
            after: null,
          }),
        });
        // Both plans' schedules read the edge; only the transaction that made the transition stamps.
        await markScheduleInputsChanged(tx, organization.id, [
          existing.predecessorPlanId,
          existing.successorPlanId,
        ]);
      }
    });
    this.logger.info(
      { organizationId: organization.id, crossPlanDependencyId: id, userId: principal.userId },
      'cross-plan dependency deleted',
    );
  }

  /** Load a plan active and in the caller's org, or 404. */
  private async loadActivePlan(planId: string, organizationId: string): Promise<void> {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
  }

  /** Load an activity active and in the caller's org, or 404. */
  private async loadActiveActivity(activityId: string, organizationId: string): Promise<Activity> {
    const activity = await this.activities.findActiveByIdInOrg(activityId, organizationId);
    if (!activity) throw new NotFoundError('Activity not found.');
    return activity;
  }

  /** A Prisma unique-violation from the partial (pred, succ, type) index → 409 (N33 backstop). */
  private mapWriteError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictError(CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.DUPLICATE, {
        reason: CROSS_PLAN_DEPENDENCY_CONFLICT.DUPLICATE_CROSS_PLAN_DEPENDENCY,
      });
    }
    return error;
  }

  /** Trim the look-ahead row, then attach the factors to the page that is actually returned. */
  private async paginate(
    rows: CrossPlanDependencyWithEndpoints[],
    limit: number,
  ): Promise<{ items: CrossPlanDependencyWithFactor[]; meta: PageMeta }> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items: await this.withLagDayFactors(items), meta: { nextCursor, hasMore } };
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
