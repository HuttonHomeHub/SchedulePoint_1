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

import { CreateNoteDto } from './dto/create-note.dto';
import { NoteResponseDto } from './dto/note-response.dto';
import { NotesService } from './notes.service';

/**
 * Note routes nested under a parent activity (ADR-0046): list the activity's (ACTIVITY-type) thread
 * newest-first, and create a note on the activity. The activity is resolved active and in-org first
 * (404 otherwise); the note's plan id is copied from the activity's plan server-side. Writes are
 * Contributor-capable and NOT pen-gated. Edit/delete live on the flat NotesController.
 */
@ApiTags('notes')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or activity not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/activities/:activityId/notes', version: '1' })
export class ActivityNotesController {
  constructor(private readonly service: NotesService) {}

  @Get()
  @ApiOperation({
    summary: "List an activity's notes, newest-first (cursor-paginated). note:read.",
  })
  @ApiOkResponse({ type: NoteResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<NoteResponseDto>> {
    const { items, meta } = await this.service.listByActivity(
      principal,
      orgSlug,
      activityId,
      query,
    );
    return new Paginated(
      items.map(({ note, authorName }) => NoteResponseDto.from(note, authorName)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a note to an activity (Contributor upward; note:create). Not pen-gated.',
  })
  @ApiCreatedResponse({ type: NoteResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({ description: 'An empty/whitespace-only or over-long body.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    const { note, authorName } = await this.service.createForActivity(
      principal,
      orgSlug,
      activityId,
      dto,
    );
    return NoteResponseDto.from(note, authorName);
  }
}
