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
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ActivitiesService } from './activities.service';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { BulkDeleteActivitiesDto } from './dto/bulk-delete-activities.dto';
import { BulkDeleteResultDto } from './dto/bulk-delete-result.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateParentsDto } from './dto/update-parents.dto';
import { UpdatePlacementsDto } from './dto/update-placements.dto';
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
    const { items, meta, canReadCost } = await this.service.list(principal, orgSlug, planId, query);
    return new Paginated(
      items.map((activity) => ActivityResponseDto.from(activity, canReadCost)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an activity under a plan (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'An activity with this name or code already exists.' })
  @ApiUnprocessableEntityResponse({
    description:
      'A field-level validation failure, or `calendarId` names a calendar this activity’s project ' +
      'may not use — a PROJECT calendar owned by another project (CALENDAR_WRONG_SCOPE, ' +
      'ADR-0053 §2) or an archived one (CALENDAR_ARCHIVED, ADR-0053 §4).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: CreateActivityDto,
  ): Promise<ActivityResponseDto> {
    const { activity, canReadCost } = await this.service.create(principal, orgSlug, planId, dto);
    return ActivityResponseDto.from(activity, canReadCost);
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
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async updatePositions(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: UpdatePositionsDto,
  ): Promise<ActivityResponseDto[]> {
    const { items, canReadCost } = await this.service.updatePositions(
      principal,
      orgSlug,
      planId,
      dto,
    );
    return items.map((activity) => ActivityResponseDto.from(activity, canReadCost));
  }

  @Patch('placements')
  @ApiOperation({
    summary:
      'Batch-move activities in time, and optionally lane (Planner or Org Admin). All-or-nothing.',
    description:
      'Structural: constraints and `visualStart` feed the CPM engine, so a committed batch leaves ' +
      'the plan’s computed dates stale until the next recalculation. Every placement field is ' +
      'required but nullable — an omitted field is a validation error, never a silent clear — and ' +
      'a null `laneIndex` means the lane is unchanged. Carries placement fields only: a bulk move ' +
      'cannot reach a definition field.',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, or a row names an activity id not in the plan.',
  })
  @ApiConflictResponse({
    description: 'A stale version — the whole batch is rejected and nothing moves.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The same activity id appears more than once (DUPLICATE_PLACEMENT_ID), a WBS_SUMMARY is in ' +
      'the batch (SUMMARY_NOT_BULK_ELIGIBLE), or a field fails validation.',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async updatePlacements(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: UpdatePlacementsDto,
  ): Promise<ActivityResponseDto[]> {
    const { items, canReadCost } = await this.service.updatePlacements(
      principal,
      orgSlug,
      planId,
      dto,
    );
    return items.map((activity) => ActivityResponseDto.from(activity, canReadCost));
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete several activities as one act (Planner or Org Admin). All-or-nothing.',
    description:
      'Every swept row shares ONE `deleteBatchId`, returned here, so the whole gesture undoes ' +
      'through restore-batch with its ids and its dependencies intact. Leaf-only: a WBS_SUMMARY is ' +
      'refused, because deleting one removes its entire subtree. Structural — computed dates are ' +
      'stale until the next recalculation.',
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description: 'The organisation or plan is not found, or a row names an id not in the plan.',
  })
  @ApiConflictResponse({
    description: 'A stale version — the whole batch is rejected and nothing is deleted.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The same activity id appears more than once (DUPLICATE_DELETE_ID), or a WBS_SUMMARY is in ' +
      'the batch (SUMMARY_NOT_BULK_ELIGIBLE).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async bulkDelete(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: BulkDeleteActivitiesDto,
    @RequestContext() context: RequestContext,
  ): Promise<BulkDeleteResultDto> {
    return BulkDeleteResultDto.from(
      await this.service.bulkDelete(principal, orgSlug, planId, dto, context),
    );
  }

  @Post('restore-batch/:batchId')
  // 200, not Nest's POST default of 201: this restores rows that already exist, by their own ids,
  // and returns them — the `POST :id/<verb>` sub-action rule `docs/API.md` states and the sibling
  // single-activity `restore` already follows. It shipped as 201 with `@ApiOkResponse` beside it
  // and `docs/API.md` saying 200, so the generated OpenAPI was wrong; the e2e had baked the wrong
  // status in rather than catching it. Found by the API review over this epic's diff.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore every activity soft-deleted under one batch id (Planner or Org Admin).',
    description:
      'Id-stable: the activities come back with their original ids, so the dependencies between ' +
      'them come back too. That is the difference between undoing a bulk delete and re-creating ' +
      'the work with different logic. Structural — computed dates are stale until the next ' +
      'recalculation.',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, or no soft-deleted activity in this plan carries ' +
      'that batch id.',
  })
  @ApiConflictResponse({
    description:
      'The batch cannot be restored as it stands — a still-deleted ancestor (PARENT_DELETED) or a ' +
      'name/code now taken by an active sibling (NAME_TAKEN / CODE_TAKEN).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async restoreBatch(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Param('batchId', ParseUuidPipe) batchId: string,
    @RequestContext() context: RequestContext,
  ): Promise<ActivityResponseDto[]> {
    const { items, canReadCost } = await this.service.restoreDeleteBatch(
      principal,
      orgSlug,
      planId,
      batchId,
      context,
    );
    return items.map((activity) => ActivityResponseDto.from(activity, canReadCost));
  }

  @Patch('parents')
  @ApiOperation({
    summary:
      'Batch-file activities under a WBS summary, or back to the top level (Planner or Org Admin). ' +
      'All-or-nothing.',
    description:
      'Structural: `parentId` feeds the engine’s WBS rollup, so a committed batch leaves the ' +
      'plan’s computed dates stale until the next recalculation. Validated against the RESULTING ' +
      'tree, so a batch that is cycle-free row by row but cyclic as a whole is still rejected.',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, or a row names an activity or parent id not in the plan.',
  })
  @ApiConflictResponse({
    description:
      'A stale version, or the batch would make the WBS tree cyclic (PARENT_CYCLE) — either way ' +
      'the whole batch is rejected and nothing moves.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The same activity id appears more than once (DUPLICATE_PARENT_ID), an activity is its own ' +
      'parent (PARENT_CYCLE), or the chosen parent is not a WBS_SUMMARY (PARENT_NOT_SUMMARY).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async updateParents(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() dto: UpdateParentsDto,
    @RequestContext() context: RequestContext,
  ): Promise<ActivityResponseDto[]> {
    const { items, canReadCost } = await this.service.updateParents(
      principal,
      orgSlug,
      planId,
      dto,
      context,
    );
    return items.map((activity) => ActivityResponseDto.from(activity, canReadCost));
  }
}
