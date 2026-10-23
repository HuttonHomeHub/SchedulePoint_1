import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { OptionalVersionDto } from '../../common/dto/optional-version.dto';
import { Paginated } from '../../common/dto/paginated';

import { CreateSwimlaneDto } from './dto/create-swimlane.dto';
import { ReorderSwimlanesDto } from './dto/reorder-swimlanes.dto';
import { SwimlaneListQueryDto } from './dto/swimlane-list-query.dto';
import { SwimlaneResponseDto } from './dto/swimlane-response.dto';
import { UpdateSwimlaneDto } from './dto/update-swimlane.dto';
import { SwimlanesService } from './swimlanes.service';

const PEN = 'You do not hold the plan edit-lock (when enforcement is on).';

/**
 * Swimlane routes nested under a parent plan (swimlanes spec §4.12). The plan is resolved active
 * and in-org first, so a foreign or deleted plan is indistinguishable from a missing one; a swimlane
 * is looked up inside that plan, so another plan's or tenant's id is a 404 as well. Every write
 * needs Planner or Org Admin and the pen.
 */
@ApiTags('swimlanes')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, plan or swimlane not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/swimlanes', version: '1' })
export class SwimlanesController {
  constructor(private readonly service: SwimlanesService) {}

  @Get()
  @ApiOperation({
    summary: "List a plan's active swimlanes in display order (cursor-paginated). swimlane:read.",
  })
  @ApiOkResponse({ type: SwimlaneResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: SwimlaneListQueryDto,
  ): Promise<Paginated<SwimlaneResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, planId, query);
    return new Paginated(
      items.map((swimlane) => SwimlaneResponseDto.from(swimlane)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a swimlane on a plan (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: SwimlaneResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'Another active swimlane has this name, ignoring case (SWIMLANE_NAME_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({
    description: 'An invalid name, or the plan already has 100 swimlanes (SWIMLANE_LIMIT).',
  })
  @ApiLockedResponse(PEN)
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: CreateSwimlaneDto,
  ): Promise<SwimlaneResponseDto> {
    return SwimlaneResponseDto.from(await this.service.create(principal, orgSlug, planId, dto));
  }

  // Declared before `:swimlaneId` so the literal `order` is never parsed as an id.
  @Patch('order')
  @ApiOperation({
    summary: 'Reorder the plan’s swimlanes (Planner or Org Admin). All-or-nothing.',
    description:
      'Names every active swimlane exactly once with its version. Returns the new order.',
  })
  @ApiOkResponse({ type: SwimlaneResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'A stale version, or the set of swimlanes changed (STALE_VERSION).',
  })
  @ApiUnprocessableEntityResponse({ description: 'A swimlane appears more than once.' })
  @ApiLockedResponse(PEN)
  async reorder(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: ReorderSwimlanesDto,
  ): Promise<SwimlaneResponseDto[]> {
    const rows = await this.service.reorder(principal, orgSlug, planId, dto);
    return rows.map((swimlane) => SwimlaneResponseDto.from(swimlane));
  }

  @Patch(':swimlaneId')
  @ApiOperation({ summary: 'Rename a swimlane (Planner or Org Admin).' })
  @ApiOkResponse({ type: SwimlaneResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'A stale version (STALE_VERSION) or a name already taken (SWIMLANE_NAME_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({ description: 'An invalid name.' })
  @ApiLockedResponse(PEN)
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('swimlaneId', ParseUUIDPipe) swimlaneId: string,
    @Body() dto: UpdateSwimlaneDto,
  ): Promise<SwimlaneResponseDto> {
    return SwimlaneResponseDto.from(
      await this.service.update(principal, orgSlug, planId, swimlaneId, dto),
    );
  }

  @Delete(':swimlaneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a swimlane (soft; Planner or Org Admin).',
    description:
      'Its activities keep their swimlane; restoring brings the picture back. **Optional ' +
      '`?version=N`**: when sent, a stale one is refused with 409 `STALE_VERSION`. Audited as ' +
      '`swimlane.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'A `version` was sent and the swimlane is at another.' })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiLockedResponse(PEN)
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('swimlaneId', ParseUUIDPipe) swimlaneId: string,
    @Query() query: OptionalVersionDto,
    @RequestContext() context: RequestContext,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, planId, swimlaneId, context, query.version);
  }

  @Post(':swimlaneId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a deleted swimlane (Planner or Org Admin).',
    description: 'Audited as `swimlane.restored`. Restoring an active swimlane is a no-op.',
  })
  @ApiOkResponse({ type: SwimlaneResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description:
      'The plan is still deleted (PARENT_DELETED), or the name was taken meanwhile ' +
      '(SWIMLANE_NAME_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({ description: 'The plan already has 100 swimlanes.' })
  @ApiLockedResponse(PEN)
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('swimlaneId', ParseUUIDPipe) swimlaneId: string,
    @RequestContext() context: RequestContext,
  ): Promise<SwimlaneResponseDto> {
    return SwimlaneResponseDto.from(
      await this.service.restore(principal, orgSlug, planId, swimlaneId, context),
    );
  }
}
