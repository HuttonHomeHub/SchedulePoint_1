import { ApiProperty } from '@nestjs/swagger';
import { PlanStatus, type Plan } from '@prisma/client';
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
    format: 'date',
    nullable: true,
    type: String,
    description: 'Planned start as a calendar day (YYYY-MM-DD), or null.',
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
      plannedStart: entity.plannedStart ? formatCalendarDate(entity.plannedStart) : null,
      calendarId: entity.calendarId,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
