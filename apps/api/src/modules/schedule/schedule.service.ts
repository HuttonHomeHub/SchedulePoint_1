import { Injectable } from '@nestjs/common';
import type { CriticalPathDefinition, Prisma, TotalFloatMode } from '@prisma/client';
import type {
  CrossPlanChangeReport,
  CrossPlanCorrelation,
  CrossPlanCorrelationRow,
  CrossPlanCriticalPathDelta,
  CrossPlanMovedActivity,
  CrossPlanPresenceActivity,
  CrossPlanRevisionCompare,
  HistogramGranularity,
  PlanEarnedValue,
  PlanFloatPaths,
  PlanScheduleSummary,
  ProgrammeScheduleLockedDetails,
  ProgrammeScheduleResult,
  HealthMetricResult,
  ResourceHistogramSeries,
  RevisionChangeReport,
  RevisionCompare,
  RevisionMovedActivity,
  RevisionPresenceActivity,
  RevisionSide,
  ScheduleHealthReport,
} from '@repo/types';
import { DEFAULT_HOURS_PER_DAY_MINUTES, LIVE_REVISION } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import {
  ForbiddenError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { attachDayFactors, resolveDayFactorMinutes } from '../activities/day-factor';
import { BaselineRepository } from '../baselines/baseline.repository';
import { classifyRevisionChanges } from '../baselines/revision-changes';
import { correlateByCode, correlateEdges } from '../baselines/revision-correlate';
import {
  computeRevisionDelta,
  type RevisionEdge,
  type RevisionRow,
} from '../baselines/revision-delta';
import { buildRevisionGhosts, buildRevisionLinkChanges } from '../baselines/revision-ghosts';
import {
  frozenRevisionEdges,
  frozenRevisionSide,
  liveRevisionEdges,
  liveRevisionSide,
  revisionDate,
} from '../baselines/revision-projections';
import { CalendarRepository } from '../calendars/calendar.repository';
import { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';

import { runCriticalPathTest } from './critical-path-test';
import {
  compareCriticalityRules,
  type CriticalityRule,
  type NullableCriticalityColumns,
  readCriticalityRule,
  toCriticalityOptions,
} from './criticality-rule';
import {
  deriveExternalInstants,
  type DerivedExternalInstant,
  type IncomingCrossPlanEdge,
  type OutgoingCrossPlanEdge,
} from './cross-plan-derivation';
import { MINUTES_PER_DAY } from './day-compat-calendar';
import { type RevisionInclude } from './dto/revision-compare-query.dto';
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
  type EvBaselineCostComponents,
  type HistogramAssignmentInput,
  type WorkingTimeCalendar,
} from './engine';
import { computeHealthReport } from './health/compute-health';
import type { HealthActivityInput } from './health/compute-health';
import {
  buildPlanCalendar,
  buildPlanCalendarOrReject,
  CALENDAR_HAS_NO_WORKING_TIME,
  CALENDAR_WORKING_TIME_UNREACHABLE,
  rejectIfWorkingTimeHorizonExceeded,
} from './plan-calendar';
import { ProgrammeCycleError, resolveProgrammeOrder } from './programme-order';
import { resolveRemainingMinutes } from './remaining-duration';
import {
  ScheduleRepository,
  type EarnedValueCostSnapshot,
  type ScheduleActivityRow,
  type ScheduleEdgeRow,
} from './schedule.repository';
import { computeStaleness } from './staleness';

/** A calendar-day (or null) as a `YYYY-MM-DD` string, for the pure EV read (the baselines `day` helper). */
function day(value: Date | null): string | null {
  return value ? formatCalendarDate(value) : null;
}

/**
 * Group an active cost baseline's **frozen per-assignment** cost components by source activity, or
 * `null` when this baseline has none to give (ADR-0071 M3 / CQ-1 option B).
 *
 * The level is read from the discriminator the capture wrote and from nothing else. A row count
 * cannot answer it: an `ASSIGNMENT`-level baseline of a plan with no resource assignments has zero
 * `baseline_assignments` rows and is nonetheless **exact**, while a pre-amendment baseline has zero
 * rows and can only ever be **approximated** — the same observation, two opposite answers. The
 * migration header states this as an invariant; the `switch` is where the code obeys it.
 *
 * The switch is deliberately **exhaustive with no `default`**: `BaselineCostSnapshotLevel` is a
 * database enum whose members the schema cannot pin to the rows, so a third level added later must
 * come back here and say which side it falls on. A `default` would silently choose one — and it would
 * choose it for money.
 */
function frozenCostComponents(
  snapshot: EarnedValueCostSnapshot | null,
): Map<string, EvBaselineCostComponents> | null {
  if (!snapshot) return null;
  switch (snapshot.costSnapshotLevel) {
    case 'ACTIVITY':
      // Captured before per-assignment cost was snapshotted. The breakdown was never recorded and
      // cannot be recovered from a frozen total, so PV keeps the live-share approximation for the
      // life of this baseline — counted out to the reader as `costPhasingApproximatedCount`.
      return null;
    case 'ASSIGNMENT': {
      // Seed EVERY snapshotted activity, not only the ones with components: an activity that had no
      // assignments at capture is exactly known to have had none, and must not fall through to the
      // live mix it may have acquired since.
      const byActivity = new Map<string, EvBaselineCostComponents>(
        snapshot.activities.map((a) => [
          a.sourceActivityId,
          { budgetedExpense: Number(a.budgetedExpense ?? 0n), assignments: [] },
        ]),
      );
      for (const a of snapshot.assignments) {
        byActivity.get(a.sourceActivityId)?.assignments.push({
          budgetedCost: Number(a.budgetedCost),
          lagMinutes: a.lagMinutes,
        });
      }
      return byActivity;
    }
  }
}

/** Machine-readable reasons carried in a schedule {@link ValidationError}. */
export const SCHEDULE_ERROR = {
  /** The plan has no `plannedStart`, so there is no data date to schedule from. */
  PLAN_START_REQUIRED: 'PLAN_START_REQUIRED',
  /** The requested histogram granularity would produce too many buckets (ask for a coarser one). */
  HISTOGRAM_GRANULARITY_TOO_FINE: 'HISTOGRAM_GRANULARITY_TOO_FINE',
  /**
   * The plan's calendar has no working time at all — an empty base week AND no working
   * exception — so nothing can ever be scheduled on it. A window-only base week is a valid
   * shape (ADR-0036 §2, TECH_DEBT #79); it just needs at least one working exception to carry
   * the hours. Only the engine sees both halves, which is why this is raised there and phrased
   * here rather than guarded at the DTO.
   */
  CALENDAR_HAS_NO_WORKING_TIME,
  /**
   * The walk-time sibling (`docs/TECH_DEBT.md` #205(b)): a calendar that HAS working time,
   * placed where the schedule cannot reach it within the engine's horizon — a blackout longer
   * than the cap, or a window-only calendar whose one working exception sits years from the
   * dates being walked. Raised by the engine's `WorkingTimeHorizonExceededError` and phrased in
   * `rejectIfWorkingTimeHorizonExceeded`.
   */
  CALENDAR_WORKING_TIME_UNREACHABLE,
  /** The programme's upstream closure exceeds {@link MAX_PROGRAMME_PLANS} — too many plans to solve
   * synchronously in one request (ADR-0045: M2 is a synchronous, bounded solve; a background/queued
   * programme recalc is the deferred next slice). */
  PROGRAMME_TOO_LARGE: 'PROGRAMME_TOO_LARGE',
} as const;

/**
 * The hard ceiling on a programme recalc's upstream closure (ADR-0045 §4). M2 solves a programme
 * **synchronously** in one HTTP request — N sequential per-plan transactions — so an unbounded closure
 * is an unbounded-latency risk (backend-performance-review). A construction programme's interdependent
 * plan count is small; beyond this we reject with 422 `PROGRAMME_TOO_LARGE` rather than run an
 * open-ended request. Lifting this ceiling means the deferred background/queued solve (ADR-0009), not
 * a bigger number here.
 */
const MAX_PROGRAMME_PLANS = 50;

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
/**
 * The cap on each of `entered` / `left`. The TRUE totals travel beside the rows, so a client never
 * computes "showing 50 of 412" from a number it holds itself (ADR-0116 D4).
 *
 * 200 is generous against what the panel can show and small enough that a pathological plan cannot
 * turn one read into an unbounded response. It is deliberately NOT a page size: this is an analysis,
 * and a planner paging through 412 activities that entered the critical path has a different problem
 * from the one this feature solves.
 */
export const REVISION_ROW_CAP = 200;

/**
 * Fill one capped sample from two sides so neither can be crowded out (`docs/TECH_DEBT.md` #263(f)).
 *
 * Each side is guaranteed **half** the budget when it can use it, and whatever it cannot use passes
 * to the other — so a one-sided population still fills the cap, and a two-sided one is always
 * visibly two-sided. The alternative, capping each side at the full budget, doubles the array's
 * maximum and silently stops the published `cap` from describing the field.
 */
export function takeBothSides<T>(from: readonly T[], to: readonly T[], cap: number): T[] {
  const half = Math.floor(cap / 2);
  const fromTake = Math.min(from.length, Math.max(half, cap - to.length));
  const toTake = Math.min(to.length, cap - fromTake);
  return [...from.slice(0, fromTake), ...to.slice(0, toTake)];
}

/**
 * A comparison side's identity — a named baseline, or the plan as it stands now.
 *
 * Shared by both comparison routes rather than assembled twice: with two plans in play the LIVE
 * branch has to read its data date and computed-at from the RIGHT plan, and a second copy is the
 * one that would eventually read the wrong one.
 */
function revisionSideOf(
  baseline: {
    id: string;
    name: string;
    capturedAt: Date;
    dataDate: Date | null;
  } | null,
  plan: { scheduleComputedAt: Date | null; plannedStart: Date | null },
): RevisionSide {
  return baseline
    ? {
        kind: 'BASELINE',
        id: baseline.id,
        name: baseline.name,
        computedAt: baseline.capturedAt.toISOString(),
        dataDate: revisionDate(baseline.dataDate),
      }
    : {
        kind: 'LIVE',
        id: null,
        name: null,
        computedAt: plan.scheduleComputedAt ? plan.scheduleComputedAt.toISOString() : null,
        dataDate: revisionDate(plan.plannedStart),
      };
}

/** The criticality rule a side's numbers were computed under — frozen on a baseline, live on a plan. */
function criticalityRuleOf(
  baseline: NullableCriticalityColumns | null,
  plan: {
    scheduleCriticalPathDefinition: CriticalPathDefinition | null;
    scheduleCriticalFloatThresholdMinutes: number | null;
    scheduleTotalFloatMode: TotalFloatMode | null;
    scheduleMakeOpenEndsCritical: boolean | null;
  },
): ReturnType<typeof readCriticalityRule> {
  return baseline
    ? readCriticalityRule(baseline)
    : readCriticalityRule({
        criticalPathDefinition: plan.scheduleCriticalPathDefinition,
        criticalFloatThresholdMinutes: plan.scheduleCriticalFloatThresholdMinutes,
        totalFloatMode: plan.scheduleTotalFloatMode,
        makeOpenEndsCritical: plan.scheduleMakeOpenEndsCritical,
      });
}

/**
 * An empty criticality delta — **zeroed, never partial**.
 *
 * A half-reported delta over a side that was never computed, or over two plans with nothing in
 * common, is the same lie in a smaller font. `notAssessableReason` is what the caller sets; the rest
 * is the same in both refusals, so it is written once.
 */
const EMPTY_CRITICAL_PATH_DELTA = {
  entered: [],
  left: [],
  enteredTotal: 0,
  leftTotal: 0,
  cap: REVISION_ROW_CAP,
  remainedCriticalCount: 0,
  remainedNonCriticalCount: 0,
  added: [],
  removed: [],
  addedTotal: 0,
  removedTotal: 0,
  noCriticalPath: false,
  notAssessableReason: null,
} as const satisfies CrossPlanCriticalPathDelta;

@Injectable()
export class ScheduleService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly schedule: ScheduleRepository,
    private readonly calendars: CalendarRepository,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    private readonly crossPlan: CrossPlanDependencyRepository,
    // The revision comparison reads both sides through the baselines repository: the frozen side
    // from `baseline_activities`, the live side from `activities`. ScheduleModule imports
    // BaselinesModule for it; BaselinesModule imports neither, so there is no cycle.
    private readonly baselines: BaselineRepository,
    @InjectPinoLogger(ScheduleService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * The day↔minute factor for each activity in a recalculation (ADR-0068 §4), keyed by activity id.
   *
   * One lookup for every DISTINCT calendar in the plan, not one per activity — a 2,000-activity plan
   * on three calendars costs three rows. An activity with no calendar takes the 24-hour constant,
   * which is also what `buildPlanCalendar` falls back to, so the unit and the schedule agree.
   */
  private async resolveDayFactors(
    calIdByActivity: ReadonlyMap<string, string | null>,
    tx: Prisma.TransactionClient,
  ): Promise<Map<string, number>> {
    const ids = [...new Set([...calIdByActivity.values()])].filter(
      (id): id is string => id !== null,
    );
    const factors = await this.calendars.findHoursPerDayMinutes(ids, tx);
    return new Map(
      [...calIdByActivity].map(([activityId, calId]) => [
        activityId,
        calId === null
          ? DEFAULT_HOURS_PER_DAY_MINUTES
          : (factors.get(calId) ?? DEFAULT_HOURS_PER_DAY_MINUTES),
      ]),
    );
  }

  async recalculate(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanScheduleSummary> {
    return (await this.recalculatePlan(principal, orgSlug, planId)).summary;
  }

  /**
   * The ADR-0022 single-plan recalc body — the shared unit reused verbatim by both the public
   * {@link recalculate} and the programme orchestrator {@link recalculateProgramme}. Resolves the org
   * (anti-IDOR) + asserts `schedule:calculate`, loads the plan (404) and its `plannedStart` (422), then —
   * under the plan advisory lock, in ONE transaction, with the pen asserted — runs the pure engine and
   * persists the engine-owned columns. Returns the public {@link PlanScheduleSummary} plus the run's N32
   * `crossPlanUpstreamMissingCount` (0 on the byte-parity path), which the programme roll-up sums; the
   * public {@link recalculate} drops the count. Not a new transaction shape — the exact per-plan unit the
   * programme solve invokes once per plan, in the deterministic topological order.
   */
  private async recalculatePlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<{ summary: PlanScheduleSummary; crossPlanUpstreamMissingCount: number }> {
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
        // Float and drift are persisted IN DAYS by this write, so they take the same factor the
        // durations do (ADR-0068 §3a). Leaving them at 1440 would print "3 days duration, 1 day
        // float" for one span — not a smaller change than converting them, an incoherent one.
        const dayFactorByActivity = await this.resolveDayFactors(graph.calIdByActivity, tx);
        await this.schedule.writeResults(organization.id, planId, results, dayFactorByActivity, tx);
        await this.schedule.writeDrivingFlags(organization.id, planId, output.edges, tx);
        // Stamp this plan's schedule freshness cursor in the SAME engine-owned write path (F6, ADR-0045
        // §5 / ADR-0035 §30.7): a raw UPDATE that touches ONLY `schedule_computed_at`, never
        // version/updated_at (ADR-0022). Both the single-plan recalc and the programme solve (which loops
        // this unit, upstream-first) stamp every plan they write, so a downstream can compare freshness on
        // read and a programme recalc clears any staleness it introduced.
        // …and the criticality rule the engine ABOVE actually ran with (ADR-0125 / CQ-1 Option B).
        // `graph.criticality` is the very object spread into `graph.options`, not a re-read of the
        // plan row: `plan` was loaded before this transaction opened and a settings PATCH takes no
        // plan lock, so re-reading could stamp a rule this computation never used.
        await this.schedule.stampScheduleComputedAt(planId, graph.criticality, tx);
        return summary;
      });
    } catch (error) {
      // The engine's walk-time horizon guard is a user-caused, user-fixable state
      // (`docs/TECH_DEBT.md` #205(b)) — map it to a 422 naming the calendar where the plan has
      // exactly one in play. `activityCalendarCount` was captured before the compute threw.
      rejectIfWorkingTimeHorizonExceeded(error, {
        planCalendarId: plan.calendarId ?? null,
        activityCalendarCount,
      });
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

    const planSummary: PlanScheduleSummary = {
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
    // Surface the run's N32 count (0 on the byte-parity path) so the programme roll-up can sum it; the
    // public `recalculate` drops it (it never reached the single-plan summary).
    return {
      summary: planSummary,
      crossPlanUpstreamMissingCount: crossPlanUpstreamMissingCount ?? 0,
    };
  }

  /**
   * **Programme recalculation** (inter-project M2, ADR-0045 §4 / ADR-0035 §30.8) — recalculate the target
   * plan's UPSTREAM cross-plan **closure** in topological order (upstream-first) so the target's derived
   * inter-project bounds (ADR-0045 §2, the F4 seam) are fresh. The pure engine is untouched; each plan is
   * recalculated with the **existing** single-plan {@link recalculatePlan} unit — its own ADR-0022
   * transaction + plan advisory lock + pen — acquired in the deterministic topological order (a stable lock
   * order ⇒ two overlapping programme recalcs cannot deadlock, §4). A programme with no cross-plan edges
   * has a closure of just the target, so this is exactly a single-plan recalc.
   *
   * Authorisation mirrors the single-plan recalc (`schedule:calculate`, Planner + Org Admin); the target
   * plan must be active in the caller's org (404). Because the recalc **writes** every plan in the closure,
   * the default policy (Critical Question 3) is **fail-fast**: a pre-flight pass asserts the pen on EVERY
   * closure plan BEFORE any write, collecting ALL blocked plans and — if any is held by another editor —
   * throwing a single 423 `LockedError` carrying the blocked-plan list, so nothing is written. (The pen is
   * asserted a second time inside each plan's transaction by {@link recalculatePlan}, unchanged.)
   */
  async recalculateProgramme(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<ProgrammeScheduleResult> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:calculate', organization.id);

    // The target must be an active plan in the caller's org (404, anti-IDOR) before we touch the graph.
    const target = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!target) throw new NotFoundError('Plan not found.');

    // Resolve the upstream closure + its deterministic topological (upstream-first) order. The adjacency
    // is the org's active cross-plan edge set (plan-grain, small); with no edge the closure is [target].
    const edges = await this.crossPlan.loadOrgAdjacency(organization.id);
    let order: string[];
    try {
      order = resolveProgrammeOrder(planId, edges);
    } catch (error) {
      // A residual plan-level cycle breaches the DAG invariant (ADR-0045 §3) — it should be unreachable.
      // Log distinctly and rethrow so the global filter returns an opaque alarm-worthy 500 (nothing written).
      if (error instanceof ProgrammeCycleError) {
        this.logger.error(
          { organizationId: organization.id, planId, unresolvedPlanIds: error.unresolvedPlanIds },
          'programme graph DAG invariant breached',
        );
      }
      throw error;
    }

    // Backpressure (backend-performance-review): M2 solves the programme synchronously — one request,
    // N sequential per-plan transactions — so cap the closure. Reject up-front (422) before the pen
    // pre-flight or any write, so an over-large programme can never open an unbounded request. The
    // ceiling is a plan count (the closure is plan-grain, not activities).
    if (order.length > MAX_PROGRAMME_PLANS) {
      throw new ValidationError(
        `This programme spans ${order.length} interdependent plans, above the ${MAX_PROGRAMME_PLANS}-plan ` +
          'limit for a single recalculation. Recalculate a smaller sub-programme.',
        { reason: SCHEDULE_ERROR.PROGRAMME_TOO_LARGE, planCount: order.length },
      );
    }

    // Pre-flight pen check (fail-fast, CQ-3 default): assert the pen on EVERY closure plan BEFORE any
    // write, COLLECTING every blocked plan (not failing on the first). `assertHoldsPen` is inert unless
    // enforcement is on, so this is a no-op in the default config; when enforced it fails fast with the
    // full blocked-plan list. A non-lock error (never expected here) propagates unchanged.
    const blockedPlanIds: string[] = [];
    for (const closurePlanId of order) {
      try {
        await this.editLock.assertHoldsPen(principal, closurePlanId, organization.id);
      } catch (error) {
        if (error instanceof LockedError) blockedPlanIds.push(closurePlanId);
        else throw error;
      }
    }
    if (blockedPlanIds.length > 0) {
      this.logger.warn(
        { organizationId: organization.id, planId, blockedPlanIds },
        'programme recalculation blocked by peer-held plan locks',
      );
      throw new LockedError(
        'One or more plans in this programme are being edited by someone else. Programme recalculation ' +
          'wrote nothing.',
        {
          reason: 'PROGRAMME_PLANS_LOCKED',
          blockedPlanIds,
        } satisfies ProgrammeScheduleLockedDetails,
      );
    }

    // Recalculate each plan in topological order, reusing the single-plan transaction verbatim. Upstreams
    // come first, so each downstream plan reads its upstreams' freshly-written dates when it derives (§2).
    const startedAt = Date.now();
    const plans: ProgrammeScheduleResult['plans'] = [];
    let crossPlanUpstreamMissingCount = 0;
    for (const closurePlanId of order) {
      const planStartedAt = Date.now();
      const { summary, crossPlanUpstreamMissingCount: missing } = await this.recalculatePlan(
        principal,
        orgSlug,
        closurePlanId,
      );
      crossPlanUpstreamMissingCount += missing;
      plans.push({ planId: closurePlanId, summary });
      this.logger.debug(
        {
          organizationId: organization.id,
          targetPlanId: planId,
          planId: closurePlanId,
          crossPlanUpstreamMissingCount: missing,
          durationMs: Date.now() - planStartedAt,
        },
        'programme recalculation — plan recalculated',
      );
    }

    this.logger.info(
      {
        organizationId: organization.id,
        targetPlanId: planId,
        userId: principal.userId,
        // The closure in recalculation order (upstream-first, target last) — the audit of what ran.
        closure: order,
        planCount: order.length,
        // N32 summed across the closure (ADR-0035 §30.5): cross-plan edges whose upstream was never
        // calculated, contributing no derived bound. 0 on the byte-parity path.
        crossPlanUpstreamMissingCount,
        durationMs: Date.now() - startedAt,
      },
      'programme recalculated',
    );

    return {
      plans,
      programme: { planCount: order.length, crossPlanUpstreamMissingCount },
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
    const summary: PlanScheduleSummary = {
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

    // Cross-plan staleness (F6, ADR-0045 §5 / ADR-0035 §30.7) — computed on READ (pull; no push job in
    // M2). GUARDED on "this plan has ≥1 cross-plan edge" (the same cheap count `buildEngineGraph` reads):
    // a plan with none returns the summary above UNCHANGED, so its two staleness fields stay ABSENT and
    // existing summary responses/goldens are byte-identical (the parity path). When an edge exists,
    // resolve the plan's UPSTREAM closure (its transitive cross-plan predecessors) and compare each
    // upstream's `schedule_computed_at` against this plan's in ONE batched query (no N+1, bounded by the
    // small plan-level graph): stale iff any upstream is newer (or this plan was never computed while an
    // upstream has). A programme recalc — which recomputes upstream-first — clears it.
    const crossPlanEdgeCount = await this.crossPlan.countActiveForPlan(organization.id, planId);
    if (crossPlanEdgeCount > 0) {
      const edges = await this.crossPlan.loadOrgAdjacency(organization.id);
      // The upstream closure, topologically ordered with the target LAST; strip the target to leave its
      // transitive upstreams (empty when the plan only has outgoing/downstream cross-plan edges).
      const upstreamPlanIds = resolveProgrammeOrder(planId, edges).filter((id) => id !== planId);
      const freshnessById = await this.schedule.loadScheduleComputedAt(organization.id, [
        planId,
        ...upstreamPlanIds,
      ]);
      const { scheduleStale, staleUpstreamPlanIds } = computeStaleness(
        freshnessById.get(planId) ?? null,
        upstreamPlanIds.map((id) => ({ planId: id, computedAt: freshnessById.get(id) ?? null })),
      );
      summary.scheduleStale = scheduleStale;
      summary.staleUpstreamPlanIds = staleUpstreamPlanIds;
    }

    return summary;
  }

  /**
   * The ranked contiguous **float paths** into a target activity (P6 "multiple float paths",
   * ADR-0035 §19) — a read-only CPM analysis (`schedule:read`, every member). Recomputes the schedule
   * live from the plan's active graph (never mutates or persists), then walks the driving chains into
   * the target: path 0 is its own driving chain (relative float 0), branch paths follow in
   * non-decreasing relative-float order, bounded by `maxPaths`. Requires a plan start (422) for a data
   * date; 404s if the target activity is not active in this plan.
   *
   * Relative float is returned in working **minutes** (`relativeFloatMinutes`) and in nothing else.
   * This sentence used to say "working days (÷1440)" and went on saying it after F4 M0 changed the
   * behaviour underneath it — the ADR-0058 failure, one method along from the fix. A day is a
   * per-calendar quantity (ADR-0068); the caller converts against the calendar it is presenting on.
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
    const { activities, edges, options, meta } = await this.prisma.$transaction((tx) =>
      this.buildEngineGraph(organization.id, plan, dataDate, tx),
    );
    // The engine returns [] for an unknown target; surface that as a 404 rather than an empty result
    // so a mistyped id is not silently "no paths". A present target always yields path 0 (target-first).
    if (!activities.some((a) => a.id === targetActivityId)) {
      throw new NotFoundError('Activity not found in this plan.');
    }

    // Ask for ONE more path than the caller wants, so "is there more?" is answered by the analysis
    // rather than guessed. `engine/float-paths.ts` is deliberately not modified: adding a `hasMore`
    // to a pure engine module's return type would change its contract and its goldens for what is
    // purely a presentation concern. The extra chain walk is bounded by the same per-chain depth
    // guard and is negligible beside the `computeSchedule` call that dominates this request.
    //
    // Note the probe deliberately exceeds the DTO's declared `maxPaths` ceiling by one. That ceiling
    // is REQUEST validation; this internal call is not re-validated, and clamping it here would
    // silently disable the probe at the top of the range.
    let found;
    try {
      found = computeFloatPaths(activities, edges, options, targetActivityId, maxPaths + 1);
    } catch (error) {
      // `computeFloatPaths` runs `computeSchedule` over the same graph `recalculate` builds, so
      // the engine's walk-time horizon guard is reachable here too and takes the same 422
      // (`docs/TECH_DEBT.md` #205(b) — this was one of the three seams the reconciliation pass's
      // api review found still answering a raw 500, one door over from the fixed pair).
      rejectIfWorkingTimeHorizonExceeded(error, {
        planCalendarId: plan.calendarId ?? null,
        activityCalendarCount: meta.activityCalendarCount,
      });
      throw error;
    }
    const hasMorePaths = found.length > maxPaths;
    const paths = found.slice(0, maxPaths).map((p) => ({
      index: p.index,
      // The engine's working minutes, carried through unconverted — there is deliberately no day
      // form beside it. A day is a per-calendar quantity (ADR-0068) and total float is measured on
      // the ACTIVITY'S OWN calendar (ADR-0037 §4), so this envelope has no single factor to divide
      // by: the paths it returns can span activities on different calendars. Converting here would
      // have to pick one and be wrong for the rest, which is what the removed `relativeFloat` did.
      relativeFloatMinutes: p.relativeFloat,
      activityIds: p.activityIds,
    }));
    return { targetActivityId, paths, hasMorePaths };
  }

  /**
   * The plan's **DCMA 14-point health check** (health M1) — a pure READ over the persisted
   * definition and CPM columns, gated on `schedule:read` (any member). Resolves the org from the
   * caller's memberships (anti-IDOR) and asserts the permission BEFORE any load; 404s if the plan
   * is not in the caller's org.
   *
   * **No plan write lock, no advisory lock, no transaction, no pen (ADR-0028), and no
   * `computeSchedule`.** The absences are an ADVANTAGE over both benchmark endpoints, not a
   * resemblance (spec §3.3): `floatPaths` runs a full CPM computation per call and `recalculate`
   * additionally locks and writes — this route can neither block a planner's recalculation nor be
   * blocked by one. The only concurrency question it raises is staleness, which `computedAt` makes
   * visible on the face of the report.
   *
   * The response carries no cost, rate or budget field at any depth (G4 pins it), so it cannot
   * vary by `cost:read` — one URL produces one document, whoever reads it (spec §3.2).
   */
  async getHealthCheck(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<ScheduleHealthReport> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const [activityRows, edges, baselineSnapshot, assignedIds, planCalendar] = await Promise.all([
      this.schedule.loadHealthActivities(organization.id, planId),
      this.schedule.loadEdges(organization.id, planId),
      this.schedule.loadActiveBaselineHealthSnapshot(organization.id, planId),
      this.schedule.loadHealthAssignedActivityIds(organization.id, planId),
      this.resolveCalendar(organization.id, plan.calendarId),
    ]);

    // Each activity's OWN day↔minute factor (ADR-0068) in one batched lookup — metric 8's
    // conversion, never a constant and never a per-row query — beside the plan's own factor for
    // CPLI's working-day arithmetic (the `variance.ts` shape, ADR-0025). The two lookups are
    // independent PK reads against the same small table, so they share one round trip rather than
    // running sequentially (the M5 backend-performance review's one suggestion, folded).
    const [withFactors, planFactor] = await Promise.all([
      attachDayFactors(this.calendars, activityRows, new Map([[planId, plan.calendarId]])),
      resolveDayFactorMinutes(this.calendars, {
        activityCalendarId: null,
        planCalendarId: plan.calendarId,
      }),
    ]);
    const workingDaysBetween = (from: string, to: string): number =>
      Math.round(planCalendar.workingTimeBetween(from, to) / planFactor);

    const date = (value: Date | null): string | null => (value ? formatCalendarDate(value) : null);

    const activities: HealthActivityInput[] = withFactors.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      status: r.status,
      constraintType: r.constraintType,
      constraintDate: date(r.constraintDate),
      secondaryConstraintType: r.secondaryConstraintType,
      secondaryConstraintDate: date(r.secondaryConstraintDate),
      totalFloat: r.totalFloat,
      durationMinutes: r.durationMinutes,
      remainingDurationMinutes: r.remainingDurationMinutes,
      percentComplete: r.percentComplete,
      actualStart: date(r.actualStart),
      actualFinish: date(r.actualFinish),
      earlyStart: date(r.earlyStart),
      earlyFinish: date(r.earlyFinish),
      dayFactorMinutes: r.dayFactorMinutes,
      hasAssignment: assignedIds.has(r.id),
    }));

    return computeHealthReport({
      plan: {
        id: plan.id,
        name: plan.name,
        dataDate: formatCalendarDate(plan.plannedStart),
        computedAt: plan.scheduleComputedAt?.toISOString() ?? null,
        schedulingMode: plan.schedulingMode,
      },
      activities,
      dependencies: edges.map((e) => ({
        id: e.id,
        predecessorId: e.predecessorId,
        successorId: e.successorId,
        type: e.type,
        lagMinutes: e.lagMinutes,
      })),
      baseline: baselineSnapshot
        ? {
            id: baselineSnapshot.id,
            name: baselineSnapshot.name,
            capturedAt: baselineSnapshot.capturedAt.toISOString(),
            capturedProjectFinish: date(baselineSnapshot.capturedProjectFinish),
            activities: baselineSnapshot.activities.map((b) => ({
              sourceActivityId: b.sourceActivityId,
              baselineFinish: date(b.baselineFinish),
            })),
          }
        : null,
      workingDaysBetween,
    });
  }

  /**
   * **DCMA metric 12, computed for real** (health M6, ADR-0116 D7) — a what-if perturbation on an
   * in-memory copy of the plan's graph, `schedule:read` (any member).
   *
   * **This route's parity sentence is D7's, never D1's**: the CPM engine IS invoked here — twice —
   * and the claim that holds is the different, weaker one: it **computes read-only and persists
   * nothing**. No plan lock, no pen, and the one transaction is the read-snapshot
   * `buildEngineGraph` shares with `floatPaths`; no write path is reachable from this method, and
   * the non-mutation e2e proves it by reading every engine-owned column back after the call.
   */
  async getCriticalPathTest(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<HealthMetricResult> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'schedule:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    if (!plan.plannedStart) {
      throw new ValidationError(
        'Set the plan’s start date before running the critical path test.',
        {
          reason: SCHEDULE_ERROR.PLAN_START_REQUIRED,
        },
      );
    }
    const dataDate = formatCalendarDate(plan.plannedStart);

    // The same read snapshot `floatPaths` takes: the exact engine-input builder `recalculate`
    // uses, so the what-if can never drift from what a real recalculation would compute.
    //
    // **`graph.leveling` is deliberately NOT taken, and that is a KNOWN GAP rather than a
    // decision** (`docs/TECH_DEBT.md` #248, ADR-0116 addendum 2026-09-10). `buildEngineGraph` also
    // returns `leveling: { assignments, resources } | null`, and `recalculate` runs
    // `levelSchedule` with it whenever `plan.levelResources` is true and persists THAT result — so
    // on a levelled plan this what-if perturbs a schedule the product does not display, and
    // measures the movement against a baseline the planner never sees.
    //
    // The sentence above ("can never drift from what a real recalculation would compute") is
    // therefore true of the INPUT and not of the passes run over it. It is left standing because it
    // is the reason the builder is shared at all; this note is what stops it being read as a
    // guarantee about the output.
    //
    // Named here rather than left implicit because the drop was invisible: a destructure that omits
    // a field looks exactly like a destructure of a type that never had one, every number the route
    // returns is internally consistent, and the seeded fixture has `level_resources = false`, so no
    // test could report it. Threading it through and levelling BOTH passes is the correct fix and
    // is the open half of #248.
    const [{ activities, edges, options, meta }, labelRows] = await Promise.all([
      this.prisma.$transaction((tx) => this.buildEngineGraph(organization.id, plan, dataDate, tx)),
      this.schedule.loadHealthActivities(organization.id, planId),
    ]);
    // One narrow loader serves both jobs: display labels for the offender/detail fields, and each
    // activity's own day↔minute factor (ADR-0068) for the injection's unit.
    const withFactors = await attachDayFactors(
      this.calendars,
      labelRows,
      new Map([[planId, plan.calendarId]]),
    );
    const byId = new Map(withFactors.map((r) => [r.id, r]));

    try {
      return runCriticalPathTest({
        activities,
        edges,
        options,
        dayFactorMinutesOf: (id) => byId.get(id)?.dayFactorMinutes ?? DEFAULT_HOURS_PER_DAY_MINUTES,
        labelOf: (id) => {
          const row = byId.get(id);
          return { code: row?.code ?? null, name: row?.name ?? 'Unknown activity' };
        },
      });
    } catch (error) {
      // The what-if runs the same two passes a recalculation would, so the walk-time horizon
      // guard is reachable here too and takes the same 422 (`docs/TECH_DEBT.md` #205(b)).
      rejectIfWorkingTimeHorizonExceeded(error, {
        planCalendarId: plan.calendarId ?? null,
        activityCalendarCount: meta.activityCalendarCount,
      });
      throw error;
    }
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

    const [activityRows, snapshot, calendar] = await Promise.all([
      this.schedule.loadEarnedValueActivities(organization.id, planId),
      this.schedule.loadActiveBaselineCostSnapshot(organization.id, planId),
      this.resolveCalendar(organization.id, plan.calendarId),
    ]);

    // Join the active baseline's cost snapshot by source activity id; a missing row (or no active
    // baseline at all) leaves the baseline fields null → the module's live-budget PV fallback.
    const baselineById = new Map((snapshot?.activities ?? []).map((s) => [s.sourceActivityId, s]));
    const componentsById = frozenCostComponents(snapshot);
    const activities: EvActivityInput[] = activityRows.map((r) => {
      const base = baselineById.get(r.id) ?? null;
      const frozen = componentsById?.get(r.id);
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
          // The join delay (ADR-0071 §1) phases THIS assignment's cost from when its resource arrives.
          // Spread only when non-zero, so an unlagged plan builds the identical object the EV read
          // received before the column existed and takes the single-window fast path by construction.
          ...(a.lagMinutes > 0 ? { lagMinutes: a.lagMinutes } : {}),
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
        // The baseline's own frozen breakdown, when it captured one (ADR-0071 M3). Spread only when
        // present, so an activity outside an ASSIGNMENT-level snapshot builds the identical object the
        // EV read received before, and the live-share path is preserved rather than re-derived.
        ...(frozen ? { baselineCostComponents: frozen } : {}),
        earlyStart: day(r.earlyStart),
        earlyFinish: day(r.earlyFinish),
      };
    });

    const dataDate = plan.plannedStart ? formatCalendarDate(plan.plannedStart) : null;
    let result;
    try {
      result = computeEarnedValue({
        activities,
        dataDate,
        eacMethod: plan.eacMethod,
        calendar,
      });
    } catch (error) {
      // "It NEVER recomputes" is true of `computeSchedule` and irrelevant to the walk: the
      // per-assignment PV phasing lag (ADR-0071 §1) calls `addWorkingTime` on the ONE resolved
      // plan calendar, so the horizon guard is reachable by this different door and takes the
      // same 422 (#205(b), found by the reconciliation pass's api review). `activityCalendarCount`
      // is 0 because this read walks only the plan calendar — the mapper may name it.
      rejectIfWorkingTimeHorizonExceeded(error, {
        planCalendarId: plan.calendarId ?? null,
        activityCalendarCount: 0,
      });
      throw error;
    }

    return {
      dataDate,
      eacMethod: plan.eacMethod,
      currencyCode: plan.currencyCode,
      costBaselineMissing: result.costBaselineMissing,
      costWarningCount: result.costWarningCount,
      costPhasingLaggedCount: result.costPhasingLaggedCount,
      costPhasingApproximatedCount: result.costPhasingApproximatedCount,
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
      // The assignment's own join delay (ADR-0071 §1), measured on the activity's calendar resolved
      // just above — so the lag walks the same working time the span does. Until M0 there was no
      // column to read and this was pinned at 0 under a comment saying so; that comment outlived the
      // column by one milestone, which is exactly the drift the surface audit exists to catch.
      lagMinutes: r.lagMinutes,
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
      // The per-assignment lag phasing walks each assignment's OWN resolved calendar
      // (`portFor` above), so the horizon guard is reachable here too and takes the same 422
      // (#205(b), found by the reconciliation pass's api review). The count of distinct
      // non-plan calendars in play decides whether the mapper may name one.
      rejectIfWorkingTimeHorizonExceeded(error, {
        planCalendarId: plan.calendarId ?? null,
        activityCalendarCount: portByCalId.size,
      });
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
    /** The criticality rule spread into {@link options} above — carried out so the write path can
     * stamp the SAME four values onto `plans` beside the freshness cursor (ADR-0125 / CQ-1 Option B).
     * Read from here, never re-derived from the plan row: the plan is loaded OUTSIDE the transaction
     * and before `lockPlanForWrite`, and a settings PATCH takes no plan lock, so a second read could
     * return a rule the engine did not run with. */
    criticality: CriticalityRule;
    /** The resource-levelling demand model — loaded ONLY when the plan opts in (`levelResources`) and
     * has active assignments; null keeps the byte-identical fast path (ADR-0041 §7). */
    leveling: { assignments: EngineAssignment[]; resources: EngineResource[] } | null;
    /** The calendar each activity SCHEDULES on, keyed by activity id — the day↔minute factor's
     * source for the day-denominated float columns this recalculation persists (ADR-0068 §3a). */
    calIdByActivity: ReadonlyMap<string, string | null>;
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
      // Durations in whole days for the FF/SF start-/finish-implied arithmetic (ADR-0036 §7).
      //
      // **Fixed 1440 here, deliberately — NOT the calendar's hours-per-day** (ADR-0068 §3b). This is
      // the one place a day-denominated value becomes engine INPUT: `deriveExternalInstants` walks
      // `addDays` over CALENDAR days, so what it needs is elapsed days, not working ones. Feeding it
      // a working-hours-scaled value would compound two approximations in the only spot where the
      // result moves computed dates — a 540-minute activity would read as one day here and be added
      // as one CALENDAR day, which is a different claim from the one its duration makes.
      const durationDaysByActivity = new Map(
        activityRows.map((r) => [r.id, Math.round(r.durationMinutes / MINUTES_PER_DAY)]),
      );
      // Lag likewise: signed working-MINUTES ÷ a fixed 1440, for the same reason as above.
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
    // The criticality rule this recalculation will run with, built ONCE and spread into the engine's
    // options below — the same object the write path stamps onto `plans` beside the freshness cursor
    // (ADR-0125 / CQ-1 Option B). One derivation, so the engine input and the persisted mirror cannot
    // disagree about which rule produced this plan's `is_critical` / `total_float`.
    //
    // `criticalFloatThresholdMinutes` is stored in working MINUTES since the F8 migration, so it is
    // passed through rather than converted. It used to be `× MINUTES_PER_DAY` from a day-denominated
    // column, which compared a flat-1440 day against a float measured on the ACTIVITY's own calendar —
    // three working days of float on an eight-hour calendar for a planner who asked for one
    // (ADR-0068's defect, one field along). Never reintroduce a factor here: there is no scalar that
    // is right for a plan whose activities sit on different calendars, which is why the column is
    // minutes.
    const criticality: CriticalityRule = {
      criticalPathDefinition: plan.criticalPathDefinition,
      criticalFloatThresholdMinutes: plan.criticalFloatThresholdMinutes,
      totalFloatMode: plan.totalFloatMode,
      makeOpenEndsCritical: plan.makeOpenEndsCritical,
    };
    const options: ComputeOptions = {
      dataDate,
      calendar,
      progressMode: plan.progressRecalcMode,
      useExpectedFinishDates: plan.useExpectedFinishDates,
      ...toCriticalityOptions(criticality),
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
          // The join delay (ADR-0071 §1): this resource is demanded from `lagMinutes` into the
          // activity, not from its start. Spread rather than always set, so a plan whose assignments
          // are all unlagged builds the SAME object the pass received before the column existed —
          // Gate B by construction rather than by a default that has to be remembered.
          ...(a.lagMinutes > 0 ? { lagMinutes: a.lagMinutes } : {}),
        }));
        leveling = { assignments, resources };
      }
    }

    return {
      activities,
      edges,
      options,
      criticality,
      leveling,
      // The calendar each activity actually SCHEDULES on (its own, or its driving resource's).
      // The recalculation's write needs it to persist `total_float`/`free_float`/`visual_drift_days`
      // in that calendar's days (ADR-0068 §3a) — ADR-0035 already measures an activity's float in
      // its own calendar, so the unit and the measurement finally agree.
      calIdByActivity,
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
    // Shared with `BaselinesService.resolveCalendar`, which reaches the same state identically —
    // a second catch here would be free to drift from that one.
    return buildPlanCalendarOrReject(calendar, calendarId);
  }

  /**
   * **The revision comparison** (ADR-0125, revision M1): what entered and left the critical path
   * between two computed schedules of one plan, and how far the completion moved.
   *
   * **The CPM engine is not invoked.** Both sides are already computed and already persisted — a
   * baseline freezes the engine's OUTPUT (`is_critical`, `total_float`, the early/late dates), and
   * the live side is the plan's own persisted columns. So `computeSchedule` is not called here, its
   * signature is unchanged, and no new input kind exists: the ADR-0034 recalculation parity gate is
   * untouched **by construction** rather than by argument. A structural gate over the delta module
   * pins the engine-free half; this docblock is the seam's half.
   *
   * No lock, no pen, no transaction, nothing written. It is a read.
   *
   * **No audit event**, and ADR-0073's two tests are why rather than an oversight: nothing durable
   * changes, and it has no blast radius. Worth stating that this is a rule with a reason and not a
   * gate — the route census reflects over controller metadata and forces a MUTATING route to be
   * classified, so nothing would fail a PR that audited this one.
   */
  async revisionCompare(
    principal: Principal,
    orgSlug: string,
    planId: string,
    fromId: string,
    to: string,
    /**
     * Opt-in projections. Absent (the default) ⇒ the response is **byte-identical** to what it was
     * before the change list existed — the ADR-0073 C2 `?include=` pattern, which is what lets a
     * new surface land without a flag on the server and without touching the shipped one.
     */
    includes: readonly RevisionInclude[] = [],
  ): Promise<RevisionCompare> {
    const startedAt = Date.now();
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    // BOTH codes, not one. They are granted to the same set today, so asserting both changes
    // nothing now — and it means narrowing either later (the `calendar:manage_org` precedent,
    // ADR-0053) cannot silently leave this route open on the strength of the other.
    this.assertCan(principal, 'schedule:read', organization.id);
    this.assertCan(principal, 'baseline:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    // A revision compared with itself has nothing to report, and answering 200 with an empty delta
    // would read as "nothing changed" rather than "you asked the wrong question".
    //
    // Compared case-INSENSITIVELY, which the first version was not (the M4 api-review finding):
    // Postgres resolves a UUID without regard to case, so the same baseline written two ways would
    // have slipped past this guard, resolved to one row twice, and produced exactly the empty delta
    // this 422 exists to prevent — the failure mode reading as a reassuring answer.
    if (fromId.toLowerCase() === to.toLowerCase()) {
      // The code rides `details.reason`, matching every other specific 422 in this service
      // (`PLAN_START_REQUIRED`, the calendar states): `ValidationError.code` is the fixed
      // envelope code `VALIDATION_FAILED`, and a second convention for the same fact is how a
      // client ends up with two places to look.
      throw new ValidationError('Pick two different revisions to compare.', {
        reason: 'SAME_REVISION',
      });
    }

    // ANTI-IDOR: each side is resolved on the TARGET — a baseline of THIS plan in THIS org — and a
    // miss is 404, never 403. A 403 would confirm the id names a real baseline somewhere, which is
    // an existence oracle; the uniform 404 is what the rest of this codebase answers and it is not
    // re-decided here.
    // Both lookups in ONE round trip: they are independent, and the second does not become
    // interesting only if the first succeeds — either miss is the same 404, so resolving them
    // together leaks nothing and saves a sequential hop (the M4 backend-performance suggestion).
    const [fromBaseline, toBaseline] = await Promise.all([
      this.baselines.findActiveByIdInPlan(fromId, organization.id, planId),
      to === LIVE_REVISION
        ? Promise.resolve(null)
        : this.baselines.findActiveByIdInPlan(to, organization.id, planId),
    ]);
    if (!fromBaseline) throw new NotFoundError('Revision not found.');
    if (to !== LIVE_REVISION && !toBaseline) throw new NotFoundError('Revision not found.');

    // Both sides project to ONE shape through the SHARED projections in `revision-projections.ts`
    // — not through a local pair. See that module for why a copy would drift invisibly.

    // **The logic and the calendar names are loaded ONLY when the change list is asked for.** The
    // delta does not read either, so a caller that did not opt in pays nothing for them — the
    // ADR-0073 C2 projection rule applied to the reads as well as to the payload.
    const wantsChanges = includes.includes('changes');
    /**
     * **The edges are loaded for EITHER projection, and that is a fix rather than a widening.**
     *
     * They were gated on `changes` alone, because the change list was the only reader when they
     * were added. `?include=ghosts` on its own then received two EMPTY edge sets and reported no
     * changed links at all — a lit overlay drawing nothing, which is the ADR-0081 shape: the
     * capability wired to a condition that is not its own. Caught by the API e2e case for exactly
     * this projection, on its first run; nothing else could see it, because the journey requests
     * both includes together and every unit test hands the classifier its edges directly.
     */
    const wantsGeometry = includes.includes('ghosts');
    const wantsEdges = wantsChanges || wantsGeometry;
    const [fromRows, toRows, liveRows, planCalendar, fromEdges, toEdges, calendarNames] =
      await Promise.all([
        this.baselines.loadSnapshotRowsForDelta(fromBaseline.id, organization.id),
        toBaseline
          ? this.baselines.loadSnapshotRowsForDelta(toBaseline.id, organization.id)
          : Promise.resolve(null),
        this.baselines.loadActiveActivitiesForDelta(organization.id, planId),
        this.resolveCalendar(organization.id, plan.calendarId),
        wantsEdges
          ? this.baselines
              .loadSnapshotDependenciesForDelta(fromBaseline.id, organization.id)
              .then(frozenRevisionEdges)
          : Promise.resolve<RevisionEdge[]>([]),
        wantsEdges
          ? toBaseline
            ? this.baselines
                .loadSnapshotDependenciesForDelta(toBaseline.id, organization.id)
                .then(frozenRevisionEdges)
            : // Normalised HERE rather than at the call site below, so the two branches produce one
              // type and nothing downstream needs a cast to tell them apart — the same reason the
              // activity projections converge before the pure function sees them.
              this.baselines
                .loadActiveDependenciesForDelta(organization.id, planId)
                .then(liveRevisionEdges)
          : Promise.resolve<RevisionEdge[]>([]),
        wantsChanges ? this.baselines.loadCalendarNames(organization.id) : Promise.resolve([]),
      ]);

    // The SHARED projections. A local copy would look right and drift — `revision-projections.ts`.
    const liveSide = liveRevisionSide(liveRows);

    // **The measurement frame, spec D4**: working days on the PLAN calendar, with the OLD side's
    // FROZEN hours-per-day factor. Not the carrier's own calendar — `BaselineActivity` carries no
    // `calendarId`, so that rule is unrecoverable from a snapshot, and resolving it from the live
    // row would apply today's calendar to a frozen side (the drift ADR-0025's copy-not-reference
    // rule exists to prevent). This matches `computeVariance`, deliberately: two numbers on one
    // screen derived on different calendars is a worse defect than the residual this inherits,
    // which is that it under-reads when the carrier works a wider week than the plan.
    const dayFactorMinutes = fromBaseline.hoursPerDayMinutes;
    const movementDaysBetween = (from: string, toDate: string): number =>
      Math.round(planCalendar.workingTimeBetween(from, toDate) / dayFactorMinutes);

    /**
     * **Both sides, projected ONCE.** `frozenRevisionSide` was called three times over the same array —
     * for the delta, the change list and the ghosts — so a caller asking for both includes (which
     * the shipped client always does) re-mapped every row through the same 19-field projection six
     * times instead of twice. Negligible in absolute terms at 2,000 rows and free to remove;
     * measured and reported by the M8 backend-performance review.
     *
     * It also makes the "one projection, three readers" claim in this method's docblocks true by
     * construction rather than by three identical calls happening to agree.
     */
    const fromSide = frozenRevisionSide(fromRows);
    const toSide = toRows === null ? liveSide : frozenRevisionSide(toRows);

    const delta = computeRevisionDelta(fromSide, toSide, REVISION_ROW_CAP, movementDaysBetween);

    /**
     * **Whether the criticality delta means anything at all**, and the answer is no when either
     * side was never calculated (the M4 ux review's sharpest finding, and a real defect).
     *
     * `activities.is_critical` DEFAULTS to `false`, so an uncalculated plan has no critical
     * activity — and comparing a real baseline against it reported **every activity that was
     * critical then as having LEFT the critical path**. Each row was technically true and the
     * picture was a lie: nothing left anything, the plan was never computed. That is worse than a
     * blank answer, because it is confident and alarming in exactly the meeting-prep moment this
     * feature exists for.
     *
     * Withheld HERE rather than in the panel, so a second consumer of this route cannot inherit the
     * fabricated version — and the completion half already reports its own non-assessability, so
     * this is the same honesty applied to the half that did not have it.
     *
     * A baseline's `capturedProjectFinish` is the frozen side's evidence: a capture from an
     * uncalculated plan has none.
     */
    const sideScheduled = (
      side: { capturedProjectFinish: Date | null } | null,
      livePlanComputedAt: Date | null,
    ): boolean =>
      side === null ? livePlanComputedAt !== null : side.capturedProjectFinish !== null;
    const bothScheduled =
      sideScheduled(fromBaseline, plan.scheduleComputedAt) &&
      sideScheduled(toBaseline, plan.scheduleComputedAt);

    // `existsLive` is what decides whether a client may offer to reveal a row. It is a question
    // about the LIVE plan and never about the comparison's `to` side: comparing two baselines can
    // name an activity that has since been deleted, and a control that navigates nowhere is worse
    // than one that says why (ADR-0082).
    const liveIds = new Set(liveRows.map((r) => r.id));
    const moved = (r: (typeof delta.entered)[number]): RevisionMovedActivity => ({
      ...r,
      existsLive: liveIds.has(r.activityId),
    });
    const present = (r: (typeof delta.added)[number]): RevisionPresenceActivity => ({
      ...r,
      existsLive: liveIds.has(r.activityId),
    });

    /**
     * **Whether the paid classes mean anything on THIS pair**, and the answer comes from the
     * capture-level discriminator — never from the row values, every one of which has a legitimate
     * null on a fully recorded side.
     *
     * The LIVE side is always recorded: it IS the plan's shape. So a live comparison turns on the
     * one frozen side, and a baseline-vs-baseline comparison needs BOTH. A pair where either side
     * predates the snapshot extension is `false` **permanently** — no backfill is possible, because
     * writing today's logic into a historic snapshot would state as history a graph that baseline
     * never saw — and the classifier then reports each paid class as not assessable with a reason,
     * never as "no change". Defaulting this to `true` would ship a report that quietly claims the
     * logic did not change, which is the defect this whole epic exists to remove.
     */
    const bothSnapshotted =
      fromBaseline.revisionSnapshotLevel === 'FULL' &&
      (toBaseline === null || toBaseline.revisionSnapshotLevel === 'FULL');

    const calendarNameById = new Map(calendarNames.map((c) => [c.id, c.name]));

    // **The change list, only when asked for.**
    const changes = wantsChanges
      ? // The SAME two projections the delta reads, composed the same way — not a second
        // assembly. Two sources for one pair would drift, and the drift would be invisible: each
        // looks right alone and only a reader comparing the delta against the change list on one
        // plan would ever see them disagree (the ADR-0065 `routeOrthogonal` argument).
        classifyRevisionChanges(
          { rows: fromSide, edges: fromEdges },
          { rows: toSide, edges: toEdges },
          {
            fromScheduled: sideScheduled(fromBaseline, plan.scheduleComputedAt),
            toScheduled: sideScheduled(toBaseline, plan.scheduleComputedAt),
            bothSnapshotted,
            // The plan's own revisions are matched on ACTIVITY ID, so a re-code is a real,
            // reportable change here — the opposite of the cross-plan case.
            codeIsTheCorrelationKey: false,
            includeProgress: includes.includes('progress'),
            calendarName: (id) => calendarNameById.get(id) ?? null,
            cap: REVISION_ROW_CAP,
          },
        )
      : null;

    /**
     * The change list's rows gain `existsLive` HERE, from the same `liveIds` the delta's rows use —
     * one source for one question, on one screen. The classifier cannot answer it: it cannot tell a
     * baseline from the live plan, which is the property that makes baseline-vs-baseline free.
     */
    const changeReport: RevisionChangeReport | null =
      changes === null
        ? null
        : {
            cap: changes.cap,
            classes: changes.classes.map((c) => ({
              ...c,
              rows: c.rows.map((r) => ({ ...r, existsLive: liveIds.has(r.activityId) })),
            })),
          };

    /**
     * The change picture's geometry, only when a canvas asked for it. Derived from the SAME two
     * projections the delta and the change list read — a second assembly would drift, and the drift
     * would show as a ghost in a place the change list does not mention.
     */
    const ghostResult = wantsGeometry
      ? buildRevisionGhosts(fromSide, toSide, REVISION_ROW_CAP)
      : null;
    // The logic half, from the same two edge sets the change list's RELOGICKED class reads — so the
    // picture and the list cannot disagree about what one changed link is. `liveIds` decides what
    // is anchorable: a link has no geometry of its own.
    const linkResult = wantsGeometry
      ? buildRevisionLinkChanges(fromEdges, toEdges, liveIds, REVISION_ROW_CAP)
      : null;

    const result: RevisionCompare = {
      planId,
      planName: plan.name,
      from: {
        kind: 'BASELINE',
        id: fromBaseline.id,
        name: fromBaseline.name,
        computedAt: fromBaseline.capturedAt.toISOString(),
        dataDate: revisionDate(fromBaseline.dataDate),
      },
      to: toBaseline
        ? {
            kind: 'BASELINE',
            id: toBaseline.id,
            name: toBaseline.name,
            computedAt: toBaseline.capturedAt.toISOString(),
            dataDate: revisionDate(toBaseline.dataDate),
          }
        : ({
            kind: 'LIVE',
            id: null,
            name: null,
            computedAt: plan.scheduleComputedAt ? plan.scheduleComputedAt.toISOString() : null,
            dataDate: revisionDate(plan.plannedStart),
          } satisfies RevisionSide),
      dayFactorMinutes,
      settingsVerdict: compareCriticalityRules(
        readCriticalityRule(fromBaseline),
        toBaseline
          ? readCriticalityRule(toBaseline)
          : readCriticalityRule({
              criticalPathDefinition: plan.scheduleCriticalPathDefinition,
              criticalFloatThresholdMinutes: plan.scheduleCriticalFloatThresholdMinutes,
              totalFloatMode: plan.scheduleTotalFloatMode,
              makeOpenEndsCritical: plan.scheduleMakeOpenEndsCritical,
            }),
      ),
      completion: {
        assessable: delta.completion.assessable,
        reason: delta.completion.reason ?? null,
        carrierActivityId: delta.completion.carrierActivityId ?? null,
        carrierName: delta.completion.carrierName ?? null,
        fromFinish: delta.completion.fromFinish ?? null,
        toFinish: delta.completion.toFinish ?? null,
        movementDays: delta.completion.movementDays ?? null,
        carrierChanged: delta.completion.carrierChanged ?? false,
        newSideCarrierActivityId: delta.completion.newSideCarrierActivityId ?? null,
        newSideCarrierName: delta.completion.newSideCarrierName ?? null,
      },
      // Absent (rather than an empty report) when not asked for, so a caller that did not opt in
      // sees byte-identically what it saw before this existed.
      ...(changeReport ? { changes: changeReport } : {}),
      ...(ghostResult
        ? {
            ghosts: ghostResult.ghosts,
            ghostsTotal: ghostResult.total,
            ghostsUndrawable: ghostResult.undrawable,
          }
        : {}),
      ...(linkResult
        ? {
            links: linkResult.links,
            linksTotal: linkResult.total,
            linksUndrawable: linkResult.undrawable,
          }
        : {}),
      criticalPath: bothScheduled
        ? {
            entered: delta.entered.map(moved),
            left: delta.left.map(moved),
            enteredTotal: delta.enteredTotal,
            leftTotal: delta.leftTotal,
            cap: REVISION_ROW_CAP,
            remainedCriticalCount: delta.remainedCriticalCount,
            remainedNonCriticalCount: delta.remainedNonCriticalCount,
            added: delta.added.map(present),
            removed: delta.removed.map(present),
            addedTotal: delta.addedTotal,
            removedTotal: delta.removedTotal,
            noCriticalPath: delta.noCriticalPath,
            notAssessableReason: null,
          }
        : {
            // Empty and zeroed, not partial: a half-reported delta over a side that was never
            // computed is the same lie in a smaller font.
            entered: [],
            left: [],
            enteredTotal: 0,
            leftTotal: 0,
            cap: REVISION_ROW_CAP,
            remainedCriticalCount: 0,
            remainedNonCriticalCount: 0,
            added: [],
            removed: [],
            addedTotal: 0,
            removedTotal: 0,
            noCriticalPath: false,
            notAssessableReason: 'SIDE_NOT_SCHEDULED',
          },
    };

    this.logger.info(
      {
        planId,
        fromRevisionId: fromBaseline.id,
        toRevisionId: toBaseline ? toBaseline.id : LIVE_REVISION,
        fromRowCount: fromRows.length,
        toRowCount: toRows === null ? liveSide.length : toRows.length,
        enteredTotal: delta.enteredTotal,
        leftTotal: delta.leftTotal,
        settingsVerdict: result.settingsVerdict,
        durationMs: Date.now() - startedAt,
      },
      'revision comparison read',
    );

    return result;
  }

  /**
   * **The cross-plan revision comparison**: a revision of one plan against a revision of ANOTHER,
   * correlated on activity `code`.
   *
   * It exists because ADR-0050 makes an import target **always a new plan**, so a re-issued P6 file
   * arrives as a sibling plan and not as a baseline of the first — and the shipped comparison, which
   * correlates on `activityId`, has nothing to say about two plans whose UUIDs name nothing in
   * common.
   *
   * **The CPM engine is not called, not imported, and not reachable from this feature's module
   * graph. The ADR-0034 recalculation parity gate is untouched by construction** — ADR-0125 D1's
   * strong form, and it is verifiable rather than asserted: both sides are persisted columns (a
   * baseline freezes the engine's OUTPUT; a live side is the plan's own computed columns), so there
   * is no input to hold parity for. **ADR-0116 D7's weaker sibling — "computes read-only, persists
   * nothing" — does NOT apply here and must never be swapped in for it**: that sentence belongs to
   * the critical-path test, which genuinely runs the engine twice. Nothing here runs it at all.
   *
   * No lock, no pen, no transaction, nothing written. It is a read, and it takes **no audit event**
   * for the same two reasons the shipped comparison does not (ADR-0073): nothing durable changes,
   * and it has no blast radius.
   *
   * **The anchor is the `to` side** (CQ-1, product owner 2026-09-08). Every id in the response
   * resolves in that plan, and `existsLive` reads as "present in the plan you are looking at". A row
   * that exists only in the OTHER plan carries `activityId: null` rather than a fabricated id: a
   * control that navigates nowhere is worse than one that is absent (ADR-0082).
   */
  async crossPlanRevisionCompare(
    principal: Principal,
    orgSlug: string,
    fromPlanId: string,
    toPlanId: string,
    from: string,
    to: string,
    includes: readonly RevisionInclude[] = [],
  ): Promise<CrossPlanRevisionCompare> {
    const startedAt = Date.now();
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    // BOTH codes, for the reason the shipped comparison gives: they are granted to the same set
    // today, so asserting both changes nothing now — and narrowing either later cannot silently
    // leave this route open on the strength of the other.
    this.assertCan(principal, 'schedule:read', organization.id);
    this.assertCan(principal, 'baseline:read', organization.id);

    // Both plans in ONE round trip. Either miss is the same uniform 404 — never a 403, which would
    // confirm the id names a real plan somewhere — so resolving them together leaks nothing and
    // saves a sequential hop.
    const plans = await this.plans.findActivePairInOrgWithProject(
      [fromPlanId, toPlanId],
      organization.id,
    );
    const planById = new Map(plans.map((p) => [p.id, p]));
    const fromPlan = planById.get(fromPlanId);
    const toPlan = planById.get(toPlanId);
    if (!fromPlan || !toPlan) throw new NotFoundError('Plan not found.');

    /**
     * **The same-plan refusal comes BEFORE the revisions are resolved**, and the ordering is the
     * decision rather than the check.
     *
     * A same-plan pair is the wrong question whatever revisions it names, so resolving them first
     * would answer a 404 about a revision when the real answer is "use the other route" — a reader
     * would go looking for a typo in an id that is perfectly correct. It is a 422 rather than a
     * silent success because the two routes correlate on DIFFERENT keys: a re-coded activity reads
     * as `RECODED` on the plan-nested route and as removed-plus-added here, so answering a
     * same-plan question here would give a different and worse answer to something the product
     * already answers correctly.
     */
    if (fromPlanId === toPlanId) {
      throw new ValidationError(
        'Use Compare revisions on the plan itself to compare two of its own revisions.',
        { reason: 'CROSS_PLAN_SAME_PLAN' },
      );
    }

    // Each side's revision resolved against ITS OWN plan (anti-IDOR): naming a baseline of the
    // other plan on the wrong side is a 404, not a quiet comparison of unrelated snapshots.
    const [fromBaseline, toBaseline] = await Promise.all([
      from === LIVE_REVISION
        ? Promise.resolve(null)
        : this.baselines.findActiveByIdInPlan(from, organization.id, fromPlanId),
      to === LIVE_REVISION
        ? Promise.resolve(null)
        : this.baselines.findActiveByIdInPlan(to, organization.id, toPlanId),
    ]);
    if (from !== LIVE_REVISION && !fromBaseline) throw new NotFoundError('Revision not found.');
    if (to !== LIVE_REVISION && !toBaseline) throw new NotFoundError('Revision not found.');

    const wantsChanges = includes.includes('changes');
    const wantsGeometry = includes.includes('ghosts');
    // Loaded for EITHER projection. Gating them on `changes` alone is the defect ADR-0126 records:
    // `?include=ghosts` on its own received two empty edge sets and lit an overlay drawing nothing.
    const wantsEdges = wantsChanges || wantsGeometry;

    /**
     * ONE read of the anchor plan's live rows, shared by the two slots that need it. Started here
     * rather than inside the array so both entries reference the same promise — writing the call
     * twice is what produced the duplicate query the M4 review measured.
     */
    const anchorLiveRowsPromise = this.baselines.loadActiveActivitiesForDelta(
      organization.id,
      toPlanId,
    );

    const [
      fromRawRows,
      toRawRows,
      anchorLiveRows,
      fromPlanCalendar,
      fromRawEdges,
      toRawEdges,
      calendarNames,
    ] = await Promise.all([
      fromBaseline
        ? this.baselines
            .loadSnapshotRowsForDelta(fromBaseline.id, organization.id)
            .then(frozenRevisionSide)
        : this.baselines
            .loadActiveActivitiesForDelta(organization.id, fromPlanId)
            .then(liveRevisionSide),
      toBaseline
        ? this.baselines
            .loadSnapshotRowsForDelta(toBaseline.id, organization.id)
            .then(frozenRevisionSide)
        : anchorLiveRowsPromise.then(liveRevisionSide),
      /**
       * **The anchor plan's LIVE rows, read whether or not the `to` side is live — but read ONCE.**
       *
       * `existsLive` and the id mapping are questions about the plan the reader has OPEN, never
       * about the comparison's `to` side: comparing two baselines can name an activity that has
       * since been deleted from the anchor, and a reveal control that navigates nowhere is worse
       * than one that is absent (ADR-0126 D9, ADR-0082).
       *
       * **The promise is shared with the `to` side above rather than issued twice**, and that is a
       * measured repair rather than tidiness. `to` defaults to `live`, and an imported plan has no
       * baseline — so the epic's OWN primary case took the `toBaseline === null` branch and issued
       * the identical 2,000-row query twice, concurrently, in this same `Promise.all`. Measured by
       * the M4 backend-performance review at ~62.6 ms of a ~115.7 ms batch: roughly half the
       * route's query cost, on every request of its commonest shape, for nothing. There was never
       * a consistency reason for two reads — they were in the same batch.
       */
      anchorLiveRowsPromise,
      this.resolveCalendar(organization.id, fromPlan.calendarId),
      wantsEdges
        ? fromBaseline
          ? this.baselines
              .loadSnapshotDependenciesForDelta(fromBaseline.id, organization.id)
              .then(frozenRevisionEdges)
          : this.baselines
              .loadActiveDependenciesForDelta(organization.id, fromPlanId)
              .then(liveRevisionEdges)
        : Promise.resolve<RevisionEdge[]>([]),
      wantsEdges
        ? toBaseline
          ? this.baselines
              .loadSnapshotDependenciesForDelta(toBaseline.id, organization.id)
              .then(frozenRevisionEdges)
          : this.baselines
              .loadActiveDependenciesForDelta(organization.id, toPlanId)
              .then(liveRevisionEdges)
        : Promise.resolve<RevisionEdge[]>([]),
      wantsChanges ? this.baselines.loadCalendarNames(organization.id) : Promise.resolve([]),
    ]);

    /**
     * **The measurement frame** (ADR-0125 D4, restated because two plans may not share it): working
     * days on the OLD side's PLAN calendar, with the OLD side's frozen hours-per-day factor. Named
     * in the payload for exactly that reason — same-plan it needs no saying, and here a number with
     * no frame beside it is a number the reader cannot check.
     *
     * A LIVE old side has no frozen factor, so it takes its plan calendar's CURRENT one. That is the
     * honest reading of "the old side's factor" when the old side is not frozen at all.
     */
    const dayFactorMinutes = fromBaseline
      ? fromBaseline.hoursPerDayMinutes
      : fromPlan.calendarId
        ? ((await this.calendars.findHoursPerDayMinutes([fromPlan.calendarId])).get(
            fromPlan.calendarId,
          ) ?? DEFAULT_HOURS_PER_DAY_MINUTES)
        : DEFAULT_HOURS_PER_DAY_MINUTES;
    const movementDaysBetween = (a: string, b: string): number =>
      Math.round(fromPlanCalendar.workingTimeBetween(a, b) / dayFactorMinutes);

    /**
     * **The correlation, and the two maps that survive it.**
     *
     * `correlateByCode` re-keys both sides on the code so the unmodified delta, classifier and ghost
     * builder can run across two plans. The real per-side UUIDs do not survive that re-keying, so
     * they are captured HERE — before the pure functions are called — and used to map every row back
     * to the anchor plan on the way out.
     */
    const correlated = correlateByCode(fromRawRows, toRawRows);
    const anchorIdByCode = new Map(
      anchorLiveRows.filter((r) => r.code !== null).map((r) => [r.code as string, r.id]),
    );
    const anchorCodes = new Set(anchorIdByCode.keys());
    /** The anchor UUID for a correlated row, or null when the row lives only in the other plan. */
    const anchorId = (code: string): string | null => anchorIdByCode.get(code) ?? null;

    const planOf = (id: string): { id: string; name: string } =>
      id === fromPlanId
        ? { id: fromPlanId, name: fromPlan.name }
        : { id: toPlanId, name: toPlan.name };
    const correlationRow = (r: RevisionRow, planId: string): CrossPlanCorrelationRow => {
      const plan = planOf(planId);
      return {
        activityId: r.code === null ? null : anchorId(r.code),
        code: r.code,
        name: r.name,
        planId: plan.id,
        planName: plan.name,
      };
    };

    // Two Sets, not two nested scans: at 2,000 activities a `some()` inside a `filter()` is four
    // million comparisons for a block the panel renders before anything else.
    const toKeys = new Set(correlated.to.map((r) => r.activityId));
    const fromKeys = new Set(correlated.from.map((r) => r.activityId));
    const correlation: CrossPlanCorrelation = {
      key: 'CODE',
      ...correlated.counts,
      // Each list capped with its own TRUE total beside it — the counts above ARE those totals, so a
      // client says "showing 20 of 137" without computing either number itself (ADR-0116 D3).
      fromUnmatchedRows: correlated.from
        .filter((r) => !toKeys.has(r.activityId))
        .slice(0, REVISION_ROW_CAP)
        .map((r) => correlationRow(r, fromPlanId)),
      toUnmatchedRows: correlated.to
        .filter((r) => !fromKeys.has(r.activityId))
        .slice(0, REVISION_ROW_CAP)
        .map((r) => correlationRow(r, toPlanId)),
      // **The one cap is SPLIT between the sides, not filled from the from-side first**
      // (`docs/TECH_DEBT.md` #263(f)). Concatenating and slicing the join gave a from-side with
      // more than `cap` uncoded rows a sample containing ZERO to-side rows, while `toUncoded`
      // reported a non-zero count beside it. Both totals stayed correct, so nothing was
      // misreported — but the sample a reader is told to use to SEE what was left out could be
      // entirely one-sided, which is the one job it has.
      //
      // Splitting the budget rather than capping each side at `cap` keeps the array within the
      // `cap` the response already publishes: widening the maximum to 2 x `cap` would make the
      // number a client is handed stop describing this field. A side that cannot fill its half
      // yields the remainder to the other, so a from-only plan still shows `cap` rows.
      uncodedRows: takeBothSides(
        fromRawRows.filter((r) => r.code === null).map((r) => correlationRow(r, fromPlanId)),
        toRawRows.filter((r) => r.code === null).map((r) => correlationRow(r, toPlanId)),
        REVISION_ROW_CAP,
      ),
      cap: REVISION_ROW_CAP,
    };

    const identity = {
      fromPlan: {
        id: fromPlan.id,
        name: fromPlan.name,
        projectId: fromPlan.project.id,
        projectName: fromPlan.project.name,
      },
      toPlan: {
        id: toPlan.id,
        name: toPlan.name,
        projectId: toPlan.project.id,
        projectName: toPlan.project.name,
      },
      from: revisionSideOf(fromBaseline, fromPlan),
      to: revisionSideOf(toBaseline, toPlan),
      dayFactorMinutes,
      frame: {
        planId: fromPlan.id,
        planName: fromPlan.name,
        calendarName: fromPlan.calendarId
          ? (calendarNames.find((c) => c.id === fromPlan.calendarId)?.name ?? null)
          : null,
        hoursPerDayMinutes: dayFactorMinutes,
      },
      settingsVerdict: compareCriticalityRules(
        criticalityRuleOf(fromBaseline, fromPlan),
        criticalityRuleOf(toBaseline, toPlan),
      ),
    } as const;

    /**
     * **No codes in common is a 200 with a typed reason and NO delta.**
     *
     * Running the delta anyway would report every activity in the old plan as removed and every
     * activity in the new one as added — each row technically true and the picture a lie, which is
     * the ADR-0125 `SIDE_NOT_SCHEDULED` defect in a new costume. It is not a 422: the question was
     * well formed, and the answer is a fact about the data.
     */
    if (correlated.counts.matched === 0) {
      return {
        ...identity,
        correlation,
        notAssessableReason: 'NO_COMMON_CODES',
        completion: {
          assessable: false,
          reason: 'NO_COMMON_ACTIVITIES',
          carrierActivityId: null,
          carrierName: null,
          fromFinish: null,
          toFinish: null,
          movementDays: null,
          carrierChanged: false,
          newSideCarrierActivityId: null,
          newSideCarrierName: null,
        },
        criticalPath: { ...EMPTY_CRITICAL_PATH_DELTA, notAssessableReason: 'NO_COMMON_CODES' },
      };
    }

    const delta = computeRevisionDelta(
      correlated.from,
      correlated.to,
      REVISION_ROW_CAP,
      movementDaysBetween,
    );

    // Whether the criticality delta means anything at all. `is_critical` DEFAULTS to false, so an
    // uncalculated side has no critical activity — and comparing a real one against it reports every
    // activity that was critical as having LEFT the critical path. Alarming, confident and false.
    const scheduled = (
      baseline: { capturedProjectFinish: Date | null } | null,
      plan: { scheduleComputedAt: Date | null },
    ): boolean =>
      baseline === null
        ? plan.scheduleComputedAt !== null
        : baseline.capturedProjectFinish !== null;
    const fromScheduled = scheduled(fromBaseline, fromPlan);
    const toScheduled = scheduled(toBaseline, toPlan);
    const bothScheduled = fromScheduled && toScheduled;

    const moved = (r: (typeof delta.entered)[number]): CrossPlanMovedActivity => ({
      ...r,
      activityId: anchorId(r.activityId),
      existsLive: anchorCodes.has(r.activityId),
    });
    const present = (r: (typeof delta.added)[number]): CrossPlanPresenceActivity => ({
      ...r,
      activityId: anchorId(r.activityId),
      existsLive: anchorCodes.has(r.activityId),
    });

    /**
     * Whether the ADR-0126 paid classes mean anything on THIS pair. A LIVE side is always recorded —
     * it IS the plan's shape — so only a frozen side can be short, and a pair where either predates
     * the snapshot extension is `false` PERMANENTLY: no backfill is possible, because writing
     * today's logic into a historic snapshot would state as history a graph that baseline never saw.
     */
    const bothSnapshotted =
      (fromBaseline === null || fromBaseline.revisionSnapshotLevel === 'FULL') &&
      (toBaseline === null || toBaseline.revisionSnapshotLevel === 'FULL');

    const calendarNameById = new Map(calendarNames.map((c) => [c.id, c.name]));
    // The edges re-keyed onto the SAME natural key the rows were, so the classifier can diff them.
    const fromCorrelated = correlateEdges(fromRawEdges, fromRawRows);
    const toCorrelated = correlateEdges(toRawEdges, toRawRows);
    const fromEdges = fromCorrelated.edges;
    const toEdges = toCorrelated.edges;

    const changes = wantsChanges
      ? classifyRevisionChanges(
          { rows: correlated.from, edges: fromEdges },
          { rows: correlated.to, edges: toEdges },
          {
            fromScheduled,
            toScheduled,
            bothSnapshotted,
            /**
             * **The sides are matched ON the code here, so the `RECODED` class is unanswerable.**
             *
             * Every matched pair has equal codes by construction, so the class would otherwise
             * print a confident "no changes in this revision" for a question the product
             * structurally cannot answer — the defect this comparison exists to remove, reproduced
             * inside it. Found by the M4 ux review; the spec had named the reason and nothing built
             * it.
             */
            codeIsTheCorrelationKey: true,
            includeProgress: includes.includes('progress'),
            calendarName: (id) => calendarNameById.get(id) ?? null,
            cap: REVISION_ROW_CAP,
          },
        )
      : null;

    const changeReport: CrossPlanChangeReport | null =
      changes === null
        ? null
        : {
            cap: changes.cap,
            classes: changes.classes.map((c) => ({
              ...c,
              rows: c.rows.map((r) => ({
                ...r,
                activityId: anchorId(r.activityId),
                existsLive: anchorCodes.has(r.activityId),
              })),
            })),
          };

    /**
     * The overlay's geometry, in **CROSS_PLAN** lane space.
     *
     * That parameter is the epic's single most dangerous defect if it is wrong, and it fails
     * silently: an imported activity's lane is its position in the source file until phase 3 repacks
     * by computed dates, and phase 3 is best-effort — so lane 5 of one plan is not lane 5 of the
     * other, and treating a lane difference as a move would ghost nearly every activity. The overlay
     * would become the whole old plan drawn on top of the new one, which is the design the product
     * owner rejected, and nothing would go red.
     */
    const ghostResult = wantsGeometry
      ? buildRevisionGhosts(correlated.from, correlated.to, REVISION_ROW_CAP, 'CROSS_PLAN')
      : null;
    // The link half needs NO change, and that was confirmed rather than assumed: its gate is the ids
    // present in the plan being drawn on, and cross-plan those ids are the anchor's CODES.
    const linkResult = wantsGeometry
      ? buildRevisionLinkChanges(fromEdges, toEdges, anchorCodes, REVISION_ROW_CAP)
      : null;

    const result: CrossPlanRevisionCompare = {
      ...identity,
      correlation,
      notAssessableReason: null,
      completion: {
        assessable: delta.completion.assessable,
        reason: delta.completion.reason ?? null,
        // The carrier is named under the ANCHOR plan's id where it exists there, exactly as every
        // other row is — a client must never receive two id vocabularies in one payload.
        carrierActivityId: delta.completion.carrierActivityId
          ? anchorId(delta.completion.carrierActivityId)
          : null,
        carrierName: delta.completion.carrierName ?? null,
        fromFinish: delta.completion.fromFinish ?? null,
        toFinish: delta.completion.toFinish ?? null,
        movementDays: delta.completion.movementDays ?? null,
        carrierChanged: delta.completion.carrierChanged ?? false,
        newSideCarrierActivityId: delta.completion.newSideCarrierActivityId
          ? anchorId(delta.completion.newSideCarrierActivityId)
          : null,
        newSideCarrierName: delta.completion.newSideCarrierName ?? null,
      },
      ...(changeReport ? { changes: changeReport } : {}),
      ...(ghostResult
        ? {
            // Every DRAWN ghost is matched — an unmatched row has no anchor lane and is counted,
            // never placed — so the anchor id is present by construction here. The `?? ''` is
            // unreachable and is written as a fallback rather than a `!` so a future widening of the
            // ghost rule fails visibly rather than casting a null through the type.
            ghosts: ghostResult.ghosts.map((g) => ({
              ...g,
              activityId: anchorId(g.activityId) ?? g.activityId,
            })),
            ghostsTotal: ghostResult.total,
            ghostsUndrawable: ghostResult.undrawable,
          }
        : {}),
      ...(linkResult
        ? {
            /**
             * **An ADDED or CHANGED link is handed back under the ANCHOR PLAN'S OWN dependency id,
             * and that is a defect this milestone found by reading the painter rather than by
             * anything failing.**
             *
             * The canvas resolves a present link by looking its `dependencyId` up among the edges
             * the diagram already draws, which are keyed on the anchor plan's real ids. Handed a
             * correlation key it matches nothing, draws nothing, and reports nothing — while
             * `linksTotal` still counts the link and `linksUndrawable` does not. A picture quietly
             * missing rows nobody is told about is the absence ADR-0127 exists to remove, arriving
             * in the one place a reader cannot check it, because a diagram has no "showing N of M".
             *
             * A REMOVED link keeps the correlation key deliberately: it is in no live edge list by
             * definition, so there is no id to map to, and the painter routes it from its endpoints
             * instead — which is why the fallback below is a fallback and not a guess.
             */
            links: linkResult.links.map((l) => ({
              ...l,
              dependencyId:
                l.state === 'REMOVED'
                  ? l.dependencyId
                  : (toCorrelated.sourceIdByKey.get(l.dependencyId) ?? l.dependencyId),
              predecessorId: anchorId(l.predecessorId) ?? l.predecessorId,
              successorId: anchorId(l.successorId) ?? l.successorId,
            })),
            linksTotal: linkResult.total,
            linksUndrawable: linkResult.undrawable,
          }
        : {}),
      criticalPath: bothScheduled
        ? {
            entered: delta.entered.map(moved),
            left: delta.left.map(moved),
            enteredTotal: delta.enteredTotal,
            leftTotal: delta.leftTotal,
            cap: REVISION_ROW_CAP,
            remainedCriticalCount: delta.remainedCriticalCount,
            remainedNonCriticalCount: delta.remainedNonCriticalCount,
            added: delta.added.map(present),
            removed: delta.removed.map(present),
            addedTotal: delta.addedTotal,
            removedTotal: delta.removedTotal,
            noCriticalPath: delta.noCriticalPath,
            notAssessableReason: null,
          }
        : { ...EMPTY_CRITICAL_PATH_DELTA, notAssessableReason: 'SIDE_NOT_SCHEDULED' },
    };

    this.logger.info(
      {
        fromPlanId,
        toPlanId,
        fromRevisionId: fromBaseline ? fromBaseline.id : LIVE_REVISION,
        toRevisionId: toBaseline ? toBaseline.id : LIVE_REVISION,
        matched: correlation.matched,
        fromUnmatched: correlation.fromUnmatched,
        toUnmatched: correlation.toUnmatched,
        enteredTotal: result.criticalPath.enteredTotal,
        leftTotal: result.criticalPath.leftTotal,
        settingsVerdict: result.settingsVerdict,
        durationMs: Date.now() - startedAt,
      },
      'cross-plan revision comparison read',
    );

    return result;
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
    // WBS containment (ADR-0038) — the input to the §24 summary rollup. Orthogonal to the dependency
    // graph, so a plan with no summary is byte-identical with it or without it; a plan WITH summaries
    // is not, which is how its absence went unnoticed (see `ScheduleActivityRow.parentId`).
    parentId: row.parentId,
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
