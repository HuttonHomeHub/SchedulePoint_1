import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityType, ConstraintType, DurationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';
import { UUID_REGEX } from '../../../common/validation/uuid';

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

  @ApiPropertyOptional({
    enum: DurationType,
    description:
      'P6 duration type (M7 rung 4, ADR-0040). Setting it alone does NOT recompute a quantity; ' +
      'when sent together with durationDays, the edit holds the (new) duration and recomputes the ' +
      'dependent per this type on the driving assignment.',
  })
  @IsOptional()
  @IsEnum(DurationType)
  durationType?: DurationType;

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

  @ApiPropertyOptional({ enum: ConstraintType, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(ConstraintType)
  @IsConstraintPaired({
    typeField: 'secondaryConstraintType',
    dateField: 'secondaryConstraintDate',
  })
  secondaryConstraintType?: ConstraintType | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, example: '2026-05-01' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  @IsConstraintPaired({
    typeField: 'secondaryConstraintType',
    dateField: 'secondaryConstraintDate',
  })
  secondaryConstraintDate?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-05-01',
    description: 'Expected-finish target (ADR-0035 §9), or null to clear it.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  expectedFinish?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      "The activity's own working-time calendar (ADR-0037, M5) — must be an active calendar in " +
      'the same organisation, or null to inherit the plan default. Validated service-side.',
  })
  @IsOptional()
  // Allow an explicit null (inherit); validate the shape only for a value (UUID v7, as the plan picker).
  @ValidateIf((_, value) => value !== null)
  @Matches(UUID_REGEX, { message: 'calendarId must be a valid UUID.' })
  calendarId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'WBS parent (ADR-0038, M5-epic): the id of a WBS_SUMMARY activity in the same plan, or null for ' +
      'top-level. Must be a summary, same-plan, and introduce no cycle — validated service-side.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(UUID_REGEX, { message: 'parentId must be a valid UUID.' })
  parentId?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex?: number;

  @ApiPropertyOptional({
    description:
      'Schedule As-Late-As-Possible (ADR-0035 §11): a display-only placement preference. Does not change early/late/float.',
  })
  @IsOptional()
  @IsBoolean()
  scheduleAsLateAsPossible?: boolean;

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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Resource-levelling tie-break (ADR-0041 §1): LOWER = HIGHER priority. Send null to clear it ' +
      '(unset — no expressed preference). Read by the levelling pass only when the plan opts in.',
  })
  @IsOptional()
  // Allow an explicit null (clear to unset); validate the shape only for a value.
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  levelingPriority?: number | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
