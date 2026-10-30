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

/** An activity response decorated with its code lane, present only under a code swimlane source. */
export type WithCodeSwimlaneLanes<T> = T & { codeSwimlaneLanes?: ActivityCodeLaneSummary[] };

/** What decides whether a response carries `codeSwimlaneLanes`, and for which type. */
export interface CodeLaneSource {
  swimlaneSource: SwimlaneSource;
  swimlaneCodeTypeId: string | null;
}

/** The type to read lanes for, or `null` when the plan's swimlanes do not come from a code. */
export function codeLaneTypeOf(plan: CodeLaneSource): string | null {
  return plan.swimlaneSource === 'ACTIVITY_CODE' ? plan.swimlaneCodeTypeId : null;
}

/**
 * **The current-basis code lane of a page's activities, in one statement** (owner decision 2026-10-30,
 * "current code only"; m4-database-review and the database-architect's Statement A). Only the plan's
 * source type `typeId`, and only the row at each activity's **current** basis: `(T, the activity's
 * live value of T)`, or `(T, NULL)` when it has none or the value is soft-deleted. At most one entry
 * an activity, so nothing stale is sent. Rows for other bases and other types stay stored untouched
 * (ADR-0206), they are simply not read. An activity with no stored row for its basis gets `[]`.
 *
 * Nested loop over the ids, probing `uq_code_value_assignments_plan_activity_type`,
 * `uq_code_values_type_id_id` and `uq_code_swimlane_lanes_basis`. Fail-closed: the type must be a live
 * type of this plan, else nothing is read. States `deleted_at` of `code_types` and `code_values`.
 */
export async function loadCurrentCodeLanes(
  db: Pick<PrismaClient, '$queryRaw'>,
  scope: { organizationId: string; planId: string },
  typeId: string,
  activityIds: readonly string[],
): Promise<Map<string, ActivityCodeLaneSummary[]>> {
  const byActivity = new Map<string, ActivityCodeLaneSummary[]>(activityIds.map((id) => [id, []]));
  if (activityIds.length === 0) return byActivity;
  const rows = await db.$queryRaw<
    { activityId: string; codeValueId: string | null; laneIndex: number; updatedAt: Date }[]
  >`
    SELECT p.activity_id AS "activityId", l.code_value_id AS "codeValueId",
           l.lane_index AS "laneIndex", l.updated_at AS "updatedAt"
    FROM unnest(${[...activityIds]}::uuid[]) AS p(activity_id)
    JOIN code_types t ON t.id = ${typeId}::uuid AND t.plan_id = ${scope.planId}::uuid
      AND t.deleted_at IS NULL
    LEFT JOIN code_value_assignments cva
      ON cva.plan_id = ${scope.planId}::uuid AND cva.activity_id = p.activity_id
      AND cva.code_type_id = ${typeId}::uuid
    LEFT JOIN code_values v
      ON v.code_type_id = ${typeId}::uuid AND v.id = cva.code_value_id AND v.deleted_at IS NULL
    JOIN code_swimlane_lanes l
      ON l.plan_id = ${scope.planId}::uuid AND l.activity_id = p.activity_id
      AND l.code_type_id = ${typeId}::uuid AND l.code_value_id IS NOT DISTINCT FROM v.id
    WHERE l.organization_id = ${scope.organizationId}::uuid
  `;
  for (const row of rows) {
    byActivity.get(row.activityId)?.push({
      codeTypeId: typeId,
      codeValueId: row.codeValueId,
      laneIndex: row.laneIndex,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return byActivity;
}

/** One activity's stored lane at its current basis under a type, for the plan-wide read. */
export interface PlanCodeLaneRow {
  activityId: string;
  codeValueId: string | null;
  laneIndex: number;
  updatedAt: string;
}

/**
 * **Every activity's current-basis lane under one type of the plan, in two statements matched in
 * memory** (the database-architect's two-statement fallback to Statement B), for the moment a planner
 * switches the swimlanes to that code. The single-statement join measured 11.5 to 12.7 ms of database
 * time at 5,000 activities against a 10 ms target (`m4-record.md` §1); these two sum to about 6.4 ms.
 *
 * 1. the plan's live activities, each with its **live** value of the type (a deleted or absent value
 *    reads as none);
 * 2. the type's lanes by `code_type_id` alone, joined fail-closed to the type as a live type of this
 *    plan (a primary-key probe).
 *
 * A lane is kept when its activity is live and its `codeValueId` equals that activity's live value (or
 * both are none): the current basis, nothing stale. Takes the **type row itself**, which the caller
 * has loaded as a live type of this plan and organisation, so the precondition is structural and a
 * bare id cannot reach the statements; it is also what makes leaving `plan_id` off the child tables
 * safe (naming it makes the planner walk the plan-leading unique index, 13 to 15 ms against 7 to 8).
 * States `deleted_at` of `activities`, `code_values` and `code_types`.
 *
 * **Deliberately unpaginated**: at most one row per live activity, bounded by the plan's size (about
 * 5,000 activities; no per-plan activity cap is enforced), and a cursor would force many round trips
 * on a switch. Ordered in memory by activity id for a stable body.
 */
export async function loadPlanCodeLanes(
  db: Pick<PrismaClient, '$queryRaw'>,
  type: { id: string; planId: string; organizationId: string },
): Promise<PlanCodeLaneRow[]> {
  const [members, stored] = await Promise.all([
    db.$queryRaw<{ activityId: string; valueId: string | null }[]>`
      SELECT a.id AS "activityId", v.id AS "valueId"
      FROM activities a
      LEFT JOIN code_value_assignments cva
        ON cva.activity_id = a.id AND cva.code_type_id = ${type.id}::uuid
      LEFT JOIN code_values v
        ON v.code_type_id = ${type.id}::uuid AND v.id = cva.code_value_id AND v.deleted_at IS NULL
      WHERE a.plan_id = ${type.planId}::uuid AND a.organization_id = ${type.organizationId}::uuid
        AND a.deleted_at IS NULL
    `,
    db.$queryRaw<
      { activityId: string; codeValueId: string | null; laneIndex: number; updatedAt: Date }[]
    >`
      SELECT l.activity_id AS "activityId", l.code_value_id AS "codeValueId",
             l.lane_index AS "laneIndex", l.updated_at AS "updatedAt"
      FROM code_swimlane_lanes l
      JOIN code_types t
        ON t.id = ${type.id}::uuid AND t.plan_id = ${type.planId}::uuid AND t.deleted_at IS NULL
      WHERE l.code_type_id = ${type.id}::uuid
    `,
  ]);
  const valueOf = new Map(members.map((m) => [m.activityId, m.valueId]));
  return stored
    .filter((row) => valueOf.has(row.activityId) && valueOf.get(row.activityId) === row.codeValueId)
    .map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
    .sort((a, b) => (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0));
}
