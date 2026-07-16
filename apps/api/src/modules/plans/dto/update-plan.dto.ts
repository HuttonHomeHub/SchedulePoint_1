import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CriticalPathDefinition,
  PlanStatus,
  ProgressRecalcMode,
  SchedulingMode,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';
import { UUID_REGEX } from '../../../common/validation/uuid';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for updating a plan. `version` is required for optimistic
 * locking (echo the value from the last read). Every field is optional; send
 * only what changes. `description` may be `""` to clear it. `plannedStart` is the
 * mandatory CPM data date (ADR-0033 M1): it may be **changed** but never cleared —
 * an explicit `null` is rejected (422).
 */
export class UpdatePlanDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional({
    enum: SchedulingMode,
    description: 'Switch scheduling mode (ADR-0033): EARLY or VISUAL.',
  })
  @IsOptional()
  @IsEnum(SchedulingMode)
  schedulingMode?: SchedulingMode;

  @ApiPropertyOptional({
    enum: ProgressRecalcMode,
    description:
      'Out-of-sequence recalc mode (M2, ADR-0035): RETAINED_LOGIC, PROGRESS_OVERRIDE, or ACTUAL_DATES.',
  })
  @IsOptional()
  @IsEnum(ProgressRecalcMode)
  progressRecalcMode?: ProgressRecalcMode;

  @ApiPropertyOptional({
    description:
      'Expected-finish scheduling option (M4, ADR-0035 §9): when on, an in-progress activity’s remaining work is resized so its early finish lands on its expectedFinish.',
  })
  @IsOptional()
  @IsBoolean()
  useExpectedFinishDates?: boolean;

  @ApiPropertyOptional({
    enum: CriticalPathDefinition,
    description:
      'Critical-path definition (M6, ADR-0035 §17): TOTAL_FLOAT (float ≤ threshold) or LONGEST_PATH (driving chain).',
  })
  @IsOptional()
  @IsEnum(CriticalPathDefinition)
  criticalPathDefinition?: CriticalPathDefinition;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Total-float threshold in whole working days (M6, ADR-0035 §17): at/below this an activity is critical under TOTAL_FLOAT.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  criticalFloatThreshold?: number;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-05-01',
    description: 'Calendar day (YYYY-MM-DD). May be changed but not cleared (ADR-0033 M1).',
  })
  // NOT `@IsOptional()`: that decorator skips validation for `null` *and* `undefined`, which would
  // let an explicit `null` slip past to the service and crash `parseCalendarDate` (500). Instead gate
  // on `!== undefined` so an omitted field is skipped (optional) but an explicit `null` still runs
  // `@IsCalendarDate` — which rejects it (422). Optional to send, but non-nullable: the mandatory data
  // date can be moved, never cleared (ADR-0033 M1).
  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  plannedStart?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      "The plan's default working-day calendar (must be an active calendar in the same " +
      'organisation), or null to clear it (all-days-work). Validated service-side.',
  })
  @IsOptional()
  // Allow an explicit null (clear the calendar); validate the shape only for a value.
  // @Matches(UUID_REGEX) — not @IsUUID — because our ids are UUID v7 and some
  // class-validator versions reject v7 (see common/validation/uuid.ts).
  @ValidateIf((_, value) => value !== null)
  @Matches(UUID_REGEX, { message: 'calendarId must be a valid UUID.' })
  calendarId?: string | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
