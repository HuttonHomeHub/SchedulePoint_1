import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, Matches, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Query params for `GET …/organizations/:orgSlug/resources` — the shared cursor pagination plus
 * the resource-tree filter (ADR-0053 §3).
 */
export class ListResourcesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Resource-tree filter (ADR-0053 §3): a GROUP id returns that group’s direct children, the ' +
      'literal string "null" returns only top-level resources, and OMITTING it returns the whole ' +
      'flat library — the behaviour-preserving default every existing client keeps. Combine with ' +
      'the cursor exactly as before.',
    example: 'null',
  })
  @IsOptional()
  // `?parentId=null` is the only way HTTP can express "top level" distinctly from "unfiltered"
  // (an omitted param and an empty one both read as absent), so it is mapped to a real null here
  // and the service treats `undefined` (omitted) and `null` (explicit) as different filters.
  @Transform(({ value }: { value: unknown }) => (value === 'null' ? null : value))
  @ValidateIf((_, value) => value !== null)
  @Matches(UUID_REGEX, { message: 'parentId must be a valid UUID or the literal "null".' })
  parentId?: string | null;
}
