import { Injectable } from '@nestjs/common';
import { Prisma, type CodeType } from '@prisma/client';
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

import { CodeTypeRepository } from './code-type.repository';
import { CodeValueRepository, type ListedCodeValue } from './code-value.repository';
import { CODE_CONFLICT, CODE_TYPE_LIMIT } from './codes.constants';
import type { CodeTypeListQueryDto } from './dto/code-type-list-query.dto';
import type { CreateCodeTypeDto } from './dto/create-code-type.dto';
import type { ReorderCodeTypesDto } from './dto/reorder-codes.dto';
import type { UpdateCodeTypeDto } from './dto/update-code-type.dto';

/**
 * A code type as the list returns it: its live value count always, its values unless `values=none`
 * left them out.
 */
export interface CodeTypeWithValues {
  type: CodeType;
  values?: ListedCodeValue[];
  valueCount?: number;
}

/**
 * Business logic for a plan's code types (p6-activity-codes spec §4.7, database-design §5.2, §8.3).
 * Every operation resolves the organisation from the caller's memberships, checks a `code:*`
 * permission, and loads the plan active and in-org before anything else, so a foreign plan or type
 * is a 404 before a 403 or a 423 could say otherwise. `organization_id` is copied from the loaded
 * plan, never from input. Every write is structural: it needs the pen (423), and create, delete and
 * restore take the plan advisory lock because the plan cascade holds it across its sweep and a
 * source switch takes it too.
 */
