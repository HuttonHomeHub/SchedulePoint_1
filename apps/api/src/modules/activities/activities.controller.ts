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
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ActivitiesService } from './activities.service';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { UpdateActivityProgressDto } from './dto/update-activity-progress.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

/**
 * Flat activity routes addressed by id: get, update (definition), delete (soft),
 * and restore. Every route resolves the org from `:orgSlug` against the caller's
 * memberships and scopes the activity to that org (anti-IDOR). Create and list
 * are nested under the parent plan (PlanActivitiesController); progress updates
 * (Contributor-capable) get their own endpoint (B2).
 */
@ApiTags('activities')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or activity not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/activities', version: '1' })
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get(':activityId')
  @ApiOperation({ summary: 'Get an activity by id.' })
  @ApiOkResponse({ type: ActivityResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
  ): Promise<ActivityResponseDto> {
    return ActivityResponseDto.from(await this.service.get(principal, orgSlug, activityId));
  }

  @Patch(':activityId')
  @ApiOperation({
    summary: "Update an activity's definition (Planner or Org Admin; optimistic locking).",
  })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version, or a name/code collision within the plan.' })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: UpdateActivityDto,
  ): Promise<ActivityResponseDto> {
    return ActivityResponseDto.from(await this.service.update(principal, orgSlug, activityId, dto));
  }

  @Patch(':activityId/progress')
  @ApiOperation({
    summary: 'Report progress: status / % / actual dates (Contributor upward).',
    description:
      'Moves progress only, not logic — requires activity:update_progress, which a ' +
      'Contributor has but a Viewer does not. Status is derived from the numbers.',
  })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version — refresh and retry.' })
  async updateProgress(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: UpdateActivityProgressDto,
  ): Promise<ActivityResponseDto> {
    return ActivityResponseDto.from(
      await this.service.updateProgress(principal, orgSlug, activityId, dto),
    );
  }

  @Delete(':activityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an activity (soft).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, activityId);
  }

  @Post(':activityId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted activity.' })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'The parent plan is still deleted (restore it first).' })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
  ): Promise<ActivityResponseDto> {
    return ActivityResponseDto.from(await this.service.restore(principal, orgSlug, activityId));
  }
}
