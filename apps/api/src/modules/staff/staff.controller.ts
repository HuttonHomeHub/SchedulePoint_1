import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StaffPrincipal } from '../../common/auth/staff-principal';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { AuditService } from '../audit/audit.service';

import { StaffHealthDto } from './dto/staff-health.dto';
import { StaffIdentityDto } from './dto/staff-identity.dto';
import { StaffGuard } from './staff.guard';
import { StaffHealthService } from './staff-health.service';

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
    return { userId: staff.userId, email: staff.email };
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
}
