import { Injectable } from '@nestjs/common';
import type { ActivityCodeLaneSummary } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';
import { loadCurrentCodeLanes } from '../activities/swimlane-lanes';

/** The org and plan every guest read is scoped to, both from the share token's principal. */
export interface GuestScope {
  organizationId: string;
  planId: string;
}

/**
 * The reads a guest's code-grouped picture needs (p6-activity-codes M4-T6, ADR-0205). Returns ids and
 * lane indices for the service to reduce to names and derived membership; nothing here reaches a DTO
 * directly, so no code id or value can leave the API by this file alone.
 */
@Injectable()
export class GuestCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The distinct `(activity type, value id)` pairs the plan's live activities carry of one type: the
   * "values in use" rule's members, shrunk to the values themselves so the read does not grow with
   * the plan. The type column stays so the shared rule can exclude WBS summaries itself.
   */
  async findCarriers(
    scope: GuestScope,
    typeId: string,
  ): Promise<{ type: string; valueId: string }[]> {
    const rows = await this.prisma.$queryRaw<{ type: string; valueId: string }[]>`
      SELECT DISTINCT a.type::text AS "type", cva.code_value_id AS "valueId"
      FROM code_value_assignments cva
      JOIN activities a ON a.id = cva.activity_id
      WHERE cva.code_type_id = ${typeId}::uuid
        AND a.organization_id = ${scope.organizationId}::uuid AND a.plan_id = ${scope.planId}::uuid
        AND a.deleted_at IS NULL
    `;
    return rows;
  }

  /**
   * One page's activities: each one's live value of the type (a deleted value is "none", as for a
   * member) and its lane at that basis. Ids this plan does not own read as none, because the lane
   * statement and this one both join through the plan and the type.
   */
  async findPlacements(
    scope: GuestScope,
    typeId: string,
    activityIds: readonly string[],
  ): Promise<{
    values: Map<string, string>;
    lanes: Map<string, ActivityCodeLaneSummary[]>;
  }> {
    if (activityIds.length === 0) return { values: new Map(), lanes: new Map() };
    const [rows, lanes] = await Promise.all([
      this.prisma.$queryRaw<{ activityId: string; valueId: string }[]>`
        SELECT cva.activity_id AS "activityId", cva.code_value_id AS "valueId"
        FROM code_value_assignments cva
        JOIN code_values v ON v.id = cva.code_value_id AND v.deleted_at IS NULL
        JOIN code_types t ON t.id = cva.code_type_id AND t.deleted_at IS NULL
        WHERE cva.plan_id = ${scope.planId}::uuid
          AND cva.organization_id = ${scope.organizationId}::uuid
          AND cva.code_type_id = ${typeId}::uuid
          AND cva.activity_id IN (SELECT u FROM unnest(${[...activityIds]}::uuid[]) AS u)
      `,
      loadCurrentCodeLanes(this.prisma, scope, typeId, activityIds),
    ]);
    return { values: new Map(rows.map((r) => [r.activityId, r.valueId])), lanes };
  }
}
