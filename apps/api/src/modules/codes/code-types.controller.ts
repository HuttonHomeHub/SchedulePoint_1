import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { OptionalVersionDto } from '../../common/dto/optional-version.dto';
import { Paginated } from '../../common/dto/paginated';

import { CodeTypesService } from './code-types.service';
import { CodeValuesService } from './code-values.service';
import { CodeTypeResponseDto, CodeValueResponseDto } from './dto/code-response.dto';
import { CodeTypeListQueryDto } from './dto/code-type-list-query.dto';
import { CreateCodeTypeDto } from './dto/create-code-type.dto';
import { CreateCodeValueDto } from './dto/create-code-value.dto';
import { ReorderCodeTypesDto, ReorderCodeValuesDto } from './dto/reorder-codes.dto';
import { UpdateCodeTypeDto } from './dto/update-code-type.dto';

const PEN = 'You do not hold the plan edit-lock (when enforcement is on).';

/**
 * Code type routes nested under a parent plan (p6-activity-codes spec §4.7). The plan is resolved
 * active and in-org first, so a foreign or deleted plan is indistinguishable from a missing one; a
 * type is looked up inside that plan, so another plan's or tenant's id is a 404 as well. Every write
 * needs Planner or Org Admin and the pen. The values of a type are created and ordered here (they are
 * addressed through their type) and edited, deleted and restored on `code-values`.
 */
