import { Injectable } from '@nestjs/common';
import { Prisma, type CodeValue } from '@prisma/client';
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
import {
  CodeValueRepository,
  type ListedCodeValue,
  type ResolvedCodeValue,
} from './code-value.repository';
import { CODE_CONFLICT, CODE_VALUE_LIMIT } from './codes.constants';
import type { CodeValueListQueryDto } from './dto/code-value-list-query.dto';
import type { CreateCodeValueDto } from './dto/create-code-value.dto';
import type { ReorderCodeValuesDto } from './dto/reorder-codes.dto';
import type { UpdateCodeValueDto } from './dto/update-code-value.dto';

/**
 * Business logic for a code type's values (p6-activity-codes spec §4.7, database-design §5.3, §8.3).
 * The same rules as {@link CodeTypesService}: the organisation from the caller's memberships, the
 * plan loaded active and in-org first, `organization_id` copied from that plan, every write behind
 * the pen. A value has no plan of its own, so it is always reached through a type of the plan in the
 * path, and a value of another plan or tenant reads as missing.
 *
 * Values are flat in this release (no parent value column, spec Q5/Q11), so "a value with its live
 * subtree" is the value alone. Deleting a value leaves its assignments: the activities that carry it
 * read as having no value, and a restore brings them back.
 */
