import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { PlanResponseDto } from './dto/plan-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

/**
 * Flat plan routes addressed by id: get, update, delete (soft), and restore.
 * Every route resolves the org from `:orgSlug` against the caller's memberships
 * and scopes the plan to that org (anti-IDOR). Create and list are nested under
 * the parent project (ProjectPlansController).
 */
@ApiTags('plans')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or plan not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans', version: '1' })
export class PlansController {
  constructor(private readonly service: PlansService) {}

  @Get(':planId')
  @ApiOperation({ summary: 'Get a plan by id.' })
  @ApiOkResponse({ type: PlanResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.from(await this.service.get(principal, orgSlug, planId));
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Update a plan (Planner or Org Admin; optimistic locking).' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version, or a name collision within the project.' })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.from(await this.service.update(principal, orgSlug, planId, dto));
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a plan (soft).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, planId);
  }

  @Post(':planId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted plan.' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'The parent project is still deleted (restore it first).' })
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.from(await this.service.restore(principal, orgSlug, planId));
  }
}
