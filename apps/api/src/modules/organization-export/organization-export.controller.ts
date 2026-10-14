import { Controller, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';

import { OrganizationExportService } from './organization-export.service';

/**
 * The export's budget: **3 requests / 10 minutes**, per client address and (the throttler keys per
 * handler) for this route alone. Sized for a person retrying a download that stopped, not for a
 * loop: one export is the heaviest read the API serves, so the global 100 / 60 s would let a
 * single session start a hundred of them a minute (the single-flight lock refuses the overlap, but
 * not the queue of retries behind it). Tighten before widening, and say why in the commit.
 */
const ORGANIZATION_EXPORT_THROTTLE = { default: { ttl: 600_000, limit: 3 } } as const;

/**
 * The whole-organisation export (ADR-0194): one ZIP of JSON and CSV holding everything the
 * organisation holds, Org Admin only, streamed on the request and stored nowhere.
 *
 * **A POST, though it returns a file and creates nothing.** It writes an audit row, and a safe
 * method must be side-effect-free; more concretely Better Auth's session cookie is `SameSite=Lax`,
 * which a browser sends on a cross-site top-level GET and not on a cross-site POST, so a GET could be
 * started from another site and would spend the admin's throttle and fill the audit log.
 *
 * The handler takes `@Res()` and writes the response itself: a stream has no envelope, and once the
 * first byte is out neither a status nor an error body can be changed. The service sends nothing
 * until its refusals (404, 403, 409) are behind it.
 */
@ApiTags('organizations')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation not found (or the caller is not a member).' })
@Controller({ path: 'organizations/:orgSlug/export', version: '1' })
export class OrganizationExportController {
  constructor(private readonly service: OrganizationExportService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle(ORGANIZATION_EXPORT_THROTTLE)
  @RequirePermissions('organization:export')
  @ApiOperation({
    summary: 'Export everything the organisation holds as one ZIP of JSON and CSV (Org Admin).',
    description:
      'Streams `schedulepoint-export-<org>-<UTC stamp>.zip`: a `json/` and a `csv/` file per kind of ' +
      'record, a plain-English `README.txt`, and a `manifest.json` (written last) listing every file ' +
      'with its row count, size and SHA-256. One consistent snapshot taken when the request starts; ' +
      'recycle-bin items, removed members and withdrawn invitations are included with their ' +
      '`deletedAt`. Credentials, the audit log’s IP addresses and browser details, and other ' +
      'organisations’ people are never included. The format is `docs/ORGANISATION_EXPORT_FORMAT.md`. ' +
      'Nothing is stored: the file is generated on the request. Takes no body. There is no ' +
      '`Content-Length`, and **once the first byte is sent an error is a destroyed connection, not an ' +
      'error envelope** — a client must treat a truncated download as a failure. Every export that ' +
      'starts is recorded in the audit log as `privacy.exported`.',
  })
  @ApiParam({ name: 'orgSlug', description: 'The organisation’s URL slug.' })
  @ApiProduces('application/zip')
  @ApiOkResponse({
    description: 'The ZIP archive (binary), as an attachment.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiForbiddenResponse({ description: 'Only an Org Admin may export the organisation.' })
  @ApiConflictResponse({
    description:
      'Another export of this organisation is running (`details.reason`: EXPORT_IN_PROGRESS).',
  })
  @ApiTooManyRequestsResponse({ description: 'More than 3 exports in 10 minutes.' })
  async export(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Res() res: Response,
    @RequestContext() context: RequestContext,
  ): Promise<void> {
    await this.service.export(principal, orgSlug, res, context);
  }
}
