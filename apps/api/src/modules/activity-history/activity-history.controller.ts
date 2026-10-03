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
import type { ActivityHistoryEntry, ActivityHistoryPageMeta } from '@repo/types';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ActivityHistoryService } from './activity-history.service';
import { ActivityHistoryEntryResponseDto } from './dto/activity-history-entry-response.dto';
import { ListActivityHistoryQueryDto } from './dto/list-activity-history-query.dto';

/**
 * An activity's change history (ADR-0174) — who changed its fields, links and resource assignments,
 * and when. Read-only: nothing here writes, and no client can create an entry. Every organisation
 * member can read it (`activity:read`); money is withheld from anyone without `cost:read`. There is
 * deliberately no route on the External-Guest surface.
 */
@ApiTags('activity history')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or activity not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/activities/:activityId/history', version: '1' })
export class ActivityHistoryController {
  constructor(private readonly service: ActivityHistoryService) {}

  @Get()
  @ApiOperation({
    summary:
      "List an activity's change history, newest first (cursor-paginated). activity:read. " +
      'Working memory, not an audit trail: entries merge and can disappear when undone.',
  })
  @ApiOkResponse({ type: ActivityHistoryEntryResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({ description: 'A malformed cursor or page size.' })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Query() query: ListActivityHistoryQueryDto,
  ): Promise<Paginated<ActivityHistoryEntry, ActivityHistoryPageMeta>> {
    const { items, meta } = await this.service.list(principal, orgSlug, activityId, query);
    return new Paginated(items, meta);
  }
}
