import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityDependency, type ResourceAssignment } from '@prisma/client';
import {
  activityHistoryItemKind,
  type ActivityHistoryResourceRef,
  type ActivityHistoryScope,
} from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { acquireActivityHistoryLocks } from '../../common/db/activity-history-lock';

import { MAX_KEYED_ITEMS_PER_ENTRY } from './activity-history.constants';
import {
  assignmentChange,
  assignmentItem,
  assignmentKey,
  assignmentState,
  changedReferenceIds,
  diffActivity,
  hasNonCostChange,
  isNetZero,
  linkItem,
  linkKey,
  linkState,
  planRecord,
  type ActivityRecordedRow,
  type RecordPlan,
} from './activity-history.diff';
import {
  combineChanges,
  type PendingChanges,
  type ResolvedNames,
} from './activity-history.pending';
import type { LatestEntry, StoredChanges } from './activity-history.types';

/** The assignment columns a state is built from (the row Prisma returns satisfies it). */
export type AssignmentRow = Pick<
  ResourceAssignment,
  | 'id'
  | 'resourceId'
  | 'budgetedUnits'
  | 'unitsPerHour'
  | 'actualUnits'
  | 'isDriving'
  | 'curveType'
  | 'lagMinutes'
  | 'budgetedCost'
  | 'actualCost'
>;

/** The link columns a state is built from. */
export type LinkRow = Pick<ActivityDependency, 'type' | 'lagMinutes' | 'lagCalendar'>;

/** One activity's share of a write: what changed on it, and the plan it belongs to (for the lock). */
export interface RecordedActivityWrite {
  activityId: string;
  planId: string;
  changes: PendingChanges;
}

export interface RecordInput {
  actorUserId: string;
  scope: ActivityHistoryScope;
  writes: readonly RecordedActivityWrite[];
}

interface ProbeRow {
  activityId: string;
  organizationId: string;
  /** Database time, read once per statement under the history lock. */
  now: Date;
  entryId: string | null;
  actorUserId: string | null;
  scope: ActivityHistoryScope | null;
  firstRecordedAt: Date | null;
  lastRecordedAt: Date | null;
  editCount: number | null;
  batchId: string | null;
  changes: StoredChanges | null;
  /** The activity's own code and name: the other end of a link names this one. */
  code: string | null;
  name: string;
  /** The reference names the writes asked for, on one row per statement (the others are null). */
  names: ProbedNames | null;
}

interface ProbedNames {
  calendars: Record<string, string>;
  parents: Record<string, string>;
  resources: Record<string, { code: string | null; name: string }>;
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
    // Fail closed: outside a transaction the lock would be released at the end of its own statement
    // and the recorder would silently stop serialising anything. A Prisma interactive-transaction
    // client has no `$transaction`; the root client does.
    if ('$transaction' in tx) {
      throw new Error('ActivityHistoryRecorder.record must be called with a transaction client.');
    }
    if (RECORDED.has(tx)) {
      throw new Error(
        'ActivityHistoryRecorder.record was called twice in one transaction; every activity a ' +
          'write records must go in a single call so the history locks are taken in one order.',
      );
    }
    RECORDED.add(tx);

    const writes = input.writes.filter((w) => w.changes.keys.length > 0);
    if (writes.length === 0) return;
    for (const w of writes) {
      // A single-object write produces at most two keyed items for one activity; more is a caller
      // bug (the knock-on path of the second milestone must chunk) and would risk the size CHECK.
      const keyed = w.changes.keys.filter((k) => activityHistoryItemKind(k) !== 'field');
      if (keyed.length > MAX_KEYED_ITEMS_PER_ENTRY) {
        throw new Error(
          `ActivityHistoryRecorder: ${keyed.length} keyed items for one activity exceeds ${MAX_KEYED_ITEMS_PER_ENTRY}`,
        );
      }
    }

    await acquireActivityHistoryLocks(tx, {
      planIds: writes.map((w) => w.planId),
      activityIds: writes.map((w) => w.activityId),
    });

