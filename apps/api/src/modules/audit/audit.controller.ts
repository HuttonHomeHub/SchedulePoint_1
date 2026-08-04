import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
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

import { AuditReadService } from './audit-read.service';
import { AuditEventResponseDto } from './dto/audit-event-response.dto';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';
import { ListOrganizationAuditEventsQueryDto } from './dto/list-organization-audit-events-query.dto';

/**
 * An organisation's audit log (ADR-0072) — Org Admin only.
 *
 * No coarse `@RequirePermissions` gate, for the reason `MembersController` gives: gating here
 * would 403 a signed-in non-member before the scope resolver can 404, which leaks more than the
 * anti-enumeration 404 does. The service resolves the org (404 for non-members) and then checks
 * `audit:read`.
 */
@ApiTags('audit')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation not found (or the caller is not a member).' })
@Controller({ path: 'organizations/:orgSlug/audit-events', version: '1' })
export class OrganizationAuditController {
  constructor(private readonly service: AuditReadService) {}

  @Get()
  @ApiOperation({
    summary: "List an organisation's audit events, newest first (Org Admin; cursor-paginated).",
  })
  @ApiOkResponse({ type: AuditEventResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Missing audit:read (Org Admin only).' })
  @ApiUnprocessableEntityResponse({
    description:
      'An unknown action or outcome, an `auth.*` action (those rows carry no organisation), more ' +
      'than 20 actions, a malformed instant, or `to` before `from`. A filter value that cannot ' +
      'match is refused rather than answered with an empty page.',
  })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: ListOrganizationAuditEventsQueryDto,
  ): Promise<Paginated<AuditEventResponseDto>> {
    const { items, meta } = await this.service.listForOrganization(principal, orgSlug, query);
    return new Paginated(
      items.map((row) => AuditEventResponseDto.from(row)),
      meta,
    );
  }
}

/**
 * The caller's own audit events (ADR-0072) — every organisation they belong to, plus the org-less
 * authentication rows.
 *
 * **The route takes no user id.** Not an optional one, not a defaulted one: the actor comes from
 * the session and there is nothing in the path or query a caller could change to read someone
 * else's history. That is why this route needs no permission — anti-IDOR by construction rather
 * than by a guard someone could later forget to apply.
 */
@ApiTags('audit')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@Controller({ path: 'me/audit-events', version: '1' })
export class SelfAuditController {
  constructor(private readonly service: AuditReadService) {}

  @Get()
  @ApiOperation({
    summary: 'List your own audit events, newest first (no permission required; cursor-paginated).',
  })
  @ApiOkResponse({ type: AuditEventResponseDto, isArray: true })
  @ApiUnprocessableEntityResponse({
    description:
      'An unknown action or outcome, more than 20 actions, a malformed instant, or `to` before ' +
      '`from`. A filter value that cannot match is refused rather than answered with an empty page.',
  })
  async list(
    @CurrentUser() principal: Principal,
    @Query() query: ListAuditEventsQueryDto,
  ): Promise<Paginated<AuditEventResponseDto>> {
    const { items, meta } = await this.service.listForSelf(principal, query);
    return new Paginated(
      items.map((row) => AuditEventResponseDto.from(row)),
      meta,
    );
  }
}
