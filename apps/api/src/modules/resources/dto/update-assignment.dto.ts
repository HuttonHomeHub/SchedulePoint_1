import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * The triad fields a driving-assignment write may name as the edited one (M7 rung 4, ADR-0040).
 * `DURATION` is deliberately excluded — a duration edit is an activity write — so it is rejected at
 * the DTO (a clean 422) rather than the service.
 */
const ASSIGNMENT_EDITED_FIELDS = ['UNITS', 'UNITS_PER_HOUR'] as const;
type AssignmentEditedField = (typeof ASSIGNMENT_EDITED_FIELDS)[number];

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
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 422).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  budgetedUnits?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Planned rate (units/time) — the Units/Time term of the triad Units = Duration × Units/Time ' +
      '(M7 rung 4, ADR-0040). Exact numeric (>= 0, N19). Only the driving assignment participates in ' +
      'the recompute; the DB CHECK backstops the boundary.',
  })
  @IsOptional()
  @Type(() => Number)
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 422).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitsPerHour?: number;

  @ApiPropertyOptional({
    enum: ASSIGNMENT_EDITED_FIELDS,
    description:
      'Which quantity the planner edited (M7 rung 4, ADR-0040) — the service holds it and recomputes ' +
      'the dependent per the activity’s durationType. Only UNITS / UNITS_PER_HOUR are valid on an ' +
      'assignment write. Omit — or send it on a non-driving assignment or one with no rate — for no recompute (a plain store).',
  })
  @IsOptional()
  @IsIn(ASSIGNMENT_EDITED_FIELDS)
  editedField?: AssignmentEditedField;

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
