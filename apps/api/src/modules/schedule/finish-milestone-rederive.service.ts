import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';

import { ScheduleService } from './schedule.service';

/** The migration that moved every stored finish-milestone placement for the end-of-day rule. */
export const FINISH_MILESTONE_DATE_MIGRATION =
  '20260923120000_finish_milestone_end_of_day_placements';

/**
 * **Re-derive, once, every plan whose stored dates were computed under the old finish-milestone
 * rule** (#381, ADR-0155 D5).
 *
 * The migration keeps every placed instant identical, but it cannot fix the ENGINE-OWNED date
 * columns (`early_*`, `late_*`, `visual_effective_*`, `leveled_*`): the new reading of a finish
 * milestone after a Friday task is that Friday, and the old one was the following Monday, which is
 * not "one day earlier" and needs a calendar SQL does not have. Left alone, every finish milestone in
 * every existing plan would draw a day late (the web now draws one on the END of its dated day) and
 * would report the old date, until somebody happened to edit that plan — and the status bar offers
 * Recalculate only on a plan it already knows is stale, so an untouched plan would stay wrong
 * indefinitely. So the API recalculates those plans itself, once.
 *
 * **Which plans, and why it cannot repeat.** A live plan with a data date, holding at least one live
 * finish milestone, whose `schedule_computed_at` is EARLIER than the moment the migration finished
 * (read from `_prisma_migrations`, so there is no date written into this file). Recalculating stamps
 * `schedule_computed_at` with the present, so a plan leaves the set the moment it is done; a plan
 * never calculated (`NULL`) is not in it, because it has no old-rule dates to replace.
 *
 * **As the system, not a member.** No principal is constructed — `ScheduleService.recalculateAsSystem`
 * takes an organisation id and runs the same locked transaction without the pen assertion, because
 * nobody is editing and the write is engine-owned (ADR-0022). The plan advisory lock still serialises
 * it with a user's recalculation of the same plan. Recalculation is never audited (ADR-0072), and
 * this is no exception.
 *
 * **Never blocks and never fails the boot** (the `StaffBootstrapService` precedent): it starts after
 * the application is up and is not awaited, and a plan that fails to recalculate is logged and left
 * for the next boot or the next edit. It exists for one release's worth of plans; after it has run on
 * a host the query returns nothing and it costs one read of the `plans` table at each boot.
 */
@Injectable()
export class FinishMilestoneRederiveService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
    @InjectPinoLogger(FinishMilestoneRederiveService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.rederive().catch((error: unknown) => {
      this.logger.error(
        { event: 'schedule.fm_rederive_failed', err: error },
        'finish-milestone re-derivation did not run',
      );
    });
  }

  /** The plans still carrying old-rule dates, in a stable order. Public for the API e2e (FC-6). */
  async pendingPlans(): Promise<{ id: string; organizationId: string }[]> {
    return this.prisma.$queryRaw<{ id: string; organizationId: string }[]>`
      SELECT p."id", p."organization_id" AS "organizationId"
        FROM "plans" p
       WHERE p."deleted_at" IS NULL
         AND p."planned_start" IS NOT NULL
         AND p."schedule_computed_at" < (
               SELECT m."finished_at" FROM "_prisma_migrations" m
                WHERE m."migration_name" = ${FINISH_MILESTONE_DATE_MIGRATION}
                  AND m."finished_at" IS NOT NULL
                  AND m."rolled_back_at" IS NULL
             )
         AND EXISTS (
               SELECT 1 FROM "activities" a
                WHERE a."plan_id" = p."id"
                  AND a."type" = 'FINISH_MILESTONE'
                  AND a."deleted_at" IS NULL
             )
       ORDER BY p."id"`;
  }

  /** Recalculate every pending plan, one at a time. Returns how many were recalculated. */
  async rederive(): Promise<number> {
    const plans = await this.pendingPlans();
    if (plans.length === 0) return 0;
    const startedAt = Date.now();
    let done = 0;
    for (const plan of plans) {
      try {
        if (await this.schedule.recalculateAsSystem(plan.organizationId, plan.id)) done += 1;
      } catch (error) {
        // One plan's failure (a horizon guard, an invalid graph) must not stop the rest; the plan
        // stays in the set and is retried at the next boot, or by the planner's next edit.
        this.logger.warn(
          { event: 'schedule.fm_rederive_plan_failed', planId: plan.id, err: error },
          'finish-milestone re-derivation skipped a plan',
        );
      }
    }
    this.logger.info(
      {
        event: 'schedule.fm_rederived',
        pending: plans.length,
        recalculated: done,
        durationMs: Date.now() - startedAt,
      },
      'plans recalculated for the finish-milestone date rule',
    );
    return done;
  }
}
