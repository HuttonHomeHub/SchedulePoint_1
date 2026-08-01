import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CalendarScope } from '@prisma/client';
import { CALENDAR_SCOPES, MAX_WORKING_WEEKDAYS_MASK, MIN_WORKING_WEEKDAYS_MASK } from '@repo/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateIf,
} from 'class-validator';

import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';

import { IsCalendarScopePaired } from './calendar-scope-validators';
import { AreWindowsOrdered, CalendarShiftDto, MAX_CALENDAR_SHIFTS } from './calendar-shift.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Request body for creating a working-day calendar within an organisation. */
export class CreateCalendarDto {
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'Display name of the calendar.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    minimum: MIN_WORKING_WEEKDAYS_MASK,
    maximum: MAX_WORKING_WEEKDAYS_MASK,
    description:
      'Weekly working pattern as a 7-bit mask (bit 0 = Monday … bit 6 = Sunday), 0–127. ' +
      '**0 is valid** and means a window-only base week: no weekday works by default and all ' +
      'working time arrives from dated exception windows — the shape a plant turnaround or a ' +
      'shutdown programme needs (ADR-0036 §2). A calendar with an empty week AND no working ' +
      'exception is refused when the schedule is calculated, not here, because only the engine ' +
      'can see both halves. This is the WorkingWeekdays bitmask contract in @repo/types.',
  })
  // A create must carry a weekly pattern in ONE of the two forms. `@ValidateIf` rather than
  // `@IsOptional()` is what makes that real: `@IsOptional()` SKIPS every validator after it when
  // the value is undefined, so a cross-field "required unless the other is present" rule placed
  // here could never fire — it only runs in the case it exists to catch. This says instead "when
  // `shifts` is absent, this field is required and fully validated", and when `shifts` is present
  // the mirror `@IsMutuallyExclusiveWith` on that field still rejects sending both.
  @ValidateIf((dto: CreateCalendarDto) => dto.shifts === undefined)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WORKING_WEEKDAYS_MASK)
  @Max(MAX_WORKING_WEEKDAYS_MASK)
  @IsMutuallyExclusiveWith('shifts')
  workingWeekdays?: number;

  @ApiPropertyOptional({
    type: [CalendarShiftDto],
    description:
      'The weekly pattern as explicit intraday SHIFT WINDOWS (ADR-0036) — the form storage and ' +
      'the engine actually use. This is how a split shift, a night shift crossing midnight, or an ' +
      'asymmetric week with a half-day Friday is authored; `workingWeekdays` can only say whether ' +
      'a whole day works. Mutually exclusive with `workingWeekdays`: a mask is shorthand for ' +
      'full-day windows on the named days, so sending both would be two answers to one question. ' +
      'An omitted weekday is non-working.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CALENDAR_SHIFTS)
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

  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional free-text description.' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    enum: CALENDAR_SCOPES,
    default: 'ORG',
    description:
      'Which tier to create the calendar in (ADR-0053). ORG is the shared organisation ' +
      'library and additionally requires `calendar:manage_org`; PROJECT is local to one ' +
      'project and requires `projectId`. Omitted ⇒ ORG (today’s behaviour).',
  })
  @IsOptional()
  @IsIn(CALENDAR_SCOPES)
  @IsCalendarScopePaired()
  scope?: CalendarScope;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The owning project — required when `scope` is PROJECT, forbidden otherwise. Must be ' +
      'an active project in this organisation (404 otherwise).',
  })
  @IsOptional()
  @IsUUID()
  @IsCalendarScopePaired()
  projectId?: string;
}
