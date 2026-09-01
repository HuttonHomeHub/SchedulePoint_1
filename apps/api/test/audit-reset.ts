import type { PrismaClient } from '@prisma/client';

/**
 * Clear `audit_events` between e2e specs.
 *
 * **Why this needs a helper at all.** ADR-0072 makes the table append-only with `BEFORE UPDATE OR
 * DELETE` and `BEFORE TRUNCATE` triggers, and gives `organization_id` an FK with `ON DELETE
 * RESTRICT`. Both are deliberate: an audit row must not be quietly removed, and deleting an
 * organisation must not orphan its trail. Together they mean a spec that clears organisations now
 * fails on the FK, and cannot fix that by deleting the audit rows first, because the trigger
 * refuses that too.
 *
 * **This is the escape hatch ADR-0072 documents rather than hides.** A trigger stops accident and
 * stops application code; it does not stop the table's OWNER, who can `ALTER TABLE … DISABLE
 * TRIGGER`. That is stated in the ADR as the limit of what a trigger can promise, and this file is
 * the proof the statement is accurate rather than aspirational. It lives in `test/` and nothing in
 * `src/` may import it — production code has no reason to remove an audit row, and the day it
 * needs one, that is an ADR, not a helper.
 *
 * `ENABLE ALWAYS` is restored afterwards, not plain `ENABLE`: the migration sets ALWAYS so the
 * trigger also fires for a replication/`session_replication_role = replica` session, and a reset
 * that quietly downgraded it would leave every later test running against a weaker table than
 * production has.
 */
export async function clearAuditEvents(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "audit_events" DISABLE TRIGGER "trg_audit_events_append_only"',
  );
  try {
    await prisma.$executeRawUnsafe('DELETE FROM "audit_events"');
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "trg_audit_events_append_only"',
    );
  }
}

/**
 * Clear every domain table an audit spec can reach, deepest FK first.
 *
 * **One list, because two drifted.** The two audit specs each kept their own sweep, and the audit
 * log's own coverage is what made them collide: as C3 widened, one spec created activities,
 * baselines and resources that the other's `plan.deleteMany()` then tripped over — a failure whose
 * message names a foreign key and says nothing about the spec that actually left the rows behind,
 * and which surfaces or hides depending on the order the runner happens to pick. Sharing the list
 * is the ADR-0065 rule applied to test scaffolding: a second copy would drift again, and the drift
 * would be invisible until an unrelated change reordered the files.
 *
 * Soft deletes are why a passing test still leaves rows: the API's DELETE marks `deleted_at` and
 * the row stays, so a spec that "cleaned up through the API" has cleaned up nothing this needs.
 */
export async function clearDomainData(prisma: PrismaClient): Promise<void> {
  await prisma.crossPlanDependency.deleteMany();
  await prisma.activityDependency.deleteMany();
  // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
  // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
  // behind, so without this the failure lands in a spec that has never heard of notes — the
  // same way `plan_shares` did, one table along.
  await prisma.note.deleteMany();
  // Weighted steps hold `activity_id` (ADR-0044 §33) — the THIRD table to fail this way, after
  // `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a).
  await prisma.activityStep.deleteMany();
  await prisma.resourceAssignment.deleteMany();
  await prisma.activity.deleteMany();
  // Baselines hold an FK to their plan, and the snapshot rows to the baseline — so both go before
  // `plan`, deepest first.
  await prisma.baselineAssignment.deleteMany();
  await prisma.baselineActivity.deleteMany();
  await prisma.baseline.deleteMany();
  await prisma.planLock.deleteMany();
  // Share links hold a RESTRICT FK to their plan.
  await prisma.planShare.deleteMany();
  await prisma.plan.deleteMany();
  // The assignments went above, before `activity` — they hold `activity_id` as well as
  // `resource_id`, so sweeping them only here could never have worked. `resource` still belongs
  // after them.
  await prisma.resource.deleteMany();
  await prisma.calendarException.deleteMany();
  await prisma.calendar.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.orgMember.deleteMany();
  // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
  await clearAuditEvents(prisma);
  await prisma.organization.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
}
