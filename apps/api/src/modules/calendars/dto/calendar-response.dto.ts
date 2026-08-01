import { ApiProperty } from '@nestjs/swagger';
import { CALENDAR_SCOPES, WorkingWeekdays } from '@repo/types';
import type {
  CalendarDetail,
  CalendarExceptionSummary,
  CalendarScope,
  CalendarSummary,
} from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';
import type {
  CalendarExceptionWithWindows,
  CalendarWithExceptions,
  CalendarWithShifts,
} from '../calendar.repository';

import { CalendarShiftDto } from './calendar-shift.dto';

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

  @ApiProperty({
    type: [CalendarShiftDto],
    description:
      'The weekly pattern as stored: explicit intraday windows (ADR-0036). `workingWeekdays` is ' +
      'derived from these and can only say whether a day works at all, so a split shift or a ' +
      'half-day Friday is visible ONLY here — without it an authored shift pattern would be ' +
      'invisible the moment it was saved (TECH_DEBT #80).',
  })
  shifts!: CalendarShiftDto[];

  @ApiProperty({
    enum: CALENDAR_SCOPES,
    description:
      'Which tier this calendar belongs to (ADR-0053): ORG = the shared organisation ' +
      'library; PROJECT = local to `projectId`.',
  })
  scope!: CalendarScope;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The owning project when `scope` is PROJECT; null for an ORG calendar.',
  })
  projectId!: string | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description:
      'When this calendar was archived (ADR-0053 §4); null = active. An archived calendar ' +
      'stays bound to its plans, activities and resources and still schedules identically — ' +
      'it is hidden from pickers and refused for a NEW binding (422 CALENDAR_ARCHIVED).',
  })
  archivedAt!: string | null;

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
      shifts: entity.shifts.map((shift) => ({
        weekday: shift.weekday,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
      })),
      scope: entity.scope,
      projectId: entity.projectId,
      archivedAt: entity.archivedAt === null ? null : entity.archivedAt.toISOString(),
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
