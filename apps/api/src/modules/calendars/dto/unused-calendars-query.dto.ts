import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query params for the unused-calendars list. The cursor is a calendar id (the list is keyset-paged
 * by `(created_at, id)` and the cursor names the last row of the previous page), so it is validated
 * as a UUID: a malformed one is a 422 here, not a database error from a cast.
 *
 * A well-formed cursor that matches no row (its calendar was deleted or never existed) returns an
 * empty page with `hasMore: false`, because the position it names cannot be found.
 */
export class UnusedCalendarsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The `nextCursor` of the previous page (a calendar id). A cursor that names no calendar ' +
      'returns an empty page.',
  })
  @IsOptional()
  @IsUUID('all')
  declare cursor?: string;
}
