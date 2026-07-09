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
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { PlansService } from './plans.service';

/**
 * Plan routes nested under a parent project: create and list. The parent
 * project is resolved active and in-org first (404 otherwise), so a foreign or
 * soft-deleted project is indistinguishable from a missing one. Item operations
 * (get/update/delete/restore) live on the flat PlansController.
 */
@ApiTags('plans')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or project not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/projects/:projectId/plans', version: '1' })
export class ProjectPlansController {
  constructor(private readonly service: PlansService) {}

  @Get()
  @ApiOperation({ summary: "List a project's plans (cursor-paginated)." })
  @ApiOkResponse({ type: PlanResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<PlanResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, projectId, query);
    return new Paginated(
      items.map((plan) => PlanResponseDto.from(plan)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a plan under a project (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'A plan with this name already exists for this project.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Body() dto: CreatePlanDto,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.from(await this.service.create(principal, orgSlug, projectId, dto));
  }
}
