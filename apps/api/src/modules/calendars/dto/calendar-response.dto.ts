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

import { CalendarExceptionWindowDto, CalendarShiftDto } from './calendar-shift.dto';

/** Hours↔minutes for the public `hoursPerDay` pair (ADR-0068). */
const MINUTES_PER_HOUR = 60;

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

  @ApiProperty({
    description:
      'The calendar’s standard working day in hours (P6 `day_hr_cnt`; ADR-0068) — the day↔minute ' +
      'factor for every day-denominated field measured on this calendar. May be fractional; read ' +
      '`hoursPerDayMinutes` for the exact stored value.',
  })
  hoursPerDay!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 1440,
    description: 'The stored truth behind `hoursPerDay`. `1440` is a 24-hour day.',
  })
  hoursPerDayMinutes!: number;

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
      // a weekday is "working" if it carries any shift. It is a LOSSY summary and has been since
      // `shifts` became authorable (create/update both accept them): a split shift or a half-day
      // Friday is visible only in `shifts` below. Read that field, not this one, to know the hours.
      workingWeekdays: WorkingWeekdays.fromIndices(entity.shifts.map((shift) => shift.weekday)),
      shifts: entity.shifts.map((shift) => ({
        weekday: shift.weekday,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
      })),
      // Both spellings, like `durationDays` beside `durationMinutes` and for the same reason:
      // minutes are the stored truth, and hours is the number a P6 planner types (ADR-0068).
      hoursPerDay: entity.hoursPerDayMinutes / MINUTES_PER_HOUR,
      hoursPerDayMinutes: entity.hoursPerDayMinutes,
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

  @ApiProperty({
    format: 'date',
    description: 'First calendar day of the exception (YYYY-MM-DD).',
  })
  date!: string;

  @ApiProperty({
    format: 'date',
    description:
      'Last calendar day of the exception, inclusive (YYYY-MM-DD). Storage holds a range ' +
      '(ADR-0036 §2) but only a single day is authorable today, so this equals `date` for ' +
      'every exception this API creates. Exposed because a field the client cannot see is a ' +
      'field the client cannot be told changed.',
  })
  endDate!: string;

  @ApiProperty({
    description:
      'false = holiday; true = worked exception. DERIVED from `windows` (worked ⇔ the day has ' +
      'any window), so it can only say whether the day works at all — a half-day is visible ' +
      'only in `windows`.',
  })
  isWorking!: boolean;

  @ApiProperty({
    type: [CalendarExceptionWindowDto],
    description:
      'The hours this day actually works, as stored (ADR-0036 §2). Empty for a holiday. Without ' +
      'this an authored half-day would be invisible the moment it was saved — the same defect ' +
      '`shifts` fixes for the weekly pattern (TECH_DEBT #80).',
  })
  windows!: CalendarExceptionWindowDto[];

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
      date: formatCalendarDate(entity.startDate),
      endDate: formatCalendarDate(entity.endDate),
      // `isWorking` is a lossy read of the same data `windows` carries in full: a day works if it
      // has any window at all. Kept beside `windows` rather than replaced by it — every existing
      // client reads it, and for the whole-day case it is still the honest answer.
      isWorking: entity.windows.length > 0,
      windows: entity.windows.map((w) => ({
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
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
