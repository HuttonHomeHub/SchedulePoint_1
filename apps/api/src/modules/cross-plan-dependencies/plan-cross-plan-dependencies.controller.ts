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
 * A plan's INCOMING cross-plan dependencies — the LIVE inter-project links whose successor is in
 * this plan (the edge's home, ADR-0045 CQ-2), i.e. the upstream dates this plan is bounded by. The
 * plan is resolved active and in-org first (404 otherwise). Read-only; create/get/delete live on
 * the org-scoped controller.
 */
@ApiTags('cross-plan-dependencies')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or plan not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/cross-plan-dependencies', version: '1' })
export class PlanCrossPlanDependenciesController {
  constructor(private readonly service: CrossPlanDependenciesService) {}

  @Get()
  @ApiOperation({ summary: "List a plan's incoming cross-plan dependencies (cursor-paginated)." })
  @ApiOkResponse({ type: CrossPlanDependencyResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<CrossPlanDependencyResponseDto>> {
    const { items, meta } = await this.service.listByPlan(principal, orgSlug, planId, query);
    return new Paginated(
      items.map((link) => CrossPlanDependencyResponseDto.from(link)),
      meta,
    );
  }
}
