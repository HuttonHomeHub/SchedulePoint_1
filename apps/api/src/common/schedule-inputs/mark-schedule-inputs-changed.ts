import type { Prisma } from '@prisma/client';

/**
 * Record that a write may have changed a scheduling input of each named plan — the one writer of
 * `plans.schedule_inputs_changed_at`, which the organisation overview compares with
 * `schedule_computed_at` to say "edited since it was calculated" (see the column's docblock in
 * `schema.prisma` and `docs/DATABASE.md`).
 *
 * **Call it last in the edit's own transaction**, and only when a classified INPUT changed
 * (`changedInputs`) or the write is a create, delete or restore. Last, because the recalculation
 * writes its children and then the plan row (`stampScheduleComputedAt`); calling this last gives an
 * edit the same child → plan order, so it adds no lock inversion.
 *
 * **`clock_timestamp()`, not `now()`.** `now()` is the edit transaction's START. An edit that began
 * before a recalculation and committed after it would be stamped earlier than `schedule_computed_at`
 * and read as already calculated: the flag would be missed. `clock_timestamp()` in the edit's last
 * statement is close to its commit, so what is left of the race fails toward a spurious flag, which
 * is the safe direction (`docs/TECH_DEBT.md`). `GREATEST` keeps the column monotone when two
 * transactions commit out of order.
 *
 * It touches no `version`, `updated_at` or `updated_by`, so an activity edit cannot 409 a concurrent
 * plan-settings save and the plan's "Recently changed" ordering is unmoved. Organisation-scoped, so
 * an id taken from another tenant matches nothing.
 *
 * soft-delete: any-state — stamps the plan of a child that was just soft-deleted or restored; the
 * caller resolved the plan active, so a filter would only hide a no-op.
 */
export async function markScheduleInputsChanged(
  tx: Prisma.TransactionClient,
  organizationId: string,
  planIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(planIds)];
  if (ids.length === 0) return;
  await tx.$executeRaw`
    UPDATE plans
    SET schedule_inputs_changed_at = GREATEST(schedule_inputs_changed_at, clock_timestamp())
    WHERE organization_id = ${organizationId}::uuid
      AND id = ANY(${ids}::uuid[])
  `;
}
