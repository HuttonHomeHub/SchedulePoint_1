import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator';

import { normaliseCspReports } from './csp-report-body';
import { CspReportService } from './csp-report.service';

/**
 * Where browsers post Content-Security-Policy violations (staff console M4, ADR-0086).
 *
 * **Unauthenticated by necessity, not by choice**: a browser sends a violation report without
 * credentials and there is no mechanism to give it any. It is the second entry on the `@Public()`
 * list ADR-0051 said should stay short, and it is throttled, capped and deduplicated for that
 * reason.
 *
 * **It always answers 204, whatever arrives.** Two reasons, and the second is the load-bearing one:
 * there is no caller to inform — a browser posting a report does not read the response and cannot
 * act on it — and an endpoint that returned errors would tell an attacker which probes were
 * interesting. Malformed bodies are dropped silently rather than rejected loudly.
 *
 * Hidden from the OpenAPI document: it is a browser-to-server mechanism defined by a web
 * specification, not part of this product's API, and listing it would invite a client to call it.
 */
@ApiExcludeController()
@Controller({ path: 'csp-report', version: '1' })
export class CspReportController {
  constructor(private readonly reports: CspReportService) {}

  @Post()
  @Public()
  // Tighter than the global 100/60 s. A real browser sends a handful of reports for a genuinely
  // broken page and then stops, because the Reporting API itself coalesces; anything sustained
  // above this is not a browser reporting on our policy. The `@Throttle` on `/api/v1/share/*` is
  // the precedent (ADR-0051), for the same reason: an unauthenticated route needs its own ceiling.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(204)
  async submit(@Body() body: unknown): Promise<void> {
    // `normaliseCspReports` never throws and returns `[]` for anything it does not recognise, so
    // this needs no try/catch of its own and no DTO validation — a `class-validator` DTO here would
    // reject rather than drop, which is the behaviour this endpoint must not have.
    await this.reports.record(normaliseCspReports(body));
  }
}
