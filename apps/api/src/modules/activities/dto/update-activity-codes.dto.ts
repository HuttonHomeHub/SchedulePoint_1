import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { CODE_TYPE_LIMIT } from '../../codes/codes.constants';

/** One code value to set on an activity, or `null` to clear that type. */
export class ActivityCodeValueDto {
  @ApiProperty({ format: 'uuid', description: 'A live code type of this plan.' })
  @IsUUID()
  codeTypeId!: string;

  /**
   * Required, but **nullable** — deliberately not `@IsOptional()`. This is a complete statement of
   * what the activity carries for the type, so omitting it is a validation error and never a silent
   * clear (the `parentId` rule of the batch re-parent).
   */
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'The value to set, or null to clear the type. Must be a live value of `codeTypeId` in this ' +
      'plan; the row is refused otherwise.',
  })
  @ValidateIf((row: ActivityCodeValueDto) => row.codeValueId !== null)
  @IsUUID()
  codeValueId!: string | null;
}

/** One activity's code values, with the version it was read at (optimistic locking). */
export class ActivityCodesRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // The INT column's ceiling: a larger value would overflow the comparison and answer 500.
  @Max(2147483647)
  version!: number;

  @ApiProperty({
    type: ActivityCodeValueDto,
    isArray: true,
    minItems: 1,
    maxItems: CODE_TYPE_LIMIT,
    description: 'The types to set or clear on this activity; a type may appear once.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CODE_TYPE_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => ActivityCodeValueDto)
  codes!: ActivityCodeValueDto[];
}

/**
 * Request body for the batch code write: set or clear code values on one or more of a plan's
 * activities in a single all-or-nothing transaction. Every activity must belong to the plan and match
 * its `version`, or the whole batch is rejected and nothing changes. A row states only the types it
 * means to touch; any other type the activity carries is left alone.
 */
export class UpdateActivityCodesDto {
  @ApiProperty({ type: ActivityCodesRowDto, isArray: true, minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ActivityCodesRowDto)
  activities!: ActivityCodesRowDto[];
}