    // The probe also reads the clock, so it is one statement: it runs AFTER the lock is held. `now()`
    // is the transaction's start and could date this entry before one a concurrent recorder committed
    // while we waited; `clock_timestamp()` cannot, and `planRecord` clamps against the latest entry.
    const probes = await this.probe(tx, writes);
    const t = [...probes.rows.values()][0]?.now;
    if (!t) throw new Error('ActivityHistoryRecorder: the probe returned no activity or clock');

    const batch: WriteBatch = { drop: [], merge: [], insert: [] };
    for (const write of writes) {
      const row = probes.rows.get(write.activityId);
      if (!row) {
        throw new Error(`ActivityHistoryRecorder: activity ${write.activityId} does not exist`);
      }
      const plan = planRecord(
        row.entryId === null ? null : toLatest(row),
        {
          actorUserId: input.actorUserId,
          scope: input.scope,
          isBatch: false,
          changes: write.changes.build(probes.names),
        },
        t,
      );
      stage(batch, plan, row, write.activityId);
      this.logger.debug(
        { activityId: write.activityId, scope: input.scope, historyEntry: plan.action },
        'activity history recorded',
      );
    }
    await this.flush(tx, batch, input);
  }

  /**
   * The activity's own recorded changes between two reads of it. The names of any calendar or WBS
   * parent that changed are read by the recorder, under the lock, in the probe (the entry names them
   * as they are then).
   */
  activityFieldChanges(before: ActivityRecordedRow, after: ActivityRecordedRow): PendingChanges {
    const refs = changedReferenceIds(before, after);
    return {
      keys: Object.keys(diffActivity(before, after, NO_NAMES)),
      refs: { ...refs, resourceIds: [] },
      build: (names) =>
        diffActivity(before, after, { calendars: names.calendars, parents: names.parents }),
    };
  }

  /**
   * One `assignment:<id>` item per `(before, after)` pair, naming the resource as it is now. A pair
   * with `before: null` is an add, with `after: null` a removal; a change that moved nothing a planner
   * can set (a version bump alone) yields no item.
   */
  assignmentChanges(
    pairs: ReadonlyArray<{ before: AssignmentRow | null; after: AssignmentRow | null }>,
  ): PendingChanges {
    const items = (
      resourceOf: (row: AssignmentRow) => ActivityHistoryResourceRef,
    ): StoredChanges => {
      const changes: StoredChanges = {};
      for (const { before, after } of pairs) {
        const row = after ?? before;
        if (!row) continue;
        const from = before ? assignmentState(before) : null;
        const to = after ? assignmentState(after) : null;
        const resource = resourceOf(row);
        const item =
          from === null || to === null
            ? assignmentItem(resource, from, to)
            : assignmentChange(resource, from, to);
        if (item) changes[assignmentKey(row.id)] = item;
      }
      return changes;
    };
    const resourceIds = [
      ...new Set(
        pairs.flatMap((p) => [p.before?.resourceId, p.after?.resourceId]).filter((id) => !!id),
      ),
    ] as string[];
    return {
      keys: Object.keys(items((row) => ({ id: row.resourceId, code: null, name: '' }))),
      refs: { calendarIds: [], parentIds: [], resourceIds },
      build: (names) =>
        items((row) => {
          const resource = names.resources.get(row.resourceId);
          if (!resource) {
            throw new Error(`ActivityHistoryRecorder: resource ${row.resourceId} is gone`);
          }
          return resource;
        }),
    };
  }

  /**
   * The two writes a link change records — one on each endpoint — with each end naming the other as
   * it is named now, in this transaction. `from: null` is an add, `to: null` a removal. A link lies
   * wholly inside one plan, so the plan the link row carries is both ends' plan.
   */
  linkWrites(link: {
    id: string;
    planId: string;
    predecessorId: string;
    successorId: string;
    before: LinkRow | null;
    after: LinkRow | null;
  }): RecordedActivityWrite[] {
    const from = link.before ? linkState(link.before) : null;
    const to = link.after ? linkState(link.after) : null;
    // A PATCH that re-sent the same type and lag changed nothing: no item, so no entry.
    if (
      from !== null &&
      to !== null &&
      isNetZero(linkKey(link.id), linkItem('IN', { id: '', code: null, name: '' }, from, to))
    ) {
      return [];
    }
    const key = linkKey(link.id);
    const end =
      (dir: 'IN' | 'OUT', otherId: string): PendingChanges['build'] =>
      (names) => {
        const other = names.activities.get(otherId);
        if (!other)
          throw new Error(`ActivityHistoryRecorder: an endpoint of link ${link.id} is gone`);
        return { [key]: linkItem(dir, other, from, to) };
      };
    const pending = (dir: 'IN' | 'OUT', otherId: string): PendingChanges => ({
      keys: [key],
      refs: { calendarIds: [], parentIds: [], resourceIds: [] },
      build: end(dir, otherId),
    });
    return [
      {
        activityId: link.predecessorId,
        planId: link.planId,
        changes: pending('OUT', link.successorId),
      },
      {
        activityId: link.successorId,
        planId: link.planId,
        changes: pending('IN', link.predecessorId),
      },
    ];
  }

  /**
   * The latest entry for each activity (whoever made it), the activity's organisation and its own
   * name, and the reference names the writes asked for — in one statement. The organisation is read
   * here, from the activity row, and copied onto the entry — never taken from the request, so a write
   * cannot plant a row in another tenant (R5).
   *
   * The names ride on the first row only, so a many-activity write does not repeat them per row.
   */
  private async probe(
    tx: Prisma.TransactionClient,
    writes: readonly RecordedActivityWrite[],
  ): Promise<{ rows: Map<string, ProbeRow>; names: ResolvedNames }> {
    const refs = combineChanges(...writes.map((w) => w.changes)).refs;
    // soft-delete: any-state — records the entry for an activity as it is being soft-deleted, and names the calendar, WBS parent and resource as they are now (a deleted one still has a name), so no row may be filtered out.
    const rows = await tx.$queryRaw<ProbeRow[]>`
      WITH names AS (
        SELECT jsonb_build_object(
          'calendars', COALESCE((SELECT jsonb_object_agg(c.id, c.name) FROM calendars c
                                 WHERE c.id = ANY(${[...refs.calendarIds]}::uuid[])), '{}'::jsonb),
          'parents', COALESCE((SELECT jsonb_object_agg(p.id, p.name) FROM activities p
                               WHERE p.id = ANY(${[...refs.parentIds]}::uuid[])), '{}'::jsonb),
          'resources', COALESCE((SELECT jsonb_object_agg(r.id,
                                   jsonb_build_object('code', r.code, 'name', r.name))
                                 FROM resources r
                                 WHERE r.id = ANY(${[...refs.resourceIds]}::uuid[])), '{}'::jsonb)
        ) AS j
      )
      SELECT a.id AS "activityId", a.organization_id AS "organizationId",
             a.code AS code, a.name AS name,
             date_trunc('milliseconds', clock_timestamp()) AS "now",
             e.id AS "entryId", e.actor_user_id AS "actorUserId", e.scope::text AS scope,
             e.first_recorded_at AS "firstRecordedAt", e.last_recorded_at AS "lastRecordedAt",
             e.edit_count AS "editCount", e.batch_id AS "batchId", e.changes AS changes,
             CASE WHEN u.ord = 1 THEN names.j END AS names
      FROM unnest(${writes.map((w) => w.activityId)}::uuid[]) WITH ORDINALITY AS u(id, ord)
      JOIN activities a ON a.id = u.id
      CROSS JOIN names
      LEFT JOIN LATERAL (
        SELECT * FROM activity_history_entries h
        WHERE h.activity_id = a.id
        ORDER BY h.first_recorded_at DESC, h.id DESC
        LIMIT 1
      ) e ON true`;
    const byActivity = new Map(rows.map((r) => [r.activityId, r]));
    const probed = rows.find((r) => r.names !== null)?.names;
    const resources = new Map<string, ActivityHistoryResourceRef>();
    for (const [id, r] of Object.entries(probed?.resources ?? {})) {
      resources.set(id, { id, code: r.code, name: r.name });
    }
    return {
      rows: byActivity,
      names: {
        calendars: new Map(Object.entries(probed?.calendars ?? {})),
        parents: new Map(Object.entries(probed?.parents ?? {})),
        resources,
        activities: new Map(
          rows.map((r) => [r.activityId, { id: r.activityId, code: r.code, name: r.name }]),
        ),
      },
    };
  }

  /**
   * Every staged entry write of the call, in ONE statement: plain parameterised SQL with no
   * `RETURNING`, because Prisma's model calls cost about twice a raw statement here (they return the
   * whole row, including the `changes` document, and deserialise it) and a link writes two entries.
   * A data-modifying CTE runs whether or not the main query reads it.
   */
  private async flush(
    tx: Prisma.TransactionClient,
    batch: WriteBatch,
    input: RecordInput,
  ): Promise<void> {
    if (batch.drop.length + batch.merge.length + batch.insert.length === 0) return;
    const dropIds = batch.drop;
    const merge = batch.merge;
    const insert = batch.insert;
    await tx.$executeRaw`
      WITH dropped AS (
        DELETE FROM activity_history_entries WHERE id = ANY(${dropIds}::uuid[])
      ), merged AS (
        UPDATE activity_history_entries e
        SET changes = v.changes::jsonb, last_recorded_at = v.at::timestamptz,
            edit_count = e.edit_count + 1, has_non_cost_change = v.non_cost
        FROM unnest(
          ${merge.map((m) => m.id)}::uuid[], ${merge.map((m) => m.changes)}::text[],
          ${merge.map((m) => m.at)}::text[], ${merge.map((m) => m.nonCost)}::boolean[]
        ) AS v(id, changes, at, non_cost)
        WHERE e.id = v.id
      )
      INSERT INTO activity_history_entries (
        id, organization_id, activity_id, actor_user_id, scope,
        first_recorded_at, last_recorded_at, has_non_cost_change, changes
      )
      SELECT v.id, v.organization_id, v.activity_id, ${input.actorUserId},
             ${input.scope}::activity_history_scope, v.at::timestamptz, v.at::timestamptz,
             v.non_cost, v.changes::jsonb
      FROM unnest(
        ${insert.map((i) => i.id)}::uuid[], ${insert.map((i) => i.organizationId)}::uuid[],
        ${insert.map((i) => i.activityId)}::uuid[], ${insert.map((i) => i.changes)}::text[],
        ${insert.map((i) => i.at)}::text[], ${insert.map((i) => i.nonCost)}::boolean[]
      ) AS v(id, organization_id, activity_id, changes, at, non_cost)`;
  }
}

