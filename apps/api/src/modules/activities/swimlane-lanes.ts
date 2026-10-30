import type { Prisma, PrismaClient, SwimlaneLaneBasis, SwimlaneSource } from '@prisma/client';
import { wbsBasisOf, type WbsNode } from '@repo/layout';
import type { ActivityCodeLaneSummary, ActivitySwimlaneLaneSummary } from '@repo/types';

import { ValidationError } from '../../common/errors/domain-errors';

/** Machine-readable reasons of a refused swimlane write (swimlanes spec §2, "Writes refused by source"). */
export const SWIMLANE_SOURCE_REASON = {
  /** A direct `swimlaneId` write while the plan's swimlanes come from its WBS. */
  IS_WBS: 'SWIMLANE_SOURCE_IS_WBS',
  /** An in-swimlane lane write while the plan has no swimlane source. */
  IS_NONE: 'SWIMLANE_SOURCE_NONE',
  /** A direct `swimlaneId` write while the plan's swimlanes come from a code. */
  IS_ACTIVITY_CODE: 'SWIMLANE_SOURCE_IS_ACTIVITY_CODE',
} as const;

/** An activity response decorated with the lanes stored against each basis it has been placed on. */
export type WithSwimlaneLanes<T> = T & { swimlaneLanes: ActivitySwimlaneLaneSummary[] };

/**
 * **The lane rows of a page's activities, in one query** (schema-design §9): `activity_id IN (page
 * ids)` through the unique index, never one query per row. A page with no rows issues none. The
 * rows are not soft-deleted — a lane lives exactly as long as its activity — so no `deletedAt` is
 * stated; scoping is by the organisation of the rows being decorated, which were already scoped.
 */
