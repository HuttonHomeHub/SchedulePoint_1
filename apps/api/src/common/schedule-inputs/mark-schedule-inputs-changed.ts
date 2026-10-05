import type { Prisma } from '@prisma/client';

/**
 * Record that a write may have changed a scheduling input of each named plan — the one writer of
 * `plans.schedule_inputs_changed_at`, which the organisation overview compares with
 * `schedule_computed_at` to say "edited since it was calculated" (see the column's docblock in
 * `schema.prisma` and `docs/DATABASE.md`).
 *
 * **Call it after every child write of the edit (history and audit inserts included), still inside
 * the edit's own transaction.** The recalculation writes its children and then the plan row
 * (`stampScheduleComputedAt`); stamping last gives an edit the same child -> plan order, so it adds no
 * lock inversion. Never call it in a transaction that also calls `stampScheduleComputedAt`: this
 * clock is always later than that transaction's `now()`, a permanent false positive. Nothing under
 * `modules/schedule/` imports it (a structural spec holds that).
 *
 * **`clock_timestamp()`, not `now()`.** `now()` is the edit transaction's START, so an edit that
 * began before a recalculation and committed after it would be stamped earlier than
 * `schedule_computed_at` and always read as calculated. `clock_timestamp()` in the edit's last
 * statement narrows that, but the race that remains runs BOTH ways. MISSED: an edit that stamps
 * before a recalculation starts and commits after the recalculation's read leaves the stamp earlier
 * than `schedule_computed_at` (window = stamp to commit, plus same-millisecond rounding; only edits
 * that do not take the plan advisory lock). SPURIOUS: a recalculation queued on the advisory lock
 * behind a lock-taking edit takes its `now()` before the edit's stamp, so the plan stays flagged
 * until the next recalculation (`docs/TECH_DEBT.md` #449). `GREATEST` keeps the column monotone when
 * two transactions commit out of order.
 *
 * Several plans are locked in id order, so two multi-plan stamps cannot deadlock each other.
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
  const ids = [...new Set(planIds)].sort();
  if (ids.length === 0) return;
  await tx.$executeRaw`
    WITH t AS (
      SELECT id FROM plans
      WHERE organization_id = ${organizationId}::uuid
        AND id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR NO KEY UPDATE
    )
    UPDATE plans p
    SET schedule_inputs_changed_at = GREATEST(p.schedule_inputs_changed_at, clock_timestamp())
    FROM t
    WHERE p.id = t.id
  `;
}
