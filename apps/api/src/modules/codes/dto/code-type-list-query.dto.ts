import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CODE_TYPE_LIMIT } from '../codes.constants';

/**
 * The list query. The default page is the plan's whole cap of types, because the screens that show
 * them need all of them and the cap makes that one page. Each page carries its types' values unless
 * `values=none` asks for the types alone (the values then come from the per-type read).
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

  // Re-declared as a UUID: a type id is all the cursor can be, and a malformed one used to reach the
  // database as a 500 (TECH_DEBT #562 bullet 8, codes routes only).
  @ApiPropertyOptional({ format: 'uuid', description: 'The `meta.nextCursor` of a previous page.' })
  @IsOptional()
  @IsUUID()
  override cursor?: string = undefined;

  @ApiPropertyOptional({
    enum: ['none'],
    description:
      'With `none`, each type is returned without `values` and the value query is not run; ' +
      '`valueCount` is still sent. Absent keeps the nesting, which is kept for compatibility and ' +
      'is not what a screen should use: read a type’s values from `code-types/{id}/values`.',
  })
  @IsOptional()
  @IsIn(['none'])
  values?: 'none';

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
