import { ApiProperty } from '@nestjs/swagger';
import type { Calendar, CalendarException } from '@prisma/client';
import type { CalendarDetail, CalendarExceptionSummary, CalendarSummary } from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';

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

  static from(entity: Calendar): CalendarResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      workingWeekdays: entity.workingWeekdays,
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

  static from(entity: CalendarException): CalendarExceptionResponseDto {
    return {
      id: entity.id,
      date: formatCalendarDate(entity.date),
      isWorking: entity.isWorking,
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

  static fromDetail(
    entity: Calendar & { exceptions: CalendarException[] },
  ): CalendarDetailResponseDto {
    return {
      ...CalendarResponseDto.from(entity),
      exceptions: entity.exceptions.map((e) => CalendarExceptionResponseDto.from(e)),
    };
  }
}
