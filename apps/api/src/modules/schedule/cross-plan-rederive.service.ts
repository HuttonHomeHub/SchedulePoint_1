import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';
import { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';

import { orderPlansUpstreamFirst } from './programme-order';
import { ScheduleService } from './schedule.service';

/**
 * The migration that re-encoded every cross-plan lag as working minutes on its lag calendar (#385).
 * Its `_prisma_migrations.finished_at` is this service's marker (spec §4.4 "Marker"), so no date is
 * written into this file.
 */
export const CROSS_PLAN_LAG_MIGRATION = '20260926120000_cross_plan_lag_working_minutes';

/** A plan still carrying dates computed under the old cross-plan rule. */
export interface PendingCrossPlanPlan {
  id: string;
  organizationId: string;
}

/**
 * **Re-derive, once, every plan whose stored dates were computed under the old cross-plan rule**
 * (#385, spec D8; the `FinishMilestoneRederiveService` precedent, ADR-0155 D9).
 *
 * A cross-plan link now produces the dates the same link would inside one plan, and its lag is stored
 * in working minutes on its lag calendar. Neither change moves a stored date by itself: the engine-owned
 * columns of a linked plan keep the old rule's dates until somebody recalculates it. And nothing flags
 * such a plan, because staleness is computed from upstream `schedule_computed_at` (ADR-0045 §5), which
 * this release does not change. So an affected plan would keep its old dates indefinitely. They are
 * wrong in BOTH directions, not only the optimistic one: of the 1,728 cells M0 predicted, 442 the old
 * rule dated later than the new one (docs/specs/cross-plan-day-boundary/m0/red-run.md). The API
 * therefore recalculates those plans itself, once.
 *
 * **Which plans, and why it cannot repeat.** A live plan with a data date, with at least one active
 * cross-plan edge in either direction, whose `schedule_computed_at` is EARLIER than the moment the lag
 * migration finished (read from `_prisma_migrations`). Recalculating stamps `schedule_computed_at` with
 * the present, so a plan leaves the set the moment it is done; a plan never calculated (`NULL`) has no
 * old-rule dates and is not in it.
 *
 * **In what order, and why the whole graph.** Topologically, per organisation, upstream first, because a
 * downstream recalculated before its upstream reads the upstream's old dates and ends stale. The pending
 * set is grouped by organisation; each organisation's adjacency is loaded ONCE, and
 * {@link orderPlansUpstreamFirst} orders EVERY plan in it, not only the pending ones. Only then is the
 * order walked, recalculating the pending plans and skipping the rest. Ordering the pending set alone is
 * wrong, and the unit suite pins why: that function counts in-degree only from edges with both ends in
 * the set, so in `A → B → C` with `B` not pending, `A` and `C` would each have in-degree 0 and be ordered
 * by plan id alone. Plan ids are UUID v7 (creation order), so `C` can sort first, be recalculated first,
 * and read stale against `A`, because staleness reads the full transitive upstream closure. Ordering the
 * whole graph keeps the path through `B`.
 *
 * **What remains, stated rather than engineered around (spec D8).** A non-pending intermediate `B` is not
 * recalculated. After `A` is, `B` reads stale until a programme recalculation reaches it: a visible flag,
 * not a silent wrong date. And backward bounds converge one pass behind, as they do in every programme
 * recalculation (ADR-0045 §4): an upstream recalculated first reads its downstream's previous late dates.
 *
 * **Two boot services can recalculate one plan.** This service and `FinishMilestoneRederiveService` both
 * start at bootstrap, neither is awaited, and both run on every replica, so a plan pending for both may be
 * recalculated twice. That is harmless: recalculation is idempotent and serialised by the plan advisory
 * lock. One consequence is recorded (spec D8): the finish-milestone service orders by plan id, so on a
 * host that jumps both releases at once it can recalculate a downstream plan AFTER this service has
 * recalculated its upstream, and that downstream then shows stale until a programme recalculation clears
 * it. On any host that has booted since the finish-milestone release its set is already empty, so the
 * case does not arise there.
 *
 * **As the system, not a member.** No principal is constructed: `ScheduleService.recalculateAsSystem`
 * takes an organisation id and runs the same locked transaction without the pen assertion, because nobody
 * is editing and the write is engine-owned (ADR-0022). Each plan's advisory lock is taken and released
 * inside its own transaction, so this service never holds two plan locks and cannot deadlock. A planner
 * holding the pen sees dates move, as with ADR-0155 D9. Recalculation is never audited (ADR-0072).
 *
 * **Never blocks and never fails the boot.** It starts after the application is up and is not awaited.
 * One plan's failure is logged and left for the next boot; one organisation whose graph cannot be ordered
 * (a residual cycle, which ADR-0045 §3 makes unreachable) is logged and skipped whole, because
 * recalculating its plans in any other order is the defect this ordering exists to prevent. After it has
 * run on a host the query returns nothing and it costs one read of `plans` at each boot.
 */
@Injectable()
export class CrossPlanRederiveService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
    private readonly crossPlan: CrossPlanDependencyRepository,
    @InjectPinoLogger(CrossPlanRederiveService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.rederive().catch((error: unknown) => {
      this.logger.error(
        { event: 'schedule.xplan_rederive_failed', err: error },
        'cross-plan re-derivation did not run',
      );
    });
  }

  /**
   * The plans still carrying old-rule dates, grouped by organisation in a stable order. Public for the
   * API e2e. Each EXISTS branch reads one column that has an index of its own (`predecessor_plan_id`, and
   * `successor_plan_id` as the leading column of its composite index). The organisation predicate is
   * defence in depth: an edge's plans are in its organisation by construction.
   */
  async pendingPlans(): Promise<PendingCrossPlanPlan[]> {
    return this.prisma.$queryRaw<PendingCrossPlanPlan[]>`
      SELECT p."id", p."organization_id" AS "organizationId"
        FROM "plans" p
       WHERE p."deleted_at" IS NULL
         AND p."planned_start" IS NOT NULL
         AND p."schedule_computed_at" < (
               SELECT m."finished_at" FROM "_prisma_migrations" m
                WHERE m."migration_name" = ${CROSS_PLAN_LAG_MIGRATION}
                  AND m."finished_at" IS NOT NULL
                  AND m."rolled_back_at" IS NULL
             )
         AND (
               EXISTS (
                 SELECT 1 FROM "cross_plan_dependencies" d
                  WHERE d."predecessor_plan_id" = p."id"
                    AND d."organization_id" = p."organization_id"
                    AND d."deleted_at" IS NULL
               )
            OR EXISTS (
                 SELECT 1 FROM "cross_plan_dependencies" d
                  WHERE d."successor_plan_id" = p."id"
                    AND d."organization_id" = p."organization_id"
                    AND d."deleted_at" IS NULL
               )
             )
       ORDER BY p."organization_id", p."id"`;
  }

  /** Recalculate every pending plan, upstream first per organisation. Returns how many were done. */
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
      try {
        const edges = await this.crossPlan.loadOrgAdjacency(organizationId);
        // Every plan the organisation's graph touches, not only the pending ones (see the docblock). The
        // pending ids are added too: each has an active edge by the query's definition, so this changes
        // nothing unless the two reads disagree, in which case the plan is still ordered rather than lost.
        const nodes = new Set<string>(pending);
        for (const edge of edges) {
          nodes.add(edge.predecessorPlanId);
          nodes.add(edge.successorPlanId);
        }
        order = orderPlansUpstreamFirst(nodes, edges);
      } catch (error) {
        this.logger.warn(
          {
            event: 'schedule.xplan_rederive_org_failed',
            organizationId,
            pending: pending.size,
            err: error,
          },
          'cross-plan re-derivation skipped an organisation',
        );
        continue;
      }

      for (const planId of order) {
        if (!pending.has(planId)) continue;
        try {
          if (await this.schedule.recalculateAsSystem(organizationId, planId)) done += 1;
        } catch (error) {
          // One plan's failure (a horizon guard, an invalid graph) must not stop the rest; the plan stays
          // in the set and is retried at the next boot, or by the planner's next edit.
          this.logger.warn(
            { event: 'schedule.xplan_rederive_plan_failed', planId, err: error },
            'cross-plan re-derivation skipped a plan',
          );
        }
      }
    }

    this.logger.info(
      {
        event: 'schedule.xplan_rederived',
        pending: plans.length,
        recalculated: done,
        organizations: pendingByOrg.size,
        durationMs: Date.now() - startedAt,
      },
      'plans recalculated for the cross-plan date rule',
    );
    return done;
  }
}
