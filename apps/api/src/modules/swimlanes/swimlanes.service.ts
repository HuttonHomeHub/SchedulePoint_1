import { Injectable } from '@nestjs/common';
import { Prisma, type Swimlane } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { lockActiveProjectChainForShare } from '../../common/db/hierarchy-row-lock';
import { assertVersionMatches } from '../../common/db/locked-version';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { HIERARCHY_CONFLICT } from '../../common/hierarchy/hierarchy-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import type { CreateSwimlaneDto } from './dto/create-swimlane.dto';
import { SWIMLANE_LIMIT, type ReorderSwimlanesDto } from './dto/reorder-swimlanes.dto';
import type { UpdateSwimlaneDto } from './dto/update-swimlane.dto';
import { SwimlaneRepository } from './swimlane.repository';

/** Machine-readable reasons carried in a swimlane {@link ConflictError}/{@link ValidationError}. */
export const SWIMLANE_CONFLICT = {
  /** Another active swimlane of the plan has this name, ignoring case (`uq_swimlanes_plan_name`). */
  NAME_TAKEN: 'SWIMLANE_NAME_TAKEN',
  /** The plan already has the maximum number of active swimlanes. */
  LIMIT: 'SWIMLANE_LIMIT',
  /** The caller's version (or the set of swimlanes it ordered) is no longer current. */
  STALE_VERSION: 'STALE_VERSION',
} as const;

/**
 * Business logic for a plan's swimlanes (swimlanes spec §4.12, schema-design §5). Every operation
 * resolves the organisation from the caller's memberships, checks a `swimlane:*` permission, and
 * loads the plan active and in-org before anything else, so a foreign plan or swimlane is a 404
 * before a 403 or a 423 could say otherwise. `organization_id` is copied from the loaded plan,
 * never from input. Every write is structural: it needs the pen (423), and create and restore take
 * the plan advisory lock because the plan cascade holds it across its sweep.
 */
