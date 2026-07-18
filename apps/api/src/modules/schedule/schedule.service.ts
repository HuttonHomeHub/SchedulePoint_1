import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  HistogramGranularity,
  PlanEarnedValue,
  PlanFloatPaths,
  PlanScheduleSummary,
  ResourceHistogramSeries,
} from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import {
  deriveExternalInstants,
  type DerivedExternalInstant,
  type IncomingCrossPlanEdge,
  type OutgoingCrossPlanEdge,
} from './cross-plan-derivation';
import { MINUTES_PER_DAY } from './day-compat-calendar';
import {
  allMinutesWorkCalendar,
  computeEarnedValue,
  computeFloatPaths,
  computeResourceHistogram,
  computeSchedule,
  HistogramTooManyBucketsError,
  levelSchedule,
  resolveCurveProfile,
  ScheduleGraphNotADagError,
  type ComputeOptions,
  type EngineActivity,
  type EngineAssignment,
  type EngineEdge,
  type EngineResource,
  type EngineSummary,
  type EvActivityInput,
  type HistogramAssignmentInput,
  type WorkingTimeCalendar,
} from './engine';
import { buildPlanCalendar } from './plan-calendar';
import {
  ScheduleRepository,
  type ScheduleActivityRow,
  type ScheduleEdgeRow,
} from './schedule.repository';

/** A calendar-day (or null) as a `YYYY-MM-DD` string, for the pure EV read (the baselines `day` helper). */
function day(value: Date | null): string | null {
  return value ? formatCalendarDate(value) : null;
}

/** Machine-readable reasons carried in a schedule {@link ValidationError}. */
export const SCHEDULE_ERROR = {
  /** The plan has no `plannedStart`, so there is no data date to schedule from. */
  PLAN_START_REQUIRED: 'PLAN_START_REQUIRED',
  /** The requested histogram granularity would produce too many buckets (ask for a coarser one). */
  HISTOGRAM_GRANULARITY_TOO_FINE: 'HISTOGRAM_GRANULARITY_TOO_FINE',
} as const;

/** An active plan row as loaded for scheduling — carries the engine-relevant option fields. */
type ActivePlan = NonNullable<Awaited<ReturnType<PlanRepository['findActiveByIdInOrg']>>>;

