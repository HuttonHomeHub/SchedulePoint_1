import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { DependenciesService } from './dependencies.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { DependencyResponseDto } from './dto/dependency-response.dto';

/**
 * Dependency routes nested under a parent plan: list the plan's whole logic
 * network, and create a link between two of its activities. The parent plan (and
 * both endpoint activities) are resolved active and in-org first, so a foreign or
 * soft-deleted plan/activity is indistinguishable from a missing one.
 */
@ApiTags('dependencies')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, plan, or an endpoint activity not found (or not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/dependencies', version: '1' })
export class PlanDependenciesController {
  constructor(private readonly service: DependenciesService) {}

  @Get()
  @ApiOperation({ summary: "List a plan's dependencies (cursor-paginated)." })
  @ApiOkResponse({ type: DependencyResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<DependencyResponseDto>> {
    const { items, meta } = await this.service.listByPlan(principal, orgSlug, planId, query);
    return new Paginated(
      items.map((dependency) => DependencyResponseDto.from(dependency)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Link two activities in a plan (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: DependencyResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'A dependency cannot link an activity to itself.',
  })
  @ApiConflictResponse({
    description:
      'A dependency of this type already exists between these activities, or it would form a cycle.',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: CreateDependencyDto,
  ): Promise<DependencyResponseDto> {
    return DependencyResponseDto.from(await this.service.create(principal, orgSlug, planId, dto));
  }
}
