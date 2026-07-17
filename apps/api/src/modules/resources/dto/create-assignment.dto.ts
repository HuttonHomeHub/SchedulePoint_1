import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Matches, Min } from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Request body for assigning a resource to an activity (ADR-0039). The activity and the
 * organisation are taken from the route/scope, never from the body (anti-IDOR); only the
 * resource, its budgeted quantity and the driving flag are set here. `budgetedUnits`
 * carries the DB `@Min(0)` boundary (N14, ADR-0035 §25) as a clean 400/422; the DB CHECK
 * backstops it.
 */
export class CreateAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'The resource to assign (active, same org).' })
  // @Matches(UUID_REGEX), not @IsUUID — our ids are UUID v7 which some class-validator versions reject.
  @Matches(UUID_REGEX, { message: 'resourceId must be a valid UUID.' })
  resourceId!: string;

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description: 'Budgeted quantity of work (>= 0). Exact numeric; defaults to 0.',
  })
  @IsOptional()
  @Type(() => Number)
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 400)
  // rather than let Postgres round or throw a 22003 later.
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  budgetedUnits?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Designate this as THE driving resource of a RESOURCE_DEPENDENT activity (ADR-0035 §23). At ' +
      'most one driver per activity — setting it moves the flag off any other assignment. A MATERIAL ' +
      'resource may never drive.',
  })
  @IsOptional()
  @IsBoolean()
  isDriving?: boolean;
}
