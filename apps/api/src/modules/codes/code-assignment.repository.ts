import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityCodeAssignment } from '@repo/types';

import { uuidV7 } from '../../common/db/uuid-v7';
import { PrismaService } from '../../prisma/prisma.service';

/** One stored assignment, as the write's before-state needs it (the value may be a deleted one). */
export interface StoredAssignment {
  activityId: string;
  codeTypeId: string;
  codeValueId: string;
}

/**
 * The codes an activity response carries (p6-activity-codes spec §4.7). `null` when the plan has no
 * live code type: the caller then sends no `codes` key at all, so a plan that never used codes answers
 * byte for byte as before (SC-2). Otherwise every activity of the page has an entry, `[]` for none.
 *
 * **Loaded per page, never as a to-one include** (database-design §9.2, §9.3): one statement for the
 * page's assignments joined to their live value and live type, so a deleted value or type reads as
 * "no value" and comes back when restored. The join states `deleted_at` for both tables (ADR-0172).
 */
export async function loadActivityCodes(
  db: Pick<PrismaService, 'codeType' | '$queryRaw'>,
  scope: { organizationId: string; planId: string },
  activityIds: readonly string[],
): Promise<Map<string, ActivityCodeAssignment[]> | null> {
  if (activityIds.length === 0) return null;
  const [anyType, rows] = await Promise.all([
    db.codeType.findFirst({
      where: { organizationId: scope.organizationId, planId: scope.planId, deletedAt: null },
      select: { id: true },
    }),
    db.$queryRaw<{ activityId: string; codeTypeId: string; codeValueId: string }[]>`
      SELECT cva.activity_id AS "activityId", cva.code_type_id AS "codeTypeId",
             cva.code_value_id AS "codeValueId"
      FROM code_value_assignments cva
      JOIN code_values v ON v.id = cva.code_value_id AND v.deleted_at IS NULL
      JOIN code_types t ON t.id = cva.code_type_id AND t.deleted_at IS NULL
      WHERE cva.plan_id = ${scope.planId}::uuid
        AND cva.organization_id = ${scope.organizationId}::uuid
        AND cva.activity_id IN (SELECT u FROM unnest(${[...activityIds]}::uuid[]) AS u)
      ORDER BY cva.activity_id, cva.code_type_id
    `,
  ]);
  if (anyType === null) return null;
  const byActivity = new Map<string, ActivityCodeAssignment[]>(activityIds.map((id) => [id, []]));
  for (const row of rows) {
    byActivity
      .get(row.activityId)
      ?.push({ codeTypeId: row.codeTypeId, codeValueId: row.codeValueId });
  }
  return byActivity;
}

/**
 * Data-access for `code_value_assignments` (database-design §5.4). A join row: no `deleted_at`, no
 * version of its own. It is written only inside an activity write that holds the activity row lock
 * and bumps `activities.version`, so the activity's version is its optimistic lock. Rows are written
 * through plain columns, set-based (database-design §16.3 D-P1), with `organization_id` taken from the
 * caller's loaded plan.
 */
@Injectable()
export class CodeAssignmentRepository {
  /**
   * The stored assignments of these activities for these types, deleted values included: the
   * before-state of a write, so a change from a deleted value to another is recorded as such.
   */
  findStored(
    planId: string,
    activityIds: readonly string[],
    codeTypeIds: readonly string[],
    db: Prisma.TransactionClient,
  ): Promise<StoredAssignment[]> {
    return db.codeValueAssignment.findMany({
      where: {
        planId,
        activityId: { in: [...activityIds] },
        codeTypeId: { in: [...codeTypeIds] },
      },
      select: { activityId: true, codeTypeId: true, codeValueId: true },
    });
  }

  /** Set the value of each (activity, type) pair, adding the row or changing it in place. */
  async upsertMany(
    organizationId: string,
    planId: string,
    rows: readonly StoredAssignment[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    await db.$executeRaw`
      INSERT INTO code_value_assignments
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, created_at, updated_at)
      SELECT v.id, ${organizationId}::uuid, ${planId}::uuid, v.activity_id, v.code_type_id,
             v.code_value_id, now(), now()
      FROM unnest(
        ${rows.map(() => uuidV7(now))}::uuid[],
        ${rows.map((r) => r.activityId)}::uuid[],
        ${rows.map((r) => r.codeTypeId)}::uuid[],
        ${rows.map((r) => r.codeValueId)}::uuid[]
      ) AS v(id, activity_id, code_type_id, code_value_id)
      ON CONFLICT (plan_id, activity_id, code_type_id)
      DO UPDATE SET code_value_id = EXCLUDED.code_value_id, updated_at = now()
    `;
  }

  /** Clear the value of each (activity, type) pair. "No value" is the absence of a row. */
  async deleteMany(
    planId: string,
    rows: ReadonlyArray<{ activityId: string; codeTypeId: string }>,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.$executeRaw`
      DELETE FROM code_value_assignments AS c
      USING unnest(
        ${rows.map((r) => r.activityId)}::uuid[],
        ${rows.map((r) => r.codeTypeId)}::uuid[]
      ) AS v(activity_id, code_type_id)
      WHERE c.plan_id = ${planId}::uuid
        AND c.activity_id = v.activity_id AND c.code_type_id = v.code_type_id
    `;
  }
}
