import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreatedInvitationDto, InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationsService } from './invitations.service';

/**
 * Organisation-scoped invitation administration (Org Admin only, enforced by the
 * service's scope + permission checks — non-members get 404, insufficient role
 * gets 403).
 */
@ApiTags('invitations')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or invitation not found (or the caller is not a member).',
})
@ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
@Controller({ path: 'organizations/:orgSlug/invitations', version: '1' })
export class OrgInvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite someone to the organisation (Org Admin).' })
  @ApiCreatedResponse({ type: CreatedInvitationDto })
  @ApiConflictResponse({ description: 'Already a member, or a pending invite exists.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<CreatedInvitationDto> {
    const { invitation, acceptUrl } = await this.service.create(principal, orgSlug, dto);
    return CreatedInvitationDto.fromWithUrl(invitation, acceptUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List pending invitations (Org Admin; cursor-paginated).' })
  @ApiOkResponse({ type: InvitationResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<InvitationResponseDto>> {
    const { items, meta } = await this.service.listPending(principal, orgSlug, query);
    return new Paginated(
      items.map((invitation) => InvitationResponseDto.from(invitation)),
      meta,
    );
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a pending invitation (Org Admin).' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The invitation is no longer pending.' })
  async revoke(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('invitationId', ParseUuidPipe) invitationId: string,
  ): Promise<void> {
    await this.service.revoke(principal, orgSlug, invitationId);
  }
}
