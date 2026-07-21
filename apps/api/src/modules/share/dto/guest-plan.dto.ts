import { ApiProperty } from '@nestjs/swagger';
import { PlanStatus } from '@prisma/client';
import { WorkingWeekdays } from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';
import type { CalendarWithExceptions } from '../../calendars/calendar.repository';
import type { ScheduleAggregate } from '../../schedule/schedule.repository';

/**
 * Guest read DTOs for the plan view (ADR-0051 §4, F-M3). These are DELIBERATELY
 * field-stripped, READ-ONLY projections for the session-less External-Guest surface:
 * they expose ONLY the fixed `SCHEDULE_READ` scope and NOTHING else. Every field here
 * is deliberate; anything not listed is excluded by construction (there is no `from`
 * that copies it). In particular these carry NO cost / Earned-Value / money, NO
 * resources / assignments, NO baselines / variance, NO notes, NO audit columns
 * (createdBy/updatedBy/version/deletedAt/timestamps), NO user identity, NO plan-lock
 * holder, and NO token / tokenHash — see the `guest-dto.spec.ts` exclusion assertions.
 */

/** A single dated calendar exception, stripped to what the time axis needs. */
export class GuestCalendarExceptionDto {
  @ApiProperty({ format: 'date', description: 'Calendar day (YYYY-MM-DD).' })
  date!: string;

  @ApiProperty({ description: 'false = non-working (holiday); true = worked exception.' })
  isWorking!: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'Optional human label.' })
  label!: string | null;
}

/**
 * The plan's working-day calendar, stripped to what a guest needs to render the TSLD
 * time axis (ADR-0051 §4): the weekday mask + dated exceptions. No id, no audit, no
 * version — a guest cannot address the calendar, only read its shape.
 */
export class GuestCalendarDto {
  @ApiProperty({ description: 'Calendar name.' })
  name!: string;

  @ApiProperty({
    minimum: 0,
    maximum: 127,
    description: '7-bit working-weekday mask (bit 0 = Monday … bit 6 = Sunday).',
  })
  workingWeekdays!: number;

  @ApiProperty({ type: GuestCalendarExceptionDto, isArray: true })
  exceptions!: GuestCalendarExceptionDto[];

  /** Map a calendar-with-exceptions row to the guest shape (only the axis-relevant fields). */
  static from(entity: CalendarWithExceptions): GuestCalendarDto {
    return {
      name: entity.name,
      // Storage is intraday shift rows (ADR-0036); the public field stays a weekday mask —
      // a weekday is "working" if it carries any shift (mirrors CalendarResponseDto).
      workingWeekdays: WorkingWeekdays.fromIndices(entity.shifts.map((shift) => shift.weekday)),
      exceptions: entity.exceptions.map((exception) => ({
        date: formatCalendarDate(exception.startDate),
        isWorking: exception.windows.length > 0,
        label: exception.label,
      })),
    };
  }
}

/**
 * The plan's computed schedule roll-up, stripped to the guest scope (ADR-0051 §4:
 * "project finish, critical path"). Read straight from the persisted engine columns —
 * NO recompute. Deliberately drops the internal engine diagnostic counts (constraint /
 * external / LOE / resource-driver / levelling), which are team-facing and out of the
 * guest surface.
 */
export class GuestScheduleSummaryDto {
  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: "The data date (the plan's start); null if unset.",
  })
  dataDate!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'The latest computed finish across the plan; null if not yet calculated.',
  })
  projectFinish!: string | null;

  @ApiProperty({ description: 'Active activities considered in the schedule.' })
  activityCount!: number;

  @ApiProperty({ description: 'Activities on the critical path (total float ≤ 0).' })
  criticalCount!: number;

  @ApiProperty({ description: 'Near-critical activities (0 < total float ≤ 5 working days).' })
  nearCriticalCount!: number;

  /** Build from the persisted-column aggregate plus the plan's data date. */
  static from(aggregate: ScheduleAggregate, dataDate: string | null): GuestScheduleSummaryDto {
    return {
      dataDate,
      projectFinish: aggregate.projectFinish,
      activityCount: aggregate.activityCount,
      criticalCount: aggregate.criticalCount,
      nearCriticalCount: aggregate.nearCriticalCount,
    };
  }
}

/** The domain inputs the guest plan view is assembled from (all derived from the token's plan). */
export interface GuestPlanViewSource {
  plan: {
    id: string;
    name: string;
    status: PlanStatus;
    description: string | null;
    plannedStart: Date | null;
  };
  calendar: CalendarWithExceptions | null;
  aggregate: ScheduleAggregate;
}

/**
 * The composite `GET /api/v1/share/plan` payload: the plan header + its calendar (for the
 * time axis) + the schedule summary. A single read so the guest view renders in one call.
 */
export class GuestPlanViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Plan name.' })
  name!: string;

  @ApiProperty({ enum: PlanStatus })
  status!: PlanStatus;

  @ApiProperty({ nullable: true, type: String, description: 'Plan description.' })
  description!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: "The data date (the plan's start), as YYYY-MM-DD; null if unset.",
  })
  dataDate!: string | null;

  @ApiProperty({
    type: GuestCalendarDto,
    nullable: true,
    description: 'The plan calendar for the time axis; null if the plan has no calendar set.',
  })
  calendar!: GuestCalendarDto | null;

  @ApiProperty({ type: GuestScheduleSummaryDto })
  summary!: GuestScheduleSummaryDto;

  static from(source: GuestPlanViewSource): GuestPlanViewDto {
    const dataDate = source.plan.plannedStart ? formatCalendarDate(source.plan.plannedStart) : null;
    return {
      id: source.plan.id,
      name: source.plan.name,
      status: source.plan.status,
      description: source.plan.description,
      dataDate,
      calendar: source.calendar ? GuestCalendarDto.from(source.calendar) : null,
      summary: GuestScheduleSummaryDto.from(source.aggregate, dataDate),
    };
  }
}
