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
  ParseUUIDPipe,
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';

import { PlanResponseDto, planResponse } from './dto/plan-response.dto';
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
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<PlanResponseDto> {
    return planResponse(principal, await this.service.get(principal, orgSlug, planId));
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Update a plan (Planner or Org Admin; optimistic locking).' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version, or a name collision within the project.' })
  @ApiUnprocessableEntityResponse({
    description:
      'A field-level validation failure, or `swimlaneSource` and `swimlaneWbsLevel` disagree ' +
      '(SWIMLANE_LEVEL_MISMATCH): WBS needs a level of 1 to 3, any other source has none.',
  })
  @ApiLockedResponse(
    'Sending `swimlaneSource` or `swimlaneWbsLevel` needs the plan edit-lock (when enforcement is on).',
  )
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
    @RequestContext() context: RequestContext,
  ): Promise<PlanResponseDto> {
    return planResponse(
      principal,
      await this.service.update(principal, orgSlug, planId, dto, context),
    );
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a plan (soft).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @RequestContext() context: RequestContext,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, planId, context);
  }

  @Post(':planId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted plan.' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description:
      'The parent project is still deleted (PARENT_DELETED), or the plan or one of its activities uses ' +
      'a calendar that is deleted (CALENDAR_DELETED; restore that calendar first)' +
      ' or one now belongs to another project (CALENDAR_OTHER_PROJECT; make it organisation-wide). PARENT_DELETED takes precedence.',
  })
  @ApiNotFoundResponse({
    description:
      'Organisation or plan not found (or the caller is not a member), including when the retention ' +
      'expiry permanently removed the plan in the same instant. Gone: do not retry.',
  })
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @RequestContext() context: RequestContext,
  ): Promise<PlanResponseDto> {
    return planResponse(principal, await this.service.restore(principal, orgSlug, planId, context));
  }
}
