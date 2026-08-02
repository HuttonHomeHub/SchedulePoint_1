import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';
import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';

/**
 * The minutes ceiling for a remaining duration: the day field's 10,000-day bound at 24 h.
 *
 * Stated as the day bound × 1440 rather than as its own number, so the two cannot drift into
 * disagreeing about what "too long" means — the whole point of the pair is that they are two
 * spellings of one quantity.
 */
const MAX_REMAINING_MINUTES = 10_000 * 24 * 60;

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
    maximum: 10000,
    nullable: true,
    example: 3,
    description:
      'Remaining work in whole days for an in-progress activity (M2, ADR-0035). Null derives it ' +
      'from percent complete. Mutually exclusive with `remainingDurationMinutes`.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsMutuallyExclusiveWith('remainingDurationMinutes')
  remainingDurationDays?: number | null;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_REMAINING_MINUTES,
    nullable: true,
    example: 240,
    description:
      'Remaining work in working MINUTES — the unit storage and the engine use (ADR-0036). The ' +
      'day-denominated sibling above cannot state a four-hour remainder: it rounds to 0, which on ' +
      'an incomplete activity is also the value meaning "no work left" (surface audit F3). Null ' +
      'derives the remainder from percent complete. Mutually exclusive with `remainingDurationDays`.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_REMAINING_MINUTES)
  @IsMutuallyExclusiveWith('remainingDurationDays')
  remainingDurationMinutes?: number | null;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-05-10',
    description:
      'Suspend date (YYYY-MM-DD) for a paused in-progress activity (M2), or null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  suspendDate?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-05-20',
    description:
      'Resume date (YYYY-MM-DD); the remaining work is floored at max(data date, resume) (M2, ADR-0035 §4).',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  resumeDate?: string | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
