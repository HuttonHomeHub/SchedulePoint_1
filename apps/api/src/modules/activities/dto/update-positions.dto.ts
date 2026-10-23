import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * An activity's lane inside its swimlane (swimlanes spec §4.12). There is deliberately **no basis**:
 * the server derives what the lane is stored against from the plan's source and the activity's
 * membership, because a client-supplied basis that disagreed with the real one would be stored and
 * believed (schema-design §4 Q3).
 */
export class ActivitySwimlaneLaneDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'MANUAL source only: file the activity in this swimlane (it must be an active swimlane of ' +
      'this plan, else 404). Omit to leave its membership as it is. Refused with 422 ' +
      'SWIMLANE_SOURCE_IS_WBS while the plan’s swimlanes come from its WBS.',
  })
  @IsOptional()
  @Matches(UUID_REGEX, { message: 'swimlaneId must be a valid UUID.' })
  swimlaneId?: string;

  @ApiProperty({
    minimum: 0,
    maximum: 10000,
    description:
      'The 0-based lane inside the swimlane. Refused with 422 SWIMLANE_SOURCE_NONE while the plan has ' +
      'no swimlane source.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex!: number;
}

/**
 * One activity's new lane, with the version it was read at (optimistic locking). Each row needs the
 * swimlane-free `laneIndex`, an in-swimlane `swimlane` lane, or both; every body that predates
 * swimlanes (a `laneIndex` and no `swimlane`) is still valid.
 */
export class ActivityPositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 10000,
    description:
      'The 0-based lane (y) to move to in the swimlane-free layout. Required unless `swimlane` is sent.',
  })
  // Required exactly when there is no `swimlane`: a row must say where it goes.
  @ValidateIf(
    (row: ActivityPositionDto) => row.swimlane === undefined || row.laneIndex !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex?: number;

  @ApiPropertyOptional({
    type: ActivitySwimlaneLaneDto,
    description: 'The activity’s lane inside its swimlane. Never writes `laneIndex`.',
  })
  // Not `@IsOptional()`: an explicit null must fail validation rather than read as "no swimlane".
  @ValidateIf((_, value) => value !== undefined)
  @ValidateNested()
  @Type(() => ActivitySwimlaneLaneDto)
  swimlane?: ActivitySwimlaneLaneDto;

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
