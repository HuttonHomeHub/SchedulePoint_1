import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanScheduleSummary } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import {
  allDaysWorkCalendar,
  buildWorkingDayCalendar,
  computeSchedule,
  ScheduleGraphNotADagError,
  type EngineActivity,
  type EngineEdge,
  type EngineSummary,
  type WorkingDayCalendar,
} from './engine';
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
    try {
      summary = await this.prisma.$transaction(async (tx) => {
        // Serialise with dependency creates and other recalcs on this plan, then
        // read a consistent snapshot of the graph (ADR-0021/0022).
        await this.schedule.lockPlanForWrite(planId, tx);
        const activityRows = await this.schedule.loadActivities(organization.id, planId, tx);
        const edgeRows = await this.schedule.loadEdges(organization.id, planId, tx);
        // Build the plan's working-day calendar once and inject it at the existing
        // port seam (ADR-0023 §5) — the engine's pass code is unchanged (ADR-0024).
        const calendar = await this.resolveCalendar(organization.id, plan.calendarId, tx);

        const output = computeSchedule(
          activityRows.map(toEngineActivity),
          edgeRows.map(toEngineEdge),
          { dataDate, calendar },
        );
        await this.schedule.writeResults(organization.id, planId, output.results, tx);
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
        parkedConstraintCount: summary.parkedConstraintCount,
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
      parkedConstraintCount: summary.parkedConstraintCount,
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
      parkedConstraintCount: aggregate.parkedConstraintCount,
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
  ): Promise<WorkingDayCalendar> {
    if (!calendarId) return allDaysWorkCalendar;
    const calendar = await this.schedule.loadPlanCalendar(organizationId, calendarId, tx);
    if (!calendar) return allDaysWorkCalendar;
    return buildWorkingDayCalendar(
      calendar.workingWeekdays,
      calendar.exceptions.map((e) => ({
        date: formatCalendarDate(e.date),
        isWorking: e.isWorking,
      })),
    );
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

/** Project a stored activity row onto the engine's input struct (ADR-0023). */
function toEngineActivity(row: ScheduleActivityRow): EngineActivity {
  return {
    id: row.id,
    durationDays: row.durationDays,
    type: row.type,
    constraintType: row.constraintType,
    constraintDate: row.constraintDate ? formatCalendarDate(row.constraintDate) : null,
  };
}

/** Project a stored dependency row onto the engine's edge struct. */
function toEngineEdge(row: ScheduleEdgeRow): EngineEdge {
  return {
    predecessorId: row.predecessorId,
    successorId: row.successorId,
    type: row.type,
    lagDays: row.lagDays,
  };
}
