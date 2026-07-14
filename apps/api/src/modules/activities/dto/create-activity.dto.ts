import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityType, ConstraintType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

import { IsConstraintPaired, IsZeroWhenMilestone } from './activity-validators';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for creating an activity. The parent plan and organisation are
 * taken from the route/scope, never from the body (anti-IDOR). Only the
 * definition is set here — progress (status / % / actuals) starts at its
 * defaults and is changed through the progress endpoint; the CPM output columns
 * are engine-owned and never accepted from input.
 */
export class CreateActivityDto {
  @ApiProperty({ minLength: 1, maxLength: 200, description: 'Display name of the activity.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    maxLength: 32,
    description: 'Optional human-facing code (unique per plan).',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional free-text description.' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ActivityType, default: ActivityType.TASK })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ApiPropertyOptional({
    minimum: 0,
    default: 1,
    description: 'Duration in working days (0 for milestones).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsZeroWhenMilestone()
  durationDays?: number;

  @ApiPropertyOptional({ enum: ConstraintType, description: 'Schedule constraint (with a date).' })
  @IsOptional()
  @IsEnum(ConstraintType)
  @IsConstraintPaired()
  constraintType?: ConstraintType;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-05-01',
    description: 'Constraint date as a calendar day (YYYY-MM-DD); required with a constraintType.',
  })
  @IsOptional()
  @IsCalendarDate()
  @IsConstraintPaired()
  constraintDate?: string;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Graphical y-lane for the TSLD.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex?: number;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-05-01',
    description:
      'Visual-Planning placement (ADR-0033): the calendar day (YYYY-MM-DD) to hand-place this ' +
      "activity's start at. Feeds only the effective-Visual pass; ignored in EARLY mode.",
  })
  @IsOptional()
  @IsCalendarDate()
  visualStart?: string;
}
