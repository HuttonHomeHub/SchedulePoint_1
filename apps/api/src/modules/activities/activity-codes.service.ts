import { Injectable } from '@nestjs/common';
import type { Activity } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Principal } from '../../common/auth/principal';
import { lockActivityRowsInIdOrder } from '../../common/db/activity-row-lock';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityHistoryRecorder } from '../activity-history/activity-history.recorder';
import { CodeAssignmentRepository } from '../codes/code-assignment.repository';
import { CodeTypeRepository } from '../codes/code-type.repository';
import { CodeValueRepository } from '../codes/code-value.repository';
import { CODE_CONFLICT } from '../codes/codes.constants';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { ActivityRepository } from './activity.repository';
import type { UpdateActivityCodesDto } from './dto/update-activity-codes.dto';

/**
 * The batch write of an activity's code values (p6-activity-codes spec §4.7, database-design §5.4).
 *
 * **An assignment is an activity write.** It takes the pen, holds the activity row lock, bumps the
 * activity's `version` (which is the optimistic lock for its codes, so a stale row is the same 409 as
 * a stale edit) and is recorded in the activity's history as a `code:<codeTypeId>` item under the
 * `DEFINITION` scope. It touches no input to the CPM engine (`swimlaneCodeTypeId` and the code tables
 * are `NOT_INPUT`), so unlike a re-parent it does not mark the plan's schedule stale.
 *
 * **Lock order** (database-design §15): plan advisory lock → activities in id order → code types
 * `FOR SHARE` → code values `FOR SHARE`, then the history lock last. Type delete and the swimlane
 * source switch take the plan lock too, which serialises the delete-the-source check with this write.
 *
 * `organization_id` on every row written comes from the plan resolved from the path and the caller's
 * own memberships, never from the body (security review S1): the DTO has no such field and the global
 * validation pipe refuses one that is sent.
 */
@Injectable()
export class ActivityCodesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly types: CodeTypeRepository,
    private readonly values: CodeValueRepository,
    private readonly assignments: CodeAssignmentRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly history: ActivityHistoryRecorder,
    @InjectPinoLogger(ActivityCodesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Set or clear code values on a batch of activities, all or nothing. Returns the written activities
   * at their fresh versions, in no particular order.
   */
  async write(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: UpdateActivityCodesDto,
  ): Promise<{ items: Activity[]; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    if (!principal.can('activity:update', organization.id)) {
      this.logger.warn(
        {
          userId: principal.userId,
          permission: 'activity:update',
          organizationId: organization.id,
        },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
    const canReadCost = principal.can('cost:read', organization.id);
    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const ids = dto.activities.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Each activity may appear at most once in a codes batch.', {
        reason: 'DUPLICATE_CODES_ACTIVITY_ID',
      });
    }
    for (const row of dto.activities) {
      const typeIds = row.codes.map((c) => c.codeTypeId);
      if (new Set(typeIds).size !== typeIds.length) {
        throw new ValidationError('Each code type may appear at most once for an activity.', {
          reason: 'DUPLICATE_CODES_TYPE_ID',
        });
      }
    }
    const typeIds = [
      ...new Set(dto.activities.flatMap((row) => row.codes.map((c) => c.codeTypeId))),
    ];
    const valueIds = [
      ...new Set(
        dto.activities.flatMap((row) =>
          row.codes.flatMap((c) => (c.codeValueId === null ? [] : [c.codeValueId])),
        ),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      await acquirePlanWriteLock(tx, planId);
      // Re-read under the lock: a plan deleted a moment ago must not take an assignment.
      if (!(await this.plans.findActiveByIdInOrg(planId, organization.id, tx))) {
        throw new NotFoundError('Plan not found.');
      }

      const locked = await lockActivityRowsInIdOrder(tx, organization.id, planId, ids);
      // A foreign, deleted or unknown id reads as missing, never told apart.
      if (locked.length !== ids.length) throw new NotFoundError('Activity not found in this plan.');
      const versionOf = new Map(locked.map((row) => [row.id, row.version]));
      if (dto.activities.some((row) => versionOf.get(row.id) !== row.version)) {
        throw new ConflictError(
          'This plan changed since you opened it — nothing was changed. Refresh and try again.',
          { reason: CODE_CONFLICT.STALE_VERSION },
        );
      }

      const lockedTypes = await this.types.lockActiveForShare(organization.id, planId, typeIds, tx);
      if (lockedTypes.length !== typeIds.length) {
        throw new NotFoundError('Code type not found in this plan.');
      }
      const typeName = new Map(lockedTypes.map((t) => [t.id, t.name]));
      const lockedValues = await this.values.lockForShare(organization.id, planId, valueIds, tx);
      if (lockedValues.length !== valueIds.length) {
        throw new NotFoundError('Code value not found in this plan.');
      }
      const valueInfo = new Map(lockedValues.map((v) => [v.id, v]));
      for (const row of dto.activities) {
        for (const c of row.codes) {
          if (c.codeValueId === null) continue;
          const value = valueInfo.get(c.codeValueId)!;
          if (value.codeTypeId !== c.codeTypeId) {
            throw new ValidationError(
              `That value does not belong to ${typeName.get(c.codeTypeId) ?? 'this code type'}.`,
              { reason: CODE_CONFLICT.VALUE_WRONG_TYPE },
            );
          }
          if (value.deleted) {
            throw new ValidationError('That value was deleted.', {
              reason: CODE_CONFLICT.VALUE_DELETED,
            });
          }
        }
      }

      const stored = await this.assignments.findStored(planId, ids, typeIds, tx);
      const before = new Map(stored.map((a) => [`${a.activityId}:${a.codeTypeId}`, a.codeValueId]));
      const upserts: { activityId: string; codeTypeId: string; codeValueId: string }[] = [];
      const clears: { activityId: string; codeTypeId: string }[] = [];
      const changes = dto.activities.map((row) => ({
        id: row.id,
        changes: row.codes.map((c) => {
          const from = before.get(`${row.id}:${c.codeTypeId}`) ?? null;
          if (c.codeValueId !== from) {
            if (c.codeValueId === null)
              clears.push({ activityId: row.id, codeTypeId: c.codeTypeId });
            else
              upserts.push({
                activityId: row.id,
                codeTypeId: c.codeTypeId,
                codeValueId: c.codeValueId,
              });
          }
          return { codeTypeId: c.codeTypeId, from, to: c.codeValueId };
        }),
      }));
      await this.assignments.upsertMany(organization.id, planId, upserts, tx);
      await this.assignments.deleteMany(planId, clears, tx);

      const bumped = await this.activities.bumpVersions(
        organization.id,
        planId,
        dto.activities,
        principal.userId,
        tx,
      );
      if (bumped !== dto.activities.length) {
        // Every id was locked at its version above and nothing else writes under these locks.
        throw new ConflictError(
          'This plan changed since you opened it — nothing was changed. Refresh and try again.',
          { reason: CODE_CONFLICT.STALE_VERSION },
        );
      }
      // Recorded last, in this transaction: the recorder takes the history lock, which must be the
      // last lock a write takes (activity-history-lock.ts).
      await this.history.record(tx, {
        actorUserId: principal.userId,
        scope: 'DEFINITION',
        batch: {},
        writes: this.history.codeWrites(planId, changes),
      });
    });

    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId, count: ids.length },
      'activity codes updated',
    );

    // The written rows at their fresh versions, so the client can reconcile optimistic state.
    const items = await this.prisma.activity.findMany({
      where: { organizationId: organization.id, planId, id: { in: ids }, deletedAt: null },
    });
    return { items, canReadCost };
  }
}
