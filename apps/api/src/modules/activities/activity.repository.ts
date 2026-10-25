import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type AccrualType,
  type Activity,
  type ActivityStatus,
  type ActivityType,
  type ConstraintType,
  type DurationType,
  type PercentCompleteType,
  type SwimlaneLaneBasis,
} from '@prisma/client';

import { lockActivityRowsInIdOrder } from '../../common/db/activity-row-lock';
import { uuidV7 } from '../../common/db/uuid-v7';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Fields an activity update may change (already converted to DB-ready values).
 * Split into DEFINITION fields (name/logic/graphics — Planner-owned) and PROGRESS
 * fields (status/%/actuals — Contributor-owned via the progress endpoint); the
 * repository is agnostic to the split, but the two callers each send only their
 * half. CPM output columns are engine-owned and never patched here.
 */
export interface ActivityPatch {
  // Definition
  name?: string;
  code?: string | null;
  description?: string | null;
  type?: ActivityType;
  durationMinutes?: number;
  /** P6 duration type (M7 rung 4, ADR-0040): governs which triad field recomputes on a quantity edit. */
  durationType?: DurationType;
  constraintType?: ConstraintType | null;
  constraintDate?: Date | null;
  /** Secondary constraint (ADR-0035 §10): drives the backward pass; paired like the primary. */
  secondaryConstraintType?: ConstraintType | null;
  secondaryConstraintDate?: Date | null;
  /** External / inter-project early start (ADR-0043 / ADR-0035 §30.1): SNET-shaped forward bound; null clears. */
  externalEarlyStart?: Date | null;
  /** External / inter-project late finish (ADR-0043 / ADR-0035 §30.2): FNLT-shaped backward bound; null clears. */
  externalLateFinish?: Date | null;
  /** The activity's own working-time calendar (ADR-0037, M5); null inherits the plan default. */
  calendarId?: string | null;
  /** WBS parent (ADR-0038, M5-epic); a WBS_SUMMARY in the same plan, or null for top-level. */
  parentId?: string | null;
  laneIndex?: number;
  /** Hand-made swimlane membership (swimlanes spec §4.6); null is "No swimlane". Same plan by composite FK. */
  swimlaneId?: string | null;
  /** As-Late-As-Possible placement preference (ADR-0035 §11): display-only, never the pure passes. */
  scheduleAsLateAsPossible?: boolean;
  /** Visual-Planning placement (ADR-0033): hand-placed start, or null to clear it. */
  visualStart?: Date | null;
  /** Resource-levelling tie-break (ADR-0041 §1): client-settable Planner input; null clears to unset. */
  levelingPriority?: number | null;
  /** %-complete measure that feeds Earned Value (EV1, ADR-0042): DURATION default; never a CPM date. */
  percentCompleteType?: PercentCompleteType;
  /** Physical % complete (EV1, ADR-0042), used only when percentCompleteType = PHYSICAL; null clears. */
  physicalPercentComplete?: number | null;
  /** Activity-level lump-sum budget in minor units (EV1, ADR-0042); null clears. Stored as BIGINT. */
  budgetedExpense?: number | null;
  /** Activity-level lump-sum actual in minor units (EV1, ADR-0042); null clears. Stored as BIGINT. */
  actualExpense?: number | null;
  /** How the activity's cost accrues (M7 rung 5, ADR-0044 §32): START/UNIFORM/END; governs PV phasing only. */
  accrualType?: AccrualType;
  // Progress
  status?: ActivityStatus;
  percentComplete?: number;
  actualStart?: Date | null;
  actualFinish?: Date | null;
  /** Explicit remaining work in minutes (M2, ADR-0035); null derives it from percent complete. */
  remainingDurationMinutes?: number | null;
  /** Suspend / resume dates (M2, ADR-0035 §4); resume floors the remaining work. */
  suspendDate?: Date | null;
  resumeDate?: Date | null;
  /** Expected-finish target (M4, ADR-0035 §9); resizes remaining work when the plan option is on. */
  expectedFinish?: Date | null;
}

/**
 * Data-access for activities (ADR-0008) — the leaf of the Client → Project →
 * Plan → Activity hierarchy. Centralises the soft-delete filter so no read
 * forgets `deletedAt: null`. Item lookups are scoped by organisation
 * (anti-IDOR); the list is scoped by both organisation and parent plan.
 * Delete/restore are handled by the shared HierarchyLifecycleService, so this
 * repository only covers create/read/update.
 */
