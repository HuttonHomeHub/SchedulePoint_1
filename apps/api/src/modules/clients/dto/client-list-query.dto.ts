import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { LIBRARY_SEARCH_MAX_LENGTH } from '../../../common/query/library-filters';

/**
 * Query params for the organisation client list.
 *
 * **`q` is the whole of it, and the absence of the other two is the design.** The shared libraries
 * carry a tri-state `archived` filter and calendars a `scope` tier; `Client` has **neither** — no
 * `archived_at` column, no tier — so this DTO reuses the search primitive alone rather than
 * inheriting a shape it would have to leave permanently empty.
 *
 * The filter is a **usability** control, never an authorisation boundary — the same point every
 * library list's DTO makes. Every member of an organisation can already read every client in it;
 * narrowing a list is tidiness, and the security control is the org scope the service asserts
 * before the query is built at all.
 *
 * Sending nothing returns exactly today's result set, which is what makes this additive.
 */
export class ClientListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    maxLength: LIBRARY_SEARCH_MAX_LENGTH,
    description:
      'Case-insensitive substring search over the client name. Trimmed; a whitespace-only term ' +
      'is treated as no search. Matching is case-insensitive while client-name UNIQUENESS is ' +
      'case-sensitive, so a search can legitimately return two rows differing only in case.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIBRARY_SEARCH_MAX_LENGTH)
  q?: string;
}
