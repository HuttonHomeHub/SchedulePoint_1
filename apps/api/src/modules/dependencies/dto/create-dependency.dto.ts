import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';
import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Request body for creating a dependency (a logic tie) under a plan. The plan and
 * organisation come from the route/scope; the two endpoints are given by id and
 * must both be active activities **in that plan** (checked server-side, never
 * trusted). `type` defaults to FS (finish-to-start), `lagDays` to 0.
 */
export class CreateDependencyDto {
  @ApiProperty({ format: 'uuid', description: 'The predecessor activity (the "from" end).' })
  @Matches(UUID_REGEX, { message: 'predecessorId must be a valid UUID.' })
  predecessorId!: string;

  @ApiProperty({ format: 'uuid', description: 'The successor activity (the "to" end).' })
  @Matches(UUID_REGEX, { message: 'successorId must be a valid UUID.' })
  successorId!: string;

  @ApiPropertyOptional({ enum: DependencyType, default: DependencyType.FS })
  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType;

  @ApiPropertyOptional({
    minimum: -3650,
    maximum: 3650,
    default: 0,
    description:
      'Signed lag in working days (a lead is negative). A day is the standard working day of ' +
      'this relationship’s lag calendar (ADR-0068); `TWENTY_FOUR_HOUR` is pinned at 1440. ' +
      'Mutually exclusive with `lagMinutes`, which is exact.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-3650)
  @Max(3650)
  @IsMutuallyExclusiveWith('lagMinutes')
  lagDays?: number;

  @ApiPropertyOptional({
    minimum: -5256000,
    maximum: 5256000,
    description:
      'Signed lag in working MINUTES — the unit storage and the engine use (ADR-0036). A ' +
      'two-hour cure time before a follow-on trade is `lagMinutes: 120`, which `lagDays` ' +
      'cannot express. Mutually exclusive with `lagDays`; sending both is a 422.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-5256000)
  @Max(5256000)
  @IsMutuallyExclusiveWith('lagDays')
  lagMinutes?: number;

  @ApiPropertyOptional({
    enum: LagCalendarSource,
    default: LagCalendarSource.PROJECT_DEFAULT,
    description:
      'The calendar the lag is measured on (ADR-0036 §6). Defaults to PROJECT_DEFAULT. ' +
      'TWENTY_FOUR_HOUR measures the lag as elapsed time (e.g. concrete cure); ' +
      'PREDECESSOR/SUCCESSOR coincide with the plan calendar until per-activity calendars land.',
  })
  @IsOptional()
  @IsEnum(LagCalendarSource)
  lagCalendar?: LagCalendarSource;
}
