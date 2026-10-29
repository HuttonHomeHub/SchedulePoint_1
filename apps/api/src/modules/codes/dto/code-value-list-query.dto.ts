import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CODE_VALUE_LIMIT } from '../codes.constants';

/**
 * The per-type values query. The default page is the type's whole cap, because a reorder must name
 * every live value with its version, so the screen needs all of them and the cap makes that one page.
 * It overrides the house `@Max(100)` the way `CodeTypeListQueryDto` overrides the default.
 */
export class CodeValueListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: CODE_VALUE_LIMIT,
    default: CODE_VALUE_LIMIT,
    description: 'Page size.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CODE_VALUE_LIMIT)
  override limit = CODE_VALUE_LIMIT;

  @ApiPropertyOptional({ format: 'uuid', description: 'The `meta.nextCursor` of a previous page.' })
  @IsOptional()
  @IsUUID()
  override cursor?: string = undefined;

  @ApiPropertyOptional({
    enum: ['deleted'],
    description:
      'With `deleted`, the type’s deleted values are listed too, each with its `deletedAt`, in ' +
      'the same order. Needs `code:restore` (Planner or Org Admin).',
  })
  @IsOptional()
  @IsIn(['deleted'])
  include?: 'deleted';
}
