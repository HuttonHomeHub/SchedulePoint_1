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

/** Request body for creating a working-day calendar within an organisation. */
export class CreateCalendarDto {
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'Display name of the calendar.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    minimum: MIN_WORKING_WEEKDAYS_MASK,
    maximum: MAX_WORKING_WEEKDAYS_MASK,
    description:
      'Weekly working pattern as a 7-bit mask (bit 0 = Monday … bit 6 = Sunday). ' +
      'Must be 1–127 — at least one working weekday, no bits beyond the week. ' +
      'This is the WorkingWeekdays bitmask contract in @repo/types.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WORKING_WEEKDAYS_MASK)
  @Max(MAX_WORKING_WEEKDAYS_MASK)
  workingWeekdays!: number;

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
