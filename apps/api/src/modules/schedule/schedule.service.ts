import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import {
  allDaysWorkCalendar,
  computeSchedule,
  type EngineActivity,
  type EngineEdge,
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
 * The plan-level result of a recalculation (and, in C1, the read summary). The
 * `dataDate` is the plan's start; `projectFinish` is the latest computed finish
 * (null for an empty plan). Dates are calendar days (`YYYY-MM-DD`).
 */
export interface PlanScheduleSummaryResult {
  dataDate: string;
  projectFinish: string | null;
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  parkedConstraintCount: number;
}

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
  ): Promise<PlanScheduleSummaryResult> {
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
    const summary = await this.prisma.$transaction(async (tx) => {
      // Serialise with dependency creates and other recalcs on this plan, then
      // read a consistent snapshot of the graph (ADR-0021/0022).
      await this.schedule.lockPlanForWrite(planId, tx);
      const activityRows = await this.schedule.loadActivities(organization.id, planId, tx);
      const edgeRows = await this.schedule.loadEdges(organization.id, planId, tx);

      const output = computeSchedule(
        activityRows.map(toEngineActivity),
        edgeRows.map(toEngineEdge),
        { dataDate, calendar: allDaysWorkCalendar },
      );
      await this.schedule.writeResults(organization.id, planId, output.results, tx);
      return output.summary;
    });

    this.logger.info(
      {
        organizationId: organization.id,
        planId,
        userId: principal.userId,
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
