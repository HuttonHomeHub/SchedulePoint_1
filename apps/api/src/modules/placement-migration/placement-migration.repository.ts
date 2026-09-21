import { Injectable } from '@nestjs/common';
import type { PlacementMigration } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * `placement_migrations` data access (one-planning-surface M-I).
 *
 * **Read-only, and that is the whole module.** The rows are written by the shipped SQL migration
 * `20260921120000_strip_drag_constraints`, inside `prisma migrate deploy` — never by the
 * application. So there is no create, no update and no delete here, and adding one would be a
 * second producer of a record whose entire value is that it says what a one-time act did.
 *
 * The table has no soft delete and no `deleted_at`, so unlike every sibling repository there is no
 * `deleted_at: null` to filter: every row is in the read set. Its rows die with their plan by
 * database cascade (see the model's docblock for why CASCADE rather than RESTRICT).
 */
@Injectable()
export class PlacementMigrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every row for one plan, oldest first.
   *
   * **Ordered by `id`, not by `migrated_at`, and the difference is not cosmetic**: the migration
   * stamps `migrated_at` from `CURRENT_TIMESTAMP` inside one transaction, which is the transaction
   * START time, so every row written by one batch shares one instant and that column cannot order
   * rows within a batch. `id` is UUID v7, so it is monotonic by creation and orders them exactly.
   * The `(plan_id, id)` index serves this read on both columns.
   *
   * **`organizationId` is a defensive predicate, not the scope check** — the caller has already
   * resolved the plan inside the organisation. It is here for the same reason `PlanLockRepository`
   * carries one: a repository that can be called with a mismatched pair should return nothing
   * rather than something.
   *
   * **Uncapped, deliberately.** The population is bounded by the binding-SNET count of one plan at
   * one instant in the past and can never grow afterwards, so a cursor would add a contract with
   * no subject. If that ever stops being true the DTO already carries its own `count`, so a cap can
   * be added without the client's "showing N of M" becoming a lie.
   */
  findForPlan(planId: string, organizationId: string): Promise<PlacementMigration[]> {
    return this.prisma.placementMigration.findMany({
      where: { planId, organizationId },
      orderBy: { id: 'asc' },
    });
  }
}
