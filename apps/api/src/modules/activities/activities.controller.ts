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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { ProgressWarning } from '@repo/types';

import type { Principal } from '../../common/auth/principal';
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { ResourceEnvelope } from '../../common/dto/resource-envelope';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ActivitiesService } from './activities.service';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { DeleteActivityResultDto } from './dto/delete-activity-result.dto';
import { DissolveSummaryResponseDto } from './dto/dissolve-summary-response.dto';
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
    const { activity, canReadCost } = await this.service.get(principal, orgSlug, activityId);
    return ActivityResponseDto.from(activity, canReadCost);
  }

  @Patch(':activityId')
  @ApiOperation({
    summary: "Update an activity's definition (Planner or Org Admin; optimistic locking).",
    description:
      'Duration-type side effect (ADR-0040): editing `durationDays` on an activity that has a ' +
      'driving resource assignment carrying a `unitsPerHour` recomputes and persists that ' +
      'assignment’s units/rate in the SAME transaction (the `Units = Duration × Units/Time` triad) ' +
      '— bumping the assignment’s `version`. The response body is the activity only; a client that ' +
      'also holds the driving assignment should refetch it (its version has moved).',
  })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description:
      'Stale version (of the activity OR its driving assignment when a duration edit recomputes it), ' +
      'or a name/code collision within the plan.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'A field-level validation failure, or `calendarId` names a calendar this activity’s project ' +
      'may not use — a PROJECT calendar owned by another project (CALENDAR_WRONG_SCOPE, ' +
      'ADR-0053 §2) or an archived one (CALENDAR_ARCHIVED, ADR-0053 §4).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: UpdateActivityDto,
  ): Promise<ActivityResponseDto> {
    const { activity, canReadCost } = await this.service.update(
      principal,
      orgSlug,
      activityId,
      dto,
    );
    return ActivityResponseDto.from(activity, canReadCost);
  }

  @Patch(':activityId/progress')
  @ApiOperation({
    summary: 'Report progress: % / actual dates / remaining / suspend-resume (Contributor upward).',
    description:
      'Moves progress only, not logic — requires activity:update_progress, which a ' +
      'Contributor has but a Viewer does not. Status is derived from the numbers. Accepts ' +
      'percent complete, actual start/finish, an explicit remaining duration, and suspend/resume ' +
      'dates (M2, ADR-0035). Actuals are validated against the plan data date (N07) and ' +
      'inconsistent completeness is repaired (N08/N18).',
  })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version — refresh and retry.' })
  async updateProgress(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: UpdateActivityProgressDto,
  ): Promise<
    ActivityResponseDto | ResourceEnvelope<ActivityResponseDto, { warnings: ProgressWarning[] }>
  > {
    const { activity, warnings, canReadCost } = await this.service.updateProgress(
      principal,
      orgSlug,
      activityId,
      dto,
    );
    const data = ActivityResponseDto.from(activity, canReadCost);
    // Only carry `meta` when a repair actually happened, so an ordinary progress report keeps the
    // bare `{ data }` shape (M2, ADR-0035 §6).
    return warnings.length > 0 ? new ResourceEnvelope(data, { warnings }) : data;
  }

  @Delete(':activityId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an activity (soft).',
    description:
      'Cascades to the whole subtree when the activity is a `WBS_SUMMARY` (ADR-0038). Returns the ' +
      '`deleteBatchId` the cascade assigned, which is what `POST …/activities/restore-batch` ' +
      'takes — **the reason this answers 200 rather than 204**: the id already existed server-' +
      'side, but a bodiless response meant a client could not restore what it had just deleted, ' +
      'so undoing a band copy had no redo (`docs/TECH_DEBT.md` #113). Additive for existing ' +
      'callers, which ignore the body.',
  })
  @ApiOkResponse({ type: DeleteActivityResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @RequestContext() context: RequestContext,
  ): Promise<DeleteActivityResultDto> {
    return this.service.remove(principal, orgSlug, activityId, context);
  }

  @Post(':activityId/dissolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dissolve a WBS summary — remove the grouping, keep the work.',
    description:
      'Promotes the summary’s direct children to its own parent (or the top level), then ' +
      'soft-deletes the now-childless summary, in one transaction. The deliberate opposite of ' +
      'DELETE, which cascades to the whole subtree. Restoring a dissolved summary brings back the ' +
      'summary ALONE — its former children stay where they were promoted to. ' +
      '**This write mutates sibling rows**: every promoted child’s `parentId` changes and its ' +
      'optimistic-lock `version` is incremented, so a client holding a cached copy of one would ' +
      'otherwise 409 on its next save with no explanation. The response returns those rows at ' +
      'their new versions — the caller cannot derive them, since it did not know which activities ' +
      'were children and the count alone would not carry the versions.',
  })
  @ApiOkResponse({ type: DissolveSummaryResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'The activity is not a WBS summary (NOT_A_SUMMARY).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async dissolve(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @RequestContext() context: RequestContext,
  ): Promise<DissolveSummaryResponseDto> {
    const { promoted } = await this.service.dissolveSummary(
      principal,
      orgSlug,
      activityId,
      context,
    );
    return { promoted };
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
    @RequestContext() context: RequestContext,
  ): Promise<ActivityResponseDto> {
    const { activity, canReadCost } = await this.service.restore(
      principal,
      orgSlug,
      activityId,
      context,
    );
    return ActivityResponseDto.from(activity, canReadCost);
  }
}