@ApiTags('codes')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, plan or code type not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/code-types', version: '1' })
export class CodeTypesController {
  constructor(
    private readonly types: CodeTypesService,
    private readonly values: CodeValuesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List a plan's code types, each with its values, in display order. code:read.",
    description:
      'Cursor-paginated over the types (at most 100 per plan, so one page by default); each page ' +
      'carries its types’ values in one query. `?include=deleted` adds deleted types and values for ' +
      'a restore and needs `code:restore`.',
  })
  @ApiOkResponse({ type: CodeTypeResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: '`include=deleted` without `code:restore`.' })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: CodeTypeListQueryDto,
  ): Promise<Paginated<CodeTypeResponseDto>> {
    const { items, meta } = await this.types.list(principal, orgSlug, planId, query);
    return new Paginated(
      items.map(({ type, values }) => CodeTypeResponseDto.from(type, values)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a code type on a plan (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: CodeTypeResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'Another live type has this name, ignoring case (CODE_TYPE_NAME_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({
    description: 'An invalid name, or the plan already has 100 code types (CODE_TYPE_LIMIT).',
  })
  @ApiLockedResponse(PEN)
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: CreateCodeTypeDto,
  ): Promise<CodeTypeResponseDto> {
    return CodeTypeResponseDto.from(await this.types.create(principal, orgSlug, planId, dto));
  }

  // Declared before `:codeTypeId` so the literal `order` is never parsed as an id.
  @Patch('order')
  @ApiOperation({
    summary: 'Reorder the plan’s code types (Planner or Org Admin). All-or-nothing.',
    description:
      'Names every live type exactly once with its version. Returns the new order. A short or ' +
      'stale set is 409 `STALE_VERSION`; an id that is unknown or another plan’s is 404.',
  })
  @ApiOkResponse({ type: CodeTypeResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'A stale version, or the set of types changed (STALE_VERSION).',
  })
  @ApiUnprocessableEntityResponse({ description: 'A type appears more than once.' })
  @ApiLockedResponse(PEN)
  async reorder(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: ReorderCodeTypesDto,
  ): Promise<CodeTypeResponseDto[]> {
    const rows = await this.types.reorder(principal, orgSlug, planId, dto);
    return rows.map((type) => CodeTypeResponseDto.from(type));
  }

  @Patch(':codeTypeId')
  @ApiOperation({ summary: 'Rename a code type (Planner or Org Admin).' })
  @ApiOkResponse({ type: CodeTypeResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'A stale version (STALE_VERSION) or a name already taken (CODE_TYPE_NAME_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({ description: 'An invalid name.' })
  @ApiLockedResponse(PEN)
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeTypeId', ParseUUIDPipe) codeTypeId: string,
    @Body() dto: UpdateCodeTypeDto,
  ): Promise<CodeTypeResponseDto> {
    return CodeTypeResponseDto.from(
      await this.types.update(principal, orgSlug, planId, codeTypeId, dto),
    );
  }

  @Delete(':codeTypeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a code type with its values (soft; Planner or Org Admin).',
    description:
      'Its live values go in the same batch; the activities that carry them read as having no ' +
      'value, and a restore brings both back. Refused while the plan’s swimlanes are made from this ' +
      'type. **Optional `?version=N`**: when sent, a stale one is refused with 409 `STALE_VERSION`. ' +
      'Audited as `code_type.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description:
      'A `version` was sent and the type is at another (STALE_VERSION), or the swimlanes are made ' +
      'from this type (CODE_TYPE_IS_SWIMLANE_SOURCE; choose another swimlane source first).',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({ description: 'An invalid `version` query parameter.' })
  @ApiLockedResponse(PEN)
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeTypeId', ParseUUIDPipe) codeTypeId: string,
    @Query() query: OptionalVersionDto,
    @RequestContext() context: RequestContext,
  ): Promise<void> {
    await this.types.remove(principal, orgSlug, planId, codeTypeId, context, query.version);
  }

  @Post(':codeTypeId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a deleted code type with the values its delete took (Planner or Org Admin).',
    description:
      'Audited as `code_type.restored`. A value deleted on its own before the type stays deleted. ' +
      'Restoring a live type is a no-op.',
  })
  @ApiOkResponse({ type: CodeTypeResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description:
      'The plan is still deleted (PARENT_DELETED), or the name was taken meanwhile ' +
      '(CODE_TYPE_NAME_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The plan already has 100 code types (CODE_TYPE_LIMIT).',
  })
  @ApiLockedResponse(PEN)
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeTypeId', ParseUUIDPipe) codeTypeId: string,
    @RequestContext() context: RequestContext,
  ): Promise<CodeTypeResponseDto> {
    const { type, values } = await this.types.restore(
      principal,
      orgSlug,
      planId,
      codeTypeId,
      context,
    );
    return CodeTypeResponseDto.from(type, values);
  }

  @Post(':codeTypeId/values')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a value to a code type, last in order (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: CodeValueResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'Another live value has this short code, ignoring case (CODE_VALUE_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'An invalid short code or description, or the type already has 1,000 values (CODE_VALUE_LIMIT).',
  })
  @ApiLockedResponse(PEN)
  async createValue(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeTypeId', ParseUUIDPipe) codeTypeId: string,
    @Body() dto: CreateCodeValueDto,
  ): Promise<CodeValueResponseDto> {
    return CodeValueResponseDto.from(
      await this.values.create(principal, orgSlug, planId, codeTypeId, dto),
    );
  }

  @Patch(':codeTypeId/values/order')
  @ApiOperation({
    summary: 'Reorder a code type’s values (Planner or Org Admin). All-or-nothing.',
    description:
      'Names every live value of the type exactly once with its version. Returns the new order. A ' +
      'short or stale set is 409 `STALE_VERSION`; an id that is unknown or another type’s is 404.',
  })
  @ApiOkResponse({ type: CodeValueResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'A stale version, or the set of values changed (STALE_VERSION).',
  })
  @ApiUnprocessableEntityResponse({ description: 'A value appears more than once.' })
  @ApiLockedResponse(PEN)
  async reorderValues(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeTypeId', ParseUUIDPipe) codeTypeId: string,
    @Body() dto: ReorderCodeValuesDto,
  ): Promise<CodeValueResponseDto[]> {
    const rows = await this.values.reorder(principal, orgSlug, planId, codeTypeId, dto);
    return rows.map((value) => CodeValueResponseDto.from(value));
  }
}
