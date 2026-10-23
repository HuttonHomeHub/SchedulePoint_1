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

/** The cap on active swimlanes per plan (swimlanes spec §2): also the longest order a body may name. */
export const SWIMLANE_LIMIT = 100;

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
