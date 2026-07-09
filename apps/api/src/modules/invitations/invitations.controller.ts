import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OrganizationResponseDto } from '../organizations/dto/organization-response.dto';

import { InvitationPreviewDto } from './dto/invitation-preview.dto';
import { InvitationTokenDto } from './dto/invitation-token.dto';
import { InvitationsService } from './invitations.service';

/**
 * Token-based invitation endpoints, keyed by the opaque token (in the body, not
 * the URL). Preview is public so an invitee can see the invite before signing
 * in; accept requires a session whose email matches the invited address.
 */
@ApiTags('invitations')
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Post('preview')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview an invitation by token (public, token-gated).' })
  @ApiOkResponse({ type: InvitationPreviewDto })
  @ApiNotFoundResponse({ description: 'No invitation matches the token.' })
  async preview(@Body() dto: InvitationTokenDto): Promise<InvitationPreviewDto> {
    return InvitationPreviewDto.from(await this.service.preview(dto.token));
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('schedulepoint.session_token')
  @ApiOperation({ summary: 'Accept an invitation for the signed-in user.' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiNotFoundResponse({ description: 'No invitation matches the token.' })
  @ApiGoneResponse({ description: 'The invitation has expired or is no longer pending.' })
  @ApiForbiddenResponse({ description: 'Signed in as a different account than the one invited.' })
  @ApiConflictResponse({ description: 'Already a member of this organisation.' })
  async accept(
    @CurrentUser() principal: Principal,
    @Body() dto: InvitationTokenDto,
  ): Promise<OrganizationResponseDto> {
    const { organization, role } = await this.service.accept(principal, dto.token);
    return OrganizationResponseDto.from(organization, role);
  }
}
