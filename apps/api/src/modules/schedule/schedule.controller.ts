import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { FloatPathsQueryDto } from './dto/float-paths-query.dto';
import { PlanFloatPathsDto } from './dto/plan-float-paths.dto';
import { PlanScheduleSummaryDto } from './dto/plan-schedule-summary.dto';
import { ScheduleService } from './schedule.service';

/**
 * CPM schedule routes for a plan (ADR-0022). `recalculate` runs the engine and
 * persists the computed columns (Planner or Org Admin); it is a synchronous
 * action, not a resource creation, so it returns `200` with the plan summary.
 */
@ApiTags('schedule')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or plan not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/schedule', version: '1' })
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate a plan’s CPM schedule (Planner or Org Admin).' })
  @ApiOkResponse({ type: PlanScheduleSummaryDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'The plan has no start date (PLAN_START_REQUIRED).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async recalculate(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanScheduleSummaryDto> {
    return PlanScheduleSummaryDto.from(await this.service.recalculate(principal, orgSlug, planId));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Read a plan’s computed schedule summary (any member).' })
  @ApiOkResponse({ type: PlanScheduleSummaryDto })
  async summary(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanScheduleSummaryDto> {
    return PlanScheduleSummaryDto.from(await this.service.summary(principal, orgSlug, planId));
  }

  @Get('float-paths')
  @ApiOperation({
    summary: 'Ranked contiguous float paths into a target activity (any member, ADR-0035 §19).',
  })
  @ApiOkResponse({ type: PlanFloatPathsDto })
  @ApiNotFoundResponse({
    description: 'Plan not found, or the target activity is not in the plan.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The plan has no start date (PLAN_START_REQUIRED).',
  })
  async floatPaths(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: FloatPathsQueryDto,
  ): Promise<PlanFloatPathsDto> {
    return PlanFloatPathsDto.from(
      await this.service.floatPaths(principal, orgSlug, planId, query.target, query.maxPaths),
    );
  }
}
