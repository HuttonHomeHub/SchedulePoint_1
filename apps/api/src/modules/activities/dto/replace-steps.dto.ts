import { ApiProperty } from '@nestjs/swagger';
import type { ActivityStepInput, ReplaceActivityStepsRequest } from '@repo/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One step in a bulk-replace body (M7 rung 5, ADR-0044 §2, Q3). The client sends the desired ordered
 * list; the server assigns `seq` contiguously, so only the mutable fields appear here. `weight` carries
 * the DB `@Min(0)` boundary as a clean 422 (the DB CHECK `ck_activity_steps_weight_nonneg` backstops
 * it); `percentComplete` carries the **N28** 0–100 boundary reject (`STEP_PERCENT_OUT_OF_RANGE`, 422 —
 * the global ValidationPipe status), mirroring the ADR-0042 physical-% N23 reject, with the DB CHECK
 * `ck_activity_steps_percent_complete_range` the backstop.
 */
export class ActivityStepInputDto implements ActivityStepInput {
  @ApiProperty({ minLength: 1, maxLength: 200, description: 'The step label.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    minimum: 0,
    description:
      'The step’s relative weight in the weighted-mean physical % (exact numeric, >= 0). All-zero ' +
      'weights fall back to the manual physical % (N27).',
  })
  @Type(() => Number)
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 422).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  weight!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description:
      'The step’s own completion (integer 0–100). Out-of-range is the N28 boundary reject ' +
      '(STEP_PERCENT_OUT_OF_RANGE, 422).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  percentComplete!: number;
}

/**
 * Request body for the bulk-replace of an activity's steps (M7 rung 5, ADR-0044 §2, Q3) —
 * `PUT …/activities/:activityId/steps`. `version` is the parent ACTIVITY's optimistic-lock version
 * (the whole replace bumps it, so a stale version 409s and nothing changes); `steps` is the full
 * desired ordered list — an empty array clears them.
 */
export class ReplaceStepsDto implements ReplaceActivityStepsRequest {
  @ApiProperty({ minimum: 1, description: 'The parent activity’s optimistic-locking version.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: ActivityStepInputDto, isArray: true, minItems: 0, maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ActivityStepInputDto)
  steps!: ActivityStepInputDto[];
}