@Injectable()
export class SwimlanesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly swimlanes: SwimlaneRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(SwimlanesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Swimlane[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'swimlane:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.swimlanes.findManyActiveByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return { items, meta: { nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore } };
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateSwimlaneDto,
  ): Promise<Swimlane> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'swimlane:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // The plan lock first: it serialises the cap count and the plan cascade's sweep, so a
        // swimlane cannot be inserted into a plan that is being deleted (schema-design §5).
        await acquirePlanWriteLock(tx, plan.id);
        await this.editLock.assertHoldsPen(principal, plan.id, organization.id, tx);
        if (!(await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx))) {
          throw new NotFoundError('Plan not found.');
        }
        if ((await this.swimlanes.countActive(organization.id, plan.id, tx)) >= SWIMLANE_LIMIT) {
          throw this.limitError();
        }

        let position: number;
        if (dto.after !== undefined) {
          const after = await this.swimlanes.findActiveInPlan(
            dto.after,
            plan.id,
            organization.id,
            tx,
          );
          if (!after) throw new NotFoundError('Swimlane not found.');
          position = after.position + 1;
          await this.swimlanes.shiftAfter(
            organization.id,
            plan.id,
            after.position,
            principal.userId,
            tx,
          );
        } else {
          position = (await this.swimlanes.maxActivePosition(organization.id, plan.id, tx)) + 1;
        }

        return this.swimlanes.create(
          {
            // From the loaded plan, never from input.
            organizationId: plan.organizationId,
            planId: plan.id,
            name: dto.name,
            position,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    planId: string,
    swimlaneId: string,
    dto: UpdateSwimlaneDto,
  ): Promise<Swimlane> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'swimlane:update', organization.id);
    await this.loadActivePlan(planId, organization.id);
    await this.loadActiveSwimlane(swimlaneId, planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await this.swimlanes.renameIfVersionMatches(
          swimlaneId,
          planId,
          organization.id,
          dto.version,
          dto.name,
          principal.userId,
          tx,
        );
        if (changed === 0) throw this.staleError();
        const updated = await this.swimlanes.findActiveInPlan(
          swimlaneId,
          planId,
          organization.id,
          tx,
        );
        if (!updated) throw this.staleError();
        return updated;
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async reorder(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: ReorderSwimlanesDto,
  ): Promise<Swimlane[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'swimlane:update', organization.id);
    await this.loadActivePlan(planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const ids = dto.order.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('A swimlane may appear only once in the order.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Id order, the lock order every other swimlane writer uses (schema-design §5).
      const locked = await this.swimlanes.lockActiveInIdOrder(organization.id, planId, tx);
      const byId = new Map(locked.map((row) => [row.id, row]));
      if (ids.some((id) => !byId.has(id))) throw new NotFoundError('Swimlane not found.');
      // Not every active swimlane named: the list changed since the caller read it.
      if (ids.length !== locked.length) throw this.staleError();
      for (const { id, version } of dto.order) {
        if (byId.get(id)?.version !== version) throw this.staleError();
      }
      await this.swimlanes.rewritePositions(organization.id, planId, ids, principal.userId, tx);
      return this.swimlanes.findManyActiveInTx(organization.id, planId, tx);
    });
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    planId: string,
    swimlaneId: string,
    context?: RequestContext,
    expectedVersion?: number,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'swimlane:delete', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);
    const existing = await this.loadActiveSwimlane(swimlaneId, planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    await this.prisma.$transaction(async (tx) => {
      // Locked first, so the version compared is the version deleted (TECH_DEBT #450).
      const version = await this.swimlanes.lockActiveVersion(
        swimlaneId,
        planId,
        organization.id,
        tx,
      );
      if (expectedVersion !== undefined) {
        assertVersionMatches(version, expectedVersion, 'swimlane', 'Swimlane not found.');
      } else if (version === null) {
        throw new NotFoundError('Swimlane not found.');
      }
      const batchId = await this.swimlanes.softDelete(
        swimlaneId,
        planId,
        organization.id,
        principal.userId,
        tx,
      );
      if (batchId === null) throw new NotFoundError('Swimlane not found.');
      await this.audit.record(
        {
          action: 'swimlane.deleted',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'SWIMLANE',
          subjectId: swimlaneId,
          subjectLabel: existing.name,
          before: { name: existing.name, planName: plan.name, deleteBatchId: batchId },
          ...auditActor(principal, context),
        },
        tx,
      );
    });
    this.logger.info(
      { organizationId: organization.id, planId, swimlaneId, userId: principal.userId },
      'swimlane deleted',
    );
  }

  async restore(
    principal: Principal,
    orgSlug: string,
    planId: string,
    swimlaneId: string,
    context?: RequestContext,
  ): Promise<Swimlane> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'swimlane:restore', organization.id);

    // The plan in either state: a deleted one is PARENT_DELETED, a missing one is 404.
    const plan = await this.plans.findByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    const existing = await this.swimlanes.findInPlan(swimlaneId, planId, organization.id);
    if (!existing) throw new NotFoundError('Swimlane not found.');
    if (plan.deletedAt) throw this.parentDeletedError();
    await this.editLock.assertHoldsPen(principal, planId, organization.id);
    if (!existing.deletedAt) return existing; // already active — no-op

    try {
      await this.prisma.$transaction(async (tx) => {
        // Ancestors top-down and BEFORE the plan lock (hierarchy-row-lock.ts, ADR-0201 D3).
        // soft-delete: any-state — only the ancestor ids are read; the lock below states the filter.
        const project = await tx.project.findFirst({
          where: { id: plan.projectId, organizationId: organization.id },
          select: { id: true, clientId: true },
        });
        if (
          !project ||
          !(await lockActiveProjectChainForShare(tx, {
            clientId: project.clientId,
            projectId: project.id,
          }))
        ) {
          throw this.parentDeletedError();
        }
        await acquirePlanWriteLock(tx, plan.id);
        if (!(await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx))) {
          throw this.parentDeletedError();
        }
        if ((await this.swimlanes.countActive(organization.id, plan.id, tx)) >= SWIMLANE_LIMIT) {
          throw this.limitError();
        }
        const changed = await this.swimlanes.restore(
          swimlaneId,
          planId,
          organization.id,
          principal.userId,
          tx,
        );
        if (changed === 0) throw new ConflictError('This swimlane was changed elsewhere.');
        await this.audit.record(
          {
            action: 'swimlane.restored',
            outcome: 'SUCCESS',
            organizationId: organization.id,
            subjectType: 'SWIMLANE',
            subjectId: swimlaneId,
            subjectLabel: existing.name,
            after: {
              name: existing.name,
              planName: plan.name,
              ...(existing.deleteBatchId === null ? {} : { deleteBatchId: existing.deleteBatchId }),
            },
            ...auditActor(principal, context),
          },
          tx,
        );
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
    this.logger.info(
      { organizationId: organization.id, planId, swimlaneId, userId: principal.userId },
      'swimlane restored',
    );

    const restored = await this.swimlanes.findActiveInPlan(swimlaneId, planId, organization.id);
    if (!restored) throw new NotFoundError('Swimlane not found.');
    return restored;
  }

  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /** An active swimlane of this plan and organisation, or 404 — a foreign one reads as missing. */
  private async loadActiveSwimlane(
    swimlaneId: string,
    planId: string,
    organizationId: string,
  ): Promise<Swimlane> {
    const swimlane = await this.swimlanes.findActiveInPlan(swimlaneId, planId, organizationId);
    if (!swimlane) throw new NotFoundError('Swimlane not found.');
    return swimlane;
  }

  private staleError(): ConflictError {
    return new ConflictError('The swimlanes were changed elsewhere. Refresh and try again.', {
      reason: SWIMLANE_CONFLICT.STALE_VERSION,
    });
  }

  private limitError(): ValidationError {
    return new ValidationError(`A plan can have at most ${SWIMLANE_LIMIT} swimlanes.`, {
      reason: SWIMLANE_CONFLICT.LIMIT,
    });
  }

  private parentDeletedError(): ConflictError {
    return new ConflictError('Restore the plan first.', {
      reason: HIERARCHY_CONFLICT.PARENT_DELETED,
    });
  }

  /**
   * The case-insensitive name index (`uq_swimlanes_plan_name`) is raw SQL Prisma cannot see, so its
   * violation arrives as a bare P2002 — or as a raw-query error carrying SQLSTATE 23505. The message
   * is fixed: it never echoes a name, so it cannot carry another plan's data.
   */
  private mapWriteError(error: unknown): unknown {
    const isUnique =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' ||
        (error.code === 'P2010' &&
          (error.meta as { code?: string } | undefined)?.code === '23505'));
    return isUnique
      ? new ConflictError('A swimlane with this name already exists in this plan.', {
          reason: SWIMLANE_CONFLICT.NAME_TAKEN,
        })
      : error;
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
