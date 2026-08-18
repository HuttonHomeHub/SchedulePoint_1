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

/**
 * **The largest number of ids one `{ in: [...] }` may carry.**
 *
 * Prisma does not chunk an `in` list — it sends one bind parameter per element, and Postgres'
 * extended protocol refuses more than 32,767 in a prepared statement. Measured against this
 * repository's own generated client: 32,767 succeeds, 32,768 fails with `P2035` ("too many bind
 * variables in prepared statement"). The cross-plan-edge delete below puts `activityIds` into the
 * predicate **twice**, so it exhausts the budget at half that — measured failing at 16,384 ids.
 *
 * 8,000 leaves headroom for the plan ids and literals sharing the same statement, and the
 * consequence of getting it wrong is not a slow query: a batch cannot be split (expiring half of
 * one leaves an unrestorable remnant), so a statement that throws makes that subtree **permanently
 * unexpirable**, retried hourly forever. The failure was inside the service's own worked example —
 * its docblock reasons about a 200,000-activity cascade that would have thrown at 8% of the way
 * there. Found by the ADR-0096 backend-performance review, by running the real client rather than
 * reading the driver.
 */
const MAX_IDS_PER_STATEMENT = 8_000;

/** Split a list into `MAX_IDS_PER_STATEMENT`-sized chunks; an empty list yields no chunks. */
function chunked(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_STATEMENT) {
    out.push(ids.slice(i, i + MAX_IDS_PER_STATEMENT));
  }
  return out;
}

/** Run one delete per chunk and sum the counts. Order within a table does not matter; across does. */
async function deleteChunked(
  ids: readonly string[],
  run: (chunk: string[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (const chunk of chunked(ids)) total += (await run(chunk)).count;
  return total;
}

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
  const activityIds: string[] = [];
  for (const chunk of chunked(planIds)) {
    const rows = await tx.activity.findMany({
      where: { planId: { in: chunk } },
      select: { id: true },
    });
    activityIds.push(...rows.map((a) => a.id));
  }

  // **Every `in` list below is chunked.** See `MAX_IDS_PER_STATEMENT`: Prisma sends one bind
  // parameter per element and Postgres refuses more than 32,767, so an unchunked list made a large
  // subtree permanently unexpirable. Chunking is safe within a table and never across one — the
  // ORDER of the tables is what the foreign keys care about, not how many statements each takes.
  //
  // Chunking by `planId` is also safe for `activities.parent_id`: ADR-0038 makes the WBS tree
  // same-plan, so a parent and its child are never in different chunks.
  if (planIds.length > 0) {
    // Cross-plan edges FIRST, and by a four-way predicate: no CHECK ties an endpoint's activity to
    // its named plan, so an edge can reference this scope through either column pair. Split into a
    // plan-keyed pass and an activity-keyed one — the original single `OR` put `activityIds` in
    // twice, which halved the parameter budget and was the first statement to blow it.
    await deleteChunked(planIds, (chunk) =>
      tx.crossPlanDependency.deleteMany({
        where: { OR: [{ predecessorPlanId: { in: chunk } }, { successorPlanId: { in: chunk } }] },
      }),
    );
    await deleteChunked(activityIds, (chunk) =>
      tx.crossPlanDependency.deleteMany({
        where: { OR: [{ predecessorId: { in: chunk } }, { successorId: { in: chunk } }] },
      }),
    );
    await deleteChunked(planIds, (chunk) =>
      tx.activityDependency.deleteMany({ where: { planId: { in: chunk } } }),
    );
  }
  // Both of these are among the tables the cascade never stamps — the reason for ownership scope.
  await deleteChunked(activityIds, (chunk) =>
    tx.resourceAssignment.deleteMany({ where: { activityId: { in: chunk } } }),
  );
  await deleteChunked(activityIds, (chunk) =>
    tx.activityStep.deleteMany({ where: { activityId: { in: chunk } } }),
  );
  if (planIds.length > 0) {
    // ADR-0046 denormalises `plan_id` onto EVERY note, including an activity's — so one pass
    // covers both kinds and no activity-keyed pass is needed.
    await deleteChunked(planIds, (chunk) =>
      tx.note.deleteMany({ where: { planId: { in: chunk } } }),
    );

    const baselineIds: string[] = [];
    for (const chunk of chunked(planIds)) {
      const rows = await tx.baseline.findMany({
        where: { planId: { in: chunk } },
        select: { id: true },
      });
      baselineIds.push(...rows.map((b) => b.id));
    }
    await deleteChunked(baselineIds, (chunk) =>
      tx.baselineAssignment.deleteMany({ where: { baselineId: { in: chunk } } }),
    );
    await deleteChunked(baselineIds, (chunk) =>
      tx.baselineActivity.deleteMany({ where: { baselineId: { in: chunk } } }),
    );
    await deleteChunked(baselineIds, (chunk) =>
      tx.baseline.deleteMany({ where: { id: { in: chunk } } }),
    );
    await deleteChunked(planIds, (chunk) =>
      tx.planShare.deleteMany({ where: { planId: { in: chunk } } }),
    );
  }

  // One statement per plan chunk, whatever the WBS depth — see the note above. `plan_locks` go by
  // ON DELETE CASCADE.
  const activityCount = await deleteChunked(planIds, (chunk) =>
    tx.activity.deleteMany({ where: { planId: { in: chunk } } }),
  );
  const planCount = await deleteChunked(planIds, (chunk) =>
    tx.plan.deleteMany({ where: { id: { in: chunk } } }),
  );

  if (projectIds.length > 0) {
    // Calendars AFTER plans and activities: both `plans.calendar_id` and `activities.calendar_id`
    // are RESTRICT into it. PROJECT-scoped only — an ORG calendar is shared and outlives this
    // project entirely (ADR-0053). `calendar_shifts` and exception windows go by cascade.
    const calendarIds: string[] = [];
    for (const chunk of chunked(projectIds)) {
      const rows = await tx.calendar.findMany({
        where: { projectId: { in: chunk } },
        select: { id: true },
      });
      calendarIds.push(...rows.map((c) => c.id));
    }
    await deleteChunked(calendarIds, (chunk) =>
      tx.calendarException.deleteMany({ where: { calendarId: { in: chunk } } }),
    );
    await deleteChunked(calendarIds, (chunk) =>
      tx.calendar.deleteMany({ where: { id: { in: chunk } } }),
    );
  }

  const projectCount = await deleteChunked(projectIds, (chunk) =>
    tx.project.deleteMany({ where: { id: { in: chunk } } }),
  );
  const clientCount = await deleteChunked(clientIds, (chunk) =>
    tx.client.deleteMany({ where: { id: { in: chunk } } }),
  );

  return {
    clients: clientCount,
    projects: projectCount,
    plans: planCount,
    activities: activityCount,
  };
}
