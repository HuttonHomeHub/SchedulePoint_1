import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Request body for creating a LIVE cross-plan dependency (an inter-project logic tie, ADR-0045).
 * The organisation comes from the route/scope; BOTH plan ids are DERIVED server-side from the two
 * endpoint activities (never trusted from input). The endpoints are given by id and must both be
 * active activities in the caller's org, in **different** plans (checked server-side). `type`
 * defaults to FS (finish-to-start), `lagDays` to 0.
 */
export class CreateCrossPlanDependencyDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The predecessor activity (the "from" end, in the upstream plan).',
  })
  @Matches(UUID_REGEX, { message: 'predecessorActivityId must be a valid UUID.' })
  predecessorActivityId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The successor activity (the "to" end, in the downstream plan).',
  })
  @Matches(UUID_REGEX, { message: 'successorActivityId must be a valid UUID.' })
  successorActivityId!: string;

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
