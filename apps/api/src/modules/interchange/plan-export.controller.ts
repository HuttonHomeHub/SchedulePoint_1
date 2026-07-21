import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ExportService } from './export.service';

/**
 * The schedule-interchange EXPORT surface, nested under a plan (ADR-0050 M4a). The read-only mirror of the
 * project-nested import controller: it resolves the org from `:orgSlug` against the caller's memberships
 * (404 for non-members) and the target plan from `:planId` within that org (anti-IDOR), and requires
 * `interchange:export` (every member — export reads on-screen-readable schedule data).
 *
 * `GET export/:format` streams the serialised file. For M4b `format` is `"xer"` (P6) or `"mspdi"` (MS
 * Project XML); any other value → 422. The interchange report — what the exporter approximated or dropped
 * (out-of-scope WBS / constraints / progress / resources) — rides alongside the download in the
 * `X-Interchange-Report` response header as compact JSON (CQ-2: the report is bundled WITH the download, not
 * a blocking pre-confirm), so a single request yields both the bytes and the honest account of what did and
 * did not come across.
 */
@ApiTags('interchange')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or plan not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/plans/:planId/interchange', version: '1' })
export class PlanExportController {
  constructor(private readonly service: ExportService) {}

  @Get('export/:format')
  @RequirePermissions('interchange:export')
  @ApiOperation({
    summary: 'Export a plan as a foreign schedule file (any member; P6 XER or MS Project MSPDI).',
    description:
      'Serialises the plan’s core network (activities, dependencies, calendars) to the requested format ' +
      'and streams it as an attachment. Out-of-scope data (WBS summaries, constraints, progress, resources) ' +
      'is reported — not silently omitted — in the `X-Interchange-Report` response header (compact JSON). ' +
      'M4b supports `xer` (P6) and `mspdi` (MS Project XML); any other format is a 422.',
  })
  @ApiParam({
    name: 'format',
    enum: ['xer', 'mspdi'],
    description: 'The export format: `xer` (Primavera P6) or `mspdi` (MS Project XML).',
  })
  @ApiProduces('application/octet-stream', 'application/xml')
  @ApiOkResponse({
    description:
      'The serialised schedule file (binary), with the interchange report in X-Interchange-Report.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description: 'Unsupported format, or the plan is too large to export (EXPORT_TOO_LARGE).',
  })
  async export(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Param('format') format: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { bytes, filename, contentType, report } = await this.service.exportPlan(
      principal,
      orgSlug,
      planId,
      format.toLowerCase(),
    );

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // The interchange report bundled with the download (CQ-2). Compact JSON with no raw newlines, so it is a
    // valid single-line header value; the browser client reads it back and parses it. Exposed via CORS
    // (app-setup) so a cross-origin fetch can see it.
    res.setHeader('X-Interchange-Report', JSON.stringify(report));

    return new StreamableFile(Buffer.from(bytes), {
      type: contentType,
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
