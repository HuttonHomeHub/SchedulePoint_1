import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CalendarScope } from '@prisma/client';
import { CALENDAR_SCOPES, MAX_WORKING_WEEKDAYS_MASK, MIN_WORKING_WEEKDAYS_MASK } from '@repo/types';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';

import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';

import { IsCalendarScopePaired } from './calendar-scope-validators';
import { AreWindowsOrdered, CalendarShiftDto } from './calendar-shift.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for updating a calendar. `version` is required for optimistic
 * locking (echo the value from the last read). Name, working pattern and
 * description are each optional; send only what changes. Description may be set
 * to an empty string to clear it. `scope`/`projectId` are the promote (→ ORG) and
 * narrow (→ PROJECT) path (ADR-0053 §2) — both need `calendar:manage_org`, and
 * narrowing is refused (409) while anything outside the target project still uses
 * the calendar.
 */
export class UpdateCalendarDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    minimum: MIN_WORKING_WEEKDAYS_MASK,
    maximum: MAX_WORKING_WEEKDAYS_MASK,
    description: '7-bit working-weekday mask (1–127); see WorkingWeekdays in @repo/types.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WORKING_WEEKDAYS_MASK)
  @Max(MAX_WORKING_WEEKDAYS_MASK)
  @IsMutuallyExclusiveWith('shifts')
  workingWeekdays?: number;

  @ApiPropertyOptional({
    type: [CalendarShiftDto],
    description:
      'Replace the weekly pattern with explicit intraday shift windows (ADR-0036). Replaces the ' +
      'week as a SET, exactly as `workingWeekdays` does. Mutually exclusive with it.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarShiftDto)
  @AreWindowsOrdered()
  @IsMutuallyExclusiveWith('workingWeekdays')
  shifts?: CalendarShiftDto[];

  @ApiPropertyOptional({
    minimum: 0.25,
    maximum: 24,
    default: 24,
    description:
      'The calendar’s STANDARD WORKING DAY in hours (Primavera P6’s `day_hr_cnt`; ADR-0068). ' +
      'This is the day↔minute factor for every day-denominated field measured on this calendar: ' +
      'a `durationDays` of 1 is `hoursPerDay × 60` working minutes, not always 1440. May be ' +
      'fractional (7.5). Omitted ⇒ derived from the weekly pattern being written — the modal ' +
      'daily working hours among the days that work, or 24 for a calendar with no base week. It ' +
      'is derived ONCE, here, and stored: a standing derivation would make this factor a ' +
      'function of the shift rows, so shortening one Friday would silently reinterpret the ' +
      'stored duration of every activity on this calendar.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(24)
  hoursPerDay?: number;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    enum: CALENDAR_SCOPES,
    description:
      'Move the calendar between tiers (ADR-0053). ORG promotes it into the shared library ' +
      '(and clears `projectId`); PROJECT narrows it to `projectId`. Requires ' +
      '`calendar:manage_org`. Omitted ⇒ the tier is unchanged.',
  })
  @IsOptional()
  @IsIn(CALENDAR_SCOPES)
  @IsCalendarScopePaired()
  scope?: CalendarScope;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The owning project when narrowing (or re-homing) to PROJECT scope. Required with ' +
      '`scope: PROJECT`, forbidden with `scope: ORG`; sent alone it re-homes a project ' +
      'calendar to another project in the same organisation.',
  })
  @IsOptional()
  @IsUUID()
  @IsCalendarScopePaired()
  projectId?: string;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
