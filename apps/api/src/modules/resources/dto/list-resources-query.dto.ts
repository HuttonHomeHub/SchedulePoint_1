import { ApiPropertyOptional } from '@nestjs/swagger';
import { ResourceKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  ARCHIVED_FILTERS,
  LIBRARY_SEARCH_MAX_LENGTH,
  type ArchivedFilter,
} from '../../../common/query/library-filters';
import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Query params for `GET …/organizations/:orgSlug/resources` — the shared cursor pagination plus
 * the resource-tree filter (ADR-0053 §3) and the M4 search/archive filters (ADR-0053 §4 / US-8).
 * Every filter defaults to "as before": omitted `parentId` is the whole flat library, `archived`
 * is `exclude` (nothing is archived until someone archives it) and `q` is absent — so a client
 * that sends nothing sees exactly today's result set.
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

  @ApiPropertyOptional({
    enum: ResourceKind,
    description:
      'Filter to one resource kind (ADR-0053 §4 / US-8). `GROUP` returns only the grouping ' +
      'nodes; omitting it returns every kind.',
  })
  @IsOptional()
  @IsEnum(ResourceKind)
  kind?: ResourceKind;

  @ApiPropertyOptional({
    enum: ARCHIVED_FILTERS,
    default: 'exclude',
    description:
      'How to treat archived resources (ADR-0053 §4): `exclude` (default) hides them — ' +
      "today's result set, and what every picker uses — `include` returns both, `only` just " +
      'the archived ones.',
  })
  @IsOptional()
  @IsIn(ARCHIVED_FILTERS)
  archived: ArchivedFilter = 'exclude';

  @ApiPropertyOptional({
    maxLength: LIBRARY_SEARCH_MAX_LENGTH,
    description:
      'Case-insensitive substring search over the resource name OR code (ADR-0053 §4 / US-8). ' +
      'Trimmed; a whitespace-only term is treated as no search.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIBRARY_SEARCH_MAX_LENGTH)
  q?: string;
}
