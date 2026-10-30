import { ApiProperty } from '@nestjs/swagger';
import { SWIMLANE_LIMIT } from '@repo/types';
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

// The cap on active swimlanes per plan (swimlanes spec §2) now lives in @repo/types, where the web's
// code-source picker reads it too; re-exported so the swimlane module's own imports are unchanged.
export { SWIMLANE_LIMIT };

/** One swimlane in the new order, with the version it was read at. */
export class SwimlaneOrderItemDto {
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
}

/** Request body for reordering: every active swimlane of the plan exactly once, in the new order. */
export class ReorderSwimlanesDto {
  @ApiProperty({ type: SwimlaneOrderItemDto, isArray: true, minItems: 1, maxItems: SWIMLANE_LIMIT })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SWIMLANE_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => SwimlaneOrderItemDto)
  order!: SwimlaneOrderItemDto[];
}
