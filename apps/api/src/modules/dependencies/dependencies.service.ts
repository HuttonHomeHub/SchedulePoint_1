import { Injectable } from '@nestjs/common';
import { Prisma, type Activity } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityRepository } from '../activities/activity.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import {
  DependencyRepository,
  type DependencyPatch,
  type DependencyWithEndpoints,
} from './dependency.repository';
import type { CreateDependencyDto } from './dto/create-dependency.dto';
import type { UpdateDependencyDto } from './dto/update-dependency.dto';

/** Machine-readable reasons carried in a dependency {@link ConflictError}/{@link ValidationError}. */
export const DEPENDENCY_CONFLICT = {
  /** A link with this (predecessor, successor, type) already exists in the plan. */
  DUPLICATE_DEPENDENCY: 'DUPLICATE_DEPENDENCY',
  /** Adding the link would close a cycle — the graph must stay acyclic (ADR-0021). */
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  /** predecessor and successor are the same activity. */
  SELF_DEPENDENCY: 'SELF_DEPENDENCY',
} as const;

/**
 * Business logic for dependencies — the edges of a plan's schedule network. Every
 * operation resolves the org from the caller's memberships (anti-IDOR) and checks
 * a `dependency:*` permission. Create/list are scoped to a parent plan; both
 * endpoints are loaded active and in-org and asserted to belong to that same plan
 * (no cross-plan links), and the organisation/plan ids are copied from the parent,
 * never from input. A link's endpoints are immutable; only type/lag update. The
 * acyclicity guarantee (cycle detection) is layered on `create` in B2 (ADR-0021);
 * this task ships create/read/update/delete with the self-loop and duplicate
 * integrity rules.
 */
@Injectable()
export class DependenciesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly dependencies: DependencyRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(DependenciesService.name) private readonly logger: PinoLogger,
  ) {}

  async listByPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: DependencyWithEndpoints[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.dependencies.findManyActiveByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return this.paginate(rows, query.limit);
  }

  async listPredecessors(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: DependencyWithEndpoints[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActiveActivity(activityId, organization.id);

    const rows = await this.dependencies.findPredecessorsOf({
      organizationId: organization.id,
      activityId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return this.paginate(rows, query.limit);
  }

  async listSuccessors(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: DependencyWithEndpoints[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActiveActivity(activityId, organization.id);

    const rows = await this.dependencies.findSuccessorsOf({
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
    dependencyId: string,
  ): Promise<DependencyWithEndpoints> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);

    const dependency = await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id);
    if (!dependency) throw new NotFoundError('Dependency not found.');
    return dependency;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateDependencyDto,
  ): Promise<DependencyWithEndpoints> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);

    // A link cannot join an activity to itself (also a DB CHECK, defence-in-depth).
    if (dto.predecessorId === dto.successorId) {
      throw new ValidationError('A dependency cannot link an activity to itself.', {
        reason: DEPENDENCY_CONFLICT.SELF_DEPENDENCY,
      });
    }

    // Both endpoints must be active activities IN THIS PLAN (anti-IDOR, no cross-plan).
    await this.loadEndpointInPlan(dto.predecessorId, organization.id, planId);
    await this.loadEndpointInPlan(dto.successorId, organization.id, planId);

    try {
      const dependency = await this.dependencies.create({
        organizationId: plan.organizationId,
        planId: plan.id,
        predecessorId: dto.predecessorId,
        successorId: dto.successorId,
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.lagDays !== undefined ? { lagDays: dto.lagDays } : {}),
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        {
          organizationId: organization.id,
          planId: plan.id,
          dependencyId: dependency.id,
          userId: principal.userId,
        },
        'dependency created',
      );
      return dependency;
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    dependencyId: string,
    dto: UpdateDependencyDto,
  ): Promise<DependencyWithEndpoints> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:update', organization.id);

    if (!(await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id))) {
      throw new NotFoundError('Dependency not found.');
    }

    const patch: DependencyPatch = {};
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.lagDays !== undefined) patch.lagDays = dto.lagDays;

    try {
      const changed = await this.dependencies.updateIfVersionMatches(
        dependencyId,
        dto.version,
        patch,
        principal.userId,
      );
      if (changed === 0) {
        throw new ConflictError('This dependency was changed elsewhere. Refresh and try again.');
      }
    } catch (error) {
      throw this.mapWriteError(error);
    }

    const updated = await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id);
    if (!updated) throw new NotFoundError('Dependency not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, dependencyId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:delete', organization.id);

    if (!(await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id))) {
      throw new NotFoundError('Dependency not found.');
    }

    await this.prisma.$transaction((tx) =>
      this.lifecycle.cascadeSoftDelete(tx, 'dependency', dependencyId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, dependencyId, userId: principal.userId },
      'dependency deleted',
    );
  }

  /** Load the parent plan active and in the caller's org, or 404. */
  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /** Load an activity active and in the caller's org, or 404. */
  private async loadActiveActivity(activityId: string, organizationId: string): Promise<Activity> {
    const activity = await this.activities.findActiveByIdInOrg(activityId, organizationId);
    if (!activity) throw new NotFoundError('Activity not found.');
    return activity;
  }

  /**
   * Load an endpoint activity active, in the caller's org, AND in the given plan.
   * A foreign, deleted, or other-plan activity is indistinguishable from missing
   * (404) — so a dependency can never span plans or leak a cross-tenant id.
   */
  private async loadEndpointInPlan(
    activityId: string,
    organizationId: string,
    planId: string,
  ): Promise<Activity> {
    const activity = await this.loadActiveActivity(activityId, organizationId);
    if (activity.planId !== planId) {
      throw new NotFoundError('Activity not found in this plan.');
    }
    return activity;
  }

  /** A Prisma unique-violation from the partial (pred, succ, type) index → 409. */
  private mapWriteError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictError(
        'A dependency of this type already exists between these activities.',
        {
          reason: DEPENDENCY_CONFLICT.DUPLICATE_DEPENDENCY,
        },
      );
    }
    return error;
  }

  private paginate(
    rows: DependencyWithEndpoints[],
    limit: number,
  ): { items: DependencyWithEndpoints[]; meta: PageMeta } {
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