@Injectable()
export class CodeValuesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly types: CodeTypeRepository,
    private readonly values: CodeValueRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(CodeValuesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * One live type's values, a page at a time in the order a reorder writes. A foreign, deleted or
   * unknown type is the same 404; a deleted type's values come back through its restore, so there
   * is no read of them here.
   */
  async list(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeTypeId: string,
    query: CodeValueListQueryDto,
  ): Promise<{ items: ListedCodeValue[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:read', organization.id);
    const includeDeleted = query.include === 'deleted';
    // Deleted rows are the restore picker's: reading them needs the restore permission.
    if (includeDeleted) this.assertCan(principal, 'code:restore', organization.id);
    await this.loadActivePlan(planId, organization.id);
    if (!(await this.types.findActiveInPlan(codeTypeId, planId, organization.id))) {
      throw new NotFoundError('Code type not found.');
    }

    const rows = await this.values.findPageByType({
      organizationId: organization.id,
      codeTypeId,
      includeDeleted,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items,
      meta: { nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore },
    };
  }

  /**
   * Name the values a caller holds ids for. Deleted values and values of deleted types are named,
   * under `code:read`: the caller already has the id, and the value was readable while live. It is
   * not a way to list what is deleted. An id of another plan or organisation, or an unknown one, is
   * absent from the answer, never an error.
   */
  async resolve(
    principal: Principal,
    orgSlug: string,
    planId: string,
    ids: readonly string[],
  ): Promise<ResolvedCodeValue[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:read', organization.id);
    await this.loadActivePlan(planId, organization.id);
    return this.values.findManyResolvedInPlan(organization.id, planId, [...new Set(ids)]);
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeTypeId: string,
    dto: CreateCodeValueDto,
  ): Promise<CodeValue> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquirePlanWriteLock(tx, plan.id);
        await this.editLock.assertHoldsPen(principal, plan.id, organization.id, tx);
        if (!(await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx))) {
          throw new NotFoundError('Plan not found.');
        }
        // Re-read under the lock: a type deleted a moment ago must not take a new value.
        const type = await this.types.findActiveInPlan(codeTypeId, plan.id, organization.id, tx);
        if (!type) throw new NotFoundError('Code type not found.');
        if ((await this.values.countActive(organization.id, type.id, tx)) >= CODE_VALUE_LIMIT) {
          throw this.limitError(type.name);
        }
        const position = (await this.values.maxActivePosition(organization.id, type.id, tx)) + 1;
        return this.values.create(
          {
            // From the loaded plan, never from input.
            organizationId: plan.organizationId,
            codeTypeId: type.id,
            shortCode: dto.shortCode,
            description: dto.description ?? null,
            position,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
      });
    } catch (error) {
      throw this.mapWriteError(error, dto.shortCode);
    }
  }

  // No plan advisory lock, deliberately: an edit is one version-gated UPDATE of one row.
  async update(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeValueId: string,
    dto: UpdateCodeValueDto,
  ): Promise<CodeValue> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:update', organization.id);
    await this.loadActivePlan(planId, organization.id);
    const existing = await this.loadActiveValue(codeValueId, planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const data: { shortCode?: string; description?: string | null } = {};
    if (dto.shortCode !== undefined) data.shortCode = dto.shortCode;
    if (dto.description !== undefined) data.description = dto.description;
    if (Object.keys(data).length === 0) {
      throw new ValidationError('Send a short code or a description to change.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await this.values.updateIfVersionMatches(
          codeValueId,
          existing.codeTypeId,
          organization.id,
          dto.version,
          data,
          principal.userId,
          tx,
        );
        if (changed === 0) throw this.staleError();
        const updated = await this.values.findActiveInPlan(
          codeValueId,
          planId,
          organization.id,
          tx,
        );
        if (!updated) throw this.staleError();
        return updated;
      });
    } catch (error) {
      throw this.mapWriteError(error, dto.shortCode ?? existing.shortCode);
    }
  }

  async reorder(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeTypeId: string,
    dto: ReorderCodeValuesDto,
  ): Promise<CodeValue[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:update', organization.id);
    await this.loadActivePlan(planId, organization.id);
    const type = await this.types.findActiveInPlan(codeTypeId, planId, organization.id);
    if (!type) throw new NotFoundError('Code type not found.');
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const ids = dto.order.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('A code value may appear only once in the order.');
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.values.lockActiveInIdOrder(organization.id, type.id, tx);
      const byId = new Map(locked.map((row) => [row.id, row]));
      if (ids.some((id) => !byId.has(id))) throw new NotFoundError('Code value not found.');
      // Not every live value named: the list changed since the caller read it.
      if (ids.length !== locked.length) throw this.staleError();
      for (const { id, version } of dto.order) {
        if (byId.get(id)?.version !== version) throw this.staleError();
      }
      await this.values.rewritePositions(organization.id, type.id, ids, principal.userId, tx);
      return this.values.findManyActiveInTx(organization.id, type.id, tx);
    });
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeValueId: string,
    context?: RequestContext,
    expectedVersion?: number,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:delete', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);
    const existing = await this.loadActiveValue(codeValueId, planId, organization.id);
    const type = await this.types.findInPlan(existing.codeTypeId, planId, organization.id);
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    await this.prisma.$transaction(async (tx) => {
      // Locked first, so the version compared is the version deleted (TECH_DEBT #450).
      const version = await this.values.lockActiveVersion(
        codeValueId,
        existing.codeTypeId,
        organization.id,
        tx,
      );
      if (expectedVersion !== undefined) {
        assertVersionMatches(version, expectedVersion, 'code value', 'Code value not found.');
      } else if (version === null) {
        throw new NotFoundError('Code value not found.');
      }
      const batchId = await this.values.softDelete(
        codeValueId,
        existing.codeTypeId,
        organization.id,
        principal.userId,
        tx,
      );
      if (batchId === null) throw new NotFoundError('Code value not found.');
      await this.audit.record(
        {
          action: 'code_value.deleted',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'CODE_VALUE',
          subjectId: codeValueId,
          subjectLabel: existing.shortCode,
          before: {
            shortCode: existing.shortCode,
            typeName: type?.name ?? null,
            planName: plan.name,
            deleteBatchId: batchId,
          },
          ...auditActor(principal, context),
        },
        tx,
      );
    });
    this.logger.info(
      { organizationId: organization.id, planId, codeValueId, userId: principal.userId },
      'code value deleted',
    );
  }

  async restore(
    principal: Principal,
    orgSlug: string,
    planId: string,
    codeValueId: string,
    context?: RequestContext,
  ): Promise<CodeValue> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'code:restore', organization.id);

    // The plan in either state: a deleted one is PARENT_DELETED, a missing one is 404.
    const plan = await this.plans.findByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    const existing = await this.values.findInPlan(codeValueId, planId, organization.id);
    if (!existing) throw new NotFoundError('Code value not found.');
    if (plan.deletedAt) throw this.parentDeletedError('the plan');
    await this.editLock.assertHoldsPen(principal, planId, organization.id);
    if (!existing.deletedAt) return existing; // already live — no-op

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
          throw this.parentDeletedError('the plan');
        }
        await acquirePlanWriteLock(tx, plan.id);
        if (!(await this.plans.findActiveByIdInOrg(plan.id, organization.id, tx))) {
          throw this.parentDeletedError('the plan');
        }
        // The type must be live, and stays so until this commits.
        const locked = await this.types.lockActiveForShare(
          organization.id,
          planId,
          [existing.codeTypeId],
          tx,
        );
        if (locked.length === 0) {
          const parent = await this.types.findInPlan(
            existing.codeTypeId,
            planId,
            organization.id,
            tx,
          );
          throw this.parentDeletedError(parent?.name ?? 'the code type');
        }
        const type = await this.types.findActiveInPlan(
          existing.codeTypeId,
          planId,
          organization.id,
          tx,
        );
        if (
          (await this.values.countActive(organization.id, existing.codeTypeId, tx)) >=
          CODE_VALUE_LIMIT
        ) {
          throw this.limitError(type?.name ?? 'this code type');
        }
        const changed = await this.values.restore(
          codeValueId,
          existing.codeTypeId,
          organization.id,
          principal.userId,
          tx,
        );
        if (changed === 0)
          throw new ConflictError('This code value was changed elsewhere.', {
            reason: CODE_CONFLICT.STALE_VERSION,
          });
        await this.audit.record(
          {
            action: 'code_value.restored',
            outcome: 'SUCCESS',
            organizationId: organization.id,
            subjectType: 'CODE_VALUE',
            subjectId: codeValueId,
            subjectLabel: existing.shortCode,
            after: {
              shortCode: existing.shortCode,
              typeName: type?.name ?? null,
              planName: plan.name,
              ...(existing.deleteBatchId === null ? {} : { deleteBatchId: existing.deleteBatchId }),
            },
            ...auditActor(principal, context),
          },
          tx,
        );
      });
    } catch (error) {
      throw this.mapWriteError(error, existing.shortCode);
    }
    this.logger.info(
      { organizationId: organization.id, planId, codeValueId, userId: principal.userId },
      'code value restored',
    );

    const restored = await this.values.findActiveInPlan(codeValueId, planId, organization.id);
    if (!restored) throw new NotFoundError('Code value not found.');
    return restored;
  }

  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /** A live value of this plan and organisation, or 404 — a foreign one reads as missing. */
  private async loadActiveValue(
    codeValueId: string,
    planId: string,
    organizationId: string,
  ): Promise<CodeValue> {
    const value = await this.values.findActiveInPlan(codeValueId, planId, organizationId);
    if (!value) throw new NotFoundError('Code value not found.');
    return value;
  }

  private staleError(): ConflictError {
    return new ConflictError('The code values were changed elsewhere. Refresh and try again.', {
      reason: CODE_CONFLICT.STALE_VERSION,
    });
  }

  private limitError(typeName: string): ValidationError {
    return new ValidationError(
      `${typeName} can have at most ${CODE_VALUE_LIMIT} values. Delete one you no longer use first.`,
      { reason: CODE_CONFLICT.VALUE_LIMIT },
    );
  }

  private parentDeletedError(what: string): ConflictError {
    return new ConflictError(`Restore ${what} first.`, {
      reason: HIERARCHY_CONFLICT.PARENT_DELETED,
    });
  }

  /**
   * The case-insensitive short-code index (`uq_code_values_type_short_code`) is raw SQL Prisma cannot
   * see, so its violation arrives as a bare P2002 — or as a raw-query error carrying SQLSTATE 23505.
   * The message echoes the code the caller itself sent, never a stored row's.
   */
  private mapWriteError(error: unknown, shortCode: string): unknown {
    const isUnique =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' ||
        (error.code === 'P2010' &&
          (error.meta as { code?: string } | undefined)?.code === '23505'));
    return isUnique
      ? new ConflictError(`A value with the short code ${shortCode} already exists in this type.`, {
          reason: CODE_CONFLICT.VALUE_TAKEN,
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
