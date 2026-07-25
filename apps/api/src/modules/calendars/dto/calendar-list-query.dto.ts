import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import type { CalendarScopeFilter } from '../calendar.repository';

/** The tier filter values the organisation calendar list accepts (ADR-0053 §1). */
const CALENDAR_SCOPE_FILTERS: readonly CalendarScopeFilter[] = ['org', 'project', 'all'];

/**
 * Query params for the organisation calendar list. `scope` defaults to `org`, so a client
 * that sends nothing gets EXACTLY today's result set — the shared library — and project
 * calendars are opt-in (`project` for only those, `all` for both, badged by tier in the UI).
 *
 * This filter is a USABILITY control, never an authorisation boundary: every member of an org
 * can already read every project in it, so hiding project calendars from the shared list is
 * tidiness. The security control is the write-time `assertCalendarUsableBy` guard, enforced
 * server-side at every seam regardless of what a list returns.
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
}
