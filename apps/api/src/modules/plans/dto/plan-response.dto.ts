import { ApiProperty } from '@nestjs/swagger';
import {
  CriticalPathDefinition,
  PlanStatus,
  ProgressRecalcMode,
  SchedulingMode,
  TotalFloatMode,
  type Plan,
} from '@prisma/client';
import type { PlanSummary } from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';

/** Public representation of a plan (scoped to a project). */
export class PlanResponseDto implements PlanSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The parent project.' })
  projectId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: PlanStatus })
  status!: PlanStatus;

  @ApiProperty({
    enum: SchedulingMode,
    description: 'Scheduling mode (ADR-0033): EARLY (computed-earliest) or VISUAL (hand-placed).',
  })
  schedulingMode!: SchedulingMode;

  @ApiProperty({
    enum: ProgressRecalcMode,
    description:
      'Out-of-sequence recalc mode (M2, ADR-0035): RETAINED_LOGIC, PROGRESS_OVERRIDE, or ACTUAL_DATES.',
  })
  progressRecalcMode!: ProgressRecalcMode;

  @ApiProperty({
    description:
      'Expected-finish scheduling option (M4, ADR-0035 §9): when on, in-progress remaining work is resized to each activity’s expectedFinish.',
  })
  useExpectedFinishDates!: boolean;

  @ApiProperty({
    enum: CriticalPathDefinition,
    description:
      'Critical-path definition (M6, ADR-0035 §17): TOTAL_FLOAT (float ≤ threshold, default) or LONGEST_PATH (driving chain).',
  })
  criticalPathDefinition!: CriticalPathDefinition;

  @ApiProperty({
    description:
      'Total-float threshold in whole working days (M6, ADR-0035 §17): at/below this an activity is critical under TOTAL_FLOAT. Default 0.',
  })
  criticalFloatThreshold!: number;

  @ApiProperty({
    enum: TotalFloatMode,
    description: 'Total-float measure (M6, ADR-0035 §18): FINISH (default), START, or SMALLEST.',
  })
  totalFloatMode!: TotalFloatMode;

  @ApiProperty({
    description:
      'Make open-ended activities critical (M6, ADR-0035 §20): when on, activities with no predecessors/successors are flagged critical. Default false.',
  })
  makeOpenEndsCritical!: boolean;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Planned start as a calendar day (YYYY-MM-DD). The mandatory data date (ADR-0033 M1).',
  })
  plannedStart!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: "The plan's default working-day calendar, or null for all-days-work.",
  })
  calendarId!: string | null;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: Plan): PlanResponseDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      schedulingMode: entity.schedulingMode,
      progressRecalcMode: entity.progressRecalcMode,
      useExpectedFinishDates: entity.useExpectedFinishDates,
      criticalPathDefinition: entity.criticalPathDefinition,
      criticalFloatThreshold: entity.criticalFloatThreshold,
      totalFloatMode: entity.totalFloatMode,
      makeOpenEndsCritical: entity.makeOpenEndsCritical,
      plannedStart: entity.plannedStart ? formatCalendarDate(entity.plannedStart) : null,
      calendarId: entity.calendarId,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