interface WriteBatch {
  drop: string[];
  merge: Array<{ id: string; changes: string; at: string; nonCost: boolean }>;
  insert: Array<{
    id: string;
    organizationId: string;
    activityId: string;
    changes: string;
    at: string;
    nonCost: boolean;
  }>;
}

const NO_NAMES = { calendars: new Map<string, string>(), parents: new Map<string, string>() };

/** Stage one activity's plan into the call's single write statement. */
function stage(batch: WriteBatch, plan: RecordPlan, row: ProbeRow, activityId: string): void {
  switch (plan.action) {
    case 'none':
      return;
    case 'drop':
      batch.drop.push(plan.entryId);
      return;
    case 'merge':
      batch.merge.push({
        id: plan.entryId,
        changes: JSON.stringify(plan.changes),
        at: plan.lastRecordedAt.toISOString(),
        nonCost: hasNonCostChange(plan.changes),
      });
      return;
    case 'insert':
      batch.insert.push({
        id: uuidV7(plan.firstRecordedAt),
        organizationId: row.organizationId,
        activityId,
        changes: JSON.stringify(plan.changes),
        at: plan.firstRecordedAt.toISOString(),
        nonCost: hasNonCostChange(plan.changes),
      });
      return;
  }
}

/**
 * A UUID v7 for a raw insert (house primary-key convention: time-ordered, so the key index appends).
 * Prisma mints these itself for a model `create`; a raw statement has to bring its own. The
 * timestamp is the entry's own database time, so the key orders with `first_recorded_at`.
 */
function uuidV7(at: Date): string {
  const b = randomBytes(16);
  b.writeUIntBE(at.getTime(), 0, 6);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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
