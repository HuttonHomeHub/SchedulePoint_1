import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';

import {
  AreWindowsOrdered,
  CalendarExceptionWindowDto,
  MAX_EXCEPTION_WINDOWS,
} from './calendar-shift.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for editing a dated exception.
 *
 * The date is deliberately **not** editable: an exception is identified by the day it applies to,
 * and moving one is indistinguishable from deleting it and adding another — which is what the two
 * existing endpoints already do, visibly. What this changes is the day's hours and its label.
 *
 * Before this endpoint the only way to correct an exception's hours was delete-then-recreate: two
 * writes, a new id, and a window in which a holiday had become an ordinary working day. A
 * recalculation landing in that window would have scheduled work on it.
 */
export class UpdateCalendarExceptionDto {
  @ApiPropertyOptional({
    description:
      'false = holiday (non-working); true = a worked exception for the WHOLE day. Shorthand for ' +
      '`windows`, and mutually exclusive with it. Omit both to leave the day’s hours untouched ' +
      'and edit only the label.',
  })
  @IsOptional()
  @IsBoolean()
  @IsMutuallyExclusiveWith('windows')
  isWorking?: boolean;

  @ApiPropertyOptional({
    type: [CalendarExceptionWindowDto],
    description:
      'The hours this day works, as explicit intraday windows (ADR-0036 §2). Windows REPLACE the ' +
      'day as a set — the same rule the weekly pattern follows, so an edit can never leave behind ' +
      'a window the new set does not name. Mutually exclusive with `isWorking`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EXCEPTION_WINDOWS)
  // As on create: an empty array is a second spelling of "holiday", and one state with two
  // spellings is how a read (`isWorking` derived from `windows.length`) starts disagreeing with
  // what the author believed they sent. Send `isWorking: false` for a non-working day.
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CalendarExceptionWindowDto)
  @AreWindowsOrdered()
  @IsMutuallyExclusiveWith('isWorking')
  windows?: CalendarExceptionWindowDto[];

  @ApiPropertyOptional({
    maxLength: 120,
    nullable: true,
    description: 'New label, or null to clear it. Omitted leaves the existing label alone.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(120)
  label?: string | null;

  @ApiProperty({
    minimum: 1,
    description:
      'The exception’s current `version` (optimistic locking). A stale value is a 409 — the row ' +
      'has moved since it was read.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
