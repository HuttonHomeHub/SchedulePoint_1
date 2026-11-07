import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';
import { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';

import { orderPlansUpstreamFirst } from './programme-order';
import { ScheduleService } from './schedule.service';

/**
 * The marker-only migration that ships with the cross-plan READ of the stored instants (ADR-0212 D5,
 * `docs/specs/cross-plan-instants/m2-schema-design.md` §5). It has no statement: its
 * `_prisma_migrations.finished_at` is the instant the instant-reading image took over on the host, and
 * is this service's marker (docs/DATABASE.md "Re-derivation markers"). No date is written into this file.
 *
 * **The migration does not exist yet, on purpose (M3).** Until M4 adds the folder, the scalar subquery
 * below is `NULL`, `x < NULL` admits no plan, and the service is dormant — fail-closed, by the same rule
 * that makes a rolled-back marker admit nothing.
 */
export const CROSS_PLAN_INSTANTS_MIGRATION = '20261107120100_cross_plan_instants_marker';

/** A linked plan whose stored dates were written before the cross-plan read took the instants. */
export interface PendingCrossPlanInstantPlan {
  id: string;
  organizationId: string;
}

/**
 * **Recalculate, once, every linked plan, upstream first, so the instants exist before a downstream
 * reads them** (ADR-0212 D5, spec §4.7 D-5; the fifth boot re-derivation, shaped like
 * `MilestoneRederiveService` and `CrossPlanRederiveService`).
 *
 * The cross-plan derivation now reads the remote activity's stored absolute INSTANT instead of its
 * calendar-day date, so a linked plan gets the dates the same logic gives inside one plan. Nothing
 * moves a stored date by itself: the engine-owned columns keep the old read's dates until somebody
 * recalculates the plan, and nothing flags such a plan as stale (ADR-0045 §5 reads upstream
 * `schedule_computed_at`, which this release does not change). Product owner, 2026-11-07 (Q2 A): linked
 * plans are recalculated once, at the first boot.
 *
 * **Which plans.** A live plan with a data date that is an endpoint of a live cross-plan link in
 * EITHER direction, whose `schedule_computed_at` is EARLIER than the marker's `finished_at`. Either
 * direction because the upstream must write its instants before the downstream reads them; the
 * downstream is pending in its own right because its dates were computed from the old read. A plan
 * never calculated (`NULL`) has no stored dates to replace and is never pending. Recalculating stamps
 * `schedule_computed_at` with the present, so a plan leaves the set the moment it is done.
 *
 * **Which order, and why the whole graph.** Per organisation, upstream first, by
 * {@link orderPlansUpstreamFirst} over EVERY plan the organisation's graph touches and only then
 * walking that order recalculating the pending plans. Ordering the pending set alone was ADR-0161 D8's
 * first, wrong design: that function counts in-degree only from edges with both ends in the set, so in
 * `A → B → C` with `B` not pending, `A` and `C` are both roots and fall to the plan id, which is a
 * UUID v7 and so creation order, which can put `C` first. Unlike `MilestoneRederiveService` this one has
 * no "downstream of a recalculated plan" extension: every linked plan is pending by the query, so the
 * set already is the closure.
 *
 * **Five boot services can recalculate one plan.** All start at bootstrap, none is awaited, every
 * replica runs them, so a plan pending for several may be recalculated more than once. That is
 * harmless: recalculation is idempotent and serialised by the plan advisory lock, each transaction of
 * which takes and releases its own, so no service holds two and none can deadlock.
 *
 * **As the system, never blocking the boot.** No principal and no pen (ADR-0022, ADR-0155 D9); not
 * audited (ADR-0072). One plan's failure is logged and retried at the next boot; one organisation whose
 * graph cannot be ordered is logged and skipped whole. Steady state costs one read of `plans` per boot.
 * A plan restored from the recycle bin keeps its old `schedule_computed_at`, so it is pending at the
 * next boot, like the four precedents.
 */
@Injectable()
export class CrossPlanInstantRederiveService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
    private readonly crossPlan: CrossPlanDependencyRepository,
    @InjectPinoLogger(CrossPlanInstantRederiveService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.rederive().catch((error: unknown) => {
      this.logger.error(
        { event: 'schedule.xplan_instants_rederive_failed', err: error },
        'cross-plan instant re-derivation did not run',
      );
    });
  }

  /**
   * The linked plans still carrying pre-instant dates, in a stable order. Public for the API e2e. The
   * marker is a scalar subquery, as in the precedents: with no row, or a rolled-back one, it is `NULL`
   * and `x < NULL` admits no plan (fail closed). Every table read states its own soft-delete filter
   * (ADR-0172). The organisation predicate on the edges is defence in depth: an edge's plans are in its
   * organisation by construction.
   */
  async pendingPlans(): Promise<PendingCrossPlanInstantPlan[]> {
    return this.prisma.$queryRaw<PendingCrossPlanInstantPlan[]>`
      SELECT p."id", p."organization_id" AS "organizationId"
        FROM "plans" p
       WHERE p."deleted_at" IS NULL
         AND p."planned_start" IS NOT NULL
         AND p."schedule_computed_at" < (
               SELECT m."finished_at" FROM "_prisma_migrations" m
                WHERE m."migration_name" = ${CROSS_PLAN_INSTANTS_MIGRATION}
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

  /**
   * Whether one plan is STILL pending, by a primary-key read against the same marker. The pending list
   * is read once up front and walked for as long as the recalculations take, during which another
   * replica, or one of the other boot services, may already have recalculated the plan; this skips the
   * duplicate. Racy by nature (a peer can finish between this read and our lock) and that is fine: the
   * recalculation is idempotent, so the check only has to cut the common duplicate, not forbid it.
   */
  private async stillPending(planId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM "plans" p
       WHERE p."id" = ${planId}::uuid
         AND p."deleted_at" IS NULL
         AND p."schedule_computed_at" < (
               SELECT m."finished_at" FROM "_prisma_migrations" m
                WHERE m."migration_name" = ${CROSS_PLAN_INSTANTS_MIGRATION}
                  AND m."finished_at" IS NOT NULL
                  AND m."rolled_back_at" IS NULL
             )`;
    return rows.length > 0;
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
        // Every plan the organisation's graph touches, not only the pending ones (see the docblock).
        const nodes = new Set<string>(pending);
        for (const edge of edges) {
          nodes.add(edge.predecessorPlanId);
          nodes.add(edge.successorPlanId);
        }
        order = orderPlansUpstreamFirst(nodes, edges);
      } catch (error) {
        this.logger.warn(
          {
            event: 'schedule.xplan_instants_rederive_org_failed',
            organizationId,
            pending: pending.size,
            err: error,
          },
          'cross-plan instant re-derivation skipped an organisation',
        );
        continue;
      }

      for (const planId of order) {
        if (!pending.has(planId)) continue;
        try {
          if (!(await this.stillPending(planId))) continue;
          if (await this.schedule.recalculateAsSystem(organizationId, planId)) done += 1;
        } catch (error) {
          // One plan's failure (a horizon guard, an invalid graph) must not stop the rest; the plan
          // stays in the set and is retried at the next boot, or by the planner's next edit.
          this.logger.warn(
            { event: 'schedule.xplan_instants_rederive_plan_failed', planId, err: error },
            'cross-plan instant re-derivation skipped a plan',
          );
        }
      }
    }

    this.logger.info(
      {
        event: 'schedule.xplan_instants_rederived',
        pending: plans.length,
        recalculated: done,
        organizations: pendingByOrg.size,
        durationMs: Date.now() - startedAt,
      },
      'plans recalculated for the cross-plan instant read',
    );
    return done;
  }
}
