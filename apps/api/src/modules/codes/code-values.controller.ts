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

import { CodeValuesService } from './code-values.service';
import { CodeValueResponseDto, ResolvedCodeValueDto } from './dto/code-response.dto';
import { ResolveCodeValuesQueryDto } from './dto/resolve-code-values-query.dto';
import { UpdateCodeValueDto } from './dto/update-code-value.dto';

const PEN = 'You do not hold the plan edit-lock (when enforcement is on).';

/**
 * Code value routes nested under a parent plan (p6-activity-codes spec §4.7): edit, delete and
 * restore a value by its own id, and name a set of them by id. A value has no plan of its own, so it is found through a type of the
 * plan in the path; another plan's or tenant's value id is a 404. Creating and ordering values is on
 * `code-types/:codeTypeId/values`.
 */
@ApiTags('codes')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, plan or code value not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/code-values', version: '1' })
export class CodeValuesController {
  constructor(private readonly service: CodeValuesService) {}

  @Get()
  @ApiOperation({
    summary: 'Name code values by id, including deleted ones. code:read.',
    description:
      'Send 1–100 ids, repeated: `?id=a&id=b` (a comma-joined list is 422). Not paged: the input ' +
      'bounds the answer. Each value carries its type’s `codeTypeName` and `codeTypeDeletedAt`. ' +
      'Deleted values and values of deleted types are named, because the caller already holds the ' +
      'id (an activity’s `codes`, a history line); it cannot list what is deleted. An id that is ' +
      'unknown, another plan’s or another organisation’s is absent from `data`, never an error.',
  })
  @ApiOkResponse({ type: ResolvedCodeValueDto, isArray: true })
  @ApiUnprocessableEntityResponse({
    description: 'No ids, more than 100, or a value that is not a UUID.',
  })
  async resolve(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: ResolveCodeValuesQueryDto,
  ): Promise<ResolvedCodeValueDto[]> {
    const rows = await this.service.resolve(principal, orgSlug, planId, query.id);
    return rows.map((row) => ResolvedCodeValueDto.fromResolved(row));
  }

  @Patch(':codeValueId')
  @ApiOperation({
    summary: 'Edit a code value’s short code or description (Planner or Org Admin).',
    description: 'A partial update: send the fields to change. `description: null` clears it.',
  })
  @ApiOkResponse({ type: CodeValueResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description:
      'A stale version (STALE_VERSION) or a short code already taken (CODE_VALUE_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({ description: 'An invalid field, or nothing to change.' })
  @ApiLockedResponse(PEN)
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeValueId', ParseUUIDPipe) codeValueId: string,
    @Body() dto: UpdateCodeValueDto,
  ): Promise<CodeValueResponseDto> {
    return CodeValueResponseDto.from(
      await this.service.update(principal, orgSlug, planId, codeValueId, dto),
    );
  }

  @Delete(':codeValueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a code value (soft; Planner or Org Admin).',
    description:
      'Activities that carry it keep their assignment but read as having no value; restoring the ' +
      'value brings them back. **Optional `?version=N`**: when sent, a stale one is refused with 409 ' +
      '`STALE_VERSION`. Audited as `code_value.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'A `version` was sent and the value is at another.' })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({ description: 'An invalid `version` query parameter.' })
  @ApiLockedResponse(PEN)
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeValueId', ParseUUIDPipe) codeValueId: string,
    @Query() query: OptionalVersionDto,
    @RequestContext() context: RequestContext,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, planId, codeValueId, context, query.version);
  }

  @Post(':codeValueId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a deleted code value (Planner or Org Admin).',
    description: 'Audited as `code_value.restored`. Restoring a live value is a no-op.',
  })
  @ApiOkResponse({ type: CodeValueResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description:
      'The plan or the code type is still deleted (PARENT_DELETED; restore it first), or the ' +
      'short code was taken meanwhile (CODE_VALUE_TAKEN).',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The type already has 1,000 values (CODE_VALUE_LIMIT).',
  })
  @ApiLockedResponse(PEN)
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('codeValueId', ParseUUIDPipe) codeValueId: string,
    @RequestContext() context: RequestContext,
  ): Promise<CodeValueResponseDto> {
    return CodeValueResponseDto.from(
      await this.service.restore(principal, orgSlug, planId, codeValueId, context),
    );
  }
}
