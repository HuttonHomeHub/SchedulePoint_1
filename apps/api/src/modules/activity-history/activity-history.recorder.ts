import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityHistoryScope } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { acquireActivityHistoryLocks } from '../../common/db/activity-history-lock';

import { hasNonCostChange, planRecord, type RecordPlan } from './activity-history.diff';
import type { LatestEntry, StoredChanges } from './activity-history.types';

/** One activity's share of a write: what changed on it, and the plan it belongs to (for the lock). */
export interface RecordedActivityWrite {
  activityId: string;
  planId: string;
  changes: StoredChanges;
}

export interface RecordInput {
  actorUserId: string;
  scope: ActivityHistoryScope;
  writes: readonly RecordedActivityWrite[];
}

interface ProbeRow {
  activityId: string;
  organizationId: string;
  entryId: string | null;
  actorUserId: string | null;
  scope: ActivityHistoryScope | null;
  firstRecordedAt: Date | null;
  lastRecordedAt: Date | null;
  editCount: number | null;
  batchId: string | null;
  changes: StoredChanges | null;
}

/**
 * Transactions that have already recorded. A `Prisma.TransactionClient` is one object per
 * interactive transaction, so a `WeakSet` is a per-transaction flag that cannot leak.
 */
const RECORDED = new WeakSet<object>();

/**
 * **The recorder** (ADR-0174): applies the pure diff-and-merge of `activity-history.diff.ts` inside a
 * write's own transaction, under the history lock.
 *
 * ## The two rules it enforces on its callers
 *
 * - **Last lock.** Call it after everything else the transaction locks, immediately before commit
 *   (an audit insert may follow). It takes the history lock, and the lock's deadlock-freedom rests on
 *   it being the last one taken (`common/db/activity-history-lock.ts`).
 * - **Once per transaction.** Every plan and activity the write records goes in one call, so the
 *   locks are taken in one acquisition. A second call in the same transaction throws: that is a
 *   programming error, not a runtime condition to degrade around.
 *
 * ## A failed record fails the write
 *
 * Nothing here is best-effort and nothing is caught. A recorder that swallowed its own failure would
 * leave a silent gap the reader of the history cannot detect, which is the one property the feature
 * must not have (spec §2 "Error scenarios").
 *
 * A write with nothing to record — every item net-zero, or none — takes no lock and issues no
 * statement, so a no-op save costs a history-enabled write nothing.
 */
@Injectable()
export class ActivityHistoryRecorder {
  constructor(
    @InjectPinoLogger(ActivityHistoryRecorder.name) private readonly logger: PinoLogger,
  ) {}

  async record(tx: Prisma.TransactionClient, input: RecordInput): Promise<void> {
    if (RECORDED.has(tx)) {
      throw new Error(
        'ActivityHistoryRecorder.record was called twice in one transaction; every activity a ' +
          'write records must go in a single call so the history locks are taken in one order.',
      );
    }
    RECORDED.add(tx);

    const writes = input.writes.filter((w) => Object.keys(w.changes).length > 0);
    if (writes.length === 0) return;

    await acquireActivityHistoryLocks(tx, {
      planIds: writes.map((w) => w.planId),
      activityIds: writes.map((w) => w.activityId),
    });

    // Read AFTER the lock is held. `now()` is the transaction's start and could date this entry
    // before one a concurrent recorder committed while we waited; `clock_timestamp()` cannot, and
    // `planRecord` clamps against the latest entry besides.
    const clock = await tx.$queryRaw<{ t: Date }[]>`
      SELECT date_trunc('milliseconds', clock_timestamp()) AS t`;
    const t = clock[0]?.t;
    if (!t) throw new Error('ActivityHistoryRecorder: the database returned no clock reading');

    const probes = await this.probe(
      tx,
      writes.map((w) => w.activityId),
    );

    for (const write of writes) {
      const row = probes.get(write.activityId);
      if (!row) {
        throw new Error(`ActivityHistoryRecorder: activity ${write.activityId} does not exist`);
      }
      const plan = planRecord(
        row.entryId === null ? null : toLatest(row),
        {
          actorUserId: input.actorUserId,
          scope: input.scope,
          isBatch: false,
          changes: write.changes,
        },
        t,
      );
      await this.apply(tx, plan, row, input, write);
      this.logger.debug(
        { activityId: write.activityId, scope: input.scope, historyEntry: plan.action },
        'activity history recorded',
      );
    }
  }

  /**
   * The latest entry for each activity (whoever made it) and the activity's organisation, in one
   * statement. The organisation is read here, from the activity row, and copied onto the entry —
   * never taken from the request, so a write cannot plant a row in another tenant (R5).
   */
  private async probe(
    tx: Prisma.TransactionClient,
    activityIds: readonly string[],
  ): Promise<Map<string, ProbeRow>> {
    const rows = await tx.$queryRaw<ProbeRow[]>`
      SELECT a.id AS "activityId", a.organization_id AS "organizationId",
             e.id AS "entryId", e.actor_user_id AS "actorUserId", e.scope::text AS scope,
             e.first_recorded_at AS "firstRecordedAt", e.last_recorded_at AS "lastRecordedAt",
             e.edit_count AS "editCount", e.batch_id AS "batchId", e.changes AS changes
      FROM unnest(${[...activityIds]}::uuid[]) AS u(id)
      JOIN activities a ON a.id = u.id
      LEFT JOIN LATERAL (
        SELECT * FROM activity_history_entries h
        WHERE h.activity_id = a.id
        ORDER BY h.first_recorded_at DESC, h.id DESC
        LIMIT 1
      ) e ON true`;
    return new Map(rows.map((r) => [r.activityId, r]));
  }

  private async apply(
    tx: Prisma.TransactionClient,
    plan: RecordPlan,
    row: ProbeRow,
    input: RecordInput,
    write: RecordedActivityWrite,
  ): Promise<void> {
    switch (plan.action) {
      case 'none':
        return;
      case 'drop':
        await tx.activityHistoryEntry.delete({ where: { id: plan.entryId } });
        return;
      case 'merge':
        await tx.activityHistoryEntry.update({
          where: { id: plan.entryId },
          data: {
            changes: plan.changes as unknown as Prisma.InputJsonObject,
            lastRecordedAt: plan.lastRecordedAt,
            editCount: { increment: 1 },
            hasNonCostChange: hasNonCostChange(plan.changes),
          },
        });
        return;
      case 'insert':
        await tx.activityHistoryEntry.create({
          data: {
            organizationId: row.organizationId,
            activityId: write.activityId,
            actorUserId: input.actorUserId,
            scope: input.scope,
            firstRecordedAt: plan.firstRecordedAt,
            lastRecordedAt: plan.firstRecordedAt,
            hasNonCostChange: hasNonCostChange(plan.changes),
            changes: plan.changes as unknown as Prisma.InputJsonObject,
          },
        });
        return;
    }
  }
}

function toLatest(row: ProbeRow): LatestEntry {
  return {
    id: row.entryId as string,
    actorUserId: row.actorUserId as string,
    scope: row.scope as ActivityHistoryScope,
    firstRecordedAt: row.firstRecordedAt as Date,
    lastRecordedAt: row.lastRecordedAt as Date,
    editCount: row.editCount as number,
    batchId: row.batchId,
    changes: row.changes as StoredChanges,
  };
}
