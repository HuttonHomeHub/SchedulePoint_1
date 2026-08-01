import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';
import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';

import { AreWindowsOrdered, CalendarExceptionWindowDto } from './calendar-shift.dto';

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
    description:
      'false = holiday (non-working); true = a worked exception for the WHOLE day. Defaults ' +
      'to false. This is shorthand for `windows`: true means one full-day `[0, 1440)` window, ' +
      'false means none. Use `windows` instead when the worked day has specific hours.',
  })
  @IsOptional()
  @IsBoolean()
  @IsMutuallyExclusiveWith('windows')
  isWorking?: boolean;

  @ApiPropertyOptional({
    type: [CalendarExceptionWindowDto],
    description:
      'The hours this day actually works, as explicit intraday windows (ADR-0036 §2) — the form ' +
      'storage and the engine use. This is how a half-day before a holiday, a shutdown day with ' +
      'a short crew, or a turnaround calendar’s working time is authored; `isWorking` can only ' +
      'say whether the whole day works. Windows REPLACE the day as a set. Mutually exclusive ' +
      'with `isWorking`, which is shorthand for the whole-day case — sending both would be two ' +
      'answers to one question, and `isWorking: false` with windows is a contradiction.',
  })
  @IsOptional()
  @IsArray()
  // An empty array is a second spelling of "holiday", and two spellings of one state is how the
  // two halves of a read (`isWorking` derived from `windows.length`) start disagreeing with what
  // the author thought they sent. Omit `windows` (or send `isWorking: false`) for a non-working day.
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CalendarExceptionWindowDto)
  @AreWindowsOrdered()
  @IsMutuallyExclusiveWith('isWorking')
  windows?: CalendarExceptionWindowDto[];

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
