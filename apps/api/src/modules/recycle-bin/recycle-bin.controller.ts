import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
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

import { DeletedItemResponseDto } from './dto/deleted-item-response.dto';
import { RecycleBinService } from './recycle-bin.service';

/**
 * The organisation recycle bin: soft-deleted clients, projects and plans in one
 * deletion-time-ordered list. Reading is a hierarchy read (any member). Restore
 * is not here — it stays on each entity's own writer-only `.../{id}/restore`
 * route, which the client picks by the item's `kind`.
 */
@ApiTags('recycle-bin')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation not found (or the caller is not a member).' })
@Controller({ path: 'organizations/:orgSlug/deleted', version: '1' })
export class RecycleBinController {
  constructor(private readonly service: RecycleBinService) {}

  @Get()
  @ApiOperation({
    summary: "List an organisation's recently-deleted clients, projects and plans.",
    description: 'Newest-deleted first, cursor-paginated. The `order` param is not used.',
  })
  @ApiOkResponse({ type: DeletedItemResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<DeletedItemResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, query);
    return new Paginated(items, meta);
  }
}
