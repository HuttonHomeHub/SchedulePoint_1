import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
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
      properties: {
        name: { type: 'string' },
        message: { type: 'string' },
        stack: { type: 'string' },
        componentStack: { type: 'string' },
        routeId: { type: 'string' },
        boundary: { type: 'string', enum: ['route', 'app'] },
        webVersion: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: CrashReportResponseDto })
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
