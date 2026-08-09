import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StaffPrincipal } from '../../common/auth/staff-principal';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { AuditService } from '../audit/audit.service';

import { StaffIdentityDto } from './dto/staff-identity.dto';
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
@Controller({ path: 'staff', version: '1' })
@UseGuards(StaffGuard)
export class StaffController {
  constructor(private readonly audit: AuditService) {}

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
  ): Promise<{ data: StaffIdentityDto }> {
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

    return { data: { userId: staff.userId, email: staff.email } };
  }
}
