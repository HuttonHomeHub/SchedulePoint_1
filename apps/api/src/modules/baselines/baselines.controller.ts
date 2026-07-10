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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { BaselinesService } from './baselines.service';
import { BaselineDetailResponseDto, BaselineResponseDto } from './dto/baseline-response.dto';
import { CreateBaselineDto } from './dto/create-baseline.dto';

/**
 * Baselines HTTP surface, nested under a plan (ADR-0025). Every route resolves the org
 * from `:orgSlug` against the caller's memberships (404 for non-members) and the plan
 * from `:planId` within that org. Reading is open to any member; capturing a baseline is
 * Planner + Org Admin. Activate/delete land in Task B2; variance in Task C1.
 */
@ApiTags('baselines')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, plan or baseline not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/baselines', version: '1' })
export class BaselinesController {
  constructor(private readonly service: BaselinesService) {}

  @Get()
  @ApiOperation({ summary: "List a plan's baselines (cursor-paginated, newest first)." })
  @ApiOkResponse({ type: BaselineResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<BaselineResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, planId, query);
    return new Paginated(
      items.map((b) => BaselineResponseDto.from(b, b.activityCount)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Capture a baseline of the plan's current schedule (Planner or Org Admin).",
  })
  @ApiCreatedResponse({ type: BaselineResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description:
      'The plan has no computed schedule to freeze (SCHEDULE_NOT_CALCULATED), or an empty name.',
  })
  @ApiConflictResponse({
    description: 'A baseline with this name already exists (DUPLICATE_BASELINE).',
  })
  async capture(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: CreateBaselineDto,
  ): Promise<BaselineResponseDto> {
    const { baseline, activityCount } = await this.service.capture(principal, orgSlug, planId, dto);
    return BaselineResponseDto.from(baseline, activityCount);
  }

  @Get(':baselineId')
  @ApiOperation({ summary: 'Get a baseline and its frozen activity snapshots by id.' })
  @ApiOkResponse({ type: BaselineDetailResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Param('baselineId', ParseUuidPipe) baselineId: string,
  ): Promise<BaselineDetailResponseDto> {
    return BaselineDetailResponseDto.fromDetail(
      await this.service.get(principal, orgSlug, planId, baselineId),
    );
  }
}
