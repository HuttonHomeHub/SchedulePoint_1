import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
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
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CreateShareDto } from './dto/create-share.dto';
import { CreatedShareDto, ShareResponseDto } from './dto/share-response.dto';
import { ShareService } from './share.service';

/**
 * The External-Guest share-link **management** surface, nested under a plan (ADR-0051 F-M2).
 * Every route resolves the org from `:orgSlug` against the caller's memberships (404 for
 * non-members), scopes the plan from `:planId` within that org (anti-IDOR), and requires
 * `plan:share` (Planner + Org Admin only — a governance act). The guest READ path lives in a
 * separate `@Public()` controller (F-M3) behind the `ShareTokenGuard`, never here.
 */
@ApiTags('share')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, plan or share link not found (or the caller is not a member).',
})
@ApiForbiddenResponse({ description: 'Insufficient role in this organisation (need plan:share).' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/shares', version: '1' })
export class ShareController {
  constructor(private readonly service: ShareService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('plan:share')
  @ApiOperation({
    summary: 'Create a read-only guest share link for a plan (Planner + Org Admin).',
    description:
      'Mints a revocable, optionally-expiring link. The one-time guest URL (raw token in its ' +
      'fragment) is returned ONCE in the response and never again — only its hash is stored.',
  })
  @ApiCreatedResponse({ type: CreatedShareDto })
  @ApiUnprocessableEntityResponse({
    description: 'The expiry is not a future instant (SHARE_EXPIRY_IN_PAST).',
  })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: CreateShareDto,
  ): Promise<CreatedShareDto> {
    const { share, url } = await this.service.create(principal, orgSlug, planId, dto);
    return CreatedShareDto.fromWithUrl(share, url);
  }

  @Get()
  @RequirePermissions('plan:share')
  @ApiOperation({
    summary: "List a plan's share links, newest-first (Planner + Org Admin). No tokens.",
  })
  @ApiOkResponse({ type: ShareResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<ShareResponseDto[]> {
    const shares = await this.service.list(principal, orgSlug, planId);
    return shares.map((share) => ShareResponseDto.from(share));
  }

  @Delete(':shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('plan:share')
  @ApiOperation({
    summary: 'Revoke a share link (Planner + Org Admin). Immediate and idempotent.',
    description:
      'The link stops resolving on the next guest request. Revoking a dead/unknown link is a no-op 204.',
  })
  @ApiNoContentResponse()
  async revoke(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Param('shareId', ParseUuidPipe) shareId: string,
  ): Promise<void> {
    await this.service.revoke(principal, orgSlug, planId, shareId);
  }
}
