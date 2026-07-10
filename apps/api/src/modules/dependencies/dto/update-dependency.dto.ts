import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DependencyType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Request body for updating a dependency. Only the **type** and **lag** are
 * mutable — the endpoints (predecessor/successor) are immutable, so re-pointing a
 * link means deleting it and creating another (which re-runs the cycle check).
 * `version` is required for optimistic locking.
 */
export class UpdateDependencyDto {
  @ApiPropertyOptional({ enum: DependencyType })
  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType;

  @ApiPropertyOptional({ minimum: -3650, maximum: 3650 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-3650)
  @Max(3650)
  lagDays?: number;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
