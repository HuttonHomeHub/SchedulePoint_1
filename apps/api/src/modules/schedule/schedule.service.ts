import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanScheduleSummary } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import {
  allMinutesWorkCalendar,
  computeSchedule,
  ScheduleGraphNotADagError,
  type EngineActivity,
  type EngineEdge,
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
        const activityRows = await this.schedule.loadActivities(organization.id, planId, tx);
        const edgeRows = await this.schedule.loadEdges(organization.id, planId, tx);
        // Observability (ADR-0036 §6): how many edges carry a lag calendar that changes the
        // arithmetic today. Only TWENTY_FOUR_HOUR is distinct from the plan calendar in M3, so
        // a non-zero count here is the signal that an elapsed lag actually moved dates.
        lagCalendarOverrideCount = edgeRows.filter(
          (e) => e.lagCalendar === 'TWENTY_FOUR_HOUR',
        ).length;
        // Build the plan's working-time calendar once — the inherit default (ADR-0024).
        const calendar = await this.resolveCalendar(organization.id, plan.calendarId, tx);

        // Per-activity calendars (ADR-0037, M5): resolve each DISTINCT non-inherit activity
        // calendar ONCE (O(distinct calendars), not O(activities)). An activity with no calendar,
        // or whose calendar IS the plan's, keeps the byte-identical fast path (undefined port).
        const distinctActivityCalIds = [
          ...new Set(
            activityRows
              .map((r) => r.calendarId)
              .filter((id): id is string => id != null && id !== plan.calendarId),
          ),
        ];
        const portByCalId = new Map<string, WorkingTimeCalendar>();
        for (const calId of distinctActivityCalIds) {
          portByCalId.set(calId, await this.resolveCalendar(organization.id, calId, tx));
        }
        activityCalendarCount = distinctActivityCalIds.length;
        const portFor = (calId: string | null): WorkingTimeCalendar | undefined =>
          calId == null || calId === plan.calendarId ? undefined : portByCalId.get(calId);
        const calIdByActivity = new Map(activityRows.map((r) => [r.id, r.calendarId] as const));

        // Progressed activities this recalc consumes (M2, ADR-0035): the signal that progress
        // actually shaped the dates (0 = an unprogressed plan, the byte-identical path).
        progressedActivityCount = activityRows.filter(
          (r) => r.actualStart != null || r.actualFinish != null,
        ).length;

        const output = computeSchedule(
          activityRows.map((r) => toEngineActivity(r, portFor(r.calendarId))),
          edgeRows.map((r) =>
            toEngineEdge(
              r,
              portFor(calIdByActivity.get(r.predecessorId) ?? null),
              portFor(calIdByActivity.get(r.successorId) ?? null),
            ),
          ),
          // The plan's out-of-sequence recalc mode (M2, ADR-0035 §1); default RETAINED_LOGIC.
          { dataDate, calendar, progressMode: plan.progressRecalcMode },
        );
        await this.schedule.writeResults(organization.id, planId, output.results, tx);
        await this.schedule.writeDrivingFlags(organization.id, planId, output.edges, tx);
        return output.summary;
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
        lagCalendarOverrideCount,
        // How many DISTINCT per-activity calendars were built this recalc (ADR-0037, M5) — the
        // signal that per-activity calendars actually shaped the dates (0 on the all-inherit path).
        activityCalendarCount,
        // Progress (M2, ADR-0035): the recalc mode and how many activities carried actuals.
        progressRecalcMode: plan.progressRecalcMode,
        progressedActivityCount,
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
    actualStart: row.actualStart ? formatCalendarDate(row.actualStart) : null,
    actualFinish: row.actualFinish ? formatCalendarDate(row.actualFinish) : null,
    resumeDate: row.resumeDate ? formatCalendarDate(row.resumeDate) : null,
    ...(remainingMinutes !== undefined ? { remainingMinutes } : {}),
    ...(calendar ? { calendar } : {}),
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
