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
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CrossPlanDependenciesService } from './cross-plan-dependencies.service';
import { CrossPlanDependencyResponseDto } from './dto/cross-plan-dependency-response.dto';

/**
 * An activity's cross-plan dependencies in BOTH directions — the LIVE inter-project links incident
 * to it, whether it is the predecessor (an edge into a downstream plan) or the successor (an edge
 * from an upstream plan). The activity is resolved active and in-org first (404 otherwise).
 * Read-only; create/get/delete live on the org-scoped controller.
 */
@ApiTags('cross-plan-dependencies')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or activity not found (or not a member).' })
@Controller({
  path: 'organizations/:orgSlug/activities/:activityId/cross-plan-dependencies',
  version: '1',
})
export class ActivityCrossPlanDependenciesController {
  constructor(private readonly service: CrossPlanDependenciesService) {}

  @Get()
  @ApiOperation({
    summary: "List an activity's cross-plan dependencies, both directions (cursor-paginated).",
  })
  @ApiOkResponse({ type: CrossPlanDependencyResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<CrossPlanDependencyResponseDto>> {
    const { items, meta } = await this.service.listByActivity(
      principal,
      orgSlug,
      activityId,
      query,
    );
    return new Paginated(
      items.map((link) => CrossPlanDependencyResponseDto.from(link)),
      meta,
    );
  }
}
