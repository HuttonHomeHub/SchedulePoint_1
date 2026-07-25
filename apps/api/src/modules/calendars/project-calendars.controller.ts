import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CalendarsService } from './calendars.service';
import { CalendarResponseDto } from './dto/calendar-response.dto';

/**
 * The calendars USABLE IN a project (ADR-0053 §1), nested under the project — its own
 * PROJECT-scoped calendars plus every ORG-scoped one. That is precisely the set the
 * `assertCalendarUsableBy` write guard accepts for a plan or activity in this project, so
 * this is the list every scope-aware picker reads: a picker fed from here can never offer a
 * calendar the write seam would reject with 422.
 *
 * Read-only. Creating a project calendar stays on the org-scoped `POST …/calendars` route
 * with `scope: PROJECT` + `projectId`, so there is exactly ONE calendar write surface (and
 * one place the tier rules live). The parent project is resolved active and in-org first, so
 * a foreign, deleted or unknown project id is a 404 — never a cross-tenant existence oracle.
 */
@ApiTags('calendars')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or project not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/projects/:projectId/calendars', version: '1' })
export class ProjectCalendarsController {
  constructor(private readonly service: CalendarsService) {}

  @Get()
  @ApiOperation({
    summary: "List the calendars usable in a project (the project's own + all org ones).",
  })
  @ApiOkResponse({ type: CalendarResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<CalendarResponseDto>> {
    const { items, meta } = await this.service.listForProject(principal, orgSlug, projectId, query);
    return new Paginated(
      items.map((calendar) => CalendarResponseDto.from(calendar)),
      meta,
    );
  }
}
