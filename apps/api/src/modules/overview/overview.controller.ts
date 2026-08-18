import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { OverviewResponseDto } from './dto/overview-response.dto';
import { OverviewService } from './overview.service';

/**
 * The organisation overview — what a member sees on the screen every sign-in already
 * lands on.
 *
 * **One endpoint, not one per section.** All three sections resolve the same organisation,
 * check the same permission and read the same database in the same request, so partial
 * failure is not a real mode: per-section error isolation buys nothing and costs a second
 * round trip on the coldest path in the product.
 */
@ApiTags('overview')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiForbiddenResponse({ description: 'A member without the hierarchy-read permission.' })
@ApiNotFoundResponse({ description: 'Organisation not found (or the caller is not a member).' })
@Controller({ path: 'organizations/:orgSlug/overview', version: '1' })
export class OverviewController {
  constructor(private readonly service: OverviewService) {}

  @Get()
  @ApiOperation({
    summary: "An organisation's landing screen: where the work is, and what is waiting.",
    description:
      'Not paginated and carries no `meta` — nothing to add. Sections the caller may not ' +
      'read are omitted from the response rather than sent empty, so an absence is a fact ' +
      'about the reader and never a zero that leaks the existence of an answer.',
  })
  @ApiOkResponse({ type: OverviewResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
  ): Promise<OverviewResponseDto> {
    // A bare DTO; the response interceptor wraps it as `{ data }` (docs/API.md).
    return this.service.get(principal, orgSlug);
  }
}