@Injectable()
export class CodeTypesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly types: CodeTypeRepository,
    private readonly values: CodeValueRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(CodeTypesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: CodeTypeListQueryDto,
  ): Promise<{ items: CodeTypeWithValues[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:read', organization.id);
    const includeDeleted = query.include === 'deleted';
    // Deleted rows are the restore picker's: reading them needs the restore permission.
    if (includeDeleted) this.assertCan(principal, 'code:restore', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const page = {
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    };
    const rows = includeDeleted
      ? await this.types.findManyAllByPlan(page)
      : await this.types.findManyActiveByPlan(page);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;

    const typeIds = pageRows.map((row) => row.id);
    const meta = { nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null, hasMore };
    const counts = await this.values.countActiveByTypes(organization.id, typeIds);
    if (query.values === 'none') {
      return {
        items: pageRows.map((type) => ({ type, valueCount: counts.get(type.id) ?? 0 })),
        meta,
      };
    }

    // One query for the whole page's values, never one per type.
    const valueRows = includeDeleted
      ? await this.values.findManyAllByTypes(organization.id, typeIds)
      : await this.values.findManyActiveByTypes(organization.id, typeIds);
    const byType = new Map<string, ListedCodeValue[]>();
    for (const value of valueRows) {
      const list = byType.get(value.codeTypeId);
      if (list) list.push(value);
      else byType.set(value.codeTypeId, [value]);
    }
    return {
      items: pageRows.map((type) => ({
        type,
        values: byType.get(type.id) ?? [],
        valueCount: counts.get(type.id) ?? 0,
      })),
      meta,
    };
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateCodeTypeDto,
  ): Promise<CodeType> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // The plan lock first: it serialises the cap count and the plan cascade's sweep, so a type
        // cannot be inserted into a plan that is being deleted (database-design §15 lock order).
        await acquirePlanWriteLock(tx, plan.id);
        await this.editLock.assertHoldsPen(principal, plan.id, organization.id, tx);
        if (!(await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx))) {
          throw new NotFoundError('Plan not found.');
        }
        if ((await this.types.countActive(organization.id, plan.id, tx)) >= CODE_TYPE_LIMIT) {
          throw this.limitError();
        }
        const position = (await this.types.maxActivePosition(organization.id, plan.id, tx)) + 1;
        return this.types.create(
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
      throw this.mapWriteError(error, dto.name);
    }
  }

  // No plan advisory lock, deliberately: a rename is one version-gated UPDATE of one row, and reorder
  // locks the plan's types in id order; only create, delete and restore race the plan cascade.
  async update(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeTypeId: string,
    dto: UpdateCodeTypeDto,
  ): Promise<CodeType> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:update', organization.id);
    await this.loadActivePlan(planId, organization.id);
    await this.loadActiveType(codeTypeId, planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await this.types.renameIfVersionMatches(
          codeTypeId,
          planId,
          organization.id,
          dto.version,
          dto.name,
          principal.userId,
          tx,
        );
        if (changed === 0) throw this.staleError();
        const updated = await this.types.findActiveInPlan(codeTypeId, planId, organization.id, tx);
        if (!updated) throw this.staleError();
        return updated;
      });
    } catch (error) {
      throw this.mapWriteError(error, dto.name);
    }
  }

  async reorder(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: ReorderCodeTypesDto,
  ): Promise<CodeType[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:update', organization.id);
    await this.loadActivePlan(planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const ids = dto.order.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('A code type may appear only once in the order.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Id order, the lock order every other writer of these rows uses.
      const locked = await this.types.lockActiveInIdOrder(organization.id, planId, tx);
      const byId = new Map(locked.map((row) => [row.id, row]));
      if (ids.some((id) => !byId.has(id))) throw new NotFoundError('Code type not found.');
      // Not every live type named: the list changed since the caller read it.
      if (ids.length !== locked.length) throw this.staleError();
      for (const { id, version } of dto.order) {
        if (byId.get(id)?.version !== version) throw this.staleError();
      }
      await this.types.rewritePositions(organization.id, planId, ids, principal.userId, tx);
      return this.types.findManyActiveInTx(organization.id, planId, tx);
    });
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeTypeId: string,
    context?: RequestContext,
    expectedVersion?: number,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:delete', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);
    const existing = await this.loadActiveType(codeTypeId, planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    await this.prisma.$transaction(async (tx) => {
      // The plan lock serialises this check with a swimlane source switch, which takes it too
      // (database-design §8.3): without it a switch could commit between the check and the delete.
      await acquirePlanWriteLock(tx, plan.id);
      const livePlan = await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx);
      if (!livePlan) throw new NotFoundError('Plan not found.');
      if (livePlan.swimlaneCodeTypeId === codeTypeId) {
        throw new ConflictError(
          `The swimlanes are made from ${existing.name}. Choose another swimlane source first.`,
          { reason: CODE_CONFLICT.TYPE_IS_SWIMLANE_SOURCE },
        );
      }
      // Locked first, so the version compared is the version deleted (TECH_DEBT #450).
      const version = await this.types.lockActiveVersion(codeTypeId, planId, organization.id, tx);
      if (expectedVersion !== undefined) {
        assertVersionMatches(version, expectedVersion, 'code type', 'Code type not found.');
      } else if (version === null) {
        throw new NotFoundError('Code type not found.');
      }
      const batchId = await this.types.softDelete(
        codeTypeId,
        planId,
        organization.id,
        principal.userId,
        tx,
      );
      if (batchId === null) throw new NotFoundError('Code type not found.');
      // Its live values go in the same batch, so restoring the type brings exactly them back.
      const valueCount = await this.values.softDeleteByType(
        codeTypeId,
        organization.id,
        batchId,
        principal.userId,
        tx,
      );
      await this.audit.record(
        {
          action: 'code_type.deleted',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'CODE_TYPE',
          subjectId: codeTypeId,
          subjectLabel: existing.name,
          before: { name: existing.name, planName: plan.name, deleteBatchId: batchId, valueCount },
          ...auditActor(principal, context),
        },
        tx,
      );
    });
    this.logger.info(
      { organizationId: organization.id, planId, codeTypeId, userId: principal.userId },
      'code type deleted',
    );
  }

  async restore(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeTypeId: string,
    context?: RequestContext,
  ): Promise<CodeTypeWithValues> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:restore', organization.id);

    // The plan in either state: a deleted one is PARENT_DELETED, a missing one is 404.
    const plan = await this.plans.findByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    const existing = await this.types.findInPlan(codeTypeId, planId, organization.id);
    if (!existing) throw new NotFoundError('Code type not found.');
    if (plan.deletedAt) throw this.planDeletedError();
    await this.editLock.assertHoldsPen(principal, planId, organization.id);
    if (!existing.deletedAt) return this.withLiveValues(existing, organization.id); // no-op

    let valueCount = 0;
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
          throw this.planDeletedError();
        }
        await acquirePlanWriteLock(tx, plan.id);
        if (!(await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx))) {
          throw this.planDeletedError();
        }
        if ((await this.types.countActive(organization.id, plan.id, tx)) >= CODE_TYPE_LIMIT) {
          throw this.limitError();
        }
        const changed = await this.types.restore(
          codeTypeId,
          planId,
          organization.id,
          principal.userId,
          tx,
        );
        if (changed === 0)
          throw new ConflictError('This code type was changed elsewhere.', {
            reason: CODE_CONFLICT.STALE_VERSION,
          });
        if (existing.deleteBatchId !== null) {
          valueCount = await this.values.restoreByBatch(
            codeTypeId,
            organization.id,
            existing.deleteBatchId,
            principal.userId,
            tx,
          );
        }
        await this.audit.record(
          {
            action: 'code_type.restored',
            outcome: 'SUCCESS',
            organizationId: organization.id,
            subjectType: 'CODE_TYPE',
            subjectId: codeTypeId,
            subjectLabel: existing.name,
            after: {
              name: existing.name,
              planName: plan.name,
              valueCount,
              ...(existing.deleteBatchId === null ? {} : { deleteBatchId: existing.deleteBatchId }),
            },
            ...auditActor(principal, context),
          },
          tx,
        );
      });
    } catch (error) {
      throw this.mapWriteError(error, existing.name);
    }
    this.logger.info(
      { organizationId: organization.id, planId, codeTypeId, userId: principal.userId, valueCount },
      'code type restored',
    );

    const restored = await this.types.findActiveInPlan(codeTypeId, planId, organization.id);
    if (!restored) throw new NotFoundError('Code type not found.');
    return this.withLiveValues(restored, organization.id);
  }

  private async withLiveValues(
    type: CodeType,
    organizationId: string,
  ): Promise<CodeTypeWithValues> {
    const values = await this.values.findManyActiveByTypes(organizationId, [type.id]);
    return { type, values };
  }

  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /** A live type of this plan and organisation, or 404 — a foreign one reads as missing. */
  private async loadActiveType(
    codeTypeId: string,
    planId: string,
    organizationId: string,
  ): Promise<CodeType> {
    const type = await this.types.findActiveInPlan(codeTypeId, planId, organizationId);
    if (!type) throw new NotFoundError('Code type not found.');
    return type;
  }

  private staleError(): ConflictError {
    return new ConflictError('The code types were changed elsewhere. Refresh and try again.', {
      reason: CODE_CONFLICT.STALE_VERSION,
    });
  }

  private limitError(): ValidationError {
    return new ValidationError(
      `A plan can have at most ${CODE_TYPE_LIMIT} code types. Delete one you no longer use first.`,
      { reason: CODE_CONFLICT.TYPE_LIMIT },
    );
  }

  private planDeletedError(): ConflictError {
    return new ConflictError('Restore the plan first.', {
      reason: HIERARCHY_CONFLICT.PARENT_DELETED,
    });
  }

  /**
   * The case-insensitive name index (`uq_code_types_plan_name`) is raw SQL Prisma cannot see, so its
   * violation arrives as a bare P2002 — or as a raw-query error carrying SQLSTATE 23505. The message
   * echoes the name the caller itself sent, never a stored row's, so it cannot carry another plan's data.
   */
  private mapWriteError(error: unknown, name: string): unknown {
    const isUnique =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' ||
        (error.code === 'P2010' &&
          (error.meta as { code?: string } | undefined)?.code === '23505'));
    return isUnique
      ? new ConflictError(`A code type called ${name} already exists.`, {
          reason: CODE_CONFLICT.TYPE_NAME_TAKEN,
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
