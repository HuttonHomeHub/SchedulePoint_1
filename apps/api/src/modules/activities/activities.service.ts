import { Injectable } from '@nestjs/common';
import { Prisma, type Activity, type ActivityType } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import {
  HIERARCHY_CONFLICT,
  HierarchyLifecycleService,
} from '../../common/hierarchy/hierarchy-lifecycle.service';
import { parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import { ActivityRepository, type ActivityPatch } from './activity.repository';
import type { CreateActivityDto } from './dto/create-activity.dto';
import type { UpdateActivityDto } from './dto/update-activity.dto';

const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

/**
 * Business logic for activities — the leaf of the Client → Project → Plan →
 * Activity hierarchy and the atomic unit of a schedule. Create and list are
 * scoped to a parent plan (loaded active and in-org first, 404 otherwise); the
 * organisation id is copied from that parent, never from input. Item operations
 * re-resolve the org scope from the caller's own memberships (anti-IDOR) paired
 * with a permission check. This service owns only the DEFINITION (name, logic,
 * graphics) — progress (status/%/actuals) is changed via ActivitiesService's
 * progress method (B2) so a Contributor can report progress without editing
 * logic. The CPM output columns are engine-owned and never set from input.
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ActivitiesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Activity[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.activities.findManyActiveByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(principal: Principal, orgSlug: string, activityId: string): Promise<Activity> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:read', organization.id);

    const activity = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!activity) throw new NotFoundError('Activity not found.');
    return activity;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateActivityDto,
  ): Promise<Activity> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);

    const type = dto.type ?? 'TASK';
    // A milestone is a point in time: force its duration to 0 defensively, even
    // if the client sent nothing (the DTO's cross-field validator only rejects a
    // non-zero duration that is explicitly present).
    const durationDays = MILESTONE_TYPES.includes(type) ? 0 : (dto.durationDays ?? 1);

    try {
      const activity = await this.activities.create({
        // Copy the organisation id from the parent plan, never from input.
        organizationId: plan.organizationId,
        planId: plan.id,
        name: dto.name,
        code: dto.code ?? null,
        description: dto.description ?? null,
        type,
        durationDays,
        ...(dto.constraintType ? { constraintType: dto.constraintType } : {}),
        ...(dto.constraintDate ? { constraintDate: parseCalendarDate(dto.constraintDate) } : {}),
        ...(dto.laneIndex !== undefined ? { laneIndex: dto.laneIndex } : {}),
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        {
          organizationId: organization.id,
          planId: plan.id,
          activityId: activity.id,
          userId: principal.userId,
        },
        'activity created',
      );
      return activity;
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: UpdateActivityDto,
  ): Promise<Activity> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update', organization.id);

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');

    const patch: ActivityPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code === '' ? null : dto.code;
    if (dto.description !== undefined) {
      patch.description = dto.description === '' ? null : dto.description;
    }
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.durationDays !== undefined) patch.durationDays = dto.durationDays;
    if (dto.constraintType !== undefined) patch.constraintType = dto.constraintType;
    if (dto.constraintDate !== undefined) {
      patch.constraintDate =
        dto.constraintDate === null ? null : parseCalendarDate(dto.constraintDate);
    }
    if (dto.laneIndex !== undefined) patch.laneIndex = dto.laneIndex;

    // Keep the milestone invariant when the type changes to (or already is) a
    // milestone: a milestone always has duration 0, regardless of what was sent.
    const effectiveType = patch.type ?? existing.type;
    if (MILESTONE_TYPES.includes(effectiveType)) patch.durationDays = 0;

    try {
      const changed = await this.activities.updateIfVersionMatches(
        activityId,
        dto.version,
        patch,
        principal.userId,
      );
      if (changed === 0) {
        throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
      }
    } catch (error) {
      throw this.mapWriteError(error);
    }

    const updated = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!updated) throw new NotFoundError('Activity not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, activityId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:delete', organization.id);

    if (!(await this.activities.findActiveByIdInOrg(activityId, organization.id))) {
      throw new NotFoundError('Activity not found.');
    }

    await this.prisma.$transaction((tx) =>
      this.lifecycle.cascadeSoftDelete(tx, 'activity', activityId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, activityId, userId: principal.userId },
      'activity deleted',
    );
  }

  async restore(principal: Principal, orgSlug: string, activityId: string): Promise<Activity> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:restore', organization.id);

    const existing = await this.activities.findByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');
    if (!existing.deletedAt) return existing; // already active — restore is a no-op

    // The lifecycle enforces the top-down invariant: restoring an activity whose
    // parent plan is still soft-deleted raises PARENT_DELETED (→ 409).
    await this.prisma.$transaction((tx) =>
      this.lifecycle.restoreBatch(tx, 'activity', activityId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, activityId, userId: principal.userId },
      'activity restored',
    );

    const restored = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!restored) throw new NotFoundError('Activity not found.');
    return restored;
  }

  /** Load the parent plan active and in the caller's org, or 404. */
  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /** Map a Prisma unique-violation (name/code per plan) to a 409, else rethrow. */
  private mapWriteError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictError('An activity with this name or code already exists for this plan.', {
        reason: HIERARCHY_CONFLICT.NAME_TAKEN,
      });
    }
    return error;
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
