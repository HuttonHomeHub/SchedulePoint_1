import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ActivitiesService } from './activities.service';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdatePositionsDto } from './dto/update-positions.dto';

/**
 * Activity routes nested under a parent plan: create and list. The parent plan
 * is resolved active and in-org first (404 otherwise), so a foreign or
 * soft-deleted plan is indistinguishable from a missing one. Item operations
 * (get/update/delete/restore/progress) live on the flat ActivitiesController.
 */
@ApiTags('activities')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or plan not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/activities', version: '1' })
export class PlanActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: "List a plan's activities (cursor-paginated)." })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ActivityResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, planId, query);
    return new Paginated(
      items.map((activity) => ActivityResponseDto.from(activity)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an activity under a plan (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'An activity with this name or code already exists.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: CreateActivityDto,
  ): Promise<ActivityResponseDto> {
    return ActivityResponseDto.from(await this.service.create(principal, orgSlug, planId, dto));
  }

  @Patch('positions')
  @ApiOperation({
    summary: 'Batch-move activities to new lanes (Planner or Org Admin). All-or-nothing.',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, or a position names an id not in the plan.',
  })
  @ApiConflictResponse({
    description: 'A stale version (or a row changed elsewhere) — the whole batch is rejected.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The same activity id appears more than once in the batch.',
  })
  async updatePositions(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: UpdatePositionsDto,
  ): Promise<ActivityResponseDto[]> {
    const moved = await this.service.updatePositions(principal, orgSlug, planId, dto);
    return moved.map((activity) => ActivityResponseDto.from(activity));
  }
}
