import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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

import { ActivityNoteCountResponseDto } from './dto/activity-note-count-response.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { NoteResponseDto } from './dto/note-response.dto';
import { NotesService } from './notes.service';

/**
 * Note routes nested under a parent plan (ADR-0046): list the plan's own (PLAN-type) thread
 * newest-first, create a note on the plan, and read the per-activity note-counts badge for the plan.
 * The plan is resolved active and in-org first (404 otherwise). Writes are Contributor-capable and
 * deliberately NOT pen-gated (the progress precedent). Edit/delete of a single note live on the flat
 * NotesController (a note is addressable by its own id).
 */
@ApiTags('notes')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or plan not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/notes', version: '1' })
export class PlanNotesController {
  constructor(private readonly service: NotesService) {}

  @Get()
  @ApiOperation({ summary: "List a plan's notes, newest-first (cursor-paginated). note:read." })
  @ApiOkResponse({ type: NoteResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<NoteResponseDto>> {
    const { items, meta } = await this.service.listByPlan(principal, orgSlug, planId, query);
    return new Paginated(
      items.map(({ note, authorName }) => NoteResponseDto.from(note, authorName)),
      meta,
    );
  }

  @Get('activity-counts')
  @ApiOperation({
    summary:
      'Per-activity active-note counts for the plan — the row badge, one grouped query. note:read.',
  })
  @ApiOkResponse({ type: ActivityNoteCountResponseDto, isArray: true })
  async activityCounts(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<ActivityNoteCountResponseDto[]> {
    const counts = await this.service.countByActivityForPlan(principal, orgSlug, planId);
    return counts.map((entry) => ActivityNoteCountResponseDto.from(entry));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a note to a plan (Contributor upward; note:create). Not pen-gated.',
  })
  @ApiCreatedResponse({ type: NoteResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({ description: 'An empty/whitespace-only or over-long body.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    const { note, authorName } = await this.service.createForPlan(principal, orgSlug, planId, dto);
    return NoteResponseDto.from(note, authorName);
  }
}
