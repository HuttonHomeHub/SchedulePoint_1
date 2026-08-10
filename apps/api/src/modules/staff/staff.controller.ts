import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { StaffPrincipal } from '../../common/auth/staff-principal';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { AuditService } from '../audit/audit.service';

import { StaffAccountsQueryDto } from './dto/staff-accounts-query.dto';
import { CspReportRowDto } from './dto/staff-csp-reports.dto';
import { StaffHealthDto } from './dto/staff-health.dto';
import { StaffIdentityDto } from './dto/staff-identity.dto';
import {
  StaffAccountsDto,
  StaffActivityRowDto,
  StaffInstallationDto,
} from './dto/staff-installation.dto';
import { IdentityProbe } from './identity-probe.decorator';
import { StaffHealthService } from './staff-health.service';
import { StaffGuard } from './staff.guard';

/**
 * The staff console's API surface (ADR-0086). **M2 ships exactly one route, and ships dark**: no
 * web route, no navigation entry, no screen. `GET /api/v1/staff/me` is reachable by `curl` with a
 * session cookie and nothing else.
 *
 * Declaring that rather than implying it is ADR-0081 §1 — a milestone claiming user-facing
 * capability names its entry point or declares itself dark. This one is dark; M3 is the first with
 * a surface, and its flag-on journey lands with it.
 *
 * **Every route here is audited, including reads** (ADR-0086 D5), pinned by the route census's
 * seventh assertion rather than by remembering. On this surface the read IS the privileged act, so
 * the ordinary "a read earns no row" rule would leave the most privileged surface in the product
 * recording nothing.
 */
@ApiTags('staff')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({
  description: 'No session at all. The global authentication guard answers before this controller.',
})
// **The defining behaviour of this surface, and it was undeclared.** Every non-staff caller — an
// authenticated member, an Org Admin, an allowlisted address that has not verified — gets the same
// 404 an unmapped route gives, never 403, so the console is no oracle for which addresses are
// staff. The generated spec said these routes were open and always succeeded, which is the
// opposite of what they do.
@ApiNotFoundResponse({
  description:
    'Uniform refusal for every non-staff caller. Never 403: a 403 would tell a prober their guess ' +
    'was interesting.',
})
@ApiTooManyRequestsResponse({ description: 'Throttled tighter than the global limit (30/60 s).' })
@Controller({ path: 'staff', version: '1' })
// Tighter than the global 100/60 s — the ADR-0051 precedent this ADR invokes and did not apply.
// Two reasons: this is the most privileged surface in the product, and every successful hit writes
// a durable audit row, so a compromised staff session could otherwise flood the one table that
// cannot be pruned. Thirty a minute is far above any human use of a console with two panels.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@UseGuards(StaffGuard)
export class StaffController {
  constructor(
    private readonly audit: AuditService,
    private readonly health: StaffHealthService,
  ) {}

  @Get('me')
  @IdentityProbe()
  @ApiOperation({
    summary: 'Who am I, as staff',
    description:
      'Returns the calling staff identity. Any non-staff caller — including an authenticated ' +
      'member and an Org Admin — receives a uniform 404, never 403, so this is not an oracle for ' +
      'whether an address is staff.',
  })
  @ApiOkResponse({ type: StaffIdentityDto })
  async me(
    @CurrentStaff() staff: StaffPrincipal,
    @RequestContext() context: RequestContext,
  ): Promise<StaffIdentityDto> {
    // `record`, NOT `recordBestEffort`, and the choice is the milestone's argument applied to
    // itself. The auth family is best-effort because refusing a sign-in when the audit table is
    // unavailable turns a logging fault into an outage for everyone. Here the trade inverts: the
    // entire justification for moving staff operations off `psql` is that they become observable,
    // so a staff read that could not be recorded is precisely the thing this replaces. There is no
    // transaction to roll back and nothing has happened yet, so failing closed costs one 500 to one
    // staff member and preserves the property the console exists for.
    await this.audit.record({
      action: 'staff.session_started',
      outcome: 'SUCCESS',
      actorType: 'STAFF',
      actorUserId: staff.userId,
      actorLabel: staff.email,
      subjectType: 'staff_console',
      // No `organizationId`: a staff act belongs to no organisation, and `audit_events` makes that
      // column nullable precisely so an installation-wide act can be recorded honestly rather than
      // attributed to whichever organisation happened to be nearby.
      ...context,
    });

    // The bare DTO: `TransformInterceptor` wraps every response in the standard `{ data }`
    // envelope, so returning one here would double-wrap it. Caught by the e2e, which is the only
    // place the real interceptor runs — a controller unit test sees whatever the method returns.
    return {
      userId: staff.userId,
      email: staff.email,
      dualHatted: await this.health.isDualHatted(staff.userId),
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Is mail working?',
    description:
      'Mail-failure counts and the most recent failures, plus whether a transport, alerting and a ' +
      'heartbeat are configured at all. Zero failures with no transport configured is NOT health.',
  })
  @ApiOkResponse({ type: StaffHealthDto })
  async healthPanel(
    @CurrentStaff() staff: StaffPrincipal,
    @RequestContext() context: RequestContext,
  ): Promise<StaffHealthDto> {
    // A read, and audited — see the class docblock. The row names the panel, never its contents:
    // this response carries customer addresses, and the audit table refuses DELETE.
    await this.audit.record({
      action: 'staff.panel_read',
      outcome: 'SUCCESS',
      actorType: 'STAFF',
      actorUserId: staff.userId,
      actorLabel: staff.email,
      subjectType: 'staff_panel',
      subjectLabel: 'health',
      ...context,
    });

    return await this.health.read();
  }

