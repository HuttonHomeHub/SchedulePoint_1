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

import { CODE_TYPE_LIMIT, CODE_VALUE_LIMIT } from '../codes.constants';

import { MAX_VERSION } from './code-text';

/** One row in the new order, with the version it was read at. */
export class CodeOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION)
  version!: number;
}

/** Request body for reordering a plan's code types: every live type exactly once, in the new order. */
export class ReorderCodeTypesDto {
  @ApiProperty({ type: CodeOrderItemDto, isArray: true, minItems: 1, maxItems: CODE_TYPE_LIMIT })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CODE_TYPE_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => CodeOrderItemDto)
  order!: CodeOrderItemDto[];
}

/** Request body for reordering a type's values: every live value exactly once, in the new order. */
export class ReorderCodeValuesDto {
  @ApiProperty({ type: CodeOrderItemDto, isArray: true, minItems: 1, maxItems: CODE_VALUE_LIMIT })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CODE_VALUE_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => CodeOrderItemDto)
  order!: CodeOrderItemDto[];
}