/**
 * The CPM recalculation service (ADR-0022). Resolves the org from the caller's
 * memberships (anti-IDOR) and requires `schedule:calculate`, loads the plan
 * (404) and requires a `plannedStart` (422), then — under the plan-scoped lock,
 * in one transaction — loads the active graph, runs the pure engine, and persists
 * the engine-owned columns. The write never touches `version`/`updated_at`, so a
 * recalculation is invisible to optimistic locking and cannot masquerade as a
 * user edit.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly schedule: ScheduleRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly crossPlan: CrossPlanDependencyRepository,
    @InjectPinoLogger(ScheduleService.name) private readonly logger: PinoLogger,
  ) {}

  async recalculate(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanScheduleSummary> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:calculate', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    if (!plan.plannedStart) {
      throw new ValidationError('Set the plan’s start date before calculating the schedule.', {
        reason: SCHEDULE_ERROR.PLAN_START_REQUIRED,
      });
    }
    const dataDate = formatCalendarDate(plan.plannedStart);

    const startedAt = Date.now();
    let summary: EngineSummary;
    let lagCalendarOverrideCount = 0;
    let activityCalendarCount = 0;
    let progressedActivityCount = 0;
    // Live cross-plan derivation (F4, ADR-0045 §2): how many cross-plan edges pointed at a
    // never-calculated upstream this recalc (N32). Undefined on the byte-parity path (no cross-plan
    // edge), so the log field reads null and existing summaries/goldens do not move.
    let crossPlanUpstreamMissingCount: number | undefined;
    try {
      summary = await this.prisma.$transaction(async (tx) => {
        // Serialise with dependency creates and other recalcs on this plan, then
        // read a consistent snapshot of the graph (ADR-0021/0022).
        await this.schedule.lockPlanForWrite(planId, tx);
        // Recalculate is a pen-gated plan mutation (ADR-0028, Q-B). Assert INSIDE the
        // advisory lock so a steal can't slip between the check and the engine write.
        await this.editLock.assertHoldsPen(principal, planId, organization.id, tx);
        const graph = await this.buildEngineGraph(organization.id, plan, dataDate, tx);
        lagCalendarOverrideCount = graph.meta.lagCalendarOverrideCount;
        activityCalendarCount = graph.meta.activityCalendarCount;
        progressedActivityCount = graph.meta.progressedActivityCount;
        crossPlanUpstreamMissingCount = graph.meta.crossPlanUpstreamMissingCount;
        const output = computeSchedule(graph.activities, graph.edges, graph.options);
        // Resource levelling (ADR-0041): iff the plan opted in AND has assignments, run the pure
        // second pass and persist its additive overlay. Off ⇒ the network `output.results` are written
        // as-is and the leveled columns are cleared to null/false (byte-identical, the parity gate).
        let results = output.results;
        let summary: EngineSummary = output.summary;
        if (graph.leveling) {
          const leveled = levelSchedule(
            graph.activities,
            output,
            graph.leveling.assignments,
            graph.leveling.resources,
            {
              levelWithinFloatOnly: plan.levelWithinFloatOnly,
              dataDate,
              planCalendar: graph.options.calendar,
            },
          );
          results = leveled.results;
          summary = { ...output.summary, ...leveled.summary };
        }
        await this.schedule.writeResults(organization.id, planId, results, tx);
        await this.schedule.writeDrivingFlags(organization.id, planId, output.edges, tx);
        return summary;
      });
    } catch (error) {
      // A residual cycle is a breach of the DAG invariant the write path
      // guarantees (ADR-0021) — it should be unreachable. Log it distinctly and
      // rethrow so the global filter returns an opaque 500 (no data persisted).
      if (error instanceof ScheduleGraphNotADagError) {
        this.logger.error(
          {
            organizationId: organization.id,
            planId,
            unresolvedActivityIds: error.unresolvedActivityIds,
          },
          'schedule DAG invariant breached',
        );
      }
      throw error;
    }

    this.logger.info(
      {
        organizationId: organization.id,
        planId,
        userId: principal.userId,
        // Which calendar drove the dates (null → all-days-work) — auditable per ADR-0024.
        calendarId: plan.calendarId ?? null,
        activityCount: summary.activityCount,
        criticalCount: summary.criticalCount,
        constraintViolationCount: summary.constraintViolationCount,
        constraintWarningCount: summary.constraintWarningCount,
        resourceDriverMissingCount: summary.resourceDriverMissingCount,
        // External / inter-project bounds that drove an activity this run (ADR-0043 / ADR-0035 §30);
        // null on the byte-parity path (no external data / ignore-external on).
        externalDrivenCount: summary.externalDrivenCount ?? null,
        lagCalendarOverrideCount,
        // How many DISTINCT per-activity calendars were built this recalc (ADR-0037, M5) — the
        // signal that per-activity calendars actually shaped the dates (0 on the all-inherit path).
        activityCalendarCount,
        // Progress (M2, ADR-0035): the recalc mode and how many activities carried actuals.
        progressRecalcMode: plan.progressRecalcMode,
        progressedActivityCount,
        // Live cross-plan derivation (F4, ADR-0045 §2 / ADR-0035 §30.5 / N32): edges whose upstream
        // was never calculated this run. Null on the byte-parity path (no cross-plan edge feeds the plan).
        crossPlanUpstreamMissingCount: crossPlanUpstreamMissingCount ?? null,
        // Expected-finish resizes applied this run (M4, ADR-0035 §9); 0 unless the option is on.
        expectedFinishAppliedCount: summary.expectedFinishAppliedCount,
        // Resource levelling (M7, ADR-0041): whether the opt-in pass ran, and its produce-and-flag
        // roll-up. Null when levelling is off (the byte-identical fast path).
        levelResources: plan.levelResources,
        leveledActivityCount: summary.leveledActivityCount ?? null,
        levelingWindowExceededCount: summary.levelingWindowExceededCount ?? null,
        selfOverAllocatedCount: summary.selfOverAllocatedCount ?? null,
        durationMs: Date.now() - startedAt,
      },
      'schedule recalculated',
    );

    return {
      dataDate,
      projectFinish: summary.projectFinish,
      activityCount: summary.activityCount,
      criticalCount: summary.criticalCount,
      nearCriticalCount: summary.nearCriticalCount,
      constraintViolationCount: summary.constraintViolationCount,
      constraintWarningCount: summary.constraintWarningCount,
      loeNoSpanCount: summary.loeNoSpanCount,
      resourceDriverMissingCount: summary.resourceDriverMissingCount,
      // External / inter-project driven count (ADR-0043 / ADR-0035 §30): engine-derived on a recalc;
      // 0 on the byte-parity path (no external data / ignore-external on).
      externalDrivenCount: summary.externalDrivenCount ?? 0,
      // Resource-levelling roll-up (ADR-0041 / ADR-0035 §28): the engine emits these only when the
      // levelling pass ran, so they default to 0 / null on the byte-identical parity path.
      leveledActivityCount: summary.leveledActivityCount ?? 0,
      levelingWindowExceededCount: summary.levelingWindowExceededCount ?? 0,
      selfOverAllocatedCount: summary.selfOverAllocatedCount ?? 0,
      leveledProjectFinish: summary.leveledProjectFinish ?? null,
    };
  }

  /**
   * Read a plan's schedule summary WITHOUT recomputing — a single aggregate over
   * the persisted engine columns (`schedule:read`, every member). Reflects the
   * last recalculation; `projectFinish` is null for a never-calculated or empty
   * plan, and `dataDate` is null when the plan has no start date.
   */
  async summary(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanScheduleSummary> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const aggregate = await this.schedule.summarise(organization.id, planId);
    return {
      dataDate: plan.plannedStart ? formatCalendarDate(plan.plannedStart) : null,
      projectFinish: aggregate.projectFinish,
      activityCount: aggregate.activityCount,
      criticalCount: aggregate.criticalCount,
      nearCriticalCount: aggregate.nearCriticalCount,
      constraintViolationCount: aggregate.constraintViolationCount,
      constraintWarningCount: aggregate.constraintWarningCount,
      loeNoSpanCount: aggregate.loeNoSpanCount,
      resourceDriverMissingCount: aggregate.resourceDriverMissingCount,
      // External / inter-project driven count (ADR-0043 / ADR-0035 §30): a read-time aggregate over the
      // plan's engine-owned `external_driven` column; 0 when the plan has no external-driven activities.
      externalDrivenCount: aggregate.externalDrivenCount,
      // Resource-levelling roll-up (ADR-0041 / ADR-0035 §28): a read-time aggregate over the plan's
      // engine-owned leveled columns; 0 / null when the plan does not level.
      leveledActivityCount: aggregate.leveledActivityCount,
      levelingWindowExceededCount: aggregate.levelingWindowExceededCount,
      selfOverAllocatedCount: aggregate.selfOverAllocatedCount,
      leveledProjectFinish: aggregate.leveledProjectFinish,
    };
  }

  /**
   * The ranked contiguous **float paths** into a target activity (P6 "multiple float paths",
   * ADR-0035 §19) — a read-only CPM analysis (`schedule:read`, every member). Recomputes the schedule
   * live from the plan's active graph (never mutates or persists), then walks the driving chains into
   * the target: path 0 is its own driving chain (relative float 0), branch paths follow in
   * non-decreasing relative-float order, bounded by `maxPaths`. Requires a plan start (422) for a data
   * date; 404s if the target activity is not active in this plan. Relative float is returned in
   * working days (÷1440), matching the day-denominated float on the activity rows (ADR-0036 §7).
   */
  async floatPaths(
    principal: Principal,
    orgSlug: string,
    planId: string,
    targetActivityId: string,
    maxPaths: number,
  ): Promise<PlanFloatPaths> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    if (!plan.plannedStart) {
      throw new ValidationError('Set the plan’s start date before analysing float paths.', {
        reason: SCHEDULE_ERROR.PLAN_START_REQUIRED,
      });
    }
    const dataDate = formatCalendarDate(plan.plannedStart);

    // Read a consistent snapshot of the graph (no write lock — this never persists). Reuses the exact
    // same engine-input builder as `recalculate`, so the analysis can never drift from the schedule.
    const { activities, edges, options } = await this.prisma.$transaction((tx) =>
      this.buildEngineGraph(organization.id, plan, dataDate, tx),
    );
    // The engine returns [] for an unknown target; surface that as a 404 rather than an empty result
    // so a mistyped id is not silently "no paths". A present target always yields path 0 (target-first).
    if (!activities.some((a) => a.id === targetActivityId)) {
      throw new NotFoundError('Activity not found in this plan.');
    }

    const paths = computeFloatPaths(activities, edges, options, targetActivityId, maxPaths).map(
      (p) => ({
        index: p.index,
        // Engine float is working minutes (ADR-0036); expose days like the activity rows.
        relativeFloat: Math.round(p.relativeFloat / MINUTES_PER_DAY),
        activityIds: p.activityIds,
      }),
    );
    return { targetActivityId, paths };
  }

  /**
   * The plan's **Earned-Value analysis** (EV2b, ADR-0042 §2) — a pure READ over the persisted CPM
   * dates plus the cost / %-complete inputs, gated on `cost:read` (Planner + Org Admin only, so a
   * Viewer/Contributor never reads commercially sensitive money). Resolves the org from the caller's
   * memberships (anti-IDOR) and asserts `cost:read` BEFORE any load; 404s if the plan is not in the
   * caller's org. It NEVER recomputes or mutates: no write lock, no `computeSchedule` — it reads the
   * persisted `earlyStart`/`earlyFinish` and cost inputs, joins the active baseline's cost snapshot
   * (live-budget fallback when absent → `costBaselineMissing`), and runs the pure `computeEarnedValue`.
   */
  async getEarnedValue(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanEarnedValue> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'cost:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const [activityRows, snapshotRows, calendar] = await Promise.all([
      this.schedule.loadEarnedValueActivities(organization.id, planId),
      this.schedule.loadActiveBaselineCostSnapshot(organization.id, planId),
      this.resolveCalendar(organization.id, plan.calendarId),
    ]);

    // Join the active baseline's cost snapshot by source activity id; a missing row (or no active
    // baseline at all) leaves the baseline fields null → the module's live-budget PV fallback.
    const baselineById = new Map(snapshotRows.map((s) => [s.sourceActivityId, s]));
    const activities: EvActivityInput[] = activityRows.map((r) => {
      const base = baselineById.get(r.id) ?? null;
      return {
        activityId: r.id,
        type: r.type,
        parentId: r.parentId,
        percentCompleteType: r.percentCompleteType,
        percentComplete: r.percentComplete,
        physicalPercentComplete: r.physicalPercentComplete,
        // How the activity's cost accrues (ADR-0044 §32) — governs PV time-phasing only. UNIFORM (the
        // DB default) is the byte-identical linear path, so a plan with no accrual data reads identically.
        accrualType: r.accrualType,
        // Weighted progress steps (M7 rung 5, ADR-0044 §33) drive the PHYSICAL measure — steps win over
        // the manual field via the shared `rollupPhysicalPercent`. An activity with NO steps yields an
        // empty array, so the manual physicalPercentComplete stands exactly (the byte-identical parity
        // path; existing EV goldens stay green). Decimal weight → number at this boundary.
        steps: r.steps.map((s) => ({
          weight: s.weight.toNumber(),
          percentComplete: s.percentComplete,
        })),
        // Money is BIGINT minor units (→ number); an unset lump-sum contributes 0.
        budgetedExpense: Number(r.budgetedExpense ?? 0n),
        actualExpense: Number(r.actualExpense ?? 0n),
        assignments: r.assignments.map((a) => ({
          budgetedCost: a.budgetedCost === null ? null : Number(a.budgetedCost),
          actualCost: Number(a.actualCost),
          budgetedUnits: a.budgetedUnits.toNumber(),
          actualUnits: a.actualUnits.toNumber(),
          costPerUnit: a.resource.costPerUnit === null ? null : a.resource.costPerUnit.toNumber(),
        })),
        baselineStart: base ? day(base.baselineStart) : null,
        baselineFinish: base ? day(base.baselineFinish) : null,
        // A SQL-NULL snapshot cost (a pre-EV baseline) stays null → PV falls back to the live BAC and
        // the module flags `costBaselineMissing`; a snapshot captured post-EV carries an integer (0+).
        baselineBudgetedCost: base
          ? base.budgetedCost === null
            ? null
            : Number(base.budgetedCost)
          : null,
        earlyStart: day(r.earlyStart),
        earlyFinish: day(r.earlyFinish),
      };
    });

    const dataDate = plan.plannedStart ? formatCalendarDate(plan.plannedStart) : null;
    const result = computeEarnedValue({
      activities,
      dataDate,
      eacMethod: plan.eacMethod,
      calendar,
    });

    return {
      dataDate,
      eacMethod: plan.eacMethod,
      currencyCode: plan.currencyCode,
      costBaselineMissing: result.costBaselineMissing,
      costWarningCount: result.costWarningCount,
      // N27 (ADR-0044 §33): leaf activities whose steps are all zero-weight, so the manual physical %
      // fallback was used — a read-time data-quality warning, mirroring costWarningCount.
      stepWeightZeroCount: result.stepWeightZeroCount,
      activities: result.activities,
      total: result.total,
    };
  }

  /**
   * The plan's **resource loading histogram** (M7 rung 5, ADR-0044 §3 / ADR-0035 §31) — a pure READ over
   * the persisted CPM dates plus each active assignment's loading `curveType`, gated on `schedule:read`
   * (every member). The units histogram is **schedule data, not cost** (Q5), so it is deliberately NOT
   * `cost:read`-gated (contrast {@link getEarnedValue}). Resolves the org from the caller's memberships
   * (anti-IDOR), 404s if the plan is not in the caller's org, then loads the plan's active assignments +
   * their activities' persisted dates/calendars and runs the pure `computeResourceHistogram`. It NEVER
   * recomputes or mutates: no write lock, no `computeSchedule`, no engine column — curves feed the
   * histogram only, not the levelling pass (Q2). The per-resource series are offset-paged; the shared
   * bucket axis + `curveNormalisedCount` (N29) ride in the meta.
   */
  async getResourceHistogram(
    principal: Principal,
    orgSlug: string,
    planId: string,
    granularity: HistogramGranularity,
    limit: number,
    offset: number,
  ): Promise<{
    series: ResourceHistogramSeries[];
    buckets: { start: string; end: string }[];
    granularity: HistogramGranularity;
    total: number;
    hasMore: boolean;
    curveNormalisedCount: number;
  }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const rows = await this.schedule.loadResourceHistogramAssignments(organization.id, planId);

    // Resolve each DISTINCT activity calendar ONCE (ADR-0037): a null calendarId (or the plan calendar)
    // inherits the plan default. A histogram distributes units over the activity's OWN calendar; the
    // driving-resource-calendar substitution used for *scheduling* a RESOURCE_DEPENDENT activity is not
    // reapplied here — the dates are already computed, and the own-calendar phasing is the ADR-0037 grain.
    const planCalendar = await this.resolveCalendar(organization.id, plan.calendarId);
    const portByCalId = new Map<string, WorkingTimeCalendar>();
    for (const calId of new Set(
      rows
        .map((r) => r.calendarId)
        .filter((id): id is string => id != null && id !== plan.calendarId),
    )) {
      portByCalId.set(calId, await this.resolveCalendar(organization.id, calId));
    }
    const portFor = (calId: string | null): WorkingTimeCalendar =>
      calId == null || calId === plan.calendarId
        ? planCalendar
        : (portByCalId.get(calId) ?? planCalendar);

    const assignments: HistogramAssignmentInput[] = rows.map((r) => ({
      resourceId: r.resourceId,
      activityId: r.activityId,
      budgetedUnits: r.budgetedUnits.toNumber(),
      // Resolve the named curve to its built-in P6 profile; UNIFORM → null → a flat load (parity).
      profile: resolveCurveProfile(r.curveType),
      start: r.earlyStart ? formatCalendarDate(r.earlyStart) : null,
      finish: r.earlyFinish ? formatCalendarDate(r.earlyFinish) : null,
      // SchedulePoint does not model a per-assignment lag column (the fixture's assignment_lag_h is a
      // conformance-only concept, exercised via the adapter); production always distributes over the
      // whole activity span.
      lagMinutes: 0,
      calendar: portFor(r.calendarId),
    }));

    let histogram;
    try {
      histogram = computeResourceHistogram({ assignments, granularity });
    } catch (error) {
      if (error instanceof HistogramTooManyBucketsError) {
        throw new ValidationError(
          'The requested granularity produces too many buckets for this plan’s span; use a coarser one.',
          { reason: SCHEDULE_ERROR.HISTOGRAM_GRANULARITY_TOO_FINE },
        );
      }
      throw error;
    }

    const total = histogram.series.length;
    const page = histogram.series.slice(offset, offset + limit);
    return {
      series: page,
      buckets: histogram.buckets,
      granularity: histogram.granularity,
      total,
      hasMore: offset + page.length < total,
      curveNormalisedCount: histogram.curveNormalisedCount,
    };
  }

  /**
   * Build the pure engine's input (activities, edges, options) for a plan from its active graph, plus
   * observability counts. Shared by {@link recalculate} (inside its write lock) and {@link floatPaths}
   * (a read snapshot) so the two can never diverge in how they map the DB graph onto the engine.
   * Per-activity calendars (ADR-0037) are resolved once per DISTINCT non-inherit calendar; an activity
   * that inherits the plan calendar keeps the byte-identical fast path (undefined port).
   */
  private async buildEngineGraph(
    organizationId: string,
    plan: ActivePlan,
    dataDate: string,
    tx: Prisma.TransactionClient,
  ): Promise<{
    activities: EngineActivity[];
    edges: EngineEdge[];
    options: ComputeOptions;
    /** The resource-levelling demand model — loaded ONLY when the plan opts in (`levelResources`) and
     * has active assignments; null keeps the byte-identical fast path (ADR-0041 §7). */
    leveling: { assignments: EngineAssignment[]; resources: EngineResource[] } | null;
    meta: {
      lagCalendarOverrideCount: number;
      activityCalendarCount: number;
      progressedActivityCount: number;
      /** Live cross-plan derivation (F4, ADR-0045 §2): edges pointing at a never-calculated upstream
       * this recalc (N32). ABSENT on the byte-parity path (no cross-plan edge feeds the plan). */
      crossPlanUpstreamMissingCount?: number;
    };
  }> {
    const activityRows = await this.schedule.loadActivities(organizationId, plan.id, tx);
    const edgeRows = await this.schedule.loadEdges(organizationId, plan.id, tx);
    // Observability (ADR-0036 §6): how many edges carry a lag calendar that changes the arithmetic
    // today. Only TWENTY_FOUR_HOUR is distinct from the plan calendar in M3.
    const lagCalendarOverrideCount = edgeRows.filter(
      (e) => e.lagCalendar === 'TWENTY_FOUR_HOUR',
    ).length;
    // Build the plan's working-time calendar once — the inherit default (ADR-0024).
    const calendar = await this.resolveCalendar(organizationId, plan.calendarId, tx);

    // Resource-dependent scheduling (M7.2, ADR-0035 §23 / ADR-0039): a RESOURCE_DEPENDENT activity
    // schedules on its DRIVING resource's calendar instead of its own. Resolve the driving-resource
    // calendar per such activity (the DB guarantees ≤1 driver). Only queried when the plan actually has
    // a RESOURCE_DEPENDENT activity, so a plan without one keeps the byte-identical fast path.
    const hasResourceDependent = activityRows.some((r) => r.type === 'RESOURCE_DEPENDENT');
    const drivingResourceCalByActivity = new Map<string, string | null>();
    if (hasResourceDependent) {
      for (const row of await this.schedule.loadDrivingResourceCalendars(
        organizationId,
        plan.id,
        tx,
      )) {
        drivingResourceCalByActivity.set(row.activityId, row.resourceCalendarId);
      }
    }
    // The EFFECTIVE calendar id an activity schedules on, and whether its driving resource is missing.
    // Fallback order (ADR-0039 §4): driving-resource calendar → activity calendar → plan default. A
    // RESOURCE_DEPENDENT activity with no active driver is produced-and-flagged (`resourceDriverMissing`)
    // and falls back to its own calendar; every other type keeps its own calendar unchanged (so the
    // A5500 contrast — a TASK ignoring an assigned resource's calendar — is type-gated for free).
    const effectiveOf = (
      r: ScheduleActivityRow,
    ): { calId: string | null; driverMissing: boolean } => {
      if (r.type !== 'RESOURCE_DEPENDENT') return { calId: r.calendarId, driverMissing: false };
      if (!drivingResourceCalByActivity.has(r.id))
        return { calId: r.calendarId, driverMissing: true };
      return {
        calId: drivingResourceCalByActivity.get(r.id) ?? r.calendarId,
        driverMissing: false,
      };
    };
    const effectiveByActivity = new Map(activityRows.map((r) => [r.id, effectiveOf(r)] as const));

    // Per-activity calendars (ADR-0037, M5) + the resource-driving calendar (M7.2): resolve each
    // DISTINCT non-inherit EFFECTIVE calendar ONCE (so a shared crane calendar is built at most once).
    const distinctActivityCalIds = [
      ...new Set(
        [...effectiveByActivity.values()]
          .map((e) => e.calId)
          .filter((id): id is string => id != null && id !== plan.calendarId),
      ),
    ];
    const portByCalId = new Map<string, WorkingTimeCalendar>();
    for (const calId of distinctActivityCalIds) {
      portByCalId.set(calId, await this.resolveCalendar(organizationId, calId, tx));
    }
    const portFor = (calId: string | null): WorkingTimeCalendar | undefined =>
      calId == null || calId === plan.calendarId ? undefined : portByCalId.get(calId);
    // Edges resolve their PRED/SUCC lag calendar on the endpoint's EFFECTIVE calendar too (a
    // RESOURCE_DEPENDENT endpoint's lag rides its resource calendar, consistent with its scheduling).
    const calIdByActivity = new Map(
      activityRows.map((r) => [r.id, effectiveByActivity.get(r.id)!.calId] as const),
    );

    // Progressed activities this recalc consumes (M2, ADR-0035): 0 = an unprogressed plan.
    const progressedActivityCount = activityRows.filter(
      (r) => r.actualStart != null || r.actualFinish != null,
    ).length;

    // Live cross-plan derivation (F4, ADR-0045 §2 / ADR-0035 §30.5). GUARDED on "this plan has ≥1 active
    // cross-plan edge": a plan with none takes the branch below unchanged — an empty derived map means
    // `toEngineActivity` reads the raw M1 columns (byte-identical engine input ⇒ byte-identical output,
    // the parity gate). Only when an edge exists do we load the upstreams' persisted dates and OVERRIDE
    // each linked activity's external instants with the composed (later-of / tighter-of) value.
    const derivedExternalByActivity = new Map<string, DerivedExternalInstant>();
    let crossPlanUpstreamMissingCount: number | undefined;
    const crossPlanEdgeCount = await this.crossPlan.countActiveForPlan(organizationId, plan.id, tx);
    if (crossPlanEdgeCount > 0) {
      const [incomingRows, outgoingRows] = await Promise.all([
        this.crossPlan.loadIncomingWithPredecessorDates(organizationId, plan.id, tx),
        this.crossPlan.loadOutgoingWithSuccessorDates(organizationId, plan.id, tx),
      ]);
      // The M1 hand-entered columns (crossed to `YYYY-MM-DD`), composed with the derived bounds below.
      const m1 = new Map(
        activityRows.map((r) => [
          r.id,
          {
            externalEarlyStart: r.externalEarlyStart
              ? formatCalendarDate(r.externalEarlyStart)
              : null,
            externalLateFinish: r.externalLateFinish
              ? formatCalendarDate(r.externalLateFinish)
              : null,
          },
        ]),
      );
      // Durations in whole days (÷1440) for the FF/SF start-/finish-implied arithmetic (ADR-0036 §7).
      const durationDaysByActivity = new Map(
        activityRows.map((r) => [r.id, Math.round(r.durationMinutes / MINUTES_PER_DAY)]),
      );
      // Lag is stored in signed working-MINUTES; the day-denominated derivation uses whole days (÷1440).
      const incoming: IncomingCrossPlanEdge[] = incomingRows.map((e) => ({
        successorActivityId: e.successorId,
        type: e.type,
        lagDays: Math.round(e.lagMinutes / MINUTES_PER_DAY),
        predecessorEarlyStart: e.predecessorEarlyStart
          ? formatCalendarDate(e.predecessorEarlyStart)
          : null,
        predecessorEarlyFinish: e.predecessorEarlyFinish
          ? formatCalendarDate(e.predecessorEarlyFinish)
          : null,
      }));
      const outgoing: OutgoingCrossPlanEdge[] = outgoingRows.map((e) => ({
        predecessorActivityId: e.predecessorId,
        type: e.type,
        lagDays: Math.round(e.lagMinutes / MINUTES_PER_DAY),
        successorLateStart: e.successorLateStart ? formatCalendarDate(e.successorLateStart) : null,
        successorLateFinish: e.successorLateFinish
          ? formatCalendarDate(e.successorLateFinish)
          : null,
      }));
      const result = deriveExternalInstants({ incoming, outgoing, m1, durationDaysByActivity });
      for (const [id, instant] of result.derived) derivedExternalByActivity.set(id, instant);
      crossPlanUpstreamMissingCount = result.upstreamMissingCount;
    }

    const activities = activityRows.map((r) => {
      const { calId, driverMissing } = effectiveByActivity.get(r.id)!;
      return toEngineActivity(
        r,
        portFor(calId),
        driverMissing,
        derivedExternalByActivity.get(r.id),
      );
    });
    const edges = edgeRows.map((r) =>
      toEngineEdge(
        r,
        portFor(calIdByActivity.get(r.predecessorId) ?? null),
        portFor(calIdByActivity.get(r.successorId) ?? null),
      ),
    );
    // The plan's out-of-sequence recalc mode (M2, ADR-0035 §1); default RETAINED_LOGIC. Expected-finish
    // (M4, §9) resizes in-progress remaining; the critical definition + float threshold (M6, §17) decide
    // criticality; the day-denominated threshold is converted to working minutes for the engine.
    const options: ComputeOptions = {
      dataDate,
      calendar,
      progressMode: plan.progressRecalcMode,
      useExpectedFinishDates: plan.useExpectedFinishDates,
      criticalDefinition: plan.criticalPathDefinition,
      criticalFloatThresholdMinutes: plan.criticalFloatThreshold * MINUTES_PER_DAY,
      totalFloatMode: plan.totalFloatMode,
      makeOpenEndsCritical: plan.makeOpenEndsCritical,
      // Ignore external / inter-project relationships (ADR-0043 / ADR-0035 §30.4): when on, the engine
      // drops every activity's external early-start / late-finish bounds. Default false = byte-parity.
      ignoreExternalRelationships: plan.ignoreExternalRelationships,
    };

    // Resource levelling (M7, ADR-0041): the opt-in second pass. Load its demand model ONLY when the
    // plan opts in AND has active assignments — otherwise `leveling` is null and the recalc is the
    // byte-identical fast path (§7). Resource calendars reuse the per-recalc port cache built above.
    let leveling: { assignments: EngineAssignment[]; resources: EngineResource[] } | null = null;
    if (plan.levelResources) {
      const assignmentRows = await this.schedule.loadResourceAssignments(
        organizationId,
        plan.id,
        tx,
      );
      if (assignmentRows.length > 0) {
        const resourceRows = await this.schedule.loadLevellingResources(
          organizationId,
          plan.id,
          tx,
        );
        // Resolve each distinct resource calendar (≠ the plan calendar) to a port ONCE — reusing any
        // already built for the activity/driving-resource calendars above.
        for (const calId of new Set(
          resourceRows
            .map((r) => r.calendarId)
            .filter((id): id is string => id != null && id !== plan.calendarId),
        )) {
          if (!portByCalId.has(calId)) {
            portByCalId.set(calId, await this.resolveCalendar(organizationId, calId, tx));
          }
        }
        const resources: EngineResource[] = resourceRows.map((r) => ({
          id: r.id,
          capacity: r.maxUnitsPerHour === null ? null : r.maxUnitsPerHour.toNumber(),
          ...(portFor(r.calendarId) ? { calendar: portFor(r.calendarId)! } : {}),
        }));
        const assignments: EngineAssignment[] = assignmentRows.map((a) => ({
          activityId: a.activityId,
          resourceId: a.resourceId,
          // A NULL demand rate (ADR-0040 inert triad) contributes zero demand (parity-safe).
          unitsPerHour: a.unitsPerHour === null ? 0 : a.unitsPerHour.toNumber(),
        }));
        leveling = { assignments, resources };
      }
    }

    return {
      activities,
      edges,
      options,
      leveling,
      meta: {
        lagCalendarOverrideCount,
        activityCalendarCount: distinctActivityCalIds.length,
        progressedActivityCount,
        // Present only when the plan has cross-plan edges; absent (⇒ null in the log) on the parity path.
        ...(crossPlanUpstreamMissingCount !== undefined ? { crossPlanUpstreamMissingCount } : {}),
      },
    };
  }

  /**
   * The plan's working-day calendar for this recalculation, built once (ADR-0024).
   * A null `calendarId`, or a calendar that is missing/soft-deleted (defensive — the
   * delete-in-use guard prevents deleting an in-use calendar), falls back to
   * `allDaysWorkCalendar`, so the null path is byte-identical to M6 and the golden
   * suite still holds.
   */
  private async resolveCalendar(
    organizationId: string,
    calendarId: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<WorkingTimeCalendar> {
    if (!calendarId) return buildPlanCalendar(null);
    const calendar = await this.schedule.loadPlanCalendar(organizationId, calendarId, tx);
    // Build the engine's minute-granular calendar directly from the stored shift/window
    // rows (ADR-0036 §2); a missing/soft-deleted calendar falls back to all-days-work.
    return buildPlanCalendar(calendar);
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}

/**
 * The engine's remaining working minutes for an **in-progress** activity (M2, ADR-0035 §1): the
 * explicit `remainingDurationMinutes` when set, else derived from `durationMinutes × (1 −
 * percentComplete)` (rounded, floored at 0). Undefined for a not-started or complete activity — the
 * engine ignores it there (a complete activity uses its actual finish; not-started, its full duration).
 */
function resolveRemainingMinutes(row: ScheduleActivityRow): number | undefined {
  if (row.actualStart == null || row.actualFinish != null) return undefined;
  if (row.remainingDurationMinutes != null) return row.remainingDurationMinutes;
  return Math.max(0, Math.round(row.durationMinutes * (1 - row.percentComplete / 100)));
}

/**
 * Project a stored activity row onto the engine's input struct (durations are stored in minutes).
 * `calendar` is the activity's resolved own-calendar port (ADR-0037, M5) — undefined when it
 * inherits the plan calendar, keeping the byte-identical fast path. Progress actuals (M2) cross as
 * `YYYY-MM-DD`; `remainingMinutes` is the service-resolved remaining for an in-progress activity.
 * `derivedExternal` is the live cross-plan-derived override (F4, ADR-0045 §2) — present ONLY for an
 * activity with a cross-plan edge, and already composed with the M1 columns; absent ⇒ the raw M1
 * columns stand (the byte-identical fast path for a plan with no cross-plan edges).
 */
function toEngineActivity(
  row: ScheduleActivityRow,
  calendar?: WorkingTimeCalendar,
  resourceDriverMissing = false,
  derivedExternal?: DerivedExternalInstant,
): EngineActivity {
  const remainingMinutes = resolveRemainingMinutes(row);
  return {
    id: row.id,
    durationMinutes: row.durationMinutes,
    type: row.type,
    constraintType: row.constraintType,
    constraintDate: row.constraintDate ? formatCalendarDate(row.constraintDate) : null,
    secondaryConstraintType: row.secondaryConstraintType,
    secondaryConstraintDate: row.secondaryConstraintDate
      ? formatCalendarDate(row.secondaryConstraintDate)
      : null,
    // External / inter-project bounds (ADR-0043 / ADR-0035 §30): stored as absolute Timestamptz (UTC
    // midnight), crossed to the engine as calendar days — the same date→YYYY-MM-DD conversion as
    // constraintDate/expectedFinish/actualStart. Dropped inside the engine when ignore-external is on.
    // A live cross-plan edge OVERRIDES these with the F4-derived value (ADR-0045 §2), which already folds
    // in the M1 column (later-of / tighter-of); absent an edge, the raw M1 column stands (parity gate).
    externalEarlyStart: derivedExternal
      ? derivedExternal.externalEarlyStart
      : row.externalEarlyStart
        ? formatCalendarDate(row.externalEarlyStart)
        : null,
    externalLateFinish: derivedExternal
      ? derivedExternal.externalLateFinish
      : row.externalLateFinish
        ? formatCalendarDate(row.externalLateFinish)
        : null,
    visualStart: row.visualStart ? formatCalendarDate(row.visualStart) : null,
    scheduleAsLateAsPossible: row.scheduleAsLateAsPossible,
    levelingPriority: row.levelingPriority,
    actualStart: row.actualStart ? formatCalendarDate(row.actualStart) : null,
    actualFinish: row.actualFinish ? formatCalendarDate(row.actualFinish) : null,
    resumeDate: row.resumeDate ? formatCalendarDate(row.resumeDate) : null,
    expectedFinish: row.expectedFinish ? formatCalendarDate(row.expectedFinish) : null,
    ...(remainingMinutes !== undefined ? { remainingMinutes } : {}),
    ...(calendar ? { calendar } : {}),
    // Resource-dependent driver-missing (M7.2, ADR-0035 §23): the service sets this for a
    // RESOURCE_DEPENDENT activity with no active driver; the engine carries it to its result.
    ...(resourceDriverMissing ? { resourceDriverMissing: true } : {}),
  };
}

/**
 * Project a stored dependency row onto the engine's edge struct (lag is stored in minutes) and
 * resolve the per-relationship lag calendar (ADR-0036 §6 / ADR-0037): `TWENTY_FOUR_HOUR` measures
 * the lag as **elapsed** time (the 24/7 `allMinutesWorkCalendar`); `PREDECESSOR`/`SUCCESSOR` resolve
 * to the predecessor's / successor's own-calendar port (M5) — undefined when that endpoint inherits
 * the plan calendar; `PROJECT_DEFAULT` is always undefined (the plan calendar). An undefined port is
 * the engine's byte-identical fast path, so an all-inherit plan is unchanged from M3.
 */
function toEngineEdge(
  row: ScheduleEdgeRow,
  predecessorCalendar?: WorkingTimeCalendar,
  successorCalendar?: WorkingTimeCalendar,
): EngineEdge {
  const lagCalendar =
    row.lagCalendar === 'TWENTY_FOUR_HOUR'
      ? allMinutesWorkCalendar
      : row.lagCalendar === 'PREDECESSOR'
        ? predecessorCalendar
        : row.lagCalendar === 'SUCCESSOR'
          ? successorCalendar
          : undefined;
  return {
    id: row.id,
    predecessorId: row.predecessorId,
    successorId: row.successorId,
    type: row.type,
    lagMinutes: row.lagMinutes,
    ...(lagCalendar ? { lagCalendar } : {}),
  };
}
