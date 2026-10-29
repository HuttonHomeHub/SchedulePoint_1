import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

import { toArray } from '../../../common/dto/to-array';
import { CODE_TYPE_LIMIT } from '../codes.constants';

/**
 * The resolve query: the value ids a screen holds and needs names for. The ceiling is the type cap,
 * because one activity carries at most one value per type, so 100 ids name everything one activity
 * can hold. The ids are **repeated** (`?id=a&id=b`); a comma-joined list is one string that is not a
 * UUID and is refused with 422, as the cross-plan revision compare's `include` is.
 */
export class ResolveCodeValuesQueryDto {
  @ApiProperty({
    format: 'uuid',
    isArray: true,
    minItems: 1,
    maxItems: CODE_TYPE_LIMIT,
    description: 'The value ids to name, repeated: `?id=a&id=b`. 1–100; not comma-joined.',
  })
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CODE_TYPE_LIMIT)
  @IsUUID('all', { each: true, message: 'id must each be a UUID.' })
  id!: string[];
}
