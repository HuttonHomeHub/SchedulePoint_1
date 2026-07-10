import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for adding a dated exception to a calendar. `isWorking` defaults
 * to `false` (a holiday); pass `true` for a worked exception (e.g. a worked
 * Saturday). `date` is a strict `YYYY-MM-DD` calendar day; it is unique per
 * calendar among active rows (a duplicate is a 409 `DUPLICATE_EXCEPTION`).
 */
export class CreateCalendarExceptionDto {
  @ApiProperty({ format: 'date', description: 'Calendar day (YYYY-MM-DD).' })
  @IsCalendarDate()
  date!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'false = holiday (non-working); true = worked exception. Defaults to false.',
  })
  @IsOptional()
  @IsBoolean()
  isWorking?: boolean;

  // `@IsNotEmpty` under `@IsOptional` rejects an explicit `label: ""` — deliberate:
  // an exception is created, not edited, so there is no "clear the label" case (unlike
  // Calendar.description, which omits @IsNotEmpty to allow clearing with "").
  @ApiPropertyOptional({ maxLength: 120, description: 'Optional label, e.g. "Christmas Day".' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(120)
  label?: string;
}
