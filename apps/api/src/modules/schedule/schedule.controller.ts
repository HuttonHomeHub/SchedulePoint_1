import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { Throttle } from '@nestjs/throttler';

import type { Principal } from '../../common/auth/principal';
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { FloatPathsQueryDto } from './dto/float-paths-query.dto';
import { PlanEarnedValueDto } from './dto/plan-earned-value.dto';
import { PlanFloatPathsDto } from './dto/plan-float-paths.dto';
import { ScheduleHealthReportDto } from './dto/plan-health-check.dto';
import {
  ResourceHistogramMetaDto,
  ResourceHistogramSeriesDto,
} from './dto/plan-resource-histogram.dto';
import { PlanScheduleSummaryDto } from './dto/plan-schedule-summary.dto';
import { ProgrammeScheduleResultDto } from './dto/programme-schedule-result.dto';
import { ResourceHistogramQueryDto } from './dto/resource-histogram-query.dto';
import { ScheduleService } from './schedule.service';

/**
 * CPM schedule routes for a plan (ADR-0022). `recalculate` runs the engine and
 * persists the computed columns (Planner or Org Admin); it is a synchronous
 * action, not a resource creation, so it returns `200` with the plan summary.
 */
/**
 * The float-paths budget: **20 requests / 60 s**, against the global 100/60 s.
 *
 * This route is not a persisted read-model — it runs a full `computeSchedule` per call (~100 ms p95
 * on a 540-activity plan, `scripts/measure-float-paths.mjs`). Sharing the generic read budget would
 * let one authenticated member spend it on a hundred CPM recomputations a minute. Twenty is well
 * above what the panel can generate — it fetches once per open, per target, per page size — and far
 * below what a loop would want. `ttl` is milliseconds, matching the global `ThrottlerModule`.
 */
const FLOAT_PATHS_THROTTLE = { default: { ttl: 60_000, limit: 20 } } as const;

