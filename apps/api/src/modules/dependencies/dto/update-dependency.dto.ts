import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { IsMutuallyExclusiveWith } from '../../../common/validation/mutually-exclusive';

/**
 * Request body for updating a dependency. Only the **type**, **lag**, and
 * **lag calendar** are mutable — the endpoints (predecessor/successor) are
 * immutable, so re-pointing a link means deleting it and creating another (which
 * re-runs the cycle check). `version` is required for optimistic locking.
 */
export class UpdateDependencyDto {
  @ApiPropertyOptional({ enum: DependencyType })
  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType;

  @ApiPropertyOptional({
    minimum: -3650,
    maximum: 3650,
    description: 'Signed lag in working days. Mutually exclusive with `lagMinutes`.',
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
      'Signed lag in working MINUTES (ADR-0036). Editing a sub-day lag through `lagDays` ' +
      'would round it away; this field is how a client corrects one. Mutually exclusive ' +
      'with `lagDays`.',
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
    description: 'The calendar the lag is measured on (ADR-0036 §6).',
  })
  @IsOptional()
  @IsEnum(LagCalendarSource)
  lagCalendar?: LagCalendarSource;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
