import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  ARCHIVED_FILTERS,
  LIBRARY_SEARCH_MAX_LENGTH,
  type ArchivedFilter,
} from '../../../common/query/library-filters';
import type { CalendarScopeFilter } from '../calendar.repository';

/** The tier filter values the organisation calendar list accepts (ADR-0053 §1). */
const CALENDAR_SCOPE_FILTERS: readonly CalendarScopeFilter[] = ['org', 'project', 'all'];

/**
 * Query params for the organisation calendar list. `scope` defaults to `org`, so a client
 * that sends nothing gets EXACTLY today's result set — the shared library — and project
 * calendars are opt-in (`project` for only those, `all` for both, badged by tier in the UI).
 * `archived` defaults to `exclude` and `q` to absent, so the same "send nothing, get today's
 * result set" contract holds for the M4 filters too (ADR-0053 §4 / US-8).
 *
 * These filters are USABILITY controls, never an authorisation boundary: every member of an org
 * can already read every project in it, so hiding project or archived calendars from the shared
 * list is tidiness. The security control is the write-time `assertCalendarUsableBy` guard,
 * enforced server-side at every seam regardless of what a list returns.
 */
export class CalendarListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CALENDAR_SCOPE_FILTERS,
    default: 'org',
    description:
      'Which calendar tier(s) to list (ADR-0053): `org` (default) the shared organisation ' +
      'library, `project` only project-scoped calendars, `all` both.',
  })
  @IsOptional()
  @IsIn(CALENDAR_SCOPE_FILTERS)
  scope: CalendarScopeFilter = 'org';

  @ApiPropertyOptional({
    enum: ARCHIVED_FILTERS,
    default: 'exclude',
    description:
      'How to treat archived calendars (ADR-0053 §4): `exclude` (default) hides them — ' +
      "today's result set — `include` returns both, `only` returns just the archived ones.",
  })
  @IsOptional()
  @IsIn(ARCHIVED_FILTERS)
  archived: ArchivedFilter = 'exclude';

  @ApiPropertyOptional({
    maxLength: LIBRARY_SEARCH_MAX_LENGTH,
    description:
      'Case-insensitive substring search over the calendar name (ADR-0053 §4 / US-8). ' +
      'Trimmed; a whitespace-only term is treated as no search.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIBRARY_SEARCH_MAX_LENGTH)
  q?: string;
}

/**
 * Query params for the project calendar list (`GET …/projects/:projectId/calendars`). It carries
 * the M4 filters but deliberately NOT `scope`: this route's whole contract is "the calendars
 * USABLE IN this project" — the project's own plus every ORG one — which is exactly the set the
 * `assertCalendarUsableBy` guard accepts. Letting a caller narrow that by tier would break the
 * "a picker fed from here can never offer something the write seam rejects" property.
 */
export class ProjectCalendarListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ARCHIVED_FILTERS,
    default: 'exclude',
    description:
      'How to treat archived calendars (ADR-0053 §4): `exclude` (default) hides them, which ' +
      'is what makes this list a faithful picker source; `include` / `only` for management UIs.',
  })
  @IsOptional()
  @IsIn(ARCHIVED_FILTERS)
  archived: ArchivedFilter = 'exclude';

  @ApiPropertyOptional({
    maxLength: LIBRARY_SEARCH_MAX_LENGTH,
    description: 'Case-insensitive substring search over the calendar name (ADR-0053 §4 / US-8).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIBRARY_SEARCH_MAX_LENGTH)
  q?: string;
}
