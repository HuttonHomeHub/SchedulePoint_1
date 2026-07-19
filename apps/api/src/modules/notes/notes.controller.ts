import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
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
import { ParseUuidPipe } from '../../common/validation/uuid';

import { NoteResponseDto } from './dto/note-response.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';

/**
 * Flat note routes addressed by the note's own id, org-scoped (ADR-0046): edit-own and delete-own.
 * A note is addressable directly (not nested under its parent) because both operations are gated on
 * **author-ownership**, not the parent — only the note's author may edit or delete it (403 otherwise),
 * on top of the `note:update`/`note:delete` permission. Every route resolves the org from `:orgSlug`
 * and scopes the note to it (a foreign/other-org note is an indistinguishable 404). NOT pen-gated —
 * annotating is non-structural (the progress precedent). Create/list are nested under the parent
 * plan/activity controllers.
 */
@ApiTags('notes')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or note not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/notes', version: '1' })
export class NotesController {
  constructor(private readonly service: NotesService) {}

  @Patch(':noteId')
  @ApiOperation({
    summary: 'Edit your own note (author-only; note:update; optimistic locking). Not pen-gated.',
  })
  @ApiOkResponse({ type: NoteResponseDto })
  @ApiForbiddenResponse({ description: 'Not the note author, or missing note:update.' })
  @ApiConflictResponse({ description: 'Stale version — refresh and retry.' })
  @ApiUnprocessableEntityResponse({ description: 'An empty/whitespace-only or over-long body.' })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('noteId', ParseUuidPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    const { note, authorName } = await this.service.update(principal, orgSlug, noteId, dto);
    return NoteResponseDto.from(note, authorName);
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete your own note (author-only; note:delete; soft). Not pen-gated.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not the note author, or missing note:delete.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('noteId', ParseUuidPipe) noteId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, noteId);
  }
}
