import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

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
    description: 'Signed lag in working days (a lead is negative).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-3650)
  @Max(3650)
  lagDays?: number;

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
