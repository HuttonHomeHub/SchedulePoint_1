import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AppConfigService } from '../../config/app-config.service';
import { OrganizationResponseDto } from '../organizations/dto/organization-response.dto';

import { MyInvitationDto } from './dto/my-invitation.dto';
import { InvitationsService } from './invitations.service';

/** The same ceiling as the email-verification confirm route. */
const ACCEPT_THROTTLE = { default: { ttl: 60_000, limit: 10 } } as const;

/**
 * The signed-in person's own invitations (ADR-0221): those addressed to the address they have
 * confirmed, on a host that enforces confirmation. Authenticated, no organisation role (the caller
 * is not a member yet). Where the door is closed the list is empty and the accept is 404.
 */
@ApiTags('invitations')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@Controller({ path: 'me/invitations', version: '1' })
export class MyInvitationsController {
  constructor(
    private readonly service: InvitationsService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List invitations sent to my confirmed address (cursor-paginated).',
    description:
      'Empty unless the host requires email verification and the caller has confirmed their address.',
  })
  @ApiOkResponse({ type: MyInvitationDto, isArray: true })
  @ApiBadRequestResponse({ description: 'A malformed `limit` or `cursor`.' })
  async list(
    @CurrentUser() principal: Principal,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<MyInvitationDto>> {
    const { items, meta } = await this.service.listForVerifiedUser(principal, query);
    return new Paginated(
      items.map((invitation) => MyInvitationDto.from(invitation)),
      meta,
    );
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle(ACCEPT_THROTTLE)
  @ApiOperation({ summary: 'Accept an invitation sent to my confirmed address.' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiBadRequestResponse({ description: '`invitationId` is not a UUID.' })
  @ApiNotFoundResponse({
    description:
      'Unknown, not addressed to the caller, or the host does not accept a confirmed address as proof.',
  })
  @ApiGoneResponse({ description: 'The invitation has expired or is no longer pending.' })
  @ApiConflictResponse({ description: 'Already a member of this organisation.' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  async accept(
    @CurrentUser() principal: Principal,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @RequestContext() context: RequestContext,
  ): Promise<OrganizationResponseDto> {
    const { organization, role } = await this.service.acceptForVerifiedUser(
      principal,
      invitationId,
      context,
    );
    return OrganizationResponseDto.from(organization, role, this.config);
  }
}
