import { ApiProperty } from '@nestjs/swagger';
import { WorkingWeekdays } from '@repo/types';
import type { CalendarDetail, CalendarExceptionSummary, CalendarSummary } from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';
import type {
  CalendarExceptionWithWindows,
  CalendarWithExceptions,
  CalendarWithShifts,
} from '../calendar.repository';

/** Public representation of a calendar (list shape — no exceptions embedded). */
export class CalendarResponseDto implements CalendarSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({
    minimum: 1,
    maximum: 127,
    description: '7-bit working-weekday mask (bit 0 = Monday … bit 6 = Sunday).',
  })
  workingWeekdays!: number;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: CalendarWithShifts): CalendarResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      // Storage is intraday shift rows (ADR-0036); the public field stays a weekday mask —
      // a weekday is "working" if it carries any shift. Every API-created calendar is
      // full-day-per-weekday, so this round-trips exactly (richer shift calendars aren't
      // API-authorable yet — M1 follow-on).
      workingWeekdays: WorkingWeekdays.fromIndices(entity.shifts.map((shift) => shift.weekday)),
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/** Public representation of a single dated calendar exception. */
export class CalendarExceptionResponseDto implements CalendarExceptionSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date', description: 'Calendar day (YYYY-MM-DD).' })
  date!: string;

  @ApiProperty({ description: 'false = holiday; true = worked exception.' })
  isWorking!: boolean;

  @ApiProperty({ nullable: true, type: String })
  label!: string | null;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: CalendarExceptionWithWindows): CalendarExceptionResponseDto {
    return {
      id: entity.id,
      // A whole-day exception is a single-day range with (worked) or without (holiday)
      // a full-day window (ADR-0036 §2); the public shape stays `{ date, isWorking }`.
      date: formatCalendarDate(entity.startDate),
      isWorking: entity.windows.length > 0,
      label: entity.label,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/** A calendar with its active exceptions embedded (the single-calendar read). */
export class CalendarDetailResponseDto extends CalendarResponseDto implements CalendarDetail {
  @ApiProperty({ type: CalendarExceptionResponseDto, isArray: true })
  exceptions!: CalendarExceptionResponseDto[];

  static fromDetail(entity: CalendarWithExceptions): CalendarDetailResponseDto {
    return {
      ...CalendarResponseDto.from(entity),
      exceptions: entity.exceptions.map((e) => CalendarExceptionResponseDto.from(e)),
    };
  }
}
