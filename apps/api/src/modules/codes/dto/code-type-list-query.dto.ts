import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CODE_TYPE_LIMIT } from '../codes.constants';

/**
 * The list query. The default page is the plan's whole cap of types, because the screens that show
 * them need all of them and the cap makes that one page. Each page carries its types' values.
 */
export class CodeTypeListQueryDto extends PaginationQueryDto {
  // Re-declared so the OpenAPI states this list's own default; the inherited decorator says 20.
  @ApiPropertyOptional({
    minimum: 1,
    maximum: CODE_TYPE_LIMIT,
    default: CODE_TYPE_LIMIT,
    description: 'Page size.',
  })
  override limit = CODE_TYPE_LIMIT;

  @ApiPropertyOptional({
    enum: ['deleted'],
    description:
      'With `deleted`, deleted types and deleted values are listed too, each with its `deletedAt`, ' +
      'so a restore can find them. Needs `code:restore` (Planner or Org Admin).',
  })
  @IsOptional()
  @IsIn(['deleted'])
  include?: 'deleted';
}