export async function loadSwimlaneLanes(
  db: PrismaClient | Prisma.TransactionClient,
  rows: readonly { id: string; organizationId: string }[],
): Promise<ReadonlyMap<string, ActivitySwimlaneLaneSummary[]>> {
  const lanes = new Map<string, ActivitySwimlaneLaneSummary[]>();
  if (rows.length === 0) return lanes;
  const found = await db.activitySwimlaneLane.findMany({
    where: {
      activityId: { in: rows.map((r) => r.id) },
      organizationId: { in: [...new Set(rows.map((r) => r.organizationId))] },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  for (const lane of found) {
    const summary: ActivitySwimlaneLaneSummary = {
      basis: lane.basis,
      swimlaneId: lane.swimlaneId,
      summaryActivityId: lane.summaryActivityId,
      wbsLevel: lane.wbsLevel,
      laneIndex: lane.laneIndex,
      updatedAt: lane.updatedAt.toISOString(),
    };
    const list = lanes.get(lane.activityId);
    if (list) list.push(summary);
    else lanes.set(lane.activityId, [summary]);
  }
  return lanes;
}

/** Attach {@link loadSwimlaneLanes}'s answer: an activity never placed on any basis carries `[]`. */
export function attachSwimlaneLanes<T extends { id: string }>(
  rows: readonly T[],
  lanes: ReadonlyMap<string, ActivitySwimlaneLaneSummary[]>,
): WithSwimlaneLanes<T>[] {
  return rows.map((row) => ({ ...row, swimlaneLanes: lanes.get(row.id) ?? [] }));
}

/** What a lane row is keyed by besides its activity (schema-design §3.5, `ck_…_basis_shape`). */
export interface LaneBasisKey {
  basis: SwimlaneLaneBasis;
  swimlaneId: string | null;
  summaryActivityId: string | null;
  wbsLevel: number | null;
}

/**
 * **The basis of an activity's in-swimlane lane, derived on the server** (schema-design §4 Q3): the
 * client never sends one, because a basis that disagreed with the activity's real membership would
 * be stored and believed by the projection.
 *
 * - `MANUAL`: the swimlane the activity will be in once this write lands, or "No swimlane".
 * - `WBS`: the level-L ancestor summary, through the same `wbsBasisOf` the web calls, or "No WBS
 *   group" at that level.
 * - `NONE`: refused (422) — there is no swimlane for a lane to be in.
 */
export function deriveLaneBasis(
  plan: { swimlaneSource: SwimlaneSource; swimlaneWbsLevel: number | null },
  activityId: string,
  effectiveSwimlaneId: string | null,
  wbsNodes: ReadonlyMap<string, WbsNode>,
): LaneBasisKey {
  switch (plan.swimlaneSource) {
    case 'NONE':
      throw new ValidationError('This plan has no swimlanes to place a lane in.', {
        reason: SWIMLANE_SOURCE_REASON.IS_NONE,
      });
    case 'MANUAL':
      return effectiveSwimlaneId === null
        ? { basis: 'NO_SWIMLANE', swimlaneId: null, summaryActivityId: null, wbsLevel: null }
        : {
            basis: 'SWIMLANE',
            swimlaneId: effectiveSwimlaneId,
            summaryActivityId: null,
            wbsLevel: null,
          };
    case 'WBS': {
      // `ck_plans_swimlane_source_level` makes the level non-null here; the guard keeps a corrupt
      // row from deriving a basis the lanes table's own CHECK would then refuse with a 500.
      const level = plan.swimlaneWbsLevel;
      if (level === null) {
        throw new ValidationError('This plan has no WBS level to place a lane against.', {
          reason: SWIMLANE_SOURCE_REASON.IS_NONE,
        });
      }
      const found = wbsBasisOf(activityId, wbsNodes, level);
      return found.kind === 'summary'
        ? {
            basis: 'WBS_SUMMARY',
            swimlaneId: null,
            summaryActivityId: found.summaryId,
            wbsLevel: null,
          }
        : { basis: 'NO_WBS_SUMMARY', swimlaneId: null, summaryActivityId: null, wbsLevel: level };
    }
    case 'ACTIVITY_CODE':
      // Code lanes live in their own table, keyed by (code type, value) rather than by a
      // SwimlaneLaneBasis (p6-activity-codes database-design §5.5), so they derive through
      // `deriveCodeLaneBasis` and a caller reaching this branch has taken the wrong road.
      throw new Error('A plan whose swimlanes come from a code derives its lane basis by code.');
  }
}

/** What a code lane row is keyed by besides its activity: `codeValueId` is `null` for "No <type>". */
export interface CodeLaneBasisKey {
  codeTypeId: string;
  codeValueId: string | null;
}

/**
 * **The basis of an activity's lane under a code source, derived on the server** (ADR-0206 A3): the
 * type the plan's swimlanes are made from and the activity's value of it once the write lands, or
 * "no value" when it has none or the value is soft-deleted. A deleted value draws its carriers in
 * "No <type>", so their lane belongs to that basis; the stored value is kept for a restore, exactly as
 * a kept membership naming a deleted hand-made swimlane takes the "No swimlane" basis.
 */
export function deriveCodeLaneBasis(
  codeTypeId: string,
  valueId: string | null,
  liveValueIds: ReadonlySet<string>,
): CodeLaneBasisKey {
  return {
    codeTypeId,
    codeValueId: valueId !== null && liveValueIds.has(valueId) ? valueId : null,
  };
}

/** An activity response decorated with its code lanes, absent when the plan has no live code type. */
export type WithCodeSwimlaneLanes<T> = T & { codeSwimlaneLanes?: ActivityCodeLaneSummary[] };

/**
 * **The code lanes of a page's activities, in one statement** (m4-database-review §2.3: 0.6 ms per
 * 200 rows), for every **live** type — a deleted type's rows stay stored, for its restore, and are not
 * sent. The caller runs it only once `loadActivityCodes` has found a live code type, so a plan that
 * never used codes issues no statement and answers byte for byte as before (SC-2). One plan's rows.
 * The statement joins `code_types`, so it states that table's `deleted_at`.
 */
export async function loadCodeSwimlaneLanes(
  db: Pick<PrismaClient, '$queryRaw'>,
  scope: { organizationId: string; planId: string },
  activityIds: readonly string[],
): Promise<Map<string, ActivityCodeLaneSummary[]>> {
  if (activityIds.length === 0) return new Map();
  const rows = await db.$queryRaw<
    {
      activityId: string;
      codeTypeId: string;
      codeValueId: string | null;
      laneIndex: number;
      updatedAt: Date;
    }[]
  >`
    SELECT l.activity_id AS "activityId", l.code_type_id AS "codeTypeId",
           l.code_value_id AS "codeValueId", l.lane_index AS "laneIndex",
           l.updated_at AS "updatedAt"
    FROM code_swimlane_lanes l
    JOIN code_types t ON t.id = l.code_type_id AND t.deleted_at IS NULL
    WHERE l.plan_id = ${scope.planId}::uuid
      AND l.organization_id = ${scope.organizationId}::uuid
      AND l.activity_id IN (SELECT u FROM unnest(${[...activityIds]}::uuid[]) AS u)
  `;
  const byActivity = new Map<string, ActivityCodeLaneSummary[]>(activityIds.map((id) => [id, []]));
  for (const row of rows) {
    byActivity.get(row.activityId)?.push({
      codeTypeId: row.codeTypeId,
      codeValueId: row.codeValueId,
      laneIndex: row.laneIndex,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  // Ordered here rather than by the statement, as `codes` is: at most 100 types an activity, and the
  // database need not sort 200 activities' rows to give a stable payload. "No value" sorts first.
  for (const list of byActivity.values()) {
    list.sort(
      (a, b) =>
        (a.codeTypeId < b.codeTypeId ? -1 : a.codeTypeId > b.codeTypeId ? 1 : 0) ||
        (a.codeValueId ?? '').localeCompare(b.codeValueId ?? ''),
    );
  }
  return byActivity;
}