@ApiTags('schedule')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or plan not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/schedule', version: '1' })
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate a plan’s CPM schedule (Planner or Org Admin).' })
  @ApiOkResponse({ type: PlanScheduleSummaryDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description:
      'The plan has no start date (PLAN_START_REQUIRED), or a calendar the plan schedules on has ' +
      'no working time at all — an empty week with no working exceptions ' +
      '(CALENDAR_HAS_NO_WORKING_TIME, carrying the calendar’s id and name).',
  })
  @ApiLockedResponse('You do not hold the plan edit-lock (when enforcement is on).')
  async recalculate(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanScheduleSummaryDto> {
    return PlanScheduleSummaryDto.from(await this.service.recalculate(principal, orgSlug, planId));
  }

  @Post('recalculate-programme')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recalculate a plan’s upstream cross-plan closure in dependency order (Planner or Org Admin, ADR-0045 §4).',
    description:
      'Resolves the target plan’s UPSTREAM cross-plan closure and recalculates each plan upstream-first ' +
      'using the existing single-plan recalc transaction (its own advisory lock + pen, in a deterministic, ' +
      'deadlock-free topological order), so the target’s derived inter-project bounds are fresh. The pure ' +
      'engine is untouched. A plan with no cross-plan edges recalculates just itself (a single-plan recalc). ' +
      'Default fail-fast policy (CQ-3): if any plan in the closure is edited by someone else, a pre-flight ' +
      'check throws 423 with the blocked-plan list and writes nothing.',
  })
  @ApiOkResponse({ type: ProgrammeScheduleResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description:
      'A plan in the closure has no start date (PLAN_START_REQUIRED), or a calendar ANY plan in ' +
      'the closure schedules on has no working time (CALENDAR_HAS_NO_WORKING_TIME).',
  })
  @ApiLockedResponse(
    'One or more plans in the closure are held by another editor (PROGRAMME_PLANS_LOCKED) — nothing written.',
  )
  async recalculateProgramme(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<ProgrammeScheduleResultDto> {
    return ProgrammeScheduleResultDto.from(
      await this.service.recalculateProgramme(principal, orgSlug, planId),
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Read a plan’s computed schedule summary (any member).' })
  @ApiOkResponse({ type: PlanScheduleSummaryDto })
  async summary(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanScheduleSummaryDto> {
    return PlanScheduleSummaryDto.from(await this.service.summary(principal, orgSlug, planId));
  }

  // A tighter budget than the global 100/60 s, because this route is **disproportionately
  // expensive for its bucket**: unlike its sibling reads it is not a persisted read-model — the
  // service runs a full `computeSchedule` per request, measured at ~100 ms p95 on a 540-activity
  // plan (`apps/api/scripts/measure-float-paths.mjs`). Sharing the generic budget would let one
  // authenticated member spend it on 100 CPM recomputations in a minute. Raised by the security
  // gate on the audit-F4 diff; the guest-share surface's `@Throttle` is the precedent.
  @Throttle(FLOAT_PATHS_THROTTLE)
  @Get('float-paths')
  @ApiOperation({
    summary: 'Ranked contiguous float paths into a target activity (any member, ADR-0035 §19).',
  })
  @ApiOkResponse({ type: PlanFloatPathsDto })
  @ApiTooManyRequestsResponse({
    description:
      'Rate limit exceeded — this route runs a CPM computation and has a tighter budget.',
  })
  @ApiNotFoundResponse({
    description: 'Plan not found, or the target activity is not in the plan.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The plan has no start date (PLAN_START_REQUIRED), or a calendar the plan schedules on has ' +
      'no working time at all — an empty week with no working exceptions ' +
      '(CALENDAR_HAS_NO_WORKING_TIME, carrying the calendar’s id and name).',
  })
  async floatPaths(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: FloatPathsQueryDto,
  ): Promise<PlanFloatPathsDto> {
    return PlanFloatPathsDto.from(
      await this.service.floatPaths(principal, orgSlug, planId, query.target, query.maxPaths),
    );
  }

  @Get('health-check')
  @ApiOperation({
    summary: 'The plan’s DCMA 14-point schedule health check (any member, health M1).',
    description:
      'A pure read over the persisted definition and CPM columns — **the CPM engine is not ' +
      'invoked** (contrast float-paths, which recomputes per call), no lock or transaction is ' +
      'taken, and nothing is written. **The response does not vary by role**: it carries no cost, ' +
      'rate or budget field at any depth, so cost:read changes nothing and one URL produces one ' +
      'document — which is what makes it a handover artefact. Metric 10 (Resources) is ' +
      'deliberately narrowed to resource-assignment existence for the same reason, and says so in ' +
      'its detail.narrowing. The metrics array is always exactly 14 entries, one per ' +
      'HealthMetricId, in ordinal order — never sparse; a metric that could not be computed is ' +
      'present with verdict NOT_ASSESSABLE and a reason, never omitted.',
  })
  @ApiOkResponse({ type: ScheduleHealthReportDto })
  @ApiTooManyRequestsResponse({
    description:
      'Rate limited by the global budget (100 requests / 60 s per IP). This route is a persisted ' +
      'read — it runs no CPM computation — so it shares the generic read budget with the schedule ' +
      'summary and the Earned-Value read rather than earning a tighter one. Measured at both ' +
      'scales (M0-T2 at 500 activities; the M5 gate pass at 2,000 — all four loads sub-1 ms, ' +
      'independently re-derived by the security review): see ' +
      'docs/specs/schedule-health-check/m0-measurement.md §M0-T2.',
  })
  async healthCheck(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<ScheduleHealthReportDto> {
    return ScheduleHealthReportDto.from(
      await this.service.getHealthCheck(principal, orgSlug, planId),
    );
  }

  @Get('earned-value')
  @ApiOperation({
    summary: 'Read a plan’s Earned-Value analysis (cost:read — Planner or Org Admin, ADR-0042).',
    description:
      'Returns per-activity + WBS-rolled Earned-Value metrics plus the plan total. The activity ' +
      'list is a bounded, plan-scoped read (one row per non-deleted activity) and is returned ' +
      'unpaginated by design — like GET …/baselines/variance; the plan-level roll-up rides in the ' +
      'same response object alongside the activity rows rather than in a Paginated `meta`.',
  })
  @ApiOkResponse({ type: PlanEarnedValueDto })
  @ApiForbiddenResponse({
    description: 'Insufficient role — cost:read (Planner/Org Admin) is required to read cost.',
  })
  async earnedValue(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanEarnedValueDto> {
    return PlanEarnedValueDto.from(await this.service.getEarnedValue(principal, orgSlug, planId));
  }

  @Get('resource-histogram')
  @ApiOperation({
    summary:
      'Read a plan’s resource loading histogram (schedule:read — any member, ADR-0044 §3 / ADR-0035 §31).',
    description:
      'Returns a units-over-time histogram per resource, curve-shaped from each assignment’s ' +
      'loading curveType and conserving units. This is SCHEDULE data (units), not cost, so it is ' +
      'schedule:read-gated — never cost:read (Q5). The per-resource series page in `data`; the shared ' +
      'time-bucket axis, the total series count, and the N29 `curveNormalisedCount` ride in `meta`. It ' +
      'reads the persisted CPM dates only — no engine recompute, no CPM date moved, and (this rung) the ' +
      'levelling pass is untouched (Q2).',
  })
  @ApiOkResponse({ type: ResourceHistogramSeriesDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Plan not found (or not a member).' })
  @ApiUnprocessableEntityResponse({
    description:
      'The requested granularity would produce too many buckets (HISTOGRAM_GRANULARITY_TOO_FINE); ' +
      'request a coarser one.',
  })
  async resourceHistogram(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Query() query: ResourceHistogramQueryDto,
  ): Promise<Paginated<ResourceHistogramSeriesDto, ResourceHistogramMetaDto>> {
    const result = await this.service.getResourceHistogram(
      principal,
      orgSlug,
      planId,
      query.granularity,
      query.limit,
      query.offset,
    );
    return new Paginated(
      result.series.map((series) => ResourceHistogramSeriesDto.from(series)),
      {
        granularity: result.granularity,
        buckets: result.buckets,
        total: result.total,
        hasMore: result.hasMore,
        curveNormalisedCount: result.curveNormalisedCount,
      },
    );
  }
}