@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ActivityWhereInput = {}): Prisma.ActivityWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ActivityUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity> {
    return db.activity.create({ data });
  }

  /**
   * Batch-insert many activities in ONE statement, inside the caller's transaction (interchange
   * commit, ADR-0050 B3). Ids may be client-assigned (the `@default(uuid(7))` is bypassed) so the
   * caller can resolve dependency endpoints before the write. All rows are brand-new (a fresh plan),
   * so no optimistic-lock/audit ceremony beyond the create defaults. Avoids a per-row `create` loop
   * that risked Prisma's interactive-transaction timeout at the import ceiling.
   */
  async createMany(
    rows: readonly Prisma.ActivityCreateManyInput[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.activity.createMany({ data: [...rows] });
  }

  /** An active activity scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    return db.activity.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** An activity in an organisation in ANY state (active or soft-deleted) — used
   * to scope a restore to the caller's org before reactivating it.
   *
   * soft-delete: any-state — restore must find the deleted row it is about to reactivate. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    return db.activity.findFirst({ where: { id, organizationId } });
  }

  /** A page of a plan's active activities (keyset cursor by id). */
  findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      where: this.active({ organizationId: params.organizationId, planId: params.planId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * ALL of a plan's active activities (full rows, source-ordered), scoped to the org (anti-IDOR) — the
   * schedule-interchange EXPORT read (ADR-0050 M4a). Unpaginated by design: export assembles the whole
   * plan network in one pass, and the graph is already bounded by the import/export activity ceiling
   * (ADR-0050). One batched query; the `(plan_id, created_at, id)` order is deterministic (matching the
   * recalc load) so the exported file is stable.
   */
  findAllActiveByPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity[]> {
    return db.activity.findMany({
      where: this.active({ organizationId, planId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * The in-swimlane lanes stored against a hand-made swimlane (basis `SWIMLANE`) for the plan's active
   * activities, for the XER writer (swimlanes M4-T5). One query; the other bases (a WBS group, "No
   * swimlane") are not written - the reader ignores them. A lane row has no `deleted_at` of its own: it
   * lives exactly as long as its activity, so the activity's state is what is stated.
   */
  findSwimlaneLanesForPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ activityId: string; swimlaneId: string | null; laneIndex: number }[]> {
    return db.activitySwimlaneLane.findMany({
      where: {
        organizationId,
        basis: 'SWIMLANE',
        activity: this.active({ organizationId, planId }),
      },
      select: { activityId: true, swimlaneId: true, laneIndex: true },
      orderBy: [{ activityId: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. Returns the row as written — `null` means a version conflict or the row
   * is gone, which the service maps to 409. The row comes back from the update itself
   * (`RETURNING`), which is the history's "after" without a second round trip
   * (ADR-0174 D4).
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: ActivityPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    const [row] = await db.activity.updateManyAndReturn({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return row ?? null;
  }

  /**
   * Batch lane-position write in ONE `unnest` statement (TSLD M4): move each `{id, laneIndex,
   * version}` to its new lane, matching by id AND `version` (per-row optimistic lock) and
   * re-asserting the plan/org/active scope in the WHERE — so a stale or cross-plan/cross-tenant
   * id can never write. Bumps `version`/`updated_at`/`updated_by` (a user edit, unlike the
   * engine's lock-bypassing write). Returns rows changed; the caller compares it to the batch
   * size and, on a shortfall, rolls the transaction back — a partial move never persists. Mirrors
   * {@link ScheduleRepository.writeResults}'s single-round-trip shape (avoids a 2,000-row loop
   * exceeding Prisma's interactive-transaction timeout).
   */
  /**
   * The plan's activities projected to the columns a lane layout needs — `id`, the `code` the packer
   * is keyed by, the `type` and visual-effective dates that give its DRAWN span, its current
   * `laneIndex`, and the `version` the batch write matches on.
   *
   * Deliberately NOT the full rows, for the reason {@link ActivityRepository.findPlanWbsTree} gives:
   * a layout pass may touch every activity in the plan, and the ~40 columns an `Activity` carries
   * are all irrelevant to "where should this bar sit". _(Corrected 2026-09-11: this cited
   * `findWbsTreeRows` "one method down", and it was wrong twice — no such symbol has ever existed,
   * and one method down is `updatePlacements`. A reader following it landed on an unrelated batch
   * writer. The real neighbour is four down and is now linked rather than described by position,
   * which is what goes stale.)_ Ordered by id so a caller's input never depends on the database's
   * scan order. **That does not make a packing reproducible, and this docblock used to imply it did**:
   * the packer breaks ties on its item's id, and these ids are UUIDv7 minted during an import, so
   * the interchange caller keys its items by `code` instead (layout-interchange M0-T4, M1).
   */
  async findLayoutRowsForPlan(
    organizationId: string,
    planId: string,
  ): Promise<
    {
      id: string;
      code: string | null;
      type: ActivityType;
      laneIndex: number;
      version: number;
      swimlaneId: string | null;
      visualEffectiveStart: Date | null;
      visualEffectiveFinish: Date | null;
    }[]
  > {
    return this.prisma.activity.findMany({
      where: { organizationId, planId, deletedAt: null },
      select: {
        id: true,
        code: true,
        type: true,
        laneIndex: true,
        version: true,
        swimlaneId: true,
        visualEffectiveStart: true,
        visualEffectiveFinish: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Batch **placement** write: one set-based UPDATE moving a plan's activities in time, and
   * optionally in lane, keyed by `id + version` (ADR-0033 constraints + `visualStart`).
   *
   * The parameter type is the whole guarantee that a bulk move cannot rename anything: it names
   * four placement columns and no others, so no definition field is reachable from this seam even
   * by accident. A structural test pins that signature.
   *
   * `laneIndex: null` means **leave the lane alone** — `COALESCE` in the SQL, not a write of null,
   * because `lane_index` is `NOT NULL`. Every other null is a genuine clear.
   *
   * One statement, never a per-row loop: the ADR-0053 M6 lesson (830 ms → 13 ms for 2,000 rows).
   * The caller takes **no** plan advisory lock, so the rows are locked first, in id order
   * ({@link lockActivityRowsInIdOrder}): without that, the order this statement locks them in is
   * whatever join plan Postgres picks, which can deadlock a concurrent recalculation
   * (`docs/TECH_DEBT.md` #440).
   */
  async updatePlacements(
    organizationId: string,
    planId: string,
    placements: readonly {
      id: string;
      version: number;
      constraintType: ConstraintType | null;
      constraintDate: string | null;
      visualStart: string | null;
      laneIndex: number | null;
    }[],
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    if (placements.length === 0) return 0;
    const ids = placements.map((p) => p.id);
    const versions = placements.map((p) => p.version);
    // Enum and date arrays travel as text and are cast in the statement: `unnest` needs a concrete
    // element type, and a nullable enum[] parameter round-trips more reliably as text[] here.
    const constraintTypes = placements.map((p) => p.constraintType);
    const constraintDates = placements.map((p) => p.constraintDate);
    const visualStarts = placements.map((p) => p.visualStart);
    const laneIndexes = placements.map((p) => p.laneIndex);

    await lockActivityRowsInIdOrder(db, organizationId, planId, ids);
    return db.$executeRaw`
      UPDATE activities AS a
      SET constraint_type = v.constraint_type::"ConstraintType",
          constraint_date = v.constraint_date::date,
          visual_start = v.visual_start::date,
          lane_index = COALESCE(v.lane_index, a.lane_index),
          version = a.version + 1,
          updated_by = ${updatedBy}::text,
          updated_at = now()
      FROM unnest(
        ${ids}::uuid[],
        ${versions}::int[],
        ${constraintTypes}::text[],
        ${constraintDates}::text[],
        ${visualStarts}::text[],
        ${laneIndexes}::int[]
      ) AS v(id, version, constraint_type, constraint_date, visual_start, lane_index)
      WHERE a.id = v.id
        AND a.version = v.version
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
    `;
  }

  /**
   * Batch lane write, by `id + version`. Like {@link updatePlacements} the caller takes no plan
   * advisory lock, so the rows are locked in id order first (`docs/TECH_DEBT.md` #440).
   *
   * A row may carry a `laneIndex` (the swimlane-free layout), a `swimlaneId` (a move into a swimlane,
   * swimlanes spec §4.4), or both; an absent one leaves that column alone (`COALESCE`), so a row that
   * only wrote an in-swimlane lane still bumps `version` — the activity's version is the optimistic
   * lock for its lane rows (schema-design §3.5). The caller has already proven every named swimlane
   * active and in this plan, under `FOR SHARE`, after the activity locks (schema-design §5).
   * `swimlaneId` is three-valued: `undefined` keeps the membership, `null` clears it, a uuid sets it.
   * It travels as a text array plus a `bool[]` "is written" flag, because a single array cannot tell an
   * omitted value from a null one (`unnest` of a null element is just NULL) — the same reason
   * {@link updateParents} gives for its `''` sentinel.
   */
  async updateLanePositions(
    organizationId: string,
    planId: string,
    positions: readonly {
      id: string;
      laneIndex?: number;
      swimlaneId?: string | null;
      version: number;
    }[],
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    if (positions.length === 0) return 0;
    const ids = positions.map((p) => p.id);
    const laneIndexes = positions.map((p) => p.laneIndex ?? null);
    const swimlaneIds = positions.map((p) => p.swimlaneId ?? '');
    const swimlaneWritten = positions.map((p) => p.swimlaneId !== undefined);
    const versions = positions.map((p) => p.version);

    await lockActivityRowsInIdOrder(db, organizationId, planId, ids);
    return db.$executeRaw`
      UPDATE activities AS a
      SET lane_index = COALESCE(v.lane_index, a.lane_index),
          swimlane_id = CASE WHEN v.swimlane_written THEN NULLIF(v.swimlane_id, '')::uuid
                             ELSE a.swimlane_id END,
          version = a.version + 1,
          updated_by = ${updatedBy}::text,
          updated_at = now()
      FROM unnest(
        ${ids}::uuid[],
        ${laneIndexes}::int[],
        ${swimlaneIds}::text[],
        ${swimlaneWritten}::boolean[],
        ${versions}::int[]
      ) AS v(id, lane_index, swimlane_id, swimlane_written, version)
      WHERE a.id = v.id
        AND a.version = v.version
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
    `;
  }

  /**
   * Upsert the in-swimlane lane of each activity against the basis the SERVER derived for it
   * (schema-design §4 Q3, §5). One row per `(activity, basis)`: the `ON CONFLICT` arbiter is the
   * unique index that carries `NULLS NOT DISTINCT`, so the two NULL-able basis columns collide on
   * "same basis" rather than never colliding.
   *
   * `organization_id` is copied from the joined activity row, never from the request, and the join
   * re-asserts plan, organisation and not-deleted, so an id outside the plan inserts nothing. Callers
   * hold the activity row locks (the id-order seam) — lane rows need no order of their own.
   * `updated_at` is set on conflict because it is the tie-break when two placed members of one basis
   * collide.
   */
  async upsertSwimlaneLanes(
    organizationId: string,
    planId: string,
    lanes: readonly {
      activityId: string;
      basis: SwimlaneLaneBasis;
      swimlaneId: string | null;
      summaryActivityId: string | null;
      wbsLevel: number | null;
      laneIndex: number;
    }[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (lanes.length === 0) return;
    const now = new Date();
    const rowIds = lanes.map(() => uuidV7(now));
    const activityIds = lanes.map((l) => l.activityId);
    const bases = lanes.map((l) => l.basis);
    // '' for NULL in the two uuid columns: see updateParents on why an all-null array cannot be
    // inferred as uuid[]. The levels are integers, so a null there is safe.
    const swimlaneIds = lanes.map((l) => l.swimlaneId ?? '');
    const summaryIds = lanes.map((l) => l.summaryActivityId ?? '');
    const wbsLevels = lanes.map((l) => l.wbsLevel);
    const laneIndexes = lanes.map((l) => l.laneIndex);

    await db.$executeRaw`
      INSERT INTO activity_swimlane_lanes AS t
        (id, organization_id, activity_id, basis, swimlane_id, summary_activity_id, wbs_level,
         lane_index, created_at, updated_at)
      SELECT v.id, a.organization_id, a.id, v.basis::"SwimlaneLaneBasis",
             NULLIF(v.swimlane_id, '')::uuid, NULLIF(v.summary_id, '')::uuid, v.wbs_level,
             v.lane_index, now(), now()
      FROM unnest(
        ${rowIds}::uuid[],
        ${activityIds}::uuid[],
        ${bases}::text[],
        ${swimlaneIds}::text[],
        ${summaryIds}::text[],
        ${wbsLevels}::int[],
        ${laneIndexes}::int[]
      ) AS v(id, activity_id, basis, swimlane_id, summary_id, wbs_level, lane_index)
      JOIN activities a ON a.id = v.activity_id
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
      ON CONFLICT (activity_id, basis, swimlane_id, summary_activity_id, wbs_level)
      DO UPDATE SET lane_index = EXCLUDED.lane_index, updated_at = now()
    `;
  }

  /**
   * The plan's WBS tree, projected to the three columns validating a membership batch needs —
   * `id` (does this row exist here at all?), `parentId` (the edges the resulting tree is checked
   * for cycles on) and `type` (only a `WBS_SUMMARY` may be a parent). Deliberately NOT the full
   * rows: a batch may touch every activity in the plan, and the ~40 columns an `Activity` carries
   * are all irrelevant to the question being asked.
   *
   * Unpaginated by design, and bounded by the same ceiling as the batch itself (ADR-0021/0038).
   */
  findPlanWbsTree(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; parentId: string | null; type: ActivityType }[]> {
    return db.activity.findMany({
      where: this.active({ organizationId, planId }),
      select: { id: true, parentId: true, type: true },
    });
  }

  /**
   * Batch WBS membership write in ONE `unnest` statement: file each `{id, parentId, version}` under
   * a summary (or, on a NULL `parentId`, at the top level), matching by id AND `version` (per-row
   * optimistic lock) and re-asserting the plan/org/active scope in the WHERE — so a stale or
   * cross-plan/cross-tenant id can never write. Bumps `version`/`updated_at`/`updated_by`. Returns
   * rows changed; the caller compares it to the batch size and, on a shortfall, rolls the
   * transaction back — a partial re-file never persists.
   *
   * Clear-to-top-level travels as `''` in a `text[]` and is turned back into NULL by `NULLIF`,
   * rather than as a NULL in a `uuid[]`. That is not stylistic: Prisma infers a raw array's
   * Postgres type from its CONTENTS, so an array whose entries are all null serialises as
   * `integer[]` and the `::uuid[]` cast fails outright (`42846 cannot cast type integer[] to
   * uuid[]`) — meaning a batch that only unfiles activities would 500 while a mixed batch worked.
   * Every entry being a string removes the inference. One statement rather than two (nulls
   * separately) keeps "all or nothing" inside a single round trip; same shape, and same
   * transaction-timeout reason, as {@link ActivityRepository.updateLanePositions}.
   *
   * Callers MUST hold the plan advisory lock — this writes the parent tree, whose acyclicity is a
   * read-then-write invariant (ADR-0038 (a)); see `ActivitiesService.assertValidParent`.
   *
   * The rows are locked in id order first: the plan lock excludes the recalculation but not the
   * placement writers, which take the pen and not the plan lock (`docs/TECH_DEBT.md` #492).
   */
  async updateParents(
    organizationId: string,
    planId: string,
    parents: readonly { id: string; parentId: string | null; version: number }[],
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    if (parents.length === 0) return 0;
    const ids = parents.map((p) => p.id);
    const parentIds = parents.map((p) => p.parentId ?? '');
    const versions = parents.map((p) => p.version);

    await lockActivityRowsInIdOrder(db, organizationId, planId, ids);
    return db.$executeRaw`
      UPDATE activities AS a
      SET parent_id = NULLIF(v.parent_id, '')::uuid,
          version = a.version + 1,
          updated_by = ${updatedBy}::text,
          updated_at = now()
      FROM unnest(
        ${ids}::uuid[],
        ${parentIds}::text[],
        ${versions}::int[]
      ) AS v(id, parent_id, version)
      WHERE a.id = v.id
        AND a.version = v.version
        AND a.plan_id = ${planId}::uuid
        AND a.organization_id = ${organizationId}::uuid
        AND a.deleted_at IS NULL
    `;
  }
}
