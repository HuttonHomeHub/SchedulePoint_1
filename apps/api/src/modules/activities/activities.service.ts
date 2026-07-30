import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Activity,
  type ActivityStatus,
  type ActivityType,
  type DurationType,
} from '@prisma/client';
import type { PageMeta, ProgressWarning } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import {
  HIERARCHY_CONFLICT,
  HierarchyLifecycleService,
} from '../../common/hierarchy/hierarchy-lifecycle.service';
import { formatCalendarDate, parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCalendarUsableBy } from '../calendars/calendar-scope.guard';
import { CalendarRepository } from '../calendars/calendar.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';
import { resolveTriad } from '../schedule/duration-type/resolve-triad';

import { ActivityRepository, type ActivityPatch } from './activity.repository';
import type { CreateActivityDto } from './dto/create-activity.dto';
import type { UpdateActivityProgressDto } from './dto/update-activity-progress.dto';
import type { UpdateActivityDto } from './dto/update-activity.dto';
import type { UpdateParentsDto } from './dto/update-parents.dto';
import type { UpdatePositionsDto } from './dto/update-positions.dto';

const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

/**
 * What a dissolve tells the caller: the activities that were promoted, at their **new** versions.
 *
 * Returned rather than a bare 204 because the client cannot derive it. It did not know which
 * activities were the summary's children, and the write bumps each one's optimistic-lock `version`
 * — so without this, a cached copy of a promoted child is silently stale and its next save 409s
 * with no explanation. This is `docs/API.md`'s cross-resource-recompute rule applied to the WBS
 * tree, and the same shape `updateParents` already returns.
 */
export interface DissolveSummaryResult {
  promoted: { id: string; parentId: string | null; version: number }[];
}

/**
 * Minutes in one full calendar day — the fixed day↔minute factor (ADR-0036 §4.2).
 * The public API stays day-denominated (`durationDays`); storage is minutes, so the
 * service converts at the boundary (a whole day of work = 1440 working-minutes).
 */
const MINUTES_PER_DAY = 1440;

/**
 * Derive an activity's status from its measurable progress so the two can never
 * contradict: a finish date (or 100%) means COMPLETE; a start date (or any
 * progress) means IN_PROGRESS; otherwise NOT_STARTED. Using the actual dates as
 * the started/finished signal — not just the percentage — lets an activity be
 * "in progress" at 0% (started but no measurable work yet).
 */
