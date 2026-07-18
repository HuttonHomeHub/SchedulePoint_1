import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
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
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CrossPlanDependenciesService } from './cross-plan-dependencies.service';
import { CreateCrossPlanDependencyDto } from './dto/create-cross-plan-dependency.dto';
import { CrossPlanDependencyResponseDto } from './dto/cross-plan-dependency-response.dto';

/**
 * Org-scoped cross-plan dependency routes (ADR-0045): create a LIVE inter-project link, get one by
 * id, and delete (soft). Create is NOT nested under a plan — the edge spans two plans, and both
 * plan ids are derived server-side from the two endpoint activities. Every route resolves the org
 * from `:orgSlug` against the caller's memberships and scopes the link to that org (anti-IDOR).
 * The per-plan and per-activity link LISTS live on the nested controllers. A deleted link has no
 * restore endpoint in this slice.
 */
@ApiTags('cross-plan-dependencies')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description:
    'Organisation, an endpoint activity, or the cross-plan dependency not found (or not a member).',
})
@Controller({ path: 'organizations/:orgSlug/cross-plan-dependencies', version: '1' })
export class CrossPlanDependenciesController {
  constructor(private readonly service: CrossPlanDependenciesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Link two activities across plans (Planner or Org Admin; dependency:link_cross_plan).',
  })
  @ApiCreatedResponse({ type: CrossPlanDependencyResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'A cross-plan link must join activities in two different plans.',
  })
  @ApiConflictResponse({
    description:
      'A cross-plan link of this type already exists between these activities, or it would form a plan-level cycle.',
  })
  @ApiLockedResponse('You do not hold the successor plan edit-lock (when enforcement is on).')
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Body() dto: CreateCrossPlanDependencyDto,
  ): Promise<CrossPlanDependencyResponseDto> {
    return CrossPlanDependencyResponseDto.from(await this.service.create(principal, orgSlug, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a cross-plan dependency by id.' })
  @ApiOkResponse({ type: CrossPlanDependencyResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<CrossPlanDependencyResponseDto> {
    return CrossPlanDependencyResponseDto.from(await this.service.get(principal, orgSlug, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a cross-plan dependency (soft).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiLockedResponse('You do not hold the successor plan edit-lock (when enforcement is on).')
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, id);
  }
}
