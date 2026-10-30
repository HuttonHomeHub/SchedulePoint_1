import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { ActivityCodesService } from './activity-codes.service';
import {
  CodeSwimlaneLanesQueryDto,
  PlanCodeSwimlaneLanesResponseDto,
} from './dto/code-swimlane-lanes.dto';

/**
 * The plan-wide read of one code's swimlane lanes (p6-activity-codes M4, owner decision 2026-10-30):
 * what a client fetches when the planner switches the swimlanes to a code, since the activity list only
 * carries the lanes of the code the plan already uses. A member read, never reachable by a share link.
 */
@ApiTags('activities')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/code-swimlane-lanes', version: '1' })
export class PlanCodeLanesController {
  constructor(private readonly codes: ActivityCodesService) {}

  @Get()
  @ApiOperation({
    summary: 'Read every activity’s lane under one code type of a plan. activity:read.',
    description:
      'One request for the whole plan: each live activity’s stored lane at its **current** basis ' +
      'under `codeTypeId` (its live value of the type, or "no value"), ordered by activity id, at ' +
      'most one per activity. A client applies a lane only when its `codeValueId` equals the ' +
      'activity’s current value of the type; a mismatch counts as unplaced. Not a write and not a ' +
      'schedule input; not available to External Guests.',
  })
  @ApiOkResponse({ type: PlanCodeSwimlaneLanesResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({
    description:
      'The organisation or plan is not found, or the type is unknown, deleted or another plan’s ' +
      '(or organisation’s), never told apart.',
  })
  @ApiUnprocessableEntityResponse({ description: '`codeTypeId` is missing or not a UUID.' })
  read(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: CodeSwimlaneLanesQueryDto,
  ): Promise<PlanCodeSwimlaneLanesResponseDto> {
    return this.codes.readPlanLanes(principal, orgSlug, planId, query.codeTypeId);
  }
}
