import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** One activity's new WBS parent, with the version it was read at (optimistic locking). */
export class ActivityParentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'The WBS_SUMMARY to file this activity under, or null to move it to the top level. ' +
      'Must be an active summary in the same plan, and may not sit inside this activity’s own subtree.',
  })
  @IsOptional()
  @IsUUID()
  parentId!: string | null;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/**
 * Request body for the batch WBS membership write: file one or more of a plan's activities under
 * (or out of) a summary in a single all-or-nothing transaction. Every id must belong to the plan
 * and match its `version`, or the whole batch is rejected and nothing changes — so managing a
 * summary's membership in one panel either lands wholesale or not at all.
 *
 * Structural, unlike the sibling lane-position write: `parentId` feeds the engine's WBS rollup, so
 * a committed batch leaves the plan's computed dates stale until the next recalculation.
 */
export class UpdateParentsDto {
  @ApiProperty({ type: ActivityParentDto, isArray: true, minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ActivityParentDto)
  parents!: ActivityParentDto[];
}
