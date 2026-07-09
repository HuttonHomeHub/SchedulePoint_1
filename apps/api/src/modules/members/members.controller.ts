import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
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
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { MemberResponseDto } from './dto/member-response.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { MembersService } from './members.service';

/**
 * Organisation membership management, nested under the organisation scope. All
 * routes resolve the org from `:orgSlug` against the caller's memberships (404
 * for non-members). Reading is open to any member; changing roles and removing
 * members are Org Admin only.
 */
@ApiTags('members')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or member not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/members', version: '1' })
export class MembersController {
  constructor(private readonly service: MembersService) {}

  // No coarse @RequirePermissions gate: every member holds `member:read`, and
  // gating on it would 403 a signed-in non-member before the scope resolver can
  // 404 — leaking less consistently than the anti-enumeration 404. The service
  // resolves the org scope (404 for non-members) and checks `member:read`.
  @Get()
  @ApiOperation({ summary: "List an organisation's members (cursor-paginated)." })
  @ApiOkResponse({ type: MemberResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<MemberResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, query);
    return new Paginated(
      items.map((member) => MemberResponseDto.from(member)),
      meta,
    );
  }

  @Patch(':memberId')
  @ApiOperation({ summary: "Change a member's role (Org Admin; optimistic locking)." })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version, or would remove the last Org Admin.' })
  async changeRole(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('memberId', ParseUuidPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.service.changeRole(principal, orgSlug, memberId, dto));
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the organisation (Org Admin; soft delete).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Would remove the last Org Admin.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('memberId', ParseUuidPipe) memberId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, memberId);
  }
}
