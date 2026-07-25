import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CalendarScope } from '@prisma/client';
import { CALENDAR_SCOPES, MAX_WORKING_WEEKDAYS_MASK, MIN_WORKING_WEEKDAYS_MASK } from '@repo/types';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsCalendarScopePaired } from './calendar-scope-validators';

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
  workingWeekdays?: number;

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
