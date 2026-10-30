import { Injectable } from '@nestjs/common';
import type { Activity, Prisma } from '@prisma/client';
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
import { CodeSwimlaneLaneRepository } from '../codes/code-swimlane-lane.repository';
import { CodeTypeRepository } from '../codes/code-type.repository';
import { CodeValueRepository } from '../codes/code-value.repository';
import { ACTIVITY_BATCH_LIMIT, CODE_CONFLICT } from '../codes/codes.constants';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { ActivityRepository } from './activity.repository';
import type { ActivityCodeValueDto, UpdateActivityCodesDto } from './dto/update-activity-codes.dto';
import { deriveCodeLaneBasis } from './swimlane-lanes';

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
 * **Lanes ride the same write** (p6-activity-codes M4, m4-database-review §3.2). While the plan's
 * swimlanes come from a code, a caller states each activity's lane and this stores it at the basis the
 * activity holds **after** the write, so one request is one undo step. The rows named only in `lanes`
 * are the band's other members, written so the band stays as drawn; they are locked and
 * version-checked in the same id-ordered pass as the movers, never trusted. The plan's source is
 * re-read under the plan lock and must be the code the lanes were planned against (409
 * `SWIMLANE_SOURCE_CHANGED`), because lane indexes planned against one picture are wrong under another.
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
    private readonly codeLanes: CodeSwimlaneLaneRepository,
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
        reason: CODE_CONFLICT.DUPLICATE_CODES_ACTIVITY_ID,
      });
    }
    for (const row of dto.activities) this.assertDistinctTypes(row.codes);
    const idSet = new Set(ids);
    const laneRows = dto.lanes ?? [];
    const lanesTypeId = dto.lanesCodeTypeId;
    if (laneRows.length > 0) {
      if (lanesTypeId === undefined) {
        throw new ValidationError(
          'Lanes need the code type they were planned against: send lanesCodeTypeId with lanes.',
          {
            reason: CODE_CONFLICT.LANES_CODE_TYPE_REQUIRED,
          },
        );
      }
      const laneIds = laneRows.map((row) => row.id);
      if (new Set(laneIds).size !== laneIds.length) {
        throw new ValidationError(
          'Each activity may appear at most once in the lanes: send each activity once.',
          {
            reason: CODE_CONFLICT.DUPLICATE_LANES_ACTIVITY_ID,
          },
        );
      }
      const rowVersion = new Map(dto.activities.map((row) => [row.id, row.version]));
      if (
        laneRows.some((row) => rowVersion.has(row.id) && rowVersion.get(row.id) !== row.version)
      ) {
        throw new ValidationError(
          'An activity in both lists must state one version. Read it again and resend.',
          { reason: CODE_CONFLICT.LANES_VERSION_DISAGREES },
        );
      }
    }
    // The activities written: the movers, then the band's other members that only take a lane.
    const writeRows = [
      ...dto.activities.map((row) => ({ id: row.id, version: row.version })),
      ...laneRows
        .filter((row) => !idSet.has(row.id))
        .map((row) => ({ id: row.id, version: row.version })),
    ];
    if (writeRows.length > ACTIVITY_BATCH_LIMIT) {
      throw new ValidationError(
        `A codes write may change at most ${ACTIVITY_BATCH_LIMIT} activities, lane-only rows included. Split it into smaller steps.`,
        { reason: CODE_CONFLICT.CODES_BATCH_TOO_LARGE },
      );
    }
    const writeIds = writeRows.map((row) => row.id);
    const typeIds = [
      ...new Set(dto.activities.flatMap((row) => row.codes.map((c) => c.codeTypeId))),
    ];
    // The source type is locked with the others: the lanes' basis is a value of it.
    const lockTypeIds =
      laneRows.length > 0 && lanesTypeId !== undefined
        ? [...new Set([...typeIds, lanesTypeId])]
        : typeIds;
    const incomingValueIds = [
      ...new Set(
        dto.activities.flatMap((row) =>
          row.codes.flatMap((c) => (c.codeValueId === null ? [] : [c.codeValueId])),
        ),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      await acquirePlanWriteLock(tx, planId);
      // Re-read under the lock: a plan deleted a moment ago must not take an assignment. The same read
      // supplies the swimlane source, which stays put while we hold the lock (a switch takes it too).
      const lockedPlan = await this.plans.findActiveByIdInOrg(planId, organization.id, tx);
      if (!lockedPlan) throw new NotFoundError('Plan not found.');
      if (
        laneRows.length > 0 &&
        (lockedPlan.swimlaneSource !== 'ACTIVITY_CODE' ||
          lockedPlan.swimlaneCodeTypeId !== lanesTypeId)
      ) {
        throw new ConflictError(
          'The swimlanes changed while you were working. Refresh the plan and try again.',
          { reason: CODE_CONFLICT.SWIMLANE_SOURCE_CHANGED },
        );
      }

      const locked = await lockActivityRowsInIdOrder(tx, organization.id, planId, writeIds);
      // A foreign, deleted or unknown id reads as missing, never told apart.
      if (locked.length !== writeIds.length) {
        throw new NotFoundError('Activity not found in this plan.');
      }
      const versionOf = new Map(locked.map((row) => [row.id, row.version]));
      if (writeRows.some((row) => versionOf.get(row.id) !== row.version)) {
        throw new ConflictError(
          'This plan changed since you opened it — nothing was changed. Refresh and try again.',
          { reason: CODE_CONFLICT.STALE_VERSION },
        );
      }

      // Plain read under the activity locks, which every assignment write holds, so it is stable.
      // Lane rows need the source type's stored value too, for the basis of a neighbour whose codes
      // this write leaves alone.
      const stored = await this.assignments.findStored(
        planId,
        laneRows.length > 0 ? writeIds : ids,
        lockTypeIds,
        tx,
      );
      const before = new Map(stored.map((a) => [`${a.activityId}:${a.codeTypeId}`, a.codeValueId]));
      const storedLaneValueIds =
        laneRows.length > 0 && lanesTypeId !== undefined
          ? laneRows.flatMap((row) => {
              const value = before.get(`${row.id}:${lanesTypeId}`);
              return value === undefined ? [] : [value];
            })
          : [];
      const valueIds = [...new Set([...incomingValueIds, ...storedLaneValueIds])];

      const lockedTypes = await this.types.lockActiveForShare(
        organization.id,
        planId,
        lockTypeIds,
        tx,
      );
      if (lockedTypes.length !== lockTypeIds.length) {
        throw new NotFoundError('Code type not found in this plan.');
      }
      const typeName = new Map(lockedTypes.map((t) => [t.id, t.name]));
      const lockedValues = await this.values.lockForShare(organization.id, planId, valueIds, tx);
      if (lockedValues.length !== valueIds.length) {
        throw new NotFoundError('Code value not found in this plan.');
      }
      const valueInfo = new Map(lockedValues.map((v) => [v.id, v]));
      for (const row of dto.activities) {
        this.assertValuesAssignable(row.codes, valueInfo, typeName);
      }

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

      if (laneRows.length > 0 && lanesTypeId !== undefined) {
        // The basis is the activity's value of the source type AFTER this write: a mover's new value
        // (already checked live above), else what it holds now. A value that is deleted reads as none.
        const after = new Map<string, string | null>();
        for (const row of dto.activities) {
          const own = row.codes.find((c) => c.codeTypeId === lanesTypeId);
          if (own) after.set(row.id, own.codeValueId);
        }
        const liveValueIds = new Set(lockedValues.filter((v) => !v.deleted).map((v) => v.id));
        await this.codeLanes.upsertMany(
          organization.id,
          planId,
          laneRows.map((row) => ({
            activityId: row.id,
            laneIndex: row.laneIndex,
            ...deriveCodeLaneBasis(
              lanesTypeId,
              after.has(row.id)
                ? (after.get(row.id) ?? null)
                : (before.get(`${row.id}:${lanesTypeId}`) ?? null),
              liveValueIds,
            ),
          })),
          tx,
        );
      }

      const bumped = await this.activities.bumpVersions(
        organization.id,
        planId,
        writeRows,
        principal.userId,
        tx,
      );
      if (bumped !== writeRows.length) {
        // Every id was locked at its version above and nothing else writes under these locks.
        throw new ConflictError(
          'This plan changed since you opened it — nothing was changed. Refresh and try again.',
          { reason: CODE_CONFLICT.STALE_VERSION },
        );
      }
      // Recorded last, in this transaction: the recorder takes the history lock, which must be the
      // last lock a write takes (activity-history-lock.ts). A lane-only row has no code change to
      // record, so it is left out rather than offered to the recorder as an empty write.
      await this.history.record(tx, {
        actorUserId: principal.userId,
        scope: 'DEFINITION',
        batch: {},
        writes: this.history.codeWrites(planId, changes),
      });
    });

    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId, count: writeIds.length },
      'activity codes updated',
    );

    // The written rows at their fresh versions, so the client can reconcile optimistic state.
    const items = await this.prisma.activity.findMany({
      where: { organizationId: organization.id, planId, id: { in: writeIds }, deletedAt: null },
    });
    return { items, canReadCost };
  }

  /** Refuse a value that is another type's or deleted, naming the way forward in the message. */
  private assertValuesAssignable(
    codes: readonly ActivityCodeValueDto[],
    valueInfo: ReadonlyMap<string, { codeTypeId: string; deleted: boolean }>,
    typeName: ReadonlyMap<string, string>,
  ): void {
    for (const c of codes) {
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

  /** Refuse the same code type twice in one activity's `codes`, before any lock is taken. */
  assertDistinctTypes(codes: readonly ActivityCodeValueDto[]): void {
    const typeIds = codes.map((c) => c.codeTypeId);
    if (new Set(typeIds).size !== typeIds.length) {
      throw new ValidationError('Each code type may appear at most once for an activity.', {
        reason: CODE_CONFLICT.DUPLICATE_CODES_TYPE_ID,
      });
    }
  }

  /**
   * The codes of a **new** activity, inside the create transaction after the insert and before the
   * scheduling-input stamp (database-architect confirmation, m4-record §2): code types `FOR SHARE`,
   * then values `FOR SHARE` in id order, then the assignment insert. The row is this transaction's
   * own, so no activity lock is involved; a `null` value is "no value" and writes nothing. No history
   * entry and no code lane row: create records none today, and an unplaced activity has no lane (the
   * next positions batch or codes write stores one).
   */
  async assignOnCreate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    planId: string,
    activityId: string,
    codes: readonly ActivityCodeValueDto[],
  ): Promise<void> {
    if (codes.length === 0) return;
    const typeIds = codes.map((c) => c.codeTypeId);
    const valueIds = [
      ...new Set(codes.flatMap((c) => (c.codeValueId === null ? [] : [c.codeValueId]))),
    ];
    const lockedTypes = await this.types.lockActiveForShare(organizationId, planId, typeIds, tx);
    if (lockedTypes.length !== typeIds.length) {
      throw new NotFoundError('Code type not found in this plan.');
    }
    const lockedValues = await this.values.lockForShare(organizationId, planId, valueIds, tx);
    if (lockedValues.length !== valueIds.length) {
      throw new NotFoundError('Code value not found in this plan.');
    }
    this.assertValuesAssignable(
      codes,
      new Map(lockedValues.map((v) => [v.id, v])),
      new Map(lockedTypes.map((t) => [t.id, t.name])),
    );
    await this.assignments.upsertMany(
      organizationId,
      planId,
      codes.flatMap((c) =>
        c.codeValueId === null
          ? []
          : [{ activityId, codeTypeId: c.codeTypeId, codeValueId: c.codeValueId }],
      ),
      tx,
    );
  }
}
