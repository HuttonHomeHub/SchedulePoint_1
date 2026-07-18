import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiConflictResponse,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ActivityStepsService } from './activity-steps.service';
import { ReplaceStepsDto } from './dto/replace-steps.dto';
import { ActivityStepResponseDto } from './dto/step-response.dto';

/**
 * Activity-steps HTTP surface (M7 rung 5, ADR-0044 §2) — the weighted progress checklist as a
 * sub-resource of an activity. Both routes hang off `activities/:activityId/steps` and resolve the org
 * from `:orgSlug` against the caller's memberships (404 for non-members). Reading is open to any member
 * (`activity:read`); the bulk PUT replaces the whole list and is an activity-write (`activity:update`,
 * Planner + Org Admin — no new permission). The PUT is optimistic-locked on the parent activity's
 * `version`; an out-of-range `percentComplete` (N28) or negative `weight` is a 422.
 */
@ApiTags('activity-steps')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or activity not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug', version: '1' })
export class ActivityStepsController {
  constructor(private readonly service: ActivityStepsService) {}

  @Get('activities/:activityId/steps')
  @ApiOperation({
    summary: "List an activity's weighted progress steps (seq-ordered).",
    description:
      'Returns the full active step list for one activity — deliberately unpaginated (bounded by the ' +
      'handful of rows a checklist carries, the same bounded-list exemption the per-activity assignment ' +
      'list uses). Steps drive the activity’s PHYSICAL %-complete (weighted mean, steps win over the ' +
      'manual field; ADR-0044 §33).',
  })
  @ApiOkResponse({ type: ActivityStepResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
  ): Promise<ActivityStepResponseDto[]> {
    const items = await this.service.list(principal, orgSlug, activityId);
    return items.map((row) => ActivityStepResponseDto.from(row));
  }

  @Put('activities/:activityId/steps')
  @ApiOperation({
    summary: "Replace an activity's steps in bulk (Planner or Org Admin; optimistic locking).",
    description:
      'Bulk-replace (Q3 default): the body is the full desired ordered list — retained positions are ' +
      'updated in place, new ones appended, and removed ones soft-deleted, all in one transaction. The ' +
      'server assigns `seq` contiguously (never client input) and bumps the parent activity’s `version`. ' +
      'An out-of-range `percentComplete` (N28, 422) or negative `weight` is rejected at the boundary; a ' +
      'stale activity `version` is a 409 (nothing changes). An empty list clears the steps (the manual ' +
      'physical % then stands).',
  })
  @ApiOkResponse({ type: ActivityStepResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'A step percentComplete outside 0–100 (N28) or a negative weight.',
  })
  @ApiConflictResponse({
    description: 'The parent activity was changed elsewhere (stale version).',
  })
  async replace(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: ReplaceStepsDto,
  ): Promise<ActivityStepResponseDto[]> {
    const items = await this.service.replace(principal, orgSlug, activityId, dto);
    return items.map((row) => ActivityStepResponseDto.from(row));
  }
}
