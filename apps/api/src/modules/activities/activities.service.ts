import { Injectable } from '@nestjs/common';
import { Prisma, type Activity, type ActivityStatus, type ActivityType } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
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
import type { UpdateActivityProgressDto } from './dto/update-activity-progress.dto';
import type { UpdateActivityDto } from './dto/update-activity.dto';
import type { UpdatePositionsDto } from './dto/update-positions.dto';

const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

/**
 * Derive an activity's status from its measurable progress so the two can never
 * contradict: a finish date (or 100%) means COMPLETE; a start date (or any
 * progress) means IN_PROGRESS; otherwise NOT_STARTED. Using the actual dates as
 * the started/finished signal — not just the percentage — lets an activity be
 * "in progress" at 0% (started but no measurable work yet).
 */
function deriveStatus(
  percentComplete: number,
  actualStart: Date | null,
  actualFinish: Date | null,
): ActivityStatus {
  if (actualFinish !== null || percentComplete >= 100) return 'COMPLETE';
  if (actualStart !== null || percentComplete > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

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

    // A constraint's type and date move together. The DTO's cross-field validator
    // can't see this when a client OMITS one side and sends the other as `null`
    // (an absent/empty property skips its own validators), so enforce it here on
    // KEY PRESENCE — otherwise a `PATCH { constraintType: null }` would clear the
    // type but leave a dangling date (or vice-versa), an invalid persisted state.
    if ((dto.constraintType !== undefined) !== (dto.constraintDate !== undefined)) {
      throw new ValidationError('constraintType and constraintDate must be updated together.', {
        reason: 'CONSTRAINT_PAIR_REQUIRED',
      });
    }

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

  /**
   * Batch lane-position write (TSLD M4): move one or more of a plan's activities to new lanes
   * in a single **all-or-nothing** transaction. Every id must be an active activity in this
   * plan+org (anti-IDOR) and still match its optimistic-lock `version`, or the whole batch is
   * rejected (409) and nothing moves — the semantics a lane drag / auto-pack needs. Layout only:
   * it sets `laneIndex` (a definition edit → `activity:update`, so `version` bumps as usual) and
   * triggers no CPM recalculation (x = time is engine-owned; y = lane is stored).
   */
  async updatePositions(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: UpdatePositionsDto,
  ): Promise<Activity[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update', organization.id);
    await this.loadActivePlan(planId, organization.id); // 404 if the plan is foreign/deleted

    const ids = dto.positions.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Each activity may appear at most once in a positions batch.', {
        reason: 'DUPLICATE_POSITION_ID',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Every id must be an active activity in THIS plan+org: a foreign/cross-plan id is
      // indistinguishable from "not found". updateIfVersionMatches scopes only by id+version,
      // so this set is the plan/org gate — read once inside the tx.
      const inPlan = new Set(
        (
          await tx.activity.findMany({
            where: { organizationId: organization.id, planId, deletedAt: null },
            select: { id: true },
          })
        ).map((a) => a.id),
      );
      for (const id of ids) {
        if (!inPlan.has(id)) throw new NotFoundError('Activity not found in this plan.');
      }
      // All-or-nothing: any stale version (or a row deleted mid-flight) rolls back the batch.
      for (const p of dto.positions) {
        const changed = await this.activities.updateIfVersionMatches(
          p.id,
          p.version,
          { laneIndex: p.laneIndex },
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError(
            'This plan changed since you opened it — no lanes were moved. Refresh and try again.',
          );
        }
      }
    });

    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId, count: ids.length },
      'activity lanes repositioned',
    );

    // Return the moved rows with their fresh versions so the client can reconcile optimistic state.
    return this.prisma.activity.findMany({
      where: { organizationId: organization.id, planId, id: { in: ids }, deletedAt: null },
    });
  }

  /**
   * Report progress (status / % / actual dates) — the Contributor-capable path.
   * Requires only `activity:update_progress`, so a Contributor can move progress
   * without the `activity:update` needed to change logic or definition. `status`
   * is derived, not taken from input, so it always agrees with the numbers.
   */
  async updateProgress(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: UpdateActivityProgressDto,
  ): Promise<Activity> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update_progress', organization.id);

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');

    // Resolve the effective values: a provided field overrides the stored one; an
    // omitted field keeps it. This lets us re-derive status and check the
    // date invariants against the FINAL state, not just what was sent.
    const percentComplete = dto.percentComplete ?? existing.percentComplete;
    const actualStart = this.resolveDate(dto.actualStart, existing.actualStart);
    const actualFinish = this.resolveDate(dto.actualFinish, existing.actualFinish);

    // You cannot finish what you never started, and a finish cannot precede a start.
    if (actualFinish !== null && actualStart === null) {
      throw new ValidationError('An actual finish needs an actual start.', {
        reason: 'FINISH_WITHOUT_START',
      });
    }
    if (actualStart !== null && actualFinish !== null && actualFinish < actualStart) {
      throw new ValidationError('Actual finish cannot precede actual start.', {
        reason: 'FINISH_BEFORE_START',
      });
    }

    const patch: ActivityPatch = {
      percentComplete,
      actualStart,
      actualFinish,
      status: deriveStatus(percentComplete, actualStart, actualFinish),
    };

    const changed = await this.activities.updateIfVersionMatches(
      activityId,
      dto.version,
      patch,
      principal.userId,
    );
    if (changed === 0) {
      throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
    }
    this.logger.info(
      { organizationId: organization.id, activityId, userId: principal.userId },
      'activity progress updated',
    );

    const updated = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!updated) throw new NotFoundError('Activity not found.');
    return updated;
  }

  /** A provided date field (parsed, or null to clear) overrides the stored one;
   * `undefined` (omitted) keeps the existing value. */
  private resolveDate(field: string | null | undefined, existing: Date | null): Date | null {
    if (field === undefined) return existing;
    return field === null ? null : parseCalendarDate(field);
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

  /**
   * Map a Prisma unique-violation to a 409, distinguishing the two partial-unique
   * constraints an activity carries (name-per-plan vs code-per-plan) so the caller
   * knows which field to fix; else rethrow untouched.
   */
  private mapWriteError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // `meta.target` names the failing unique — the field list (e.g.
      // `['plan_id', 'code']`) on PostgreSQL, or the index name as a string.
      const target = error.meta?.target;
      const isCode = Array.isArray(target)
        ? target.includes('code')
        : typeof target === 'string' && target.includes('code');
      return isCode
        ? new ConflictError('An activity with this code already exists for this plan.', {
            reason: HIERARCHY_CONFLICT.CODE_TAKEN,
          })
        : new ConflictError('An activity with this name already exists for this plan.', {
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
