import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, Matches, Min } from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * The triad fields a driving-assignment write may name as the edited one (M7 rung 4, ADR-0040).
 * `DURATION` is deliberately excluded — a duration edit is an activity write, never an assignment
 * one — so it is rejected at the DTO (a clean 422) rather than the service.
 */
const ASSIGNMENT_EDITED_FIELDS = ['UNITS', 'UNITS_PER_HOUR'] as const;
type AssignmentEditedField = (typeof ASSIGNMENT_EDITED_FIELDS)[number];

/**
 * Request body for assigning a resource to an activity (ADR-0039). The activity and the
 * organisation are taken from the route/scope, never from the body (anti-IDOR); only the
 * resource, its budgeted quantity and the driving flag are set here. `budgetedUnits`
 * carries the DB `@Min(0)` boundary (N14, ADR-0035 §25) as a clean 422 (the global ValidationPipe status); the DB CHECK
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
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 422)
  // rather than let Postgres round or throw a 22003 later.
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  budgetedUnits?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Planned rate (units/time) — the Units/Time term of the triad Units = Duration × Units/Time ' +
      '(M7 rung 4, ADR-0040). Exact numeric (>= 0, N19); omit for no rate (the triad is inert — parity). ' +
      'Only the driving assignment participates in the recompute.',
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
      'assignment write (a duration edit is an activity write). Omit — or send it on a non-driving assignment or one with no rate — for no recompute (a plain store).',
  })
  @IsOptional()
  @IsIn(ASSIGNMENT_EDITED_FIELDS)
  editedField?: AssignmentEditedField;

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
