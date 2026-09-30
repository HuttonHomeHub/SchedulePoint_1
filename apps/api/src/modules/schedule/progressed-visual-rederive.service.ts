import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';
import { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';

import { orderPlansUpstreamFirst } from './programme-order';
import { ScheduleService } from './schedule.service';

/**
 * The marker-only migration that ships with the engine fix for #421. It has no statement: its
 * `_prisma_migrations.finished_at` is the instant the fixed engine took over on the host, and is this
 * service's marker (docs/DATABASE.md "Re-derivation markers"). No date is written into this file.
 */
export const PROGRESSED_VISUAL_MIGRATION = '20260930120000_progressed_predecessor_visual_marker';

/** A plan whose stored placed dates were written by the old Pass 2. */
export interface PendingProgressedVisualPlan {
  id: string;
  organizationId: string;
}

/**
 * **Re-derive, once, every plan whose placed dates the old Pass 2 wrote** (#421, spec §4.4 / D4; the
 * `CrossPlanRederiveService` shape and the ADR-0155 D9 precedent).
 *
 * Pass 2 used to propagate a progressed predecessor's PLANNED duration from its own start, so the
 * successor of a started or finished activity was drawn away from where Pass 1 puts it. The engine is
 * fixed, but the engine-owned `visual_effective_*` columns keep the old values until somebody
 * recalculates the plan, and nothing flags such a plan as stale. Product owner, 2026-09-30: "all at once
 * on release" — every plan, including what a guest share link shows, is corrected at the first boot.
 *
 * **Which plans.** A live plan with a data date whose `schedule_computed_at` is EARLIER than the marker
 * migration's `finished_at` and which has a live activity with an `actual_start`, an `actual_finish`, or
 * (with the plan's `use_expected_finish_dates` on) an `expected_finish`: the only inputs the old Pass 2
 * got wrong. Recalculating stamps `schedule_computed_at`, so a plan leaves the set once done; a plan never
 * calculated (`NULL`) has no old dates and is never in it. The `EXISTS` on `activities` deliberately has
 * NO `a.organization_id = p.organization_id` predicate: it was measured slower (a BitmapAnd with the
 * organisation index read 20,200 entries per plan, 13.8 ms against 7.1 ms) and protects nothing, since
 * the organisation comes from the `plans` row and `recalculateAsSystem` re-reads the plan scoped to it.
 *
 * **Which order, and the downstream extension.** Per organisation, upstream first, ordering the WHOLE
 * cross-plan graph and not only the pending set (see `CrossPlanRederiveService` for why the pending set
 * alone orders wrongly). A corrected upstream plan moves the forward bound its downstream plans read
 * (ADR-0148 D10), and a downstream plan with no progress of its own is not pending, so on its own it
 * would keep old dates until somebody touched it. To honour "every plan corrected", the walk ALSO
 * recalculates a plan when any of its direct upstream plans was recalculated in this run. Because the
 * walk is topological the rule propagates down a chain, and it converges: the second boot finds nothing
 * pending, so it recalculates nothing.
 *
 * **Three boot services can recalculate one plan.** This service, `FinishMilestoneRederiveService` and
 * `CrossPlanRederiveService` all start at bootstrap, none is awaited, and every replica runs them, so a
 * plan pending for several may be recalculated more than once. That is harmless: recalculation is
 * idempotent and serialised by the plan advisory lock, each of whose transactions takes and releases its
 * own lock, so no service holds two and none can deadlock.
 *
 * **As the system, never blocking the boot.** No principal and no pen (ADR-0022, ADR-0155 D9); not
 * audited (ADR-0072). It starts after the application is up and is not awaited. One plan's failure is
 * logged and left for the next boot; one organisation whose graph cannot be ordered is logged and skipped
 * whole. Steady state costs one read of `plans` per boot.
 */
@Injectable()
export class ProgressedVisualRederiveService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
    private readonly crossPlan: CrossPlanDependencyRepository,
    @InjectPinoLogger(ProgressedVisualRederiveService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.rederive().catch((error: unknown) => {
      this.logger.warn(
        { event: 'schedule.pv_rederive_failed', err: error },
        'progressed-predecessor re-derivation did not run',
      );
    });
  }

  /**
   * The plans still carrying old Pass 2 dates, in a stable order. Public for the API e2e. The marker is
   * a scalar subquery, as in the precedents: with no row, or a rolled-back one, it is `NULL` and
   * `x < NULL` admits no plan (fail closed).
   */
  async pendingPlans(): Promise<PendingProgressedVisualPlan[]> {
    return this.prisma.$queryRaw<PendingProgressedVisualPlan[]>`
      SELECT p."id", p."organization_id" AS "organizationId"
        FROM "plans" p
       WHERE p."deleted_at" IS NULL
         AND p."planned_start" IS NOT NULL
         AND p."schedule_computed_at" < (
               SELECT m."finished_at" FROM "_prisma_migrations" m
                WHERE m."migration_name" = ${PROGRESSED_VISUAL_MIGRATION}
                  AND m."finished_at" IS NOT NULL
                  AND m."rolled_back_at" IS NULL
             )
         AND EXISTS (
               SELECT 1 FROM "activities" a
                WHERE a."plan_id" = p."id"
                  AND a."deleted_at" IS NULL
                  AND (
                        a."actual_start" IS NOT NULL
                     OR a."actual_finish" IS NOT NULL
                     OR (p."use_expected_finish_dates" AND a."expected_finish" IS NOT NULL)
                  )
             )
       ORDER BY p."organization_id", p."id"`;
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
            event: 'schedule.pv_rederive_org_failed',
            organizationId,
            pending: pending.size,
            err: error,
          },
          'progressed-predecessor re-derivation skipped an organisation',
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
            { event: 'schedule.pv_rederive_plan_failed', planId, err: error },
            'progressed-predecessor re-derivation skipped a plan',
          );
        }
      }
    }

    this.logger.info(
      {
        event: 'schedule.pv_rederived',
        pending: plans.length,
        recalculated: done,
        organizations: pendingByOrg.size,
        durationMs: Date.now() - startedAt,
      },
      'plans recalculated for the progressed-predecessor placed dates',
    );
    return done;
  }
}