function deriveStatus(
  percentComplete: number,
  actualStart: Date | null,
  actualFinish: Date | null,
): ActivityStatus {
  if (actualFinish !== null || percentComplete >= 100) return 'COMPLETE';
  if (actualStart !== null || percentComplete > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

/**
 * Business logic for activities — the leaf of the Client → Project → Plan →
 * Activity hierarchy and the atomic unit of a schedule. Create and list are
 * scoped to a parent plan (loaded active and in-org first, 404 otherwise); the
 * organisation id is copied from that parent, never from input. Item operations
 * re-resolve the org scope from the caller's own memberships (anti-IDOR) paired
 * with a permission check. This service owns only the DEFINITION (name, logic,
 * graphics) — progress (status/%/actuals) is changed via ActivitiesService's
 * progress method (B2) so a Contributor can report progress without editing
 * logic. The CPM output columns are engine-owned and never set from input.
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly calendars: CalendarRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ActivitiesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Validate a non-null WBS `parentId` (ADR-0038, M5-epic §24): the parent must be an ACTIVE
   * `WBS_SUMMARY` activity in the **same plan** (a cross-plan / foreign / deleted / unknown id reads as
   * 404, leaking nothing), and — when re-parenting an EXISTING activity (`selfId` set) — must not sit
   * inside `selfId`'s own subtree, which would make the WBS parent tree cyclic. Only a summary may be a
   * parent, and the tree is otherwise acyclic, so the ancestor walk terminates. Runs inside the write
   * transaction alongside the insert/update.
   *
   * **The caller MUST hold {@link acquirePlanWriteLock} for the plan.** The walk reads the parent
   * chain and then writes on the strength of what it read; without the lock, two concurrent mirror
   * re-parents (A under B, B under A) each read a chain that is still acyclic, both pass, and the
   * tree ends up cyclic — ADR-0038 invariant (a) broken by a race no optimistic `version` check can
   * catch, because each write's own row IS at the version it was read at. Same argument, and same
   * remedy, as the dependency-DAG cycle check (ADR-0021) and the resource tree (ADR-0053 §3). Take
   * the plan lock BEFORE the calendar guard's lock, so every path in this service acquires
   * plan → calendar in one order and no two of them can deadlock.
   */
  private async assertValidParent(
    tx: Prisma.TransactionClient,
    parentId: string,
    organizationId: string,
    planId: string,
    selfId: string | null,
  ): Promise<void> {
    if (selfId !== null && parentId === selfId) {
      throw new ValidationError('An activity cannot be its own WBS parent.', {
        // SELF_PARENT, not PARENT_CYCLE: `details.reason` is the field a client branches on
        // (docs/API.md), so it must not mean two different things under two different statuses.
        // This is unconditionally invalid input (422); a cycle only forms against the plan's
        // current tree and is state-dependent (409).
        reason: 'SELF_PARENT',
      });
    }
    const parent = await this.activities.findActiveByIdInOrg(parentId, organizationId, tx);
    if (!parent || parent.planId !== planId) throw new NotFoundError('Parent activity not found.');
    if (parent.type !== 'WBS_SUMMARY') {
      throw new ValidationError('A WBS parent must be a summary activity.', {
        reason: 'PARENT_NOT_SUMMARY',
      });
    }
    // Walk up the parent chain: reaching `selfId` means the new parent is inside self's subtree (cycle).
    let ancestorId: string | null = parent.parentId;
    while (ancestorId !== null) {
      if (ancestorId === selfId) {
        throw new ConflictError('The chosen parent would create a WBS cycle.', {
          reason: 'PARENT_CYCLE',
        });
      }
      const ancestor = await this.activities.findActiveByIdInOrg(ancestorId, organizationId, tx);
      ancestorId = ancestor?.parentId ?? null;
    }
  }

  /**
   * N26 (ADR-0043 / ADR-0035 §30): an external late finish may not precede an external early start when
   * BOTH are set — a self-contradictory imported window. Boundary reject (422 `EXTERNAL_FINISH_BEFORE_START`),
   * mirroring the actual finish-before-start (N06) and resume-before-suspend cross-field checks; the DB
   * CHECK `ck_activities_external_finish_after_start` is the backstop. Compares the two calendar-day
   * strings, which order lexicographically (`YYYY-MM-DD`). Either bound absent = nothing to compare.
   */
  private assertExternalDatesOrdered(
    externalEarlyStart: string | null,
    externalLateFinish: string | null,
  ): void {
    if (
      externalEarlyStart !== null &&
      externalLateFinish !== null &&
      externalLateFinish < externalEarlyStart
    ) {
      throw new ValidationError('External late finish cannot precede external early start.', {
        reason: 'EXTERNAL_FINISH_BEFORE_START',
      });
    }
  }

  async list(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Activity[]; meta: PageMeta; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:read', organization.id);
    // Org-scoped cost:read (EV4a, ADR-0042) on the SAME resolved org — never `canAnywhere` (cross-tenant
    // IDOR). Threaded to the response DTO so the money expense amounts are gated per role (fail-closed).
    const canReadCost = principal.can('cost:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.activities.findManyActiveByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore }, canReadCost };
  }

  async get(
    principal: Principal,
    orgSlug: string,
    activityId: string,
  ): Promise<{ activity: Activity; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:read', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const activity = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!activity) throw new NotFoundError('Activity not found.');
    return { activity, canReadCost };
  }

  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateActivityDto,
  ): Promise<{ activity: Activity; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:create', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);
    // N26 (ADR-0043 / ADR-0035 §30): an external late finish may not precede an external early start
    // when BOTH are set. Boundary reject before the insert (mirrors the actual finish-before-start and
    // resume-before-suspend cross-field checks); the DB CHECK ck_activities_external_finish_after_start
    // is the backstop.
    this.assertExternalDatesOrdered(dto.externalEarlyStart ?? null, dto.externalLateFinish ?? null);
    const plan = await this.loadActivePlan(planId, organization.id);
    // Structural write — the caller must hold the plan edit-lock (ADR-0028), 423 otherwise.
    await this.editLock.assertHoldsPen(principal, plan.id, organization.id);

    const type = dto.type ?? 'TASK';
    // A milestone is a point in time: force its duration to 0 defensively, even
    // if the client sent nothing (the DTO's cross-field validator only rejects a
    // non-zero duration that is explicitly present).
    const durationDays = MILESTONE_TYPES.includes(type) ? 0 : (dto.durationDays ?? 1);
    // The activity's own calendar (ADR-0037); null/omitted inherits the plan default.
    const calendarId = dto.calendarId ?? null;
    // The WBS parent (ADR-0038); null/omitted is top-level.
    const parentId = dto.parentId ?? null;

    try {
      const activity = await this.prisma.$transaction(async (tx) => {
        // Serialise the WBS parent-tree read-then-write per plan (ADR-0038 invariant (a)) — see
        // `assertValidParent`. Taken ONLY when a parent is actually being set, so the overwhelmingly
        // common top-level create never contends for a plan-wide lock; and taken FIRST, before the
        // calendar guard's own lock, to keep this service's acquisition order plan → calendar.
        if (parentId !== null) await acquirePlanWriteLock(tx, plan.id);
        // Validate a specific calendar through THE shared scope guard before the insert
        // (ADR-0037 + ADR-0053 §2): active + in-org (404 otherwise) AND usable by this
        // activity's PROJECT — an ORG calendar anywhere, a PROJECT calendar only inside its
        // owning project (422 CALENDAR_WRONG_SCOPE). `plan.projectId` is already in hand from
        // `loadActivePlan`, so the tier check costs NO extra query.
        if (calendarId !== null) {
          await assertCalendarUsableBy(tx, this.calendars, {
            calendarId,
            organizationId: organization.id,
            projectId: plan.projectId,
            // A brand-new activity holds no calendar yet, so ANY archived calendar is a new
            // binding here and is refused (ADR-0053 §4).
            currentCalendarId: null,
          });
        }
        // Validate the WBS parent is a same-plan summary (no cycle possible on a brand-new activity).
        if (parentId !== null)
          await this.assertValidParent(tx, parentId, organization.id, plan.id, null);
        return this.activities.create(
          {
            // Copy the organisation id from the parent plan, never from input.
            organizationId: plan.organizationId,
            planId: plan.id,
            name: dto.name,
            code: dto.code ?? null,
            description: dto.description ?? null,
            type,
            durationMinutes: durationDays * MINUTES_PER_DAY,
            // P6 duration type (ADR-0040); omit to take the Prisma default (FIXED_DURATION_AND_UNITS_TIME).
            // A brand-new activity has no assignments yet, so nothing to recompute at create.
            ...(dto.durationType ? { durationType: dto.durationType } : {}),
            calendarId,
            ...(parentId !== null ? { parentId } : {}),
            ...(dto.constraintType ? { constraintType: dto.constraintType } : {}),
            ...(dto.constraintDate
              ? { constraintDate: parseCalendarDate(dto.constraintDate) }
              : {}),
            // Secondary constraint (ADR-0035 §10) — drives the backward pass; paired like the primary.
            ...(dto.secondaryConstraintType
              ? { secondaryConstraintType: dto.secondaryConstraintType }
              : {}),
            ...(dto.secondaryConstraintDate
              ? { secondaryConstraintDate: parseCalendarDate(dto.secondaryConstraintDate) }
              : {}),
            // External / inter-project bounds (ADR-0043 / ADR-0035 §30): imported absolute commitments
            // stored via the same calendar-day parse as constraintDate; either/both/neither may be set.
            ...(dto.externalEarlyStart
              ? { externalEarlyStart: parseCalendarDate(dto.externalEarlyStart) }
              : {}),
            ...(dto.externalLateFinish
              ? { externalLateFinish: parseCalendarDate(dto.externalLateFinish) }
              : {}),
            // Expected-finish target (ADR-0035 §9); honoured only when the plan option is on.
            ...(dto.expectedFinish
              ? { expectedFinish: parseCalendarDate(dto.expectedFinish) }
              : {}),
            ...(dto.laneIndex !== undefined ? { laneIndex: dto.laneIndex } : {}),
            // As-Late-As-Possible (ADR-0035 §11): a display-only placement preference.
            ...(dto.scheduleAsLateAsPossible !== undefined
              ? { scheduleAsLateAsPossible: dto.scheduleAsLateAsPossible }
              : {}),
            // Visual-Planning placement input (ADR-0033): feeds only the effective-Visual pass.
            ...(dto.visualStart ? { visualStart: parseCalendarDate(dto.visualStart) } : {}),
            // Resource-levelling tie-break (ADR-0041 §1); omit to leave NULL (unset). Client-settable;
            // the engine-owned leveled_* overlay is never set from input (dark until L2).
            ...(dto.levelingPriority !== undefined
              ? { levelingPriority: dto.levelingPriority }
              : {}),
            // Earned-Value inputs (EV1, ADR-0042): passthrough only, no derivation. Omit to take the
            // parity defaults (percentCompleteType DURATION; the money/physical columns NULL). Dark
            // until the EV read (EV2b); none feed the CPM engine.
            ...(dto.percentCompleteType ? { percentCompleteType: dto.percentCompleteType } : {}),
            ...(dto.physicalPercentComplete !== undefined
              ? { physicalPercentComplete: dto.physicalPercentComplete }
              : {}),
            ...(dto.budgetedExpense !== undefined ? { budgetedExpense: dto.budgetedExpense } : {}),
            ...(dto.actualExpense !== undefined ? { actualExpense: dto.actualExpense } : {}),
            // Cost accrual (M7 rung 5, ADR-0044 §32): passthrough only; omit to take the DB default
            // (UNIFORM = the byte-identical linear PV path). Governs the EV read's PV time-phasing,
            // never a CPM date.
            ...(dto.accrualType ? { accrualType: dto.accrualType } : {}),
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
      });
      this.logger.info(
        {
          organizationId: organization.id,
          planId: plan.id,
          activityId: activity.id,
          userId: principal.userId,
        },
        'activity created',
      );
      return { activity, canReadCost };
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: UpdateActivityDto,
  ): Promise<{ activity: Activity; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);

    // A constraint's type and date move together. The DTO's cross-field validator
    // can't see this when a client OMITS one side and sends the other as `null`
    // (an absent/empty property skips its own validators), so enforce it here on
    // KEY PRESENCE — otherwise a `PATCH { constraintType: null }` would clear the
    // type but leave a dangling date (or vice-versa), an invalid persisted state.
    if ((dto.constraintType !== undefined) !== (dto.constraintDate !== undefined)) {
      throw new ValidationError('constraintType and constraintDate must be updated together.', {
        reason: 'CONSTRAINT_PAIR_REQUIRED',
      });
    }
    // Same key-presence rule for the secondary pair (ADR-0035 §10).
    if (
      (dto.secondaryConstraintType !== undefined) !==
      (dto.secondaryConstraintDate !== undefined)
    ) {
      throw new ValidationError(
        'secondaryConstraintType and secondaryConstraintDate must be updated together.',
        { reason: 'CONSTRAINT_PAIR_REQUIRED' },
      );
    }

    const patch: ActivityPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code === '' ? null : dto.code;
    if (dto.description !== undefined) {
      patch.description = dto.description === '' ? null : dto.description;
    }
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.durationType !== undefined) patch.durationType = dto.durationType;
    if (dto.durationDays !== undefined) patch.durationMinutes = dto.durationDays * MINUTES_PER_DAY;
    if (dto.constraintType !== undefined) patch.constraintType = dto.constraintType;
    if (dto.constraintDate !== undefined) {
      patch.constraintDate =
        dto.constraintDate === null ? null : parseCalendarDate(dto.constraintDate);
    }
    if (dto.secondaryConstraintType !== undefined) {
      patch.secondaryConstraintType = dto.secondaryConstraintType;
    }
    if (dto.secondaryConstraintDate !== undefined) {
      patch.secondaryConstraintDate =
        dto.secondaryConstraintDate === null
          ? null
          : parseCalendarDate(dto.secondaryConstraintDate);
    }
    if (dto.laneIndex !== undefined) patch.laneIndex = dto.laneIndex;
    if (dto.scheduleAsLateAsPossible !== undefined) {
      patch.scheduleAsLateAsPossible = dto.scheduleAsLateAsPossible;
    }
    // External / inter-project bounds (ADR-0043 / ADR-0035 §30): planner-owned definition inputs; a
    // date sets the bound, null clears it. Enforce N26 on the RESOLVED effective pair (a provided value
    // overrides the stored one, null clears, omitted keeps) so a PATCH of one side is still validated
    // against the other's persisted value — mirrors how updateProgress resolves before its N06 check.
    const effectiveExternalEarlyStart =
      dto.externalEarlyStart !== undefined
        ? dto.externalEarlyStart
        : existing.externalEarlyStart
          ? formatCalendarDate(existing.externalEarlyStart)
          : null;
    const effectiveExternalLateFinish =
      dto.externalLateFinish !== undefined
        ? dto.externalLateFinish
        : existing.externalLateFinish
          ? formatCalendarDate(existing.externalLateFinish)
          : null;
    this.assertExternalDatesOrdered(effectiveExternalEarlyStart, effectiveExternalLateFinish);
    if (dto.externalEarlyStart !== undefined) {
      patch.externalEarlyStart =
        dto.externalEarlyStart === null ? null : parseCalendarDate(dto.externalEarlyStart);
    }
    if (dto.externalLateFinish !== undefined) {
      patch.externalLateFinish =
        dto.externalLateFinish === null ? null : parseCalendarDate(dto.externalLateFinish);
    }
    if (dto.expectedFinish !== undefined) {
      patch.expectedFinish =
        dto.expectedFinish === null ? null : parseCalendarDate(dto.expectedFinish);
    }
    // Visual-Planning placement (ADR-0033): a date hand-places the bar; null clears it (revert to
    // computed). Planner-owned definition input — feeds only the effective-Visual pass, never the
    // pure-network pass, and never travels the progress path (it's absent from the progress DTO).
    if (dto.visualStart !== undefined) {
      patch.visualStart = dto.visualStart === null ? null : parseCalendarDate(dto.visualStart);
    }
    // Resource-levelling tie-break (ADR-0041 §1): client-settable; null clears to unset. The
    // engine-owned leveled_* overlay is never patched here (dark until L2).
    if (dto.levelingPriority !== undefined) patch.levelingPriority = dto.levelingPriority;
    // Earned-Value inputs (EV1, ADR-0042): passthrough only; percentCompleteType is never a CPM date,
    // the physical/money columns clear on an explicit null. No derivation here (that is EV2b).
    if (dto.percentCompleteType !== undefined) patch.percentCompleteType = dto.percentCompleteType;
    if (dto.physicalPercentComplete !== undefined) {
      patch.physicalPercentComplete = dto.physicalPercentComplete;
    }
    if (dto.budgetedExpense !== undefined) patch.budgetedExpense = dto.budgetedExpense;
    if (dto.actualExpense !== undefined) patch.actualExpense = dto.actualExpense;
    // Cost accrual (M7 rung 5, ADR-0044 §32): passthrough only; governs the EV read's PV time-phasing,
    // never a CPM date. No derivation here (that is the read-model's job).
    if (dto.accrualType !== undefined) patch.accrualType = dto.accrualType;
    // The activity's own calendar (ADR-0037): null clears to inherit the plan default; a specific
    // id is validated in-org under the calendar lock inside the transaction below (T4).
    const calendarId = dto.calendarId;
    if (calendarId === null) patch.calendarId = null;
    // The WBS parent (ADR-0038): null clears to top-level; a specific id is validated (same-plan
    // summary, no cycle) inside the transaction below.
    const parentId = dto.parentId;
    if (parentId === null) patch.parentId = null;

    // Keep the milestone invariant when the type changes to (or already is) a
    // milestone: a milestone always has duration 0, regardless of what was sent.
    const effectiveType = patch.type ?? existing.type;
    if (MILESTONE_TYPES.includes(effectiveType)) patch.durationMinutes = 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-parenting: serialise the parent-tree read-then-write per plan (ADR-0038 invariant (a))
        // — see `assertValidParent`. Only on the branch that sets a NON-NULL parent: clearing to
        // top-level cannot create a cycle, and an ordinary edit (no `parentId` in the DTO) must not
        // pay for a plan-wide lock. Taken FIRST, before the calendar guard's lock (order:
        // plan → calendar).
        if (parentId !== undefined && parentId !== null) {
          await acquirePlanWriteLock(tx, existing.planId);
        }
        // Assigning a specific calendar: THE shared scope guard (ADR-0053 §2) validates active
        // + in-org (404) under the calendar advisory lock — serialised with the delete-in-use
        // guard, so no TOCTOU dangling reference — AND that the tier allows it here (422
        // CALENDAR_WRONG_SCOPE). Unlike create, the update path does not already hold the plan
        // (only its id), so the owning project is resolved LAZILY inside this branch: one extra
        // indexed read on the rare calendar-assigning PATCH, and none at all on every other
        // activity update.
        if (calendarId !== undefined && calendarId !== null) {
          const plan = await this.loadActivePlan(existing.planId, organization.id);
          await assertCalendarUsableBy(tx, this.calendars, {
            calendarId,
            organizationId: organization.id,
            projectId: plan.projectId,
            // The activity's CURRENT calendar: an edit that re-submits it is not a new binding,
            // so an activity already on an archived calendar stays editable (ADR-0053 §4).
            currentCalendarId: existing.calendarId,
          });
          patch.calendarId = calendarId;
        }
        // Re-parenting to a specific summary: validate same-plan + no cycle inside the write tx.
        if (parentId !== undefined && parentId !== null) {
          await this.assertValidParent(tx, parentId, organization.id, existing.planId, activityId);
          patch.parentId = parentId;
        }
        const changed = await this.activities.updateIfVersionMatches(
          activityId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
        }
        // Duration-type recompute (ADR-0040 §3, editedField = DURATION): a duration edit holds the
        // (new) duration and recomputes the DEPENDENT — never DURATION itself — on the activity's
        // DRIVING assignment. Runs in THIS transaction, optimistic-locking the assignment row too, so
        // a stale version on either row rolls the whole write back (409).
        await this.recomputeDrivingAssignmentOnDurationEdit(
          tx,
          activityId,
          dto.durationDays,
          patch.durationMinutes,
          patch.durationType ?? existing.durationType,
          principal.userId,
        );
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }

    const updated = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!updated) throw new NotFoundError('Activity not found.');
    return { activity: updated, canReadCost };
  }

  /**
   * The duration-type triad recompute for the ACTIVITY write path (M7 rung 4, ADR-0040 §3;
   * `editedField = DURATION`). A duration edit **holds** the new duration and recomputes the
   * dependent — which, under every duration type, is Units or Units/Time on the **driving**
   * assignment, never the duration itself (the truth table). So this reads the single driving
   * assignment and, when it carries a rate, persists the recomputed `budgetedUnits`/`unitsPerHour`
   * on it, inside the caller's transaction and optimistic-locked, so a stale assignment version
   * aborts the whole activity write (409).
   *
   * Inert (a plain duration write, byte-parity — ADR-0040 (e)) when: this is not a duration edit
   * (`durationDays` absent); the effective duration is 0 (a milestone / zero-duration activity —
   * its triad is inert); there is no driving assignment; or that assignment has no `unitsPerHour`.
   * The driving assignment is fetched in ONE indexed query via the ADR-0039 `(activity_id) WHERE
   * is_driving` partial-unique — no N+1.
   */
  private async recomputeDrivingAssignmentOnDurationEdit(
    tx: Prisma.TransactionClient,
    activityId: string,
    durationDays: number | undefined,
    effectiveDurationMinutes: number | undefined,
    durationType: DurationType,
    userId: string,
  ): Promise<void> {
    // Only a duration edit drives this; a milestone / zero-duration activity's triad is inert.
    if (durationDays === undefined) return;
    if (effectiveDurationMinutes === undefined || effectiveDurationMinutes <= 0) return;

    const driving = await tx.resourceAssignment.findFirst({
      where: { activityId, isDriving: true, deletedAt: null },
    });
    // No driving assignment, or a driving assignment with no rate ⇒ triad inert ⇒ byte-parity.
    if (!driving || driving.unitsPerHour === null) return;

    const resolved = resolveTriad(durationType, 'DURATION', {
      durationMinutes: effectiveDurationMinutes,
      budgetedUnits: driving.budgetedUnits.toNumber(),
      unitsPerHour: driving.unitsPerHour.toNumber(),
    });
    // A DURATION edit never recomputes DURATION (the dependent is Units or Units/Time), so
    // resolveTriad is always `ok` here (the zero-rate divisor N20 is a units-driven-recompute
    // concern, unreachable on this path); guard defensively and never write on the impossible branch.
    if (!resolved.ok) return;

    // Persist the resolved dependent on the driving assignment (the held field is unchanged).
    // Optimistic-locked on the assignment's own version: a stale row rolls the activity write back.
    const result = await tx.resourceAssignment.updateMany({
      where: { id: driving.id, version: driving.version, deletedAt: null },
      data: {
        budgetedUnits: resolved.budgetedUnits,
        unitsPerHour: resolved.unitsPerHour,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictError('The driving assignment changed elsewhere. Refresh and try again.');
    }
  }

  /**
   * Batch lane-position write (TSLD M4): move one or more of a plan's activities to new lanes
   * in a single **all-or-nothing** transaction. Every id must be an active activity in this
   * plan+org (anti-IDOR) and still match its optimistic-lock `version`, or the whole batch is
   * rejected (409) and nothing moves — the semantics a lane drag / auto-pack needs. Layout only:
   * it sets `laneIndex` (a definition edit → `activity:update`, so `version` bumps as usual) and
   * triggers no CPM recalculation (x = time is engine-owned; y = lane is stored).
   */
  async updatePositions(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: UpdatePositionsDto,
  ): Promise<{ items: Activity[]; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);
    await this.loadActivePlan(planId, organization.id); // 404 if the plan is foreign/deleted
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const ids = dto.positions.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Each activity may appear at most once in a positions batch.', {
        reason: 'DUPLICATE_POSITION_ID',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // One set-based UPDATE keyed by id+version and re-asserting plan/org/active scope: a stale
      // or cross-plan/tenant id simply doesn't match and isn't written. All-or-nothing is the
      // count check below — a shortfall rolls the whole (possibly partial) UPDATE back.
      const updated = await this.activities.updateLanePositions(
        organization.id,
        planId,
        dto.positions,
        principal.userId,
        tx,
      );
      if (updated !== dto.positions.length) {
        // Only on the cold failure path do we spend a query to say WHY: an id not in this
        // plan (foreign/cross-plan/deleted → 404) vs a present-but-stale version (→ 409).
        const inPlan = new Set(
          (
            await tx.activity.findMany({
              where: { organizationId: organization.id, planId, id: { in: ids }, deletedAt: null },
              select: { id: true },
            })
          ).map((a) => a.id),
        );
        if (ids.some((id) => !inPlan.has(id))) {
          throw new NotFoundError('Activity not found in this plan.');
        }
        throw new ConflictError(
          'This plan changed since you opened it — no lanes were moved. Refresh and try again.',
        );
      }
    });

    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId, count: ids.length },
      'activity lanes repositioned',
    );

    // Return the moved rows with their fresh versions so the client can reconcile optimistic state.
    const items = await this.prisma.activity.findMany({
      where: { organizationId: organization.id, planId, id: { in: ids }, deletedAt: null },
    });
    return { items, canReadCost };
  }

  /**
   * Batch WBS membership write: file one or more of a plan's activities under a summary — or, on a
   * null `parentId`, back at the top level — in a single **all-or-nothing** transaction. Every id
   * must be an active activity in this plan+org (anti-IDOR) and still match its optimistic-lock
   * `version`, or the whole batch is rejected and nothing moves: the semantics managing a summary's
   * whole membership in one panel needs.
   *
   * Unlike the sibling lane-position write this is **structural** — `parentId` feeds the engine's
   * WBS rollup — so a committed batch leaves the plan's computed dates stale until the next
   * recalculation. It writes only `parentId` (plus the usual `version`/`updatedBy`), never a date;
   * the CPM engine is not called from here.
   *
   * **Validation is against the RESULTING tree, not the current one.** Checking each row against
   * the pre-batch state would accept `[A→B, B→A]`: read alone, each is filing under a childless
   * top-level summary, and each passes. Applied together they close a cycle. So the batch is
   * overlaid on the plan's current edges and the whole result is walked (see
   * {@link ActivitiesService.assertNoParentCycles}) — which is also cheaper than the per-row
   * ancestor walk, being one projected read plus O(n) rather than O(rows × depth) queries.
   */
  async updateParents(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: UpdateParentsDto,
  ): Promise<{ items: Activity[]; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);
    await this.loadActivePlan(planId, organization.id); // 404 if the plan is foreign/deleted
    await this.editLock.assertHoldsPen(principal, planId, organization.id);

    const rows = dto.parents.map((p) => ({ ...p, parentId: p.parentId ?? null }));
    const ids = rows.map((r) => r.id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Each activity may appear at most once in a parents batch.', {
        reason: 'DUPLICATE_PARENT_ID',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // The parent tree's acyclicity is a read-then-write invariant (ADR-0038 (a)) — serialise it
      // per plan, exactly as the single-activity re-parent path does.
      await acquirePlanWriteLock(tx, planId);

      // ONE projected read of the plan's tree serves every check below: membership (is this id even
      // in this plan?), the summary-only-parent rule, and the resulting-tree cycle walk.
      const tree = await this.activities.findPlanWbsTree(organization.id, planId, tx);
      const byId = new Map(tree.map((a) => [a.id, a]));

      for (const row of rows) {
        // A cross-plan / foreign / deleted / unknown id reads as 404, leaking nothing.
        if (!byId.has(row.id)) throw new NotFoundError('Activity not found in this plan.');
        if (row.parentId === null) continue;
        if (row.parentId === row.id) {
          throw new ValidationError('An activity cannot be its own WBS parent.', {
            // See `assertValidParent` — 422 SELF_PARENT, distinct from the 409 PARENT_CYCLE.
            reason: 'SELF_PARENT',
          });
        }
        const parent = byId.get(row.parentId);
        if (!parent) throw new NotFoundError('Parent activity not found.');
        if (parent.type !== 'WBS_SUMMARY') {
          throw new ValidationError('A WBS parent must be a summary activity.', {
            reason: 'PARENT_NOT_SUMMARY',
          });
        }
      }

      // Overlay the batch on the plan's current edges and prove the RESULT is a forest.
      const resulting = new Map(tree.map((a) => [a.id, a.parentId]));
      for (const row of rows) resulting.set(row.id, row.parentId);
      this.assertNoParentCycles(resulting);

      // One set-based UPDATE keyed by id+version and re-asserting plan/org/active scope: a stale or
      // cross-plan/tenant id simply doesn't match and isn't written. All-or-nothing is the count
      // check below — a shortfall rolls the whole (possibly partial) UPDATE back.
      const updated = await this.activities.updateParents(
        organization.id,
        planId,
        rows,
        principal.userId,
        tx,
      );
      if (updated !== rows.length) {
        // Every id was proven present in the plan above and nothing else writes under this lock, so
        // a shortfall here can only be a version mismatch.
        throw new ConflictError(
          'This plan changed since you opened it — nothing was moved. Refresh and try again.',
        );
      }
    });

    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId, count: ids.length },
      'activity WBS parents updated',
    );

    // Return the moved rows with their fresh versions so the client can reconcile optimistic state.
    const items = await this.prisma.activity.findMany({
      where: { organizationId: organization.id, planId, id: { in: ids }, deletedAt: null },
    });
    return { items, canReadCost };
  }

  /**
   * Prove a `child → parent` map is a forest. Walks up from each node, marking nodes proven
   * cycle-free so the whole check is O(n) however deep the tree; a node reached twice within one
   * walk closes a loop. Operates on the map alone — no queries — so the caller can hand it a
   * hypothetical (post-batch) tree rather than the persisted one.
   */
  private assertNoParentCycles(parentOf: ReadonlyMap<string, string | null>): void {
    const safe = new Set<string>();
    for (const start of parentOf.keys()) {
      if (safe.has(start)) continue;
      const walked = new Set<string>();
      let node: string | null = start;
      while (node !== null && !safe.has(node)) {
        if (walked.has(node)) {
          throw new ConflictError('That would create a WBS cycle.', { reason: 'PARENT_CYCLE' });
        }
        walked.add(node);
        node = parentOf.get(node) ?? null;
      }
      for (const seen of walked) safe.add(seen);
    }
  }

  /**
   * Report progress (status / % / actual dates) — the Contributor-capable path.
   * Requires only `activity:update_progress`, so a Contributor can move progress
   * without the `activity:update` needed to change logic or definition. `status`
   * is derived, not taken from input, so it always agrees with the numbers.
   */
  async updateProgress(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: UpdateActivityProgressDto,
  ): Promise<{ activity: Activity; warnings: ProgressWarning[]; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update_progress', organization.id);
    // A Contributor can report progress but does NOT hold cost:read — so this fails closed and the
    // response echoes null for every money field (EV4a, ADR-0042): a progress reporter never sees cost.
    const canReadCost = principal.can('cost:read', organization.id);

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');

    // The plan's data date bounds the actuals (M2, ADR-0035 §6) — load it (404s on a foreign/deleted plan).
    const plan = await this.loadActivePlan(existing.planId, organization.id);
    const dataDate = plan.plannedStart;

    // Resolve the effective values: a provided field overrides the stored one; an
    // omitted field keeps it. This lets us re-derive status and check the
    // date invariants against the FINAL state, not just what was sent.
    const percentComplete = dto.percentComplete ?? existing.percentComplete;
    const actualStart = this.resolveDate(dto.actualStart, existing.actualStart);
    let actualFinish = this.resolveDate(dto.actualFinish, existing.actualFinish);
    // Explicit remaining in minutes (day-denominated at the boundary): provided overrides stored,
    // null clears (derive), omitted keeps.
    let remainingDurationMinutes =
      dto.remainingDurationDays === undefined
        ? existing.remainingDurationMinutes
        : dto.remainingDurationDays === null
          ? null
          : dto.remainingDurationDays * MINUTES_PER_DAY;

    // You cannot finish what you never started, and a finish cannot precede a start (N06).
    if (actualFinish !== null && actualStart === null) {
      throw new ValidationError('An actual finish needs an actual start.', {
        reason: 'FINISH_WITHOUT_START',
      });
    }
    if (actualStart !== null && actualFinish !== null && actualFinish < actualStart) {
      throw new ValidationError('Actual finish cannot precede actual start.', {
        reason: 'FINISH_BEFORE_START',
      });
    }

    // N07 — an actual date may not be in the future beyond the data date (ADR-0035 §6): reject.
    if (dataDate !== null) {
      const future = [actualStart, actualFinish].find((d) => d !== null && d > dataDate);
      if (future) {
        throw new ValidationError('An actual date cannot be after the plan’s data date.', {
          reason: 'ACTUAL_AFTER_DATA_DATE',
        });
      }
    }

    // Repairs that keep the report self-consistent are surfaced to the caller as `meta.warnings`
    // (ADR-0035 §6): the write still succeeds and the resource reflects the corrected value, but the
    // client gets a machine-readable signal that a field it sent (or implied) was overridden.
    const warnings: ProgressWarning[] = [];
    const isComplete = actualFinish !== null || percentComplete >= 100;
    // N08 — complete without an actual finish (ADR-0035 §6): repair the finish to the data date + warn.
    if (isComplete && actualFinish === null && actualStart !== null && dataDate !== null) {
      actualFinish = dataDate;
      this.logger.warn({ activityId, reason: 'N08_COMPLETE_WITHOUT_FINISH' }, 'progress repaired');
      warnings.push({
        code: 'COMPLETE_WITHOUT_FINISH',
        message: 'Actual finish was set to the data date because the activity is complete.',
      });
    }
    // N18 — remaining > 0 on a complete activity (ADR-0035 §6): repair remaining to 0 + warn.
    if (isComplete && remainingDurationMinutes !== null && remainingDurationMinutes > 0) {
      remainingDurationMinutes = 0;
      this.logger.warn({ activityId, reason: 'N18_REMAINING_ON_COMPLETE' }, 'progress repaired');
      warnings.push({
        code: 'REMAINING_ON_COMPLETE',
        message: 'Remaining duration was set to zero because the activity is complete.',
      });
    }

    // Suspend / resume (ADR-0035 §4): resolve the pair (provided overrides stored; null clears) and
    // reject a resume before the suspend. These are NOT bounded by the data date (a resume may be in
    // the future — that pushes the remaining work out, §4).
    const suspendDate = this.resolveDate(dto.suspendDate, existing.suspendDate);
    const resumeDate = this.resolveDate(dto.resumeDate, existing.resumeDate);
    if (suspendDate !== null && resumeDate !== null && resumeDate < suspendDate) {
      throw new ValidationError('Resume date cannot precede the suspend date.', {
        reason: 'RESUME_BEFORE_SUSPEND',
      });
    }

    const patch: ActivityPatch = {
      percentComplete,
      actualStart,
      actualFinish,
      remainingDurationMinutes,
      suspendDate,
      resumeDate,
      status: deriveStatus(percentComplete, actualStart, actualFinish),
    };

    const changed = await this.activities.updateIfVersionMatches(
      activityId,
      dto.version,
      patch,
      principal.userId,
    );
    if (changed === 0) {
      throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
    }
    this.logger.info(
      { organizationId: organization.id, activityId, userId: principal.userId },
      'activity progress updated',
    );

    const updated = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!updated) throw new NotFoundError('Activity not found.');
    return { activity: updated, warnings, canReadCost };
  }

  /** A provided date field (parsed, or null to clear) overrides the stored one;
   * `undefined` (omitted) keeps the existing value. */
  private resolveDate(field: string | null | undefined, existing: Date | null): Date | null {
    if (field === undefined) return existing;
    return field === null ? null : parseCalendarDate(field);
  }

  async remove(principal: Principal, orgSlug: string, activityId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:delete', organization.id);

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);

    await this.prisma.$transaction((tx) =>
      this.lifecycle.cascadeSoftDelete(tx, 'activity', activityId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, activityId, userId: principal.userId },
      'activity deleted',
    );
  }

  /**
   * Dissolve a WBS summary: remove the grouping and **keep the work**. Its direct children take the
   * summary's own parent (its grandparent, or the top level), then the — now childless — summary is
   * soft-deleted through the usual cascade.
   *
   * This exists because deleting a summary is the opposite operation: `cascadeSoftDelete` takes the
   * whole subtree with it (ADR-0038), which is right when the work is genuinely cancelled and
   * catastrophic when the planner only meant to drop a level of grouping. The two are deliberately
   * separate endpoints rather than a flag, so the destructive one is never the default.
   *
   * A grandchild is untouched: it stays under its own parent, which simply moves up a level, so a
   * nested branch keeps its shape. The re-parent and the delete share ONE transaction under the
   * plan advisory lock, so a child can never be stranded between them — the count of active
   * activities falls by exactly one.
   *
   * Deliberately NOT in `HierarchyLifecycleService`: that service's contract is "a parent's removal
   * propagates to its children", and this is the precise inverse. Folding it in would put both
   * meanings behind one name.
   */
  async dissolveSummary(
    principal: Principal,
    orgSlug: string,
    activityId: string,
  ): Promise<DissolveSummaryResult> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:delete', organization.id);

    const existing = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');
    // The pen is asserted BEFORE the business rule, so a caller without the lock is told that and
    // not the activity's type — the "gate first" ordering every other structural write uses.
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);
    if (existing.type !== 'WBS_SUMMARY') {
      throw new ValidationError('Only a WBS summary can be dissolved.', {
        reason: 'NOT_A_SUMMARY',
      });
    }

    const promoted = await this.prisma.$transaction(async (tx) => {
      // Same lock as every other parent-tree write.
      await acquirePlanWriteLock(tx, existing.planId);

      /*
       * **Re-read the summary under the lock**, and take the children's new parent from THAT row.
       *
       * The read above happened before the lock, so between the two a concurrent `update` could
       * have re-parented this summary — and that write takes the same lock, so it is a race the
       * lock is meant to settle. Using the pre-lock `parentId` would promote the children to a
       * grandparent the summary no longer has: a silently wrong tree, produced by a transaction
       * that looks correctly serialised. A single primary-key read is the whole cost of not
       * having that bug.
       */
      const locked = await tx.activity.findFirst({
        where: { id: activityId, organizationId: organization.id, deletedAt: null },
        select: { parentId: true },
      });
      if (!locked) throw new NotFoundError('Activity not found.');

      // Children take the summary's own parent — null promotes them to the top level. Scoped to
      // org + active rows; `version` bumps so a client holding a stale copy of a promoted child
      // gets a clean 409 on its next write rather than silently overwriting the promotion.
      const rows = await tx.activity.findMany({
        where: { organizationId: organization.id, parentId: activityId, deletedAt: null },
        select: { id: true },
      });
      await tx.activity.updateMany({
        where: { organizationId: organization.id, parentId: activityId, deletedAt: null },
        data: {
          parentId: locked.parentId,
          updatedBy: principal.userId,
          version: { increment: 1 },
        },
      });
      // The summary is childless now, so the cascade has nothing left to take with it.
      await this.lifecycle.cascadeSoftDelete(tx, 'activity', activityId, principal.userId);

      // Re-read the promoted rows so the response carries their NEW versions. A client cannot
      // derive them: it did not know which activities were children, and `updateMany` reports only
      // a count. Without this the caller's only correct move after a dissolve is a full refetch,
      // and nothing tells it so.
      return tx.activity.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, parentId: true, version: true },
        orderBy: { id: 'asc' },
      });
    });

    this.logger.info(
      {
        organizationId: organization.id,
        planId: existing.planId,
        activityId,
        userId: principal.userId,
        promoted: promoted.length,
      },
      'WBS summary dissolved',
    );

    return { promoted };
  }

  async restore(
    principal: Principal,
    orgSlug: string,
    activityId: string,
  ): Promise<{ activity: Activity; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:restore', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const existing = await this.activities.findByIdInOrg(activityId, organization.id);
    if (!existing) throw new NotFoundError('Activity not found.');
    await this.editLock.assertHoldsPen(principal, existing.planId, organization.id);
    if (!existing.deletedAt) return { activity: existing, canReadCost }; // already active — no-op

    // The lifecycle enforces the top-down invariant: restoring an activity whose
    // parent plan is still soft-deleted raises PARENT_DELETED (→ 409).
    await this.prisma.$transaction((tx) =>
      this.lifecycle.restoreBatch(tx, 'activity', activityId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, activityId, userId: principal.userId },
      'activity restored',
    );

    const restored = await this.activities.findActiveByIdInOrg(activityId, organization.id);
    if (!restored) throw new NotFoundError('Activity not found.');
    return { activity: restored, canReadCost };
  }

  /** Load the parent plan active and in the caller's org, or 404. */
  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /**
   * Map a Prisma unique-violation to a 409, distinguishing the two partial-unique
   * constraints an activity carries (name-per-plan vs code-per-plan) so the caller
   * knows which field to fix; else rethrow untouched.
   */
  private mapWriteError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // `meta.target` names the failing unique — the field list (e.g.
      // `['plan_id', 'code']`) on PostgreSQL, or the index name as a string.
      const target = error.meta?.target;
      const isCode = Array.isArray(target)
        ? target.includes('code')
        : typeof target === 'string' && target.includes('code');
      return isCode
        ? new ConflictError('An activity with this code already exists for this plan.', {
            reason: HIERARCHY_CONFLICT.CODE_TAKEN,
          })
        : new ConflictError('An activity with this name already exists for this plan.', {
            reason: HIERARCHY_CONFLICT.NAME_TAKEN,
          });
    }
    return error;
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
