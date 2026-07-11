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
  ValidateNested,
} from 'class-validator';

/** One activity's new lane, with the version it was read at (optimistic locking). */
export class ActivityPositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 0, maximum: 10000, description: 'The 0-based lane (y) to move to.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex!: number;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/**
 * Request body for the batch lane-position write (TSLD M4): move one or more of a plan's
 * activities to new lanes in a single all-or-nothing transaction. Every id must belong to the
 * plan and match its `version`, or the whole batch is rejected (409) and nothing changes — so a
 * lane drag (or auto-pack) either lands wholesale or not at all. Layout only: this changes no
 * dates and triggers no CPM recalculation (y = stored lane; x = time is engine-owned).
 */
export class UpdatePositionsDto {
  @ApiProperty({ type: ActivityPositionDto, isArray: true, minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ActivityPositionDto)
  positions!: ActivityPositionDto[];
}