  @Get('csp-reports')
  @ApiOperation({
    summary: 'What the Content-Security-Policy is blocking',
    description:
      'Distinct violations reported by browsers, most recent activity first. An EMPTY list is not ' +
      'proof the policy is clean — end-to-end delivery from a browser is unverified ' +
      '(docs/TECH_DEBT.md #117), so silence here means "nothing arrived", not "nothing happened".',
  })
  @ApiOkResponse({ type: [CspReportRowDto] })
  async cspReports(
    @CurrentStaff() staff: StaffPrincipal,
    @RequestContext() context: RequestContext,
  ): Promise<CspReportRowDto[]> {
    await this.audit.record({
      action: 'staff.panel_read',
      outcome: 'SUCCESS',
      actorType: 'STAFF',
      actorUserId: staff.userId,
      actorLabel: staff.email,
      subjectType: 'staff_panel',
      subjectLabel: 'security',
      ...context,
    });

    return await this.health.cspReports();
  }

  @Get('installation')
  @ApiOperation({
    summary: 'What this installation is running',
    description:
      'Versions, effective switches and an ALLOW-LISTED view of configuration. Never the mail ' +
      'credential: the response is built from named scalars rather than by omission from the ' +
      'config object, so a field added later cannot arrive by accident.',
  })
  @ApiOkResponse({ type: StaffInstallationDto })
  async installation(
    @CurrentStaff() staff: StaffPrincipal,
    @RequestContext() context: RequestContext,
  ): Promise<StaffInstallationDto> {
    await this.recordPanelRead(staff, context, 'installation');
    return this.health.installation();
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Who cannot sign in',
    description:
      'Accounts with an unverified address, oldest first, with the total. Paginated because the ' +
      'page carries addresses, and scoped in the repository rather than by a query parameter.',
  })
  @ApiOkResponse({ type: StaffAccountsDto })
  async accounts(
    @CurrentStaff() staff: StaffPrincipal,
    @RequestContext() context: RequestContext,
    @Query() query: StaffAccountsQueryDto,
  ): Promise<StaffAccountsDto> {
    // The audit row names the panel and NEVER its contents. This response carries customer
    // addresses, and `audit_events` refuses DELETE — recording them here would put customer PII in
    // the one table erasure cannot reach, which is exactly what M1's ordinary `mail_events` table
    // exists to avoid.
    await this.recordPanelRead(staff, context, 'accounts');
    return await this.health.accounts(query.cursor);
  }

  @Get('activity')
  @ApiOperation({
    summary: 'What staff have done',
    description:
      "Staff actions only, filtered in the repository. A member's row is never returned.",
  })
  @ApiOkResponse({ type: [StaffActivityRowDto] })
  async activity(
    @CurrentStaff() staff: StaffPrincipal,
    @RequestContext() context: RequestContext,
  ): Promise<StaffActivityRowDto[]> {
    await this.recordPanelRead(staff, context, 'activity');
    return await this.health.activity();
  }

  /**
   * One place every panel records that it was read.
   *
   * Extracted once there were four: four call sites assembling this object independently is how two
   * of them end up with a different `actorType` or a missing correlation id — the `recordFailure`
   * reasoning in `SmtpMailService`, one surface along.
   */
  private async recordPanelRead(
    staff: StaffPrincipal,
    context: RequestContext,
    panel: string,
  ): Promise<void> {
    await this.audit.record({
      action: 'staff.panel_read',
      outcome: 'SUCCESS',
      actorType: 'STAFF',
      actorUserId: staff.userId,
      actorLabel: staff.email,
      subjectType: 'staff_panel',
      subjectLabel: panel,
      ...context,
    });
  }
}
