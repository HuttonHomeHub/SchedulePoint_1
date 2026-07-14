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
  ValidateIf,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

import { IsConstraintPaired, IsZeroWhenMilestone } from './activity-validators';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for updating an activity's DEFINITION (Planner/Org Admin). Every
 * field is optional; send only what changes. Progress fields (status / % /
 * actuals) are deliberately absent — they are changed via the progress endpoint,
 * which is what lets a Contributor report progress without touching logic.
 * `version` is required for optimistic locking. `code`/`description` may be `""`
 * to clear; `constraintType`/`constraintDate` may be `null` to clear (together).
 */
export class UpdateActivityDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsZeroWhenMilestone()
  durationDays?: number;

  @ApiPropertyOptional({ enum: ConstraintType, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(ConstraintType)
  @IsConstraintPaired()
  constraintType?: ConstraintType | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, example: '2026-05-01' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  @IsConstraintPaired()
  constraintDate?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex?: number;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-05-01',
    description:
      'Visual-Planning placement (ADR-0033): the calendar day (YYYY-MM-DD) to hand-place the ' +
      "activity's start at, or null to clear the placement (revert to computed). Feeds only the " +
      'effective-Visual pass; never the pure-network pass, and not on the progress path.',
  })
  @IsOptional()
  // Allow an explicit null (clear the placement); validate the format only for a value.
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  visualStart?: string | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
