import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { uuidV7 } from '../../common/db/uuid-v7';

/** One code lane to store: the activity's lane under `(codeTypeId, codeValueId)`; `null` is "No <type>". */
export interface CodeLaneWrite {
  activityId: string;
  codeTypeId: string;
  codeValueId: string | null;
  laneIndex: number;
}

/**
 * Data-access for `code_swimlane_lanes` (p6-activity-codes database-design §5.5). A join row with no
 * `deleted_at` and no version of its own: like an assignment it is written only inside an activity
 * write that holds the activity row lock and bumps `activities.version`.
 */
@Injectable()
export class CodeSwimlaneLaneRepository {
  /**
   * Store each lane, adding the row for its basis or moving the one already there (m4-database-review
   * §2.4). Raw, because Prisma cannot name a NULL in a compound-unique `where`, and the unique index
   * is `NULLS NOT DISTINCT`, so the "No <type>" row is one per (activity, type) and the conflict
   * arbiter resolves it. The join to `activities` re-asserts plan, organisation and liveness, so an
   * id that is not this plan's live activity writes nothing (the caller has locked every id already).
   * Writes `code_swimlane_lanes` only: never `activity_swimlane_lanes`, never `activities.lane_index`
   * (ADR-0206 A1–A2).
   */
  async upsertMany(
    organizationId: string,
    planId: string,
    lanes: readonly CodeLaneWrite[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (lanes.length === 0) return;
    const now = new Date();
    // '' for NULL in the value column: an all-null array cannot be inferred as uuid[] (the same
    // workaround as `ActivityRepository.upsertSwimlaneLanes`).
    await db.$executeRaw`
      INSERT INTO code_swimlane_lanes AS t
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, lane_index,
         created_at, updated_at)
      SELECT v.id, a.organization_id, a.plan_id, a.id, v.code_type_id,
             NULLIF(v.code_value_id, '')::uuid, v.lane_index, now(), now()
      FROM unnest(
        ${lanes.map(() => uuidV7(now))}::uuid[],
        ${lanes.map((l) => l.activityId)}::uuid[],
        ${lanes.map((l) => l.codeTypeId)}::uuid[],
        ${lanes.map((l) => l.codeValueId ?? '')}::text[],
        ${lanes.map((l) => l.laneIndex)}::int[]
      ) AS v(id, activity_id, code_type_id, code_value_id, lane_index)
      JOIN activities a ON a.id = v.activity_id
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
      ON CONFLICT (plan_id, activity_id, code_type_id, code_value_id)
      DO UPDATE SET lane_index = EXCLUDED.lane_index, updated_at = now()
    `;
  }
}
