import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanFloatPaths, PlanScheduleSummary } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { MINUTES_PER_DAY } from './day-compat-calendar';
import {
  allMinutesWorkCalendar,
  computeFloatPaths,
  computeSchedule,
  levelSchedule,
  ScheduleGraphNotADagError,
  type ComputeOptions,
  type EngineActivity,
  type EngineAssignment,
  type EngineEdge,
  type EngineResource,
  type EngineSummary,
  type WorkingTimeCalendar,
} from './engine';
import { buildPlanCalendar } from './plan-calendar';
import {
  ScheduleRepository,
  type ScheduleActivityRow,
  type ScheduleEdgeRow,
} from './schedule.repository';

/** Machine-readable reasons carried in a schedule {@link ValidationError}. */
export const SCHEDULE_ERROR = {
  /** The plan has no `plannedStart`, so there is no data date to schedule from. */
  PLAN_START_REQUIRED: 'PLAN_START_REQUIRED',
} as const;

/** An active plan row as loaded for scheduling — carries the engine-relevant option fields. */
type ActivePlan = NonNullable<Awaited<ReturnType<PlanRepository['findActiveByIdInOrg']>>>;

/**
 * The CPM recalculation service (ADR-0022). Resolves the org from the caller's
 * memberships (anti-IDOR) and requires `schedule:calculate`, loads the plan
 * (404) and requires a `plannedStart` (422), then — under the plan-scoped lock,
 * in one transaction — loads the active graph, runs the pure engine, and persists
 * the engine-owned columns. The write never touches `version`/`updated_at`, so a
 * recalculation is invisible to optimistic locking and cannot masquerade as a
 * user edit.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly schedule: ScheduleRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ScheduleService.name) private readonly logger: PinoLogger,
  ) {}

  async recalculate(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanScheduleSummary> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:calculate', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    if (!plan.plannedStart) {
      throw new ValidationError('Set the plan’s start date before calculating the schedule.', {
        reason: SCHEDULE_ERROR.PLAN_START_REQUIRED,
      });
    }
    const dataDate = formatCalendarDate(plan.plannedStart);

    const startedAt = Date.now();
    let summary: EngineSummary;
    let lagCalendarOverrideCount = 0;
    let activityCalendarCount = 0;
    let progressedActivityCount = 0;
    try {
      summary = await this.prisma.$transaction(async (tx) => {
        // Serialise with dependency creates and other recalcs on this plan, then
        // read a consistent snapshot of the graph (ADR-0021/0022).
        await this.schedule.lockPlanForWrite(planId, tx);
        // Recalculate is a pen-gated plan mutation (ADR-0028, Q-B). Assert INSIDE the
        // advisory lock so a steal can't slip between the check and the engine write.
        await this.editLock.assertHoldsPen(principal, planId, organization.id, tx);
        const graph = await this.buildEngineGraph(organization.id, plan, dataDate, tx);
        lagCalendarOverrideCount = graph.meta.lagCalendarOverrideCount;
        activityCalendarCount = graph.meta.activityCalendarCount;
        progressedActivityCount = graph.meta.progressedActivityCount;
        const output = computeSchedule(graph.activities, graph.edges, graph.options);
        // Resource levelling (ADR-0041): iff the plan opted in AND has assignments, run the pure
        // second pass and persist its additive overlay. Off ⇒ the network `output.results` are written
        // as-is and the leveled columns are cleared to null/false (byte-identical, the parity gate).
        let results = output.results;
        let summary: EngineSummary = output.summary;
        if (graph.leveling) {
          const leveled = levelSchedule(
            graph.activities,
            output,
            graph.leveling.assignments,
            graph.leveling.resources,
            {
              levelWithinFloatOnly: plan.levelWithinFloatOnly,
              dataDate,
              planCalendar: graph.options.calendar,
            },
          );
          results = leveled.results;
          summary = { ...output.summary, ...leveled.summary };
        }
        await this.schedule.writeResults(organization.id, planId, results, tx);
        await this.schedule.writeDrivingFlags(organization.id, planId, output.edges, tx);
        return summary;
      });
    } catch (error) {
      // A residual cycle is a breach of the DAG invariant the write path
      // guarantees (ADR-0021) — it should be unreachable. Log it distinctly and
      // rethrow so the global filter returns an opaque 500 (no data persisted).
      if (error instanceof ScheduleGraphNotADagError) {
        this.logger.error(
          {
            organizationId: organization.id,
            planId,
            unresolvedActivityIds: error.unresolvedActivityIds,
          },
          'schedule DAG invariant breached',
        );
      }
      throw error;
    }

    this.logger.info(
      {
        organizationId: organization.id,
        planId,
        userId: principal.userId,
        // Which calendar drove the dates (null → all-days-work) — auditable per ADR-0024.
        calendarId: plan.calendarId ?? null,
        activityCount: summary.activityCount,
        criticalCount: summary.criticalCount,
        constraintViolationCount: summary.constraintViolationCount,
        constraintWarningCount: summary.constraintWarningCount,
        resourceDriverMissingCount: summary.resourceDriverMissingCount,
        lagCalendarOverrideCount,
        // How many DISTINCT per-activity calendars were built this recalc (ADR-0037, M5) — the
        // signal that per-activity calendars actually shaped the dates (0 on the all-inherit path).
        activityCalendarCount,
        // Progress (M2, ADR-0035): the recalc mode and how many activities carried actuals.
        progressRecalcMode: plan.progressRecalcMode,
        progressedActivityCount,
        // Expected-finish resizes applied this run (M4, ADR-0035 §9); 0 unless the option is on.
        expectedFinishAppliedCount: summary.expectedFinishAppliedCount,
        // Resource levelling (M7, ADR-0041): whether the opt-in pass ran, and its produce-and-flag
        // roll-up. Null when levelling is off (the byte-identical fast path).
        levelResources: plan.levelResources,
        leveledActivityCount: summary.leveledActivityCount ?? null,
        levelingWindowExceededCount: summary.levelingWindowExceededCount ?? null,
        selfOverAllocatedCount: summary.selfOverAllocatedCount ?? null,
        durationMs: Date.now() - startedAt,
      },
      'schedule recalculated',
    );

    return {
      dataDate,
      projectFinish: summary.projectFinish,
      activityCount: summary.activityCount,
      criticalCount: summary.criticalCount,
      nearCriticalCount: summary.nearCriticalCount,
      constraintViolationCount: summary.constraintViolationCount,
      constraintWarningCount: summary.constraintWarningCount,
      loeNoSpanCount: summary.loeNoSpanCount,
      resourceDriverMissingCount: summary.resourceDriverMissingCount,
    };
  }

  /**
   * Read a plan's schedule summary WITHOUT recomputing — a single aggregate over
   * the persisted engine columns (`schedule:read`, every member). Reflects the
   * last recalculation; `projectFinish` is null for a never-calculated or empty
   * plan, and `dataDate` is null when the plan has no start date.
   */
  async summary(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanScheduleSummary> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const aggregate = await this.schedule.summarise(organization.id, planId);
    return {
      dataDate: plan.plannedStart ? formatCalendarDate(plan.plannedStart) : null,
      projectFinish: aggregate.projectFinish,
      activityCount: aggregate.activityCount,
      criticalCount: aggregate.criticalCount,
      nearCriticalCount: aggregate.nearCriticalCount,
      constraintViolationCount: aggregate.constraintViolationCount,
      constraintWarningCount: aggregate.constraintWarningCount,
      loeNoSpanCount: aggregate.loeNoSpanCount,
      resourceDriverMissingCount: aggregate.resourceDriverMissingCount,
    };
  }

  /**
   * The ranked contiguous **float paths** into a target activity (P6 "multiple float paths",
   * ADR-0035 §19) — a read-only CPM analysis (`schedule:read`, every member). Recomputes the schedule
   * live from the plan's active graph (never mutates or persists), then walks the driving chains into
   * the target: path 0 is its own driving chain (relative float 0), branch paths follow in
   * non-decreasing relative-float order, bounded by `maxPaths`. Requires a plan start (422) for a data
   * date; 404s if the target activity is not active in this plan. Relative float is returned in
   * working days (÷1440), matching the day-denominated float on the activity rows (ADR-0036 §7).
   */
  async floatPaths(
    principal: Principal,
    orgSlug: string,
    planId: string,
    targetActivityId: string,
    maxPaths: number,
  ): Promise<PlanFloatPaths> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    if (!plan.plannedStart) {
      throw new ValidationError('Set the plan’s start date before analysing float paths.', {
        reason: SCHEDULE_ERROR.PLAN_START_REQUIRED,
      });
    }
    const dataDate = formatCalendarDate(plan.plannedStart);

    // Read a consistent snapshot of the graph (no write lock — this never persists). Reuses the exact
    // same engine-input builder as `recalculate`, so the analysis can never drift from the schedule.
    const { activities, edges, options } = await this.prisma.$transaction((tx) =>
      this.buildEngineGraph(organization.id, plan, dataDate, tx),
    );
    // The engine returns [] for an unknown target; surface that as a 404 rather than an empty result
    // so a mistyped id is not silently "no paths". A present target always yields path 0 (target-first).
    if (!activities.some((a) => a.id === targetActivityId)) {
      throw new NotFoundError('Activity not found in this plan.');
    }

    const paths = computeFloatPaths(activities, edges, options, targetActivityId, maxPaths).map(
      (p) => ({
        index: p.index,
        // Engine float is working minutes (ADR-0036); expose days like the activity rows.
        relativeFloat: Math.round(p.relativeFloat / MINUTES_PER_DAY),
        activityIds: p.activityIds,
      }),
    );
    return { targetActivityId, paths };
  }

  /**
   * Build the pure engine's input (activities, edges, options) for a plan from its active graph, plus
   * observability counts. Shared by {@link recalculate} (inside its write lock) and {@link floatPaths}
   * (a read snapshot) so the two can never diverge in how they map the DB graph onto the engine.
   * Per-activity calendars (ADR-0037) are resolved once per DISTINCT non-inherit calendar; an activity
   * that inherits the plan calendar keeps the byte-identical fast path (undefined port).
   */
  private async buildEngineGraph(
    organizationId: string,
    plan: ActivePlan,
    dataDate: string,
    tx: Prisma.TransactionClient,
  ): Promise<{
    activities: EngineActivity[];
    edges: EngineEdge[];
    options: ComputeOptions;
    /** The resource-levelling demand model — loaded ONLY when the plan opts in (`levelResources`) and
     * has active assignments; null keeps the byte-identical fast path (ADR-0041 §7). */
    leveling: { assignments: EngineAssignment[]; resources: EngineResource[] } | null;
    meta: {
      lagCalendarOverrideCount: number;
      activityCalendarCount: number;
      progressedActivityCount: number;
    };
  }> {
    const activityRows = await this.schedule.loadActivities(organizationId, plan.id, tx);
    const edgeRows = await this.schedule.loadEdges(organizationId, plan.id, tx);
    // Observability (ADR-0036 §6): how many edges carry a lag calendar that changes the arithmetic
    // today. Only TWENTY_FOUR_HOUR is distinct from the plan calendar in M3.
    const lagCalendarOverrideCount = edgeRows.filter(
      (e) => e.lagCalendar === 'TWENTY_FOUR_HOUR',
    ).length;
    // Build the plan's working-time calendar once — the inherit default (ADR-0024).
    const calendar = await this.resolveCalendar(organizationId, plan.calendarId, tx);

    // Resource-dependent scheduling (M7.2, ADR-0035 §23 / ADR-0039): a RESOURCE_DEPENDENT activity
    // schedules on its DRIVING resource's calendar instead of its own. Resolve the driving-resource
    // calendar per such activity (the DB guarantees ≤1 driver). Only queried when the plan actually has
    // a RESOURCE_DEPENDENT activity, so a plan without one keeps the byte-identical fast path.
    const hasResourceDependent = activityRows.some((r) => r.type === 'RESOURCE_DEPENDENT');
    const drivingResourceCalByActivity = new Map<string, string | null>();
    if (hasResourceDependent) {
      for (const row of await this.schedule.loadDrivingResourceCalendars(
        organizationId,
        plan.id,
        tx,
      )) {
        drivingResourceCalByActivity.set(row.activityId, row.resourceCalendarId);
      }
    }
    // The EFFECTIVE calendar id an activity schedules on, and whether its driving resource is missing.
    // Fallback order (ADR-0039 §4): driving-resource calendar → activity calendar → plan default. A
    // RESOURCE_DEPENDENT activity with no active driver is produced-and-flagged (`resourceDriverMissing`)
    // and falls back to its own calendar; every other type keeps its own calendar unchanged (so the
    // A5500 contrast — a TASK ignoring an assigned resource's calendar — is type-gated for free).
    const effectiveOf = (
      r: ScheduleActivityRow,
    ): { calId: string | null; driverMissing: boolean } => {
      if (r.type !== 'RESOURCE_DEPENDENT') return { calId: r.calendarId, driverMissing: false };
      if (!drivingResourceCalByActivity.has(r.id))
        return { calId: r.calendarId, driverMissing: true };
      return {
        calId: drivingResourceCalByActivity.get(r.id) ?? r.calendarId,
        driverMissing: false,
      };
    };
    const effectiveByActivity = new Map(activityRows.map((r) => [r.id, effectiveOf(r)] as const));

    // Per-activity calendars (ADR-0037, M5) + the resource-driving calendar (M7.2): resolve each
    // DISTINCT non-inherit EFFECTIVE calendar ONCE (so a shared crane calendar is built at most once).
    const distinctActivityCalIds = [
      ...new Set(
        [...effectiveByActivity.values()]
          .map((e) => e.calId)
          .filter((id): id is string => id != null && id !== plan.calendarId),
      ),
    ];
    const portByCalId = new Map<string, WorkingTimeCalendar>();
    for (const calId of distinctActivityCalIds) {
      portByCalId.set(calId, await this.resolveCalendar(organizationId, calId, tx));
    }
    const portFor = (calId: string | null): WorkingTimeCalendar | undefined =>
      calId == null || calId === plan.calendarId ? undefined : portByCalId.get(calId);
    // Edges resolve their PRED/SUCC lag calendar on the endpoint's EFFECTIVE calendar too (a
    // RESOURCE_DEPENDENT endpoint's lag rides its resource calendar, consistent with its scheduling).
    const calIdByActivity = new Map(
      activityRows.map((r) => [r.id, effectiveByActivity.get(r.id)!.calId] as const),
    );

    // Progressed activities this recalc consumes (M2, ADR-0035): 0 = an unprogressed plan.
    const progressedActivityCount = activityRows.filter(
      (r) => r.actualStart != null || r.actualFinish != null,
    ).length;

    const activities = activityRows.map((r) => {
      const { calId, driverMissing } = effectiveByActivity.get(r.id)!;
      return toEngineActivity(r, portFor(calId), driverMissing);
    });
    const edges = edgeRows.map((r) =>
      toEngineEdge(
        r,
        portFor(calIdByActivity.get(r.predecessorId) ?? null),
        portFor(calIdByActivity.get(r.successorId) ?? null),
      ),
    );
    // The plan's out-of-sequence recalc mode (M2, ADR-0035 §1); default RETAINED_LOGIC. Expected-finish
    // (M4, §9) resizes in-progress remaining; the critical definition + float threshold (M6, §17) decide
    // criticality; the day-denominated threshold is converted to working minutes for the engine.
    const options: ComputeOptions = {
      dataDate,
      calendar,
      progressMode: plan.progressRecalcMode,
      useExpectedFinishDates: plan.useExpectedFinishDates,
      criticalDefinition: plan.criticalPathDefinition,
      criticalFloatThresholdMinutes: plan.criticalFloatThreshold * MINUTES_PER_DAY,
      totalFloatMode: plan.totalFloatMode,
      makeOpenEndsCritical: plan.makeOpenEndsCritical,
    };

    // Resource levelling (M7, ADR-0041): the opt-in second pass. Load its demand model ONLY when the
    // plan opts in AND has active assignments — otherwise `leveling` is null and the recalc is the
    // byte-identical fast path (§7). Resource calendars reuse the per-recalc port cache built above.
    let leveling: { assignments: EngineAssignment[]; resources: EngineResource[] } | null = null;
    if (plan.levelResources) {
      const assignmentRows = await this.schedule.loadResourceAssignments(
        organizationId,
        plan.id,
        tx,
      );
      if (assignmentRows.length > 0) {
        const resourceRows = await this.schedule.loadLevellingResources(
          organizationId,
          plan.id,
          tx,
        );
        // Resolve each distinct resource calendar (≠ the plan calendar) to a port ONCE — reusing any
        // already built for the activity/driving-resource calendars above.
        for (const calId of new Set(
          resourceRows
            .map((r) => r.calendarId)
            .filter((id): id is string => id != null && id !== plan.calendarId),
        )) {
          if (!portByCalId.has(calId)) {
            portByCalId.set(calId, await this.resolveCalendar(organizationId, calId, tx));
          }
        }
        const resources: EngineResource[] = resourceRows.map((r) => ({
          id: r.id,
          capacity: r.maxUnitsPerHour === null ? null : r.maxUnitsPerHour.toNumber(),
          ...(portFor(r.calendarId) ? { calendar: portFor(r.calendarId)! } : {}),
        }));
        const assignments: EngineAssignment[] = assignmentRows.map((a) => ({
          activityId: a.activityId,
          resourceId: a.resourceId,
          // A NULL demand rate (ADR-0040 inert triad) contributes zero demand (parity-safe).
          unitsPerHour: a.unitsPerHour === null ? 0 : a.unitsPerHour.toNumber(),
        }));
        leveling = { assignments, resources };
      }
    }

    return {
      activities,
      edges,
      options,
      leveling,
      meta: {
        lagCalendarOverrideCount,
        activityCalendarCount: distinctActivityCalIds.length,
        progressedActivityCount,
      },
    };
  }

  /**
   * The plan's working-day calendar for this recalculation, built once (ADR-0024).
   * A null `calendarId`, or a calendar that is missing/soft-deleted (defensive — the
   * delete-in-use guard prevents deleting an in-use calendar), falls back to
   * `allDaysWorkCalendar`, so the null path is byte-identical to M6 and the golden
   * suite still holds.
   */
  private async resolveCalendar(
    organizationId: string,
    calendarId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<WorkingTimeCalendar> {
    if (!calendarId) return buildPlanCalendar(null);
    const calendar = await this.schedule.loadPlanCalendar(organizationId, calendarId, tx);
    // Build the engine's minute-granular calendar directly from the stored shift/window
    // rows (ADR-0036 §2); a missing/soft-deleted calendar falls back to all-days-work.
    return buildPlanCalendar(calendar);
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

/**
 * The engine's remaining working minutes for an **in-progress** activity (M2, ADR-0035 §1): the
 * explicit `remainingDurationMinutes` when set, else derived from `durationMinutes × (1 −
 * percentComplete)` (rounded, floored at 0). Undefined for a not-started or complete activity — the
 * engine ignores it there (a complete activity uses its actual finish; not-started, its full duration).
 */
function resolveRemainingMinutes(row: ScheduleActivityRow): number | undefined {
  if (row.actualStart == null || row.actualFinish != null) return undefined;
  if (row.remainingDurationMinutes != null) return row.remainingDurationMinutes;
  return Math.max(0, Math.round(row.durationMinutes * (1 - row.percentComplete / 100)));
}

/**
 * Project a stored activity row onto the engine's input struct (durations are stored in minutes).
 * `calendar` is the activity's resolved own-calendar port (ADR-0037, M5) — undefined when it
 * inherits the plan calendar, keeping the byte-identical fast path. Progress actuals (M2) cross as
 * `YYYY-MM-DD`; `remainingMinutes` is the service-resolved remaining for an in-progress activity.
 */
function toEngineActivity(
  row: ScheduleActivityRow,
  calendar?: WorkingTimeCalendar,
  resourceDriverMissing = false,
): EngineActivity {
  const remainingMinutes = resolveRemainingMinutes(row);
  return {
    id: row.id,
    durationMinutes: row.durationMinutes,
    type: row.type,
    constraintType: row.constraintType,
    constraintDate: row.constraintDate ? formatCalendarDate(row.constraintDate) : null,
    secondaryConstraintType: row.secondaryConstraintType,
    secondaryConstraintDate: row.secondaryConstraintDate
      ? formatCalendarDate(row.secondaryConstraintDate)
      : null,
    visualStart: row.visualStart ? formatCalendarDate(row.visualStart) : null,
    scheduleAsLateAsPossible: row.scheduleAsLateAsPossible,
    levelingPriority: row.levelingPriority,
    actualStart: row.actualStart ? formatCalendarDate(row.actualStart) : null,
    actualFinish: row.actualFinish ? formatCalendarDate(row.actualFinish) : null,
    resumeDate: row.resumeDate ? formatCalendarDate(row.resumeDate) : null,
    expectedFinish: row.expectedFinish ? formatCalendarDate(row.expectedFinish) : null,
    ...(remainingMinutes !== undefined ? { remainingMinutes } : {}),
    ...(calendar ? { calendar } : {}),
    // Resource-dependent driver-missing (M7.2, ADR-0035 §23): the service sets this for a
    // RESOURCE_DEPENDENT activity with no active driver; the engine carries it to its result.
    ...(resourceDriverMissing ? { resourceDriverMissing: true } : {}),
  };
}

/**
 * Project a stored dependency row onto the engine's edge struct (lag is stored in minutes) and
 * resolve the per-relationship lag calendar (ADR-0036 §6 / ADR-0037): `TWENTY_FOUR_HOUR` measures
 * the lag as **elapsed** time (the 24/7 `allMinutesWorkCalendar`); `PREDECESSOR`/`SUCCESSOR` resolve
 * to the predecessor's / successor's own-calendar port (M5) — undefined when that endpoint inherits
 * the plan calendar; `PROJECT_DEFAULT` is always undefined (the plan calendar). An undefined port is
 * the engine's byte-identical fast path, so an all-inherit plan is unchanged from M3.
 */
function toEngineEdge(
  row: ScheduleEdgeRow,
  predecessorCalendar?: WorkingTimeCalendar,
  successorCalendar?: WorkingTimeCalendar,
): EngineEdge {
  const lagCalendar =
    row.lagCalendar === 'TWENTY_FOUR_HOUR'
      ? allMinutesWorkCalendar
      : row.lagCalendar === 'PREDECESSOR'
        ? predecessorCalendar
        : row.lagCalendar === 'SUCCESSOR'
          ? successorCalendar
          : undefined;
  return {
    id: row.id,
    predecessorId: row.predecessorId,
    successorId: row.successorId,
    type: row.type,
    lagMinutes: row.lagMinutes,
    ...(lagCalendar ? { lagCalendar } : {}),
  };
}
