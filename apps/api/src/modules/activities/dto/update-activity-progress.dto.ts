import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

/**
 * Request body for reporting an activity's PROGRESS (Contributor upward). This is
 * the endpoint that realises the progress-vs-logic split: it can move
 * `percentComplete` and the actual start/finish dates, but touches nothing about
 * the activity's definition or logic. `status` is deliberately NOT accepted — it
 * is derived server-side from `percentComplete` and the actual dates so it can
 * never contradict them. Every field is optional (send only what changed);
 * `version` is required for optimistic locking. Actual dates may be `null` to
 * clear (e.g. to un-start an activity).
 */
export class UpdateActivityProgressDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Percent complete (0–100).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  percentComplete?: number;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-05-01',
    description: 'Actual start as a calendar day (YYYY-MM-DD), or null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  actualStart?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-06-01',
    description: 'Actual finish as a calendar day (YYYY-MM-DD), or null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  actualFinish?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    example: 3,
    description:
      'Remaining work in whole days for an in-progress activity (M2, ADR-0035). Null derives it from percent complete.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  remainingDurationDays?: number | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
