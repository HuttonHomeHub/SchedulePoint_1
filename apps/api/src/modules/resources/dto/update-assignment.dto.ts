import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Request body for updating a resource assignment (ADR-0039). `version` is required for
 * optimistic locking. Only `budgetedUnits` and `isDriving` are mutable; the endpoints
 * (activity, resource) are fixed at assign time. `budgetedUnits` carries the `@Min(0)`
 * boundary (N14) as a clean reject; the DB CHECK backstops it.
 */
export class UpdateAssignmentDto {
  @ApiPropertyOptional({ minimum: 0, description: 'Budgeted quantity of work (>= 0).' })
  @IsOptional()
  @Type(() => Number)
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 400).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  budgetedUnits?: number;

  @ApiPropertyOptional({
    description:
      'Set this as THE driving resource of the activity; setting it moves the flag off any other ' +
      'assignment (a MATERIAL resource may never drive).',
  })
  @IsOptional()
  @IsBoolean()
  isDriving?: boolean;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
