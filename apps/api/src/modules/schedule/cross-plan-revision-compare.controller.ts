import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { CrossPlanRevisionCompareQueryDto } from './dto/cross-plan-revision-compare-query.dto';
import { CrossPlanRevisionCompareDto } from './dto/cross-plan-revision-compare.dto';
import { ScheduleService } from './schedule.service';

/**
 * **Comparing two SEPARATELY IMPORTED revisions of one programme.**
 *
 * Org-scoped and **not nested under a plan**, following the precedent `docs/API.md` states in as
 * many words for cross-plan dependencies: a route carrying **two** plan ids has no honest
 * `:planId` segment, and nesting it would make that segment a lie for one of the two sides.
 *
 * It exists because ADR-0050 makes an import target **always a new plan**, so a re-issued P6 file
 * arrives as a sibling plan and not as a baseline of the first — and the plan-nested comparison,
 * which correlates on `activityId`, has nothing to say about two plans whose UUIDs name nothing in
 * common.
 *
 * **The plan-nested route is unchanged by this**, and its existing e2e cases passing unchanged is
 * how that is asserted rather than claimed.
 *
 * **No dedicated throttle**, and that follows a rule committed BEFORE the measurement rather than a
 * judgement made after it: `m0-condition.md` said ≤ 250 ms ⇒ the global budget stands, above it ⇒
 * derive one by `clamp(floor(12_000 / p95), 3, 20)`. Measured **215.2 ms** p95 end-to-end at 2,000
 * activities per side (the harness half of the same run read 208.2 ms), so the global 100/60 s
 * budget stands. Like the plan-nested route this runs **no CPM
 * computation** — both sides are persisted columns — which is why it belongs in the generic read
 * budget with the health check and the schedule summary rather than beside the routes that
 * recompute.
 */
@ApiTags('schedule')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@Controller({ path: 'organizations/:orgSlug/cross-plan-revision-compare', version: '1' })
export class CrossPlanRevisionCompareController {
  constructor(private readonly service: ScheduleService) {}

  @Get()
  @ApiOperation({
    summary:
      'Compare a revision of one plan against a revision of another, matched on activity code.',
    description:
      'For two revisions of one programme that arrived as two IMPORTS: an import always targets a ' +
      'new plan, so the second file is a sibling plan and not a baseline, and their activity ids ' +
      'name nothing in common. Both sides are matched on `code` — **exactly**, with no case ' +
      'folding, because `uq_activities_plan_code` is case-sensitive and folding would manufacture ' +
      'a collision the database deliberately permits.\n\n' +
      '**Read the `correlation` block first.** Everything else is worth exactly what it says it ' +
      'is: an activity present on one side only is reported as added or removed, and cross-plan ' +
      'that is **indistinguishable from a re-code**, which the coverage numbers are what let a ' +
      'reader judge. An uncoded row is in neither set and is counted separately — the product does ' +
      'not know whether it was added or removed.\n\n' +
      '**This route reads two persisted schedules. The CPM engine is not called, not imported and ' +
      'not reachable from its module graph**, so no schedule is recomputed, nothing is written, ' +
      'and it takes no lock and no plan edit-lock. Do not confuse that with the critical-path ' +
      'test’s weaker sentence ("computes read-only, persists nothing") — that route runs the ' +
      'engine twice and this one runs it not at all.\n\n' +
      '**Every activity id in the response resolves in `toPlanId`, the anchor.** A row that exists ' +
      'only in the other plan carries a **null** `activityId`, and a client omits its activation ' +
      'control rather than shading it. The response does not vary by role: it carries no cost, ' +
      'rate or budget field at any depth, and a structural scan asserts that rather than a ' +
      'reviewer’s eye.',
  })
  @ApiOkResponse({
    type: CrossPlanRevisionCompareDto,
    description:
      'The comparison — **including the case where the two plans share no activity codes**, which ' +
      'is a 200 carrying `notAssessableReason: NO_COMMON_CODES`, the coverage block, and no delta. ' +
      'It is not a 4xx: the question was well formed and the answer is a fact about the data.',
  })
  @ApiNotFoundResponse({
    description:
      'The organisation, either plan, or either revision — **uniformly**. A plan or a baseline ' +
      'belonging to another organisation is 404 and never 403, and so is a baseline of the ' +
      '**other** plan named on the wrong side: each revision is resolved against its own plan, and ' +
      'a 403 would confirm the id names a real row somewhere.',
  })
  @ApiForbiddenResponse({
    description:
      'The caller is a member without `schedule:read` **and** `baseline:read`. Both are asserted: ' +
      'they are granted to the same set today, so narrowing either later cannot silently leave ' +
      'this route open on the strength of the other.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      '`fromPlanId` equals `toPlanId`, with `details.reason` = `CROSS_PLAN_SAME_PLAN` — use the ' +
      'plan-nested `revision-compare` for two revisions of one plan. Not a silent success: the two ' +
      'routes correlate on **different keys**, so a re-coded activity reads as `RECODED` there and ' +
      'as removed-plus-added here, and answering it would give a different and worse answer to a ' +
      'question the product already answers correctly. Also field-level validation: both plan ids ' +
      'must be UUIDs, and each revision a UUID or the literal `live`.',
  })
  @ApiTooManyRequestsResponse({
    description:
      'Rate limited by the **global default** (100 requests / 60 s per IP, counted per route ' +
      'handler — docs/TECH_DEBT.md #315). This route runs no CPM computation — both sides are ' +
      'persisted columns — so it earns no tighter limit than the default. That is a rule applied, ' +
      'not a preference: the threshold ' +
      'and the fallback formula were committed before the measurement, which landed at 215.2 ms ' +
      'p95 end-to-end at 2,000 activities per side, inside the 250 ms bar.',
  })
  async compare(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: CrossPlanRevisionCompareQueryDto,
  ): Promise<CrossPlanRevisionCompareDto> {
    return CrossPlanRevisionCompareDto.from(
      await this.service.crossPlanRevisionCompare(
        principal,
        orgSlug,
        query.fromPlanId,
        query.toPlanId,
        query.from,
        query.to,
        query.include ?? [],
      ),
    );
  }
}
