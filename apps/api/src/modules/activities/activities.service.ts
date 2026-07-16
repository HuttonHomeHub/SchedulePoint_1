import { Injectable } from '@nestjs/common';
import { Prisma, type Activity, type ActivityStatus, type ActivityType } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
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
import { CalendarRepository } from '../calendars/calendar.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { ActivityRepository, type ActivityPatch } from './activity.repository';
import type { CreateActivityDto } from './dto/create-activity.dto';
import type { UpdateActivityProgressDto } from './dto/update-activity-progress.dto';
import type { UpdateActivityDto } from './dto/update-activity.dto';
import type { UpdatePositionsDto } from './dto/update-positions.dto';

const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

/**
 * Minutes in one full calendar day — the fixed day↔minute factor (ADR-0036 §4.2).
 * The public API stays day-denominated (`durationDays`); storage is minutes, so the
 * service converts at the boundary (a whole day of work = 1440 working-minutes).
 */
const MINUTES_PER_DAY = 1440;

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
    private readonly calendars: CalendarRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ActivitiesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Validate a non-null `calendarId` is an ACTIVE calendar in the activity's own organisation
   * (ADR-0037, mirrors PlansService). Taken under the same calendar advisory lock the delete-in-use
   * guard uses, so an activity can never be assigned a calendar mid-deletion (no TOCTOU dangle). A
   * foreign / deleted / unknown id is indistinguishable from missing (404), leaking nothing.
   */
  private async assertCalendarInOrg(
    tx: Prisma.TransactionClient,
    calendarId: string,
    organizationId: string,
  ): Promise<void> {
    await acquireCalendarWriteLock(tx, calendarId);
    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organizationId, tx);
    if (!calendar) throw new NotFoundError('Calendar not found.');
  }

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
    // Structural write — the caller must hold the plan edit-lock (ADR-0028), 423 otherwise.
    await this.editLock.assertHoldsPen(principal, plan.id, organization.id);

    const type = dto.type ?? 'TASK';
    // A milestone is a point in time: force its duration to 0 defensively, even
    // if the client sent nothing (the DTO's cross-field validator only rejects a
    // non-zero duration that is explicitly present).
    const durationDays = MILESTONE_TYPES.includes(type) ? 0 : (dto.durationDays ?? 1);
    // The activity's own calendar (ADR-0037); null/omitted inherits the plan default.
    const calendarId = dto.calendarId ?? null;

    try {
      const activity = await this.prisma.$transaction(async (tx) => {
        // Validate a specific calendar in-org under the calendar lock before the insert (T4).
        if (calendarId !== null) await this.assertCalendarInOrg(tx, calendarId, organization.id);
        return this.activities.create(
          {
            // Copy the organisation id from the parent plan, never from input.
            organizationId: plan.organizationId,
            planId: plan.id,
            name: dto.name,
            code: dto.code ?? null,
            description: dto.description ?? null,
            type,
            durationMinutes: durationDays * MINUTES_PER_DAY,
            calendarId,
            ...(dto.constraintType ? { constraintType: dto.constraintType } : {}),
            ...(dto.constraintDate
              ? { constraintDate: parseCalendarDate(dto.constraintDate) }
              : {}),
            ...(dto.laneIndex !== undefined ? { laneIndex: dto.laneIndex } : {}),
            // Visual-Planning placement input (ADR-0033): feeds only the effective-Visual pass.
            ...(dto.visualStart ? { visualStart: parseCalendarDate(dto.visualStart) } : {}),
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
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
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);

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
    if (dto.durationDays !== undefined) patch.durationMinutes = dto.durationDays * MINUTES_PER_DAY;
    if (dto.constraintType !== undefined) patch.constraintType = dto.constraintType;
    if (dto.constraintDate !== undefined) {
      patch.constraintDate =
        dto.constraintDate === null ? null : parseCalendarDate(dto.constraintDate);
    }
    if (dto.laneIndex !== undefined) patch.laneIndex = dto.laneIndex;
    // Visual-Planning placement (ADR-0033): a date hand-places the bar; null clears it (revert to
    // computed). Planner-owned definition input — feeds only the effective-Visual pass, never the
    // pure-network pass, and never travels the progress path (it's absent from the progress DTO).
    if (dto.visualStart !== undefined) {
      patch.visualStart = dto.visualStart === null ? null : parseCalendarDate(dto.visualStart);
    }
    // The activity's own calendar (ADR-0037): null clears to inherit the plan default; a specific
    // id is validated in-org under the calendar lock inside the transaction below (T4).
    const calendarId = dto.calendarId;
    if (calendarId === null) patch.calendarId = null;

    // Keep the milestone invariant when the type changes to (or already is) a
    // milestone: a milestone always has duration 0, regardless of what was sent.
    const effectiveType = patch.type ?? existing.type;
    if (MILESTONE_TYPES.includes(effectiveType)) patch.durationMinutes = 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Assigning a specific calendar: validate it is active + in-org under the calendar lock,
        // serialised with the delete-in-use guard (no TOCTOU dangling reference).
        if (calendarId !== undefined && calendarId !== null) {
          await this.assertCalendarInOrg(tx, calendarId, organization.id);
          patch.calendarId = calendarId;
        }
        const changed = await this.activities.updateIfVersionMatches(
          activityId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
        }
      });
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
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const ids = dto.positions.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Each activity may appear at most once in a positions batch.', {
        reason: 'DUPLICATE_POSITION_ID',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // One set-based UPDATE keyed by id+version and re-asserting plan/org/active scope: a stale
      // or cross-plan/tenant id simply doesn't match and isn't written. All-or-nothing is the
      // count check below — a shortfall rolls the whole (possibly partial) UPDATE back.
      const updated = await this.activities.updateLanePositions(
        organization.id,
        planId,
        dto.positions,
        principal.userId,
        tx,
      );
      if (updated !== dto.positions.length) {
        // Only on the cold failure path do we spend a query to say WHY: an id not in this
        // plan (foreign/cross-plan/deleted → 404) vs a present-but-stale version (→ 409).
        const inPlan = new Set(
          (
            await tx.activity.findMany({
              where: { organizationId: organization.id, planId, id: { in: ids }, deletedAt: null },
              select: { id: true },
            })
          ).map((a) => a.id),
        );
        if (ids.some((id) => !inPlan.has(id))) {
          throw new NotFoundError('Activity not found in this plan.');
        }
        throw new ConflictError(
          'This plan changed since you opened it — no lanes were moved. Refresh and try again.',
        );
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

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);

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
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);
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
