import { Injectable } from '@nestjs/common';
import { Prisma, type LagCalendarSource, type Activity } from '@prisma/client';
import { DEPENDENCY_CONFLICT_MESSAGES, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityRepository } from '../activities/activity.repository';
import { daysToMinutes } from '../activities/day-factor';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
import { CalendarRepository } from '../calendars/calendar.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { wouldCreateCycle } from './cycle-detector';
import {
  DependencyRepository,
  type DependencyPatch,
  type DependencyWithEndpoints,
} from './dependency.repository';
import type { CreateDependencyDto } from './dto/create-dependency.dto';
import type { UpdateDependencyDto } from './dto/update-dependency.dto';
import {
  attachLagDayFactors,
  resolveLagDayFactorMinutes,
  type WithLagDayFactor,
} from './lag-day-factor';

/** Machine-readable reasons carried in a dependency {@link ConflictError}/{@link ValidationError}. */
export const DEPENDENCY_CONFLICT = {
  /** A link with this (predecessor, successor, type) already exists in the plan. */
  DUPLICATE_DEPENDENCY: 'DUPLICATE_DEPENDENCY',
  /** Adding the link would close a cycle — the graph must stay acyclic (ADR-0021). */
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  /** predecessor and successor are the same activity. */
  SELF_DEPENDENCY: 'SELF_DEPENDENCY',
  /** An endpoint is a WBS_SUMMARY, which carries no logic (ADR-0035 §24 / ADR-0038). */
  SUMMARY_HAS_NO_LOGIC: 'SUMMARY_HAS_NO_LOGIC',
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
    private readonly calendars: CalendarRepository,
    private readonly dependencies: DependencyRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(DependenciesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Attach each relationship's lag day↔minute factor (ADR-0068 §4).
   *
   * Rows share a plan (every list here is plan- or activity-scoped), so the plan's calendar is one
   * lookup and the endpoints' calendars ride on the join the read already does.
   */
  private async withLagDayFactors<
    T extends {
      planId: string;
      lagCalendar: LagCalendarSource;
      predecessor: { calendarId: string | null };
      successor: { calendarId: string | null };
    },
  >(rows: readonly T[]): Promise<WithLagDayFactor<T>[]> {
    if (rows.length === 0) return [];
    const planCalendars = await this.plans.findCalendarIds(rows.map((row) => row.planId));
    // Every row in one of these reads belongs to one plan, so a single calendar id covers the page.
    const planCalendarId = planCalendars[0]?.calendarId ?? null;
    return attachLagDayFactors(this.calendars, rows, planCalendarId);
  }

  /** {@link withLagDayFactors} for one relationship. */
  private async withLagDayFactor<
    T extends {
      planId: string;
      lagCalendar: LagCalendarSource;
      predecessor: { calendarId: string | null };
      successor: { calendarId: string | null };
    },
  >(row: T): Promise<WithLagDayFactor<T>> {
    const [decorated] = await this.withLagDayFactors([row]);
    return decorated!;
  }

  async listByPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: WithLagDayFactor<DependencyWithEndpoints>[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.dependencies.findManyActiveByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const { items, meta } = this.paginate(rows, query.limit);
    return { items: await this.withLagDayFactors(items), meta };
  }

  async listPredecessors(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: WithLagDayFactor<DependencyWithEndpoints>[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActiveActivity(activityId, organization.id);

    const rows = await this.dependencies.findPredecessorsOf({
      organizationId: organization.id,
      activityId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const { items, meta } = this.paginate(rows, query.limit);
    return { items: await this.withLagDayFactors(items), meta };
  }

  async listSuccessors(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: WithLagDayFactor<DependencyWithEndpoints>[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);
    await this.loadActiveActivity(activityId, organization.id);

    const rows = await this.dependencies.findSuccessorsOf({
      organizationId: organization.id,
      activityId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const { items, meta } = this.paginate(rows, query.limit);
    return { items: await this.withLagDayFactors(items), meta };
  }

  async get(
    principal: Principal,
    orgSlug: string,
    dependencyId: string,
  ): Promise<WithLagDayFactor<DependencyWithEndpoints>> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:read', organization.id);

    const dependency = await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id);
    if (!dependency) throw new NotFoundError('Dependency not found.');
    return this.withLagDayFactor(dependency);
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateDependencyDto,
    context?: RequestContext,
  ): Promise<WithLagDayFactor<DependencyWithEndpoints>> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);

    // A link cannot join an activity to itself (also a DB CHECK, defence-in-depth).
    if (dto.predecessorId === dto.successorId) {
      throw new ValidationError(DEPENDENCY_CONFLICT_MESSAGES.SELF, {
        reason: DEPENDENCY_CONFLICT.SELF_DEPENDENCY,
      });
    }

    // Both endpoints must be active activities IN THIS PLAN (anti-IDOR, no cross-plan).
    const predecessor = await this.loadEndpointInPlan(dto.predecessorId, organization.id, planId);
    const successor = await this.loadEndpointInPlan(dto.successorId, organization.id, planId);

    // A WBS summary carries no logic (ADR-0035 §24 / ADR-0038): it may not be a dependency endpoint.
    if (predecessor.type === 'WBS_SUMMARY' || successor.type === 'WBS_SUMMARY') {
      throw new ValidationError(DEPENDENCY_CONFLICT_MESSAGES.SUMMARY_NO_LOGIC, {
        reason: DEPENDENCY_CONFLICT.SUMMARY_HAS_NO_LOGIC,
      });
    }

    try {
      // Load-check-insert runs in ONE transaction under a plan-scoped advisory lock
      // so the acyclicity invariant is race-safe: a concurrent mirror insert in the
      // same plan is serialised behind us and its walk sees our edge (ADR-0021).
      const dependency = await this.prisma.$transaction(async (tx) => {
        await this.dependencies.lockPlanForWrite(plan.id, tx);
        // Assert the pen INSIDE the advisory lock (ADR-0028): a graph write is
        // serialised, so a steal can't slip between the check and the insert.
        await this.editLock.assertHoldsPen(principal, plan.id, organization.id, tx);
        const edges = await this.dependencies.findActiveEdgesByPlan(organization.id, plan.id, tx);
        if (wouldCreateCycle(edges, dto.predecessorId, dto.successorId)) {
          throw new ConflictError(DEPENDENCY_CONFLICT_MESSAGES.CYCLE, {
            reason: DEPENDENCY_CONFLICT.CYCLE_DETECTED,
          });
        }
        const created = await this.dependencies.create(
          {
            organizationId: plan.organizationId,
            planId: plan.id,
            predecessorId: dto.predecessorId,
            successorId: dto.successorId,
            ...(dto.type ? { type: dto.type } : {}),
            // Mutually exclusive at the DTO; minutes is the storage unit, days a convenience
            // over it (TECH_DEBT #78).
            // Days convert on the calendar `lagCalendar` names (ADR-0068 §4) — the predecessor's,
            // the successor's, the plan's, or a hard-pinned 1440 for TWENTY_FOUR_HOUR, which is the
            // entire meaning of that option. Minutes are stored as sent.
            ...(dto.lagMinutes !== undefined
              ? { lagMinutes: dto.lagMinutes }
              : dto.lagDays !== undefined
                ? {
                    lagMinutes: daysToMinutes(
                      dto.lagDays,
                      await resolveLagDayFactorMinutes(
                        this.calendars,
                        {
                          lagCalendar: dto.lagCalendar ?? 'PROJECT_DEFAULT',
                          predecessorCalendarId: predecessor.calendarId,
                          successorCalendarId: successor.calendarId,
                          planCalendarId: plan.calendarId,
                        },
                        tx,
                      ),
                    ),
                  }
                : {}),
            ...(dto.lagCalendar ? { lagCalendar: dto.lagCalendar } : {}),
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );

        /*
         * A create that earns a row — the one exception to "a create is already durably
         * attributed" (spec Test 1), because a link passes Test 2 instead: it re-dates everything
         * downstream of it, which is other people's work.
         *
         * Both endpoint NAMES are recorded rather than one id, and in that order, because the
         * direction is the fact ADR-0064 found planners most often get wrong — and an audit row
         * that says only "a link was created" cannot settle the argument it exists to settle.
         *
         * Inside the same transaction as the insert, under the same advisory lock and after the
         * same `assertHoldsPen`: a rolled-back create records nothing, and a 423 records nothing.
         */
        await this.audit.record(
          {
            action: 'dependency.created',
            outcome: 'SUCCESS',
            organizationId: organization.id,
            subjectType: 'DEPENDENCY',
            subjectId: created.id,
            subjectLabel: `${predecessor.name} → ${successor.name}`,
            after: {
              predecessorName: predecessor.name,
              successorName: successor.name,
              type: created.type,
              lagMinutes: created.lagMinutes,
            },
            ...auditActor(principal, context),
          },
          tx,
        );
        return created;
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
      return this.withLagDayFactor(dependency);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    dependencyId: string,
    dto: UpdateDependencyDto,
  ): Promise<WithLagDayFactor<DependencyWithEndpoints>> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:update', organization.id);

    const existing = await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id);
    if (!existing) throw new NotFoundError('Dependency not found.');
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);

    const patch: DependencyPatch = {};
    if (dto.type !== undefined) patch.type = dto.type;
    // Mutually exclusive at the DTO, so at most one fires. `lagMinutes` lets a client edit a
    // sub-day lag without rounding it away (TECH_DEBT #78).
    if (dto.lagMinutes !== undefined) patch.lagMinutes = dto.lagMinutes;
    if (dto.lagCalendar !== undefined) patch.lagCalendar = dto.lagCalendar;
    // Converted on the calendar this write LEAVES the relationship measuring against — the patched
    // `lagCalendar` when the same PATCH changes it, otherwise the stored one. A PATCH that moves a
    // lag from PROJECT_DEFAULT to TWENTY_FOUR_HOUR and edits the days in one call must convert
    // against the option it is switching TO (ADR-0068 §4).
    if (dto.lagDays !== undefined) {
      const plan = await this.loadActivePlan(existing.planId, organization.id);
      patch.lagMinutes = daysToMinutes(
        dto.lagDays,
        await resolveLagDayFactorMinutes(this.calendars, {
          lagCalendar: patch.lagCalendar ?? existing.lagCalendar,
          predecessorCalendarId: existing.predecessor.calendarId,
          successorCalendarId: existing.successor.calendarId,
          planCalendarId: plan.calendarId,
        }),
      );
    }

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
    return this.withLagDayFactor(updated);
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    dependencyId: string,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'dependency:delete', organization.id);

    const existing = await this.dependencies.findActiveByIdInOrg(dependencyId, organization.id);
    if (!existing) throw new NotFoundError('Dependency not found.');
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);

    await this.prisma.$transaction(async (tx) => {
      const cascade = await this.lifecycle.cascadeSoftDelete(
        tx,
        'dependency',
        dependencyId,
        principal.userId,
      );
      // The link that disappeared, named by its endpoints in direction order — the same shape as
      // the create, so the two read as a pair rather than as two unrelated facts about an id
      // nothing can now resolve.
      await this.audit.record(
        {
          action: 'dependency.deleted',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'DEPENDENCY',
          subjectId: dependencyId,
          subjectLabel: `${existing.predecessor.name} → ${existing.successor.name}`,
          before: {
            predecessorName: existing.predecessor.name,
            successorName: existing.successor.name,
            type: existing.type,
            lagMinutes: existing.lagMinutes,
            deleteBatchId: cascade.batchId,
          },
          ...auditActor(principal, context),
        },
        tx,
      );
    });
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
      return new ConflictError(DEPENDENCY_CONFLICT_MESSAGES.DUPLICATE, {
        reason: DEPENDENCY_CONFLICT.DUPLICATE_DEPENDENCY,
      });
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
