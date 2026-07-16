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
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CalendarsService } from './calendars.service';
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
  @ApiOperation({ summary: "List an organisation's calendars (cursor-paginated)." })
  @ApiOkResponse({ type: CalendarResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<CalendarResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, query);
    return new Paginated(
      items.map((calendar) => CalendarResponseDto.from(calendar)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a calendar (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: CalendarDetailResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid working-weekday pattern (must be 1–127).',
  })
  @ApiConflictResponse({ description: 'A calendar with this name already exists.' })
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
  @ApiOperation({ summary: 'Update a calendar (Planner or Org Admin; optimistic locking).' })
  @ApiOkResponse({ type: CalendarDetailResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid working-weekday pattern (must be 1–127).',
  })
  @ApiConflictResponse({ description: 'Stale version, or a name collision.' })
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
  @ApiOperation({ summary: 'Delete a calendar and its exceptions (soft cascade).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
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
