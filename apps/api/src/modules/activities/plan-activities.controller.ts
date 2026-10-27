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
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
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
import { ORG_SCOPED_JSON_LIMIT } from '../../common/http/body-limits';

import { ActivitiesService } from './activities.service';
import { ActivityCodesService } from './activity-codes.service';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { BulkDeleteActivitiesDto } from './dto/bulk-delete-activities.dto';
import { BulkDeleteResultDto } from './dto/bulk-delete-result.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityCodesDto } from './dto/update-activity-codes.dto';
import { UpdateParentsDto } from './dto/update-parents.dto';
import { UpdatePlacementsDto } from './dto/update-placements.dto';
import { UpdatePositionsDto } from './dto/update-positions.dto';

/** The four `@ArrayMaxSize(2000)` batch bodies; the cap is set in `app-setup.ts` (TECH_DEBT #407). */
const BATCH_BODY_TOO_LARGE = `The JSON body exceeds the ${ORG_SCOPED_JSON_LIMIT} cap for organisation routes (2,000 rows fit).`;

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
  constructor(
    private readonly service: ActivitiesService,
    private readonly codes: ActivityCodesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List a plan's activities (cursor-paginated)." })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
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
      'ADR-0053 §2) or an archived one (CALENDAR_ARCHIVED, ADR-0053 §4). A `swimlaneId` is refused ' +
      'while the plan’s swimlanes come from its WBS (SWIMLANE_SOURCE_IS_WBS).',
  })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, or a `swimlaneId` is unknown, deleted or another ' +
      'plan’s (or organisation’s), never told apart.',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
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
  @ApiPayloadTooLargeResponse({ description: BATCH_BODY_TOO_LARGE })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, a position names an id not in the plan, or a ' +
      '`swimlane.swimlaneId` is unknown, deleted or another plan’s.',
  })
  @ApiConflictResponse({
    description: 'A stale version (or a row changed elsewhere) — the whole batch is rejected.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The same activity id appears more than once in the batch; a `swimlane` lane while the plan ' +
      'has no swimlane source (SWIMLANE_SOURCE_NONE); or a named `swimlane.swimlaneId` while the ' +
      'swimlanes come from the WBS (SWIMLANE_SOURCE_IS_WBS).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async updatePositions(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
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
  @ApiPayloadTooLargeResponse({ description: BATCH_BODY_TOO_LARGE })
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
    @Param('planId', ParseUUIDPipe) planId: string,
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

  @Patch('codes')
  @ApiOperation({
    summary: 'Set or clear code values on activities (Planner or Org Admin). All-or-nothing.',
    description:
      'An ordinary activity write (p6-activity-codes): it needs `activity:update` and the pen, ' +
      'bumps each named activity’s `version` and is recorded in its history as a `code:<codeTypeId>` ' +
      'item. A row states only the types it means to touch (`codeValueId: null` clears one); every ' +
      'other type the activity carries is left alone. Not a schedule input, so computed dates are ' +
      'not made stale. Returns the written activities at their fresh versions, with `codes`.',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  @ApiPayloadTooLargeResponse({ description: BATCH_BODY_TOO_LARGE })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, a row names an activity id not in the plan, or a ' +
      'row names a code type or value that is unknown, deleted (a type) or another plan’s.',
  })
  @ApiConflictResponse({
    description: 'A stale version — the whole batch is rejected and nothing changes.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The same activity (DUPLICATE_CODES_ACTIVITY_ID) or the same code type within an activity ' +
      '(DUPLICATE_CODES_TYPE_ID) appears twice, a value belongs to another code type of the plan ' +
      '(CODE_VALUE_WRONG_TYPE) or was deleted (CODE_VALUE_DELETED), or a field fails validation.',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async updateCodes(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdateActivityCodesDto,
  ): Promise<ActivityResponseDto[]> {
    const { items, canReadCost } = await this.codes.write(principal, orgSlug, planId, dto);
    const decorated = await this.service.decorateWithCodes(items);
    return decorated.map((activity) => ActivityResponseDto.from(activity, canReadCost));
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
  @ApiPayloadTooLargeResponse({ description: BATCH_BODY_TOO_LARGE })
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
    @Param('planId', ParseUUIDPipe) planId: string,
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
      'name/code now taken by an active sibling (NAME_TAKEN / CODE_TAKEN), or a calendar an activity in ' +
      'the batch uses is deleted (CALENDAR_DELETED; restore that calendar first)' +
      ' or one now belongs to another project (CALENDAR_OTHER_PROJECT; make it organisation-wide). PARENT_DELETED takes precedence.',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async restoreBatch(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
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
  @ApiPayloadTooLargeResponse({ description: BATCH_BODY_TOO_LARGE })
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
    @Param('planId', ParseUUIDPipe) planId: string,
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
