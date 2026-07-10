import { Injectable } from '@nestjs/common';
import { Prisma, type Baseline } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import { BaselineRepository, type CaptureActivityRow } from './baseline.repository';
import type { BaselineWithActivities, BaselineWithCount } from './dto/baseline-response.dto';
import type { CreateBaselineDto } from './dto/create-baseline.dto';

/** Machine-readable conflict reasons carried in a {@link ConflictError}'s `details`. */
export const BASELINE_CONFLICT = {
  /** A baseline name collides with an active baseline in the same plan. */
  DUPLICATE_BASELINE: 'DUPLICATE_BASELINE',
} as const;

/** Machine-readable reasons carried in a baseline {@link ValidationError}. */
export const BASELINE_ERROR = {
  /** The plan has no computed schedule to freeze (empty, or never calculated). */
  SCHEDULE_NOT_CALCULATED: 'SCHEDULE_NOT_CALCULATED',
} as const;

/**
 * Business logic for baselines — named plan-of-record snapshots (ADR-0025). Every
 * action re-resolves the org scope from the caller's own memberships (anti-IDOR) and
 * pairs it with a permission check; all loads filter by the resolved `organization_id`
 * and the `planId`. Capture freezes the plan's currently-persisted computed activities
 * as a self-contained copy under the plan write-lock (the same advisory lock as
 * `ScheduleService.recalculate`, ADR-0022), so a snapshot is never taken
 * mid-recalculation; the plan's first baseline is captured active. Activate/delete land
 * in Task B2.
 */
@Injectable()
export class BaselinesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly baselines: BaselineRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(BaselinesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string; order: 'asc' | 'desc' },
  ): Promise<{ items: BaselineWithCount[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'baseline:read', organization.id);
    await this.assertPlanExists(planId, organization.id);

    const rows = await this.baselines.findManyActiveByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      order: query.order,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(
    principal: Principal,
    orgSlug: string,
    planId: string,
    baselineId: string,
  ): Promise<BaselineWithActivities> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'baseline:read', organization.id);

    const baseline = await this.baselines.findActiveDetailByIdInPlan(
      baselineId,
      organization.id,
      planId,
    );
    if (!baseline) throw new NotFoundError('Baseline not found.');
    return baseline;
  }

  async capture(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateBaselineDto,
  ): Promise<{ baseline: Baseline; activityCount: number }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'baseline:create', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Serialise with recalculation and other captures on this plan, then read a
        // consistent snapshot of the computed activities (ADR-0022/0025).
        await acquirePlanWriteLock(tx, planId);
        const activities = await this.baselines.loadActiveActivitiesForCapture(
          organization.id,
          planId,
          tx,
        );
        const projectFinish = latestFinish(activities);
        // Nothing meaningful to freeze: an empty plan, or one that was never
        // calculated (no computed finish). Reject before any write (ADR-0025 Q3).
        if (activities.length === 0 || projectFinish === null) {
          throw new ValidationError('Recalculate the schedule before capturing a baseline.', {
            reason: BASELINE_ERROR.SCHEDULE_NOT_CALCULATED,
          });
        }

        // The plan's FIRST baseline becomes the active comparison baseline; later
        // captures are inactive until activated. Determined inside the locked tx.
        const isActive =
          (await this.baselines.countActiveByPlan(organization.id, planId, tx)) === 0;

        const baseline = await this.baselines.createWithSnapshot(
          {
            organizationId: organization.id,
            planId,
            name: dto.name,
            isActive,
            dataDate: plan.plannedStart,
            capturedProjectFinish: projectFinish,
            actorId: principal.userId,
            activities,
          },
          tx,
        );
        return { baseline, activityCount: activities.length };
      });

      this.logger.info(
        {
          organizationId: organization.id,
          planId,
          baselineId: result.baseline.id,
          userId: principal.userId,
          isActive: result.baseline.isActive,
          activityCount: result.activityCount,
        },
        'baseline captured',
      );
      return result;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateBaselineError();
      throw error;
    }
  }

  async activate(
    principal: Principal,
    orgSlug: string,
    planId: string,
    baselineId: string,
  ): Promise<{ baseline: Baseline; activityCount: number }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'baseline:activate', organization.id);

    if (!(await this.baselines.findActiveByIdInPlan(baselineId, organization.id, planId))) {
      throw new NotFoundError('Baseline not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialise with capture/other activates on this plan. Clear the current active
      // baseline BEFORE setting the target, so the one-active partial unique is never
      // momentarily violated (ADR-0025); idempotent if the target is already active.
      await acquirePlanWriteLock(tx, planId);
      await this.baselines.clearActive(organization.id, planId, principal.userId, tx);
      const changed = await this.baselines.setActive(
        baselineId,
        organization.id,
        planId,
        principal.userId,
        tx,
      );
      // Deleted between the existence check and the locked flip → 404 (nothing activated).
      if (changed === 0) throw new NotFoundError('Baseline not found.');
    });

    const updated = await this.baselines.findActiveWithCountByIdInPlan(
      baselineId,
      organization.id,
      planId,
    );
    if (!updated) throw new NotFoundError('Baseline not found.');
    this.logger.info(
      { organizationId: organization.id, planId, baselineId, userId: principal.userId },
      'baseline activated',
    );
    const { activityCount, ...baseline } = updated;
    return { baseline, activityCount };
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    planId: string,
    baselineId: string,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'baseline:delete', organization.id);

    if (!(await this.baselines.findActiveByIdInPlan(baselineId, organization.id, planId))) {
      throw new NotFoundError('Baseline not found.');
    }

    // Soft-cascade the baseline and its snapshot rows under one batch. Deleting the
    // active baseline simply leaves the plan with none active (variance is then hidden).
    await this.prisma.$transaction(async (tx) => {
      await acquirePlanWriteLock(tx, planId);
      await this.baselines.softDeleteWithSnapshot(baselineId, principal.userId, tx);
    });
    this.logger.info(
      { organizationId: organization.id, planId, baselineId, userId: principal.userId },
      'baseline deleted (with snapshot)',
    );
  }

  /** Assert an active plan exists in this org, so a list/read on a bogus plan is a 404 (not empty). */
  private async assertPlanExists(planId: string, organizationId: string): Promise<void> {
    if (!(await this.plans.findActiveByIdInOrg(planId, organizationId))) {
      throw new NotFoundError('Plan not found.');
    }
  }

  /** A Prisma unique-violation from a partial unique index (baseline name per plan). */
  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private duplicateBaselineError(): ConflictError {
    return new ConflictError('A baseline with this name already exists for this plan.', {
      reason: BASELINE_CONFLICT.DUPLICATE_BASELINE,
    });
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

/** The latest (max) computed finish across a plan's activities, or null if none is computed. */
function latestFinish(activities: readonly CaptureActivityRow[]): Date | null {
  let max: Date | null = null;
  for (const a of activities) {
    if (a.earlyFinish && (max === null || a.earlyFinish.getTime() > max.getTime())) {
      max = a.earlyFinish;
    }
  }
  return max;
}
