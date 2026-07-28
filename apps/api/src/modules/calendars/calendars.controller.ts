import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ArchiveActionDto } from '../../common/dto/archive-action.dto';
import { Paginated } from '../../common/dto/paginated';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CalendarsService } from './calendars.service';
import { CalendarListQueryDto } from './dto/calendar-list-query.dto';
import {
  CalendarDetailResponseDto,
  CalendarExceptionResponseDto,
  CalendarResponseDto,
} from './dto/calendar-response.dto';
import { CreateCalendarExceptionDto } from './dto/create-calendar-exception.dto';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';

/**
 * Working-day calendar library HTTP surface, nested under the organisation scope
 * (ADR-0024). Every route resolves the org from `:orgSlug` against the caller's
 * memberships (404 for non-members). Reading is open to any member; create/update/
 * delete and the exception editor are Planner + Org Admin. Delete is a soft cascade
 * over the calendar and its exceptions.
 */
@ApiTags('calendars')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or calendar not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/calendars', version: '1' })
export class CalendarsController {
  constructor(private readonly service: CalendarsService) {}

  @Get()
  @ApiOperation({
    summary: "List an organisation's calendars (cursor-paginated).",
    description:
      'Returns the SHARED organisation library by default (`?scope=org`, ADR-0053); pass ' +
      '`?scope=project` or `?scope=all` to include project-scoped calendars. Rows are always ' +
      'returned oldest-first (`created_at, id`), the order the cursor is built on; there is no ' +
      'sort-direction param.',
  })
  @ApiOkResponse({ type: CalendarResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: CalendarListQueryDto,
  ): Promise<Paginated<CalendarResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, query);
    return new Paginated(
      items.map((calendar) => CalendarResponseDto.from(calendar)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a calendar (Planner or Org Admin).',
    description:
      'Creates in the SHARED organisation library by default. `scope: PROJECT` + `projectId` ' +
      'creates a project-local calendar instead (ADR-0053); `scope: ORG` additionally requires ' +
      'the `calendar:manage_org` permission.',
  })
  @ApiCreatedResponse({ type: CalendarDetailResponseDto })
  @ApiForbiddenResponse({
    description: 'Insufficient role, or no `calendar:manage_org` for an ORG-scoped calendar.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Invalid working-weekday pattern (must be 1–127), or scope/projectId disagree ' +
      '(CALENDAR_SCOPE_PROJECT_MISMATCH).',
  })
  @ApiConflictResponse({
    description: 'A calendar with this name already exists in the same tier (DUPLICATE_CALENDAR).',
  })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Body() dto: CreateCalendarDto,
  ): Promise<CalendarDetailResponseDto> {
    return CalendarDetailResponseDto.fromDetail(await this.service.create(principal, orgSlug, dto));
  }

  @Get(':calendarId')
  @ApiOperation({ summary: 'Get a calendar and its exceptions by id.' })
  @ApiOkResponse({ type: CalendarDetailResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
  ): Promise<CalendarDetailResponseDto> {
    return CalendarDetailResponseDto.fromDetail(
      await this.service.get(principal, orgSlug, calendarId),
    );
  }

  @Patch(':calendarId')
  @ApiOperation({
    summary: 'Update a calendar (Planner or Org Admin; optimistic locking).',
    description:
      'Also the promote/narrow path (ADR-0053): `scope: ORG` promotes a project calendar into ' +
      'the shared library (always allowed); `scope: PROJECT` + `projectId` narrows it, and is ' +
      'refused while anything outside that project still uses it. Both need `calendar:manage_org`.',
  })
  @ApiOkResponse({ type: CalendarDetailResponseDto })
  @ApiForbiddenResponse({
    description: 'Insufficient role, or no `calendar:manage_org` for a shared-library write.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Invalid working-weekday pattern (must be 1–127), or scope/projectId disagree ' +
      '(CALENDAR_SCOPE_PROJECT_MISMATCH).',
  })
  @ApiConflictResponse({
    description:
      'Stale version, a per-tier name collision (DUPLICATE_CALENDAR), or the calendar is still ' +
      'used outside the target project (CALENDAR_SCOPE_NARROWING_BLOCKED).',
  })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
    @Body() dto: UpdateCalendarDto,
  ): Promise<CalendarDetailResponseDto> {
    return CalendarDetailResponseDto.fromDetail(
      await this.service.update(principal, orgSlug, calendarId, dto),
    );
  }

  @Delete(':calendarId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a calendar and its exceptions (soft cascade).',
    description:
      'Deleting an ORG-scoped calendar additionally requires `calendar:manage_org` (ADR-0053).',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({
    description: 'Insufficient role, or no `calendar:manage_org` for an ORG-scoped calendar.',
  })
  @ApiConflictResponse({
    description: 'The calendar is in use by an active plan or activity (CALENDAR_IN_USE).',
  })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, calendarId);
  }

  @Post(':calendarId/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive a calendar — retire it from the pickers without deleting it.',
    description:
      'ADR-0053 §4. An archived calendar STAYS BOUND to its plans, activities and resources ' +
      'and still schedules identically; it is hidden from the default list and from every ' +
      'picker, and refused for a NEW binding (422 CALENDAR_ARCHIVED). Archiving is ' +
      'deliberately NOT blocked by use — it is the only way to retire a calendar the ' +
      'CALENDAR_IN_USE delete guard (correctly) refuses to delete. Archiving an ORG-scoped ' +
      'calendar additionally requires `calendar:manage_org`.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({
    description: 'Insufficient role, or no `calendar:manage_org` for an ORG-scoped calendar.',
  })
  @ApiNotFoundResponse({ description: 'No such calendar in this organisation.' })
  @ApiConflictResponse({ description: 'Stale `version` — the calendar changed elsewhere.' })
  async archive(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
    @Body() dto: ArchiveActionDto,
  ): Promise<void> {
    await this.service.setArchived(principal, orgSlug, calendarId, true, dto.version);
  }

  @Post(':calendarId/unarchive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unarchive a calendar — return it to the library and the pickers.',
    description:
      'ADR-0053 §4. Clears `archivedAt`. This can never fail on a name collision: an archived ' +
      'calendar keeps its name (the per-tier partial uniques are predicated on `deleted_at` ' +
      'alone), so nothing can have taken it meanwhile.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({
    description: 'Insufficient role, or no `calendar:manage_org` for an ORG-scoped calendar.',
  })
  @ApiNotFoundResponse({ description: 'No such calendar in this organisation.' })
  @ApiConflictResponse({ description: 'Stale `version` — the calendar changed elsewhere.' })
  async unarchive(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
    @Body() dto: ArchiveActionDto,
  ): Promise<void> {
    await this.service.setArchived(principal, orgSlug, calendarId, false, dto.version);
  }

  @Post(':calendarId/exceptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a dated exception (holiday / worked day) to a calendar.' })
  @ApiCreatedResponse({ type: CalendarExceptionResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid date (must be YYYY-MM-DD).' })
  @ApiConflictResponse({ description: 'An exception for this date already exists.' })
  async addException(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
    @Body() dto: CreateCalendarExceptionDto,
  ): Promise<CalendarExceptionResponseDto> {
    return CalendarExceptionResponseDto.from(
      await this.service.addException(principal, orgSlug, calendarId, dto),
    );
  }

  @Delete(':calendarId/exceptions/:exceptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a calendar exception (soft delete).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  async removeException(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('calendarId', ParseUuidPipe) calendarId: string,
    @Param('exceptionId', ParseUuidPipe) exceptionId: string,
  ): Promise<void> {
    await this.service.removeException(principal, orgSlug, calendarId, exceptionId);
  }
}
