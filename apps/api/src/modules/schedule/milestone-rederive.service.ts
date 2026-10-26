import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';
import { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';

import { orderPlansUpstreamFirst } from './programme-order';
import { ScheduleService } from './schedule.service';

/**
 * The marker-only migration that ships with the engine fix for #539. It has no statement: its
 * `_prisma_migrations.finished_at` is the instant the fixed engine took over on the host, and is this
 * service's marker (docs/DATABASE.md "Re-derivation markers"). No date is written into this file.
 */
export const MILESTONE_CROSS_CALENDAR_MIGRATION = '20261026120000_milestone_cross_calendar_marker';

/** A plan whose stored dates the old engine wrote with a zero-span activity snapped onto its calendar. */
export interface PendingMilestonePlan {
  id: string;
  organizationId: string;
}

/**
 * **Re-derive, once, every plan a zero-span activity's old snap wrote dates for** (#539, ADR-0207 D1-D3;
 * the `MilestoneRederiveService` shape, whose downstream extension and ordering it keeps).
 *
 * The old engine snapped a milestone or zero-duration task onto its own calendar in both passes, so
 * across calendars it pushed successors a calendar period and charged the work before it a negative
 * float. The engine is fixed, but the engine-owned date, float and criticality columns keep the old
 * values until somebody recalculates the plan, and nothing flags such a plan as stale. Product owner,
 * 2026-10-26 (defaults): every affected plan is corrected once, at the first boot.
 *
 * **Which plans.** A live plan with a data date whose `schedule_computed_at` is EARLIER than the marker
 * migration's `finished_at` and which either holds a live zero-span activity (the engine's `isZeroSpan`,
 * widened to every milestone because nothing forces a milestone's stored duration to 0) or is an endpoint
 * of a live cross-plan link whose other end is one. The second arm is not in the spec's first draft: the
 * cross-plan derivation stopped back-rolling a zero-duration REMOTE's late date, so a plan with no
 * zero-span activity whose outgoing link reaches a milestone in another plan reads a different late
 * bound now, upstream of the plan the downstream extension starts from, and nothing else would flag it.
 * The incoming arm covers a run in which that upstream plan failed.
 *
 * **The query is a CTE, and its shape is load-bearing** (database-architect, measured; docs/DATABASE.md
 * "Re-derivation markers"). Three `OR EXISTS` arms correlated on `plans` push the plan cost over the JIT
 * threshold and compile on EVERY boot (51 ms of JIT for a steady state that finds nothing); a single
 * `EXISTS` with an `OR` blocks every index and took 28 s on the first boot. Materialising the stale
 * plans first means the activity scan never runs when nothing is stale (0.5 ms) and is one hashed scan
 * when something is (31-46 ms for 200,000 activities). The subqueries deliberately state no
 * `organization_id`: the organisation comes from the `plans` row and `recalculateAsSystem` re-reads the
 * plan scoped to it.
 *
 * **Which order, and the downstream extension.** As `MilestoneRederiveService`: per organisation,
 * upstream first over the WHOLE cross-plan graph, and a plan is also recalculated when any direct
 * upstream plan was recalculated in this run, so every plan downstream of a corrected one is corrected
 * too. It converges: the second boot finds nothing pending.
 *
 * **Four boot services can recalculate one plan.** This service, `FinishMilestoneRederiveService`,
 * `CrossPlanRederiveService` and `MilestoneRederiveService` all start at bootstrap, none is
 * awaited, and every replica runs them, so a plan pending for several may be recalculated more than
 * once. That is harmless: recalculation is idempotent and serialised by the plan advisory lock, each
 * transaction of which takes and releases its own, so no service holds two and none can deadlock.
 *
 * **As the system, never blocking the boot.** No principal and no pen (ADR-0022, ADR-0155 D9); not
 * audited (ADR-0072). One plan's failure is logged and retried at the next boot; one organisation whose
 * graph cannot be ordered is logged and skipped whole. Steady state costs one read of `plans` per boot.
 * A plan restored from the recycle bin keeps its old `schedule_computed_at`, so it is pending at the next
 * boot, like the three precedents.
 */
@Injectable()
export class MilestoneRederiveService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
    private readonly crossPlan: CrossPlanDependencyRepository,
    @InjectPinoLogger(MilestoneRederiveService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.rederive().catch((error: unknown) => {
      this.logger.error(
        { event: 'schedule.milestone_rederive_failed', err: error },
        'milestone re-derivation did not run',
      );
    });
  }

  /**
   * The plans still carrying dates the old zero-span snap wrote, in a stable order. Public for the API
   * e2e. The marker is a scalar subquery, as in the precedents: with no row, or a rolled-back one, it is
   * `NULL` and `x < NULL` admits no plan (fail closed).
   */
  async pendingPlans(): Promise<PendingMilestonePlan[]> {
    return this.prisma.$queryRaw<PendingMilestonePlan[]>`
      WITH "stale" AS MATERIALIZED (
        SELECT p."id", p."organization_id"
          FROM "plans" p
         WHERE p."deleted_at" IS NULL
           AND p."planned_start" IS NOT NULL
           AND p."schedule_computed_at" < (
                 SELECT m."finished_at" FROM "_prisma_migrations" m
                  WHERE m."migration_name" = ${MILESTONE_CROSS_CALENDAR_MIGRATION}
                    AND m."finished_at" IS NOT NULL
                    AND m."rolled_back_at" IS NULL
               )
      ), "zero_span" AS (
        -- Mirrors the engine's isZeroSpan, widened to every milestone (database-architect design 4.1).
        SELECT a."id", a."plan_id"
          FROM "activities" a
         WHERE a."deleted_at" IS NULL
           AND (   (a."duration_minutes" = 0 AND a."type" NOT IN ('LEVEL_OF_EFFORT', 'WBS_SUMMARY'))
                OR a."type" IN ('START_MILESTONE', 'FINISH_MILESTONE'))
      )
      SELECT s."id", s."organization_id" AS "organizationId"
        FROM "stale" s
       WHERE EXISTS (SELECT 1 FROM "zero_span" z WHERE z."plan_id" = s."id")
          -- An outgoing link to a zero-span successor: its late date is read differently now.
          OR EXISTS (SELECT 1 FROM "cross_plan_dependencies" d
                       JOIN "zero_span" z ON z."id" = d."successor_id"
                      WHERE d."predecessor_plan_id" = s."id" AND d."deleted_at" IS NULL)
          -- An incoming link from a zero-span predecessor: robust to that plan's failed run.
          OR EXISTS (SELECT 1 FROM "cross_plan_dependencies" d
                       JOIN "zero_span" z ON z."id" = d."predecessor_id"
                      WHERE d."successor_plan_id" = s."id" AND d."deleted_at" IS NULL)
       ORDER BY s."organization_id", s."id"`;
  }

  /** Recalculate every pending plan and its downstream, upstream first. Returns how many were done. */
  async rederive(): Promise<number> {
    const plans = await this.pendingPlans();
    if (plans.length === 0) return 0;
    const startedAt = Date.now();

    const pendingByOrg = new Map<string, Set<string>>();
    for (const plan of plans) {
      const bucket = pendingByOrg.get(plan.organizationId) ?? new Set<string>();
      bucket.add(plan.id);
      pendingByOrg.set(plan.organizationId, bucket);
    }

    let done = 0;
    for (const [organizationId, pending] of pendingByOrg) {
      let order: string[];
      // Each plan's direct upstream plans, for the downstream propagation.
      const upstreamOf = new Map<string, string[]>();
      try {
        const edges = await this.crossPlan.loadOrgAdjacency(organizationId);
        const nodes = new Set<string>(pending);
        for (const edge of edges) {
          nodes.add(edge.predecessorPlanId);
          nodes.add(edge.successorPlanId);
          const bucket = upstreamOf.get(edge.successorPlanId) ?? [];
          bucket.push(edge.predecessorPlanId);
          upstreamOf.set(edge.successorPlanId, bucket);
        }
        order = orderPlansUpstreamFirst(nodes, edges);
      } catch (error) {
        this.logger.warn(
          {
            event: 'schedule.milestone_rederive_org_failed',
            organizationId,
            pending: pending.size,
            err: error,
          },
          'milestone re-derivation skipped an organisation',
        );
        continue;
      }

      const recalculated = new Set<string>();
      for (const planId of order) {
        const downstreamOfRecalculated = (upstreamOf.get(planId) ?? []).some((id) =>
          recalculated.has(id),
        );
        if (!pending.has(planId) && !downstreamOfRecalculated) continue;
        try {
          if (await this.schedule.recalculateAsSystem(organizationId, planId)) {
            recalculated.add(planId);
            done += 1;
          }
        } catch (error) {
          // One plan's failure must not stop the rest; it stays in the set (if pending) and is retried
          // at the next boot, or by the planner's next edit.
          this.logger.warn(
            { event: 'schedule.milestone_rederive_plan_failed', planId, err: error },
            'milestone re-derivation skipped a plan',
          );
        }
      }
    }

    this.logger.info(
      {
        event: 'schedule.milestone_rederived',
        pending: plans.length,
        recalculated: done,
        organizations: pendingByOrg.size,
        durationMs: Date.now() - startedAt,
      },
      'plans recalculated for the zero-span milestone rule',
    );
    return done;
  }
}
