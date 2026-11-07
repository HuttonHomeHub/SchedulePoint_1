import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CrashReportService } from './crash-report.service';
import { CrashReportResponseDto } from './dto/crash-report-response.dto';

/**
 * Where a signed-in browser reports a screen crash (browser crash reports M1-T2, ADR-0211).
 *
 * **Authenticated, and deliberately not `@Public()`.** The CSP sink is anonymous because a browser
 * posts a violation report without credentials; our own code sends this one with the session
 * cookie, so that reason does not apply. A session keeps the `@Public()` list short (ADR-0051),
 * makes an anonymous flood need an account first, and stores nothing for people who never signed
 * in. What it costs is that a crash on a sign-in or guest-share screen is not seen (spec Q1).
 *
 * **No organisation scope and no role check**, like `GET /api/v1/me`: no field of the `Principal`
 * is read, and none is stored. **Not audited** (`BROWSER_TELEMETRY`).
 *
 * **Always 200, whatever the body.** The caller is a crashed screen that cannot act on a 422, and
 * one rejected field would lose the whole report, so an unusable body answers `reference: null`.
 * A body the parser cannot read at all never reaches this handler: the exception filter answers 400.
 */
@ApiTags('crash-reports')
@ApiCookieAuth('schedulepoint.session_token')
@Controller({ path: 'crash-reports', version: '1' })
export class CrashReportsController {
  constructor(private readonly reports: CrashReportService) {}

  @Post()
  // One handler, so the bound is 10 a minute per address: a person meets a handful of crashes in a
  // session (the browser sends at most 3 per page load), and anything sustained is not that.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Report a screen crash from the browser (signed-in people only).' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      // Lengths are what is READ, not what is stored: longer values are accepted and cleaned down to
      // the column caps (300 / 4,000 / 2,000), and the whole body is held to 64 KB.
      properties: {
        name: { type: 'string', maxLength: 64 },
        message: { type: 'string', maxLength: 4_000 },
        stack: { type: 'string', maxLength: 60_000 },
        componentStack: { type: 'string', maxLength: 60_000 },
        routeId: { type: 'string', maxLength: 200 },
        boundary: { type: 'string', enum: ['route', 'app'] },
        webVersion: { type: 'string', maxLength: 32 },
      },
    },
  })
  @ApiOkResponse({
    type: CrashReportResponseDto,
    description:
      'Any body that parses answers 200, and 200 does not mean stored: `reference` is null when the ' +
      'body was unusable, the table is full for new kinds of crash, or the write failed.',
  })
  @ApiBadRequestResponse({ description: 'The body is not parseable JSON (answered before auth).' })
  @ApiPayloadTooLargeResponse({ description: 'The body is larger than 64 KB.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiTooManyRequestsResponse({ description: 'More than 10 reports a minute from this address.' })
  submit(
    // `unknown`, not a DTO: a `class-validator` DTO would reject rather than drop. The normaliser
    // never throws and returns null for anything it cannot use.
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<CrashReportResponseDto> {
    return this.reports.record(body, userAgent);
  }
}
