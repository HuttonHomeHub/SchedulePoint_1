import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';

import { CalendarsService } from './calendars.service';
import { ProjectCalendarListQueryDto } from './dto/calendar-list-query.dto';
import { CalendarResponseDto } from './dto/calendar-response.dto';
import { UnusedCalendarResponseDto } from './dto/unused-calendar-response.dto';
import { UnusedCalendarsQueryDto } from './dto/unused-calendars-query.dto';

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

  @Get('unused')
  @ApiOperation({
    summary: "List the project's own calendars that nothing active uses.",
    description:
      'The calendars the "Remove unused calendars…" action offers (ADR-0208 D5): PROJECT tier in ' +
      'this project, archived included, with no active plan, activity or resource. Each row says ' +
      'how many deleted plans and activities still point at it. Oldest first; cursor-paginated.',
  })
  @ApiOkResponse({ type: UnusedCalendarResponseDto, isArray: true })
  @ApiNotFoundResponse({
    description: 'The project is unknown, deleted or in another organisation.',
  })
  @ApiUnprocessableEntityResponse({
    description: '`limit` is out of range or `cursor` is not a UUID.',
  })
  async listUnused(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: UnusedCalendarsQueryDto,
  ): Promise<Paginated<UnusedCalendarResponseDto>> {
    const { items, meta } = await this.service.listUnusedForProject(
      principal,
      orgSlug,
      projectId,
      query,
    );
    return new Paginated(items, meta);
  }

  @Get()
  @ApiOperation({
    summary: "List the calendars usable in a project (the project's own + all org ones).",
    description:
      'Rows are always returned oldest-first (`created_at, id`), the order the cursor is built ' +
      'on; there is no sort-direction param.',
  })
  @ApiOkResponse({ type: CalendarResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectCalendarListQueryDto,
  ): Promise<Paginated<CalendarResponseDto>> {
    const { items, meta } = await this.service.listForProject(principal, orgSlug, projectId, query);
    return new Paginated(
      items.map((calendar) => CalendarResponseDto.from(calendar)),
      meta,
    );
  }
}
