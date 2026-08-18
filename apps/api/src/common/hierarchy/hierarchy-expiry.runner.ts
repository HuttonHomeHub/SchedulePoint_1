import type { Prisma } from '@prisma/client';

/**
 * **The permanent deletion of one expired subtree, in FK-safe order.**
 *
 * Deliberately not in `common/operational/` beside the other sweep. That directory's structural
 * spec (`retention-boundary.structural.spec.ts`) pins `RETENTION_TABLES` to exactly
 * `{csp_reports, mail_events}` by set equality and FORBIDS the Prisma accessors this needs — so
 * this code could not live there, and equally the gate there gives it no protection. Its own gate
 * is `hierarchy-expiry.structural.spec.ts`, in this directory.
 *
 * ## Ownership scope, never `delete_batch_id`
 *
 * The soft-delete cascade stamps 13 models and leaves two unstamped — `resource_assignments` and
 * `cross_plan_dependencies` (`docs/TECH_DEBT.md` #139). A batch-keyed delete would therefore pass
 * on an empty plan and fail the foreign key on exactly the plans that matter: resourced ones and
 * programme-linked ones. The deletable set is derived from ownership instead.
 *
 * ## One statement for activities
 *
 * `activities.parent_id` is `onDelete: Restrict`, and the spec claimed that forced a repeated
 * leaves-first loop. It does not: the RI check is an `AFTER ROW` trigger evaluated at the END of
 * the statement, so every row the statement targets is already gone before any check runs. Proved
 * twice, independently — a 100-deep chain plus 1,900 leaves in one statement, and the same
 * conclusion from trigger timing (ADR-0096 D7). A negative control fails with the named
 * constraint, so the proof is not vacuous.
 *
 * ## What a wrong order costs
 *
 * `23503`, naming the constraint — no corruption and no partial delete, because this runs in one
 * transaction per batch. But the batch is then **never** deleted and is retried hourly forever, so
 * the caller escalates that code rather than absorbing it as ordinary sweep noise.
 */

/** The rows one expired batch owns, resolved before anything is deleted. */
export interface ExpiryScope {
  clientIds: readonly string[];
  projectIds: readonly string[];
  planIds: readonly string[];
}

export interface ExpiryCounts {
  clients: number;
  projects: number;
  plans: number;
  activities: number;
}

/**
 * Delete one scope. **Order is load-bearing** and was enumerated from `pg_constraint` rather than
 * from the schema file, then run end to end against a real database
 * (`docs/specs/recently-deleted/measurements/05-delete-order.sql`).
 */
export async function deleteExpiredScope(
  tx: Prisma.TransactionClient,
  scope: ExpiryScope,
): Promise<ExpiryCounts> {
  const planIds = [...scope.planIds];
  const projectIds = [...scope.projectIds];
  const clientIds = [...scope.clientIds];

  // Resolved once. Every activity-keyed delete below reads this, so a second query would be a
  // second answer to "which activities are in scope" — and the two could differ under concurrency.
  const activities =
    planIds.length === 0
      ? []
      : await tx.activity.findMany({ where: { planId: { in: planIds } }, select: { id: true } });
  const activityIds = activities.map((a) => a.id);

  if (planIds.length > 0) {
    // Cross-plan edges FIRST, and by a four-way predicate: no CHECK ties an endpoint's activity to
    // its named plan, so an edge can reference this scope through either column pair.
    await tx.crossPlanDependency.deleteMany({
      where: {
        OR: [
          { predecessorPlanId: { in: planIds } },
          { successorPlanId: { in: planIds } },
          ...(activityIds.length > 0
            ? [{ predecessorId: { in: activityIds } }, { successorId: { in: activityIds } }]
            : []),
        ],
      },
    });
    await tx.activityDependency.deleteMany({ where: { planId: { in: planIds } } });
  }
  if (activityIds.length > 0) {
    // Both of these are among the tables the cascade never stamps — the reason for ownership scope.
    await tx.resourceAssignment.deleteMany({ where: { activityId: { in: activityIds } } });
    await tx.activityStep.deleteMany({ where: { activityId: { in: activityIds } } });
  }
  if (planIds.length > 0) {
    // ADR-0046 denormalises `plan_id` onto EVERY note, including an activity's — so one statement
    // covers both kinds and no activity-keyed pass is needed.
    await tx.note.deleteMany({ where: { planId: { in: planIds } } });

    const baselines = await tx.baseline.findMany({
      where: { planId: { in: planIds } },
      select: { id: true },
    });
    const baselineIds = baselines.map((b) => b.id);
    if (baselineIds.length > 0) {
      await tx.baselineAssignment.deleteMany({ where: { baselineId: { in: baselineIds } } });
      await tx.baselineActivity.deleteMany({ where: { baselineId: { in: baselineIds } } });
      await tx.baseline.deleteMany({ where: { id: { in: baselineIds } } });
    }
    await tx.planShare.deleteMany({ where: { planId: { in: planIds } } });
  }

  // ONE statement, whatever the WBS depth — see the note above. `plan_locks` go by ON DELETE CASCADE.
  const activityResult =
    planIds.length === 0
      ? { count: 0 }
      : await tx.activity.deleteMany({ where: { planId: { in: planIds } } });
  const planResult =
    planIds.length === 0
      ? { count: 0 }
      : await tx.plan.deleteMany({ where: { id: { in: planIds } } });

  if (projectIds.length > 0) {
    // Calendars AFTER plans and activities: both `plans.calendar_id` and `activities.calendar_id`
    // are RESTRICT into it. PROJECT-scoped only — an ORG calendar is shared and outlives this
    // project entirely (ADR-0053). `calendar_shifts` and exception windows go by cascade.
    const calendars = await tx.calendar.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const calendarIds = calendars.map((c) => c.id);
    if (calendarIds.length > 0) {
      await tx.calendarException.deleteMany({ where: { calendarId: { in: calendarIds } } });
      await tx.calendar.deleteMany({ where: { id: { in: calendarIds } } });
    }
  }

  const projectResult =
    projectIds.length === 0
      ? { count: 0 }
      : await tx.project.deleteMany({ where: { id: { in: projectIds } } });
  const clientResult =
    clientIds.length === 0
      ? { count: 0 }
      : await tx.client.deleteMany({ where: { id: { in: clientIds } } });

  return {
    clients: clientResult.count,
    projects: projectResult.count,
    plans: planResult.count,
    activities: activityResult.count,
  };
}
