import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { PlacementMigrationReportDto } from './dto/placement-migration-report.dto';
import { PlacementMigrationService } from './placement-migration.service';

/**
 * The placement-migration report (one-planning-surface M-I) — what the one-time strip of
 * drag-created `SNET` (start no earlier than) constraints did to this plan.
 *
 * **One route, read-only, and there will never be a write here.** The rows are produced by a
 * shipped SQL migration inside `prisma migrate deploy`, not by the application; a POST on this
 * resource would be a second producer of a record whose whole value is that it describes a
 * one-time act. The strip itself is irreversible and, because `PATCH …/activities/:activityId` is
 * classified `PLAN_CONTENT` in the audit census, permanently unauditable — so this endpoint is the
 * only thing in the product that can say what happened.
 */
@ApiTags('placement-migration')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or plan not found (or not a member).' })
@ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/placement-migration', version: '1' })
export class PlacementMigrationController {
  constructor(private readonly service: PlacementMigrationService) {}

  @Get()
  @ApiOperation({
    summary: 'What the placement migration changed on this plan (any member).',
    description:
      'Every constraint the one-time strip converted to a hand-placement, with the constraint ' +
      'type and date it replaced and the activity’s code and name as they then stood. An empty ' +
      'list means the migration changed nothing on this plan — either it had no binding ' +
      'start-no-earlier-than constraints, or the ones it had were left alone (inert, ' +
      'unclassified, or already carrying a hand-placement). Those untouched classes are NOT ' +
      'reported here, because nothing happened to them; they are counted estate-wide by the ' +
      'staff diagnostics panel instead. Reads ride on `plan:read`, held by every member.',
  })
  @ApiOkResponse({ type: PlacementMigrationReportDto })
  async report(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlacementMigrationReportDto> {
    return PlacementMigrationReportDto.from(await this.service.report(principal, orgSlug, planId));
  }
}
