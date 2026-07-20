import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { InterchangeCommitResponseDto } from './dto/interchange-commit-response.dto';
import { InterchangeReportResponseDto } from './dto/interchange-report-response.dto';
import { INTERCHANGE_FILE_FIELD, INTERCHANGE_MAX_UPLOAD_BYTES } from './interchange.constants';
import { InterchangeService } from './interchange.service';
import type { UploadedInterchangeFile } from './uploaded-file';

/**
 * Schedule-interchange HTTP surface, nested under a project (ADR-0050, C2). Every route resolves the org
 * from `:orgSlug` against the caller's memberships (404 for non-members) and the target project from
 * `:projectId` within that org (anti-IDOR), and requires `interchange:import` (Planner + Org Admin).
 *
 * `dry-run` accepts a multipart file upload and returns the pre-commit report (counts, approximations,
 * repairs, drops) — it is a synchronous, **read-only** parse (no plan is created), so it returns `200`.
 * `commit` re-accepts the same multipart upload and, in one transaction, creates the plan (calendars +
 * activities + dependencies) via the existing services and recalculates it, returning `201 { planId,
 * report }`. The byte cap is enforced at this boundary by the multipart interceptor (→ 413) before the
 * file is fully buffered.
 */
@ApiTags('interchange')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or project not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/projects/:projectId/interchange', version: '1' })
export class InterchangeController {
  constructor(private readonly service: InterchangeService) {}

  @Post('dry-run')
  @RequirePermissions('interchange:import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor(INTERCHANGE_FILE_FIELD, {
      // Hard boundary cap: reject an oversize upload mid-stream (→ 413) before buffering it all.
      limits: { fileSize: INTERCHANGE_MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'The schedule file to parse (a P6 `.xer` for M1), sent as the `file` multipart field.',
    schema: {
      type: 'object',
      required: [INTERCHANGE_FILE_FIELD],
      properties: {
        [INTERCHANGE_FILE_FIELD]: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Dry-run: parse an uploaded schedule file and return the interchange report (Planner or Org Admin).',
    description:
      'Parses the file and returns what would map, be approximated, repaired, or dropped — WITHOUT ' +
      'creating anything. A parseable file (even one needing repairs) returns 200 with the report; an ' +
      'unrecognised/malformed file is a 422 rejection and an oversize file a 413.',
  })
  @ApiOkResponse({ type: InterchangeReportResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiPayloadTooLargeResponse({ description: 'The uploaded file exceeds the maximum size.' })
  @ApiUnprocessableEntityResponse({
    description: 'No file, or the file is not a recognised/parseable schedule file.',
  })
  async dryRun(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @UploadedFile() file: UploadedInterchangeFile | undefined,
  ): Promise<InterchangeReportResponseDto> {
    return InterchangeReportResponseDto.from(
      await this.service.dryRun(principal, orgSlug, projectId, file),
    );
  }

  @Post('commit')
  @RequirePermissions('interchange:import')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor(INTERCHANGE_FILE_FIELD, {
      // Same hard boundary cap as dry-run: reject an oversize upload mid-stream (→ 413).
      limits: { fileSize: INTERCHANGE_MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'The schedule file to import (a P6 `.xer` for M1), sent as the `file` multipart field.',
    schema: {
      type: 'object',
      required: [INTERCHANGE_FILE_FIELD],
      properties: {
        [INTERCHANGE_FILE_FIELD]: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Commit: import an uploaded schedule file as a new plan and recalculate it (Planner or Org Admin).',
    description:
      'Re-parses the uploaded file (deterministic — the graph equals the reviewed dry-run) and, in one ' +
      'transaction, creates the plan (calendars + activities + dependencies) via the existing services, ' +
      'then recalculates it. Returns 201 with the new plan id and the interchange report. Any failure ' +
      '(parse, a persistence rejection, or recalculation) leaves nothing created. 422 unrecognised/' +
      'malformed/no file · 413 oversize.',
  })
  @ApiCreatedResponse({ type: InterchangeCommitResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiPayloadTooLargeResponse({ description: 'The uploaded file exceeds the maximum size.' })
  @ApiUnprocessableEntityResponse({
    description: 'No file, or the file is not a recognised/parseable schedule file.',
  })
  async commit(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @UploadedFile() file: UploadedInterchangeFile | undefined,
  ): Promise<InterchangeCommitResponseDto> {
    const { planId, report } = await this.service.commit(principal, orgSlug, projectId, file);
    return InterchangeCommitResponseDto.from(planId, report);
  }
}
