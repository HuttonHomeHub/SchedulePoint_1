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
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityRepository } from '../activities/activity.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { wouldCreatePlanCycle } from './cross-plan-cycle-detector';
import {
  CrossPlanDependencyRepository,
  type CrossPlanDependencyWithEndpoints,
} from './cross-plan-dependency.repository';
import type { CreateCrossPlanDependencyDto } from './dto/create-cross-plan-dependency.dto';

/**
 * Minutes in one full calendar day — the fixed day↔minute factor (ADR-0036 §4.2), mirroring the
 * dependencies service. The public API stays day-denominated (`lagDays`); storage is signed minutes.
 */
const MINUTES_PER_DAY = 1440;

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
  ) {}

  async listByPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: CrossPlanDependencyWithEndpoints[]; meta: PageMeta }> {
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
  ): Promise<{ items: CrossPlanDependencyWithEndpoints[]; meta: PageMeta }> {
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
  ): Promise<CrossPlanDependencyWithEndpoints> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);

    const link = await this.crossPlanDependencies.findActiveByIdInOrg(id, organization.id);
    if (!link) throw new NotFoundError('Cross-plan dependency not found.');
    return link;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    dto: CreateCrossPlanDependencyDto,
  ): Promise<CrossPlanDependencyWithEndpoints> {
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
        return this.crossPlanDependencies.create(
          {
            organizationId: organization.id,
            predecessorPlanId,
            successorPlanId,
            predecessorId: dto.predecessorActivityId,
            successorId: dto.successorActivityId,
            type,
            ...(dto.lagDays !== undefined ? { lagMinutes: dto.lagDays * MINUTES_PER_DAY } : {}),
            ...(dto.lagCalendar ? { lagCalendar: dto.lagCalendar } : {}),
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
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

    await this.prisma.$transaction((tx) =>
      this.crossPlanDependencies.softDelete(id, principal.userId, tx),
    );
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

  private paginate(
    rows: CrossPlanDependencyWithEndpoints[],
    limit: number,
  ): { items: CrossPlanDependencyWithEndpoints[]; meta: PageMeta } {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
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
