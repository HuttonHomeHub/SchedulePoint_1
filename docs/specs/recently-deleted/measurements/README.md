# Recycle-bin index measurements (M0-T2)

The evidence behind `apps/api/prisma/migrations/20260818120000_recycle_bin_deleted_at_indexes`.
Re-runnable: nothing here depends on machine state beyond a migrated database.

## WHERE THIS BYPASSES THE PRODUCT (ADR-0081 §3)

`01-seed.sql` **INSERTs rows directly**. No controller, no service, and
`HierarchyLifecycleService`'s cascade never runs — the soft deletes are `UPDATE`s that
imitate the three shapes that cascade produces (client-rooted, project-rooted, lone plan),
including the fact that a cascade stamps **one** `deleted_at` and **one** `delete_batch_id`
on every row it touches (`hierarchy-lifecycle.service.ts:98-99`).

That is legitimate for **this** question and only this one. An index decision depends on row
counts, column selectivity and the physical predicate, none of which the write path
influences. It proves **nothing** about cascade correctness, restore, or the delete order,
and it is not evidence for any other claim in the epic. M4-T1's Supertest case still has to
be written; what this harness did establish about the delete order is recorded in the M0-T2
report, and was established with real FK constraints on a migrated database, not here.

## Running it

```bash
scripts/e2e-local.sh --db-only                 # brings up the CI-shaped Postgres
createdb -h localhost -U app recycle_bench     # a scratch database, NOT app_test
DATABASE_URL=postgresql://app:app@localhost:5432/recycle_bench?schema=public \
  pnpm --filter @repo/api exec prisma migrate deploy

psql -h localhost -U app -d recycle_bench -f 01-seed.sql
psql -h localhost -U app -d recycle_bench -f 02-walk-harness.sql
psql -h localhost -U app -d recycle_bench -c "SELECT * FROM walk_bin2('org-xl',100,false);"  # today's query
psql -h localhost -U app -d recycle_bench -c "SELECT * FROM walk_bin2('org-xl',100,true);"   # per-branch LIMIT
psql -h localhost -U app -d recycle_bench -v cutoff="'2025-01-01 00:00:00+00'" -f 03-expiry-scan.sql
```

`walk_bin2` simulates **one screen open**, not one request: `use-deleted-items.ts:24` walks
`?limit=100` to exhaustion, so the number a planner waits for is the sum over every page.

## The seeded shape, stated so a later reader can judge "realistic"

24 organisations; 625 clients / 5,625 projects / 54,151 plans; 12,861 soft-deleted rows
spread over 400 days. `org-xl` (400/4,000/40,000, 8,773 deleted = 88 pages) is the stress
case; `org-l` (100/1,000/10,000, 2,356 deleted) is the realistic upper end today; `org-s`
(5/25/150, 34 deleted) is what the deployed installation actually looks like now.

**The deployed installation is nearer `org-s` than `org-xl` today.** The index is bought for
the shape the product grows into, and the `org-s` row of every table below is the honest
"this buys nothing yet" line.

## Caveat that applies to every number

Measured on **PostgreSQL 16.13**. CI and the deployed host run **17**
(`.github/workflows/ci.yml:166`, `docker-compose.yml:14`). The one finding that could differ
is the absent Merge Append over `UNION ALL` (see the migration); the recommended repository
rewrite is shaped so that it does not depend on the planner acquiring it.

---

## The activities hard-delete measurement (M0-T2 follow-up)

`04-seed-activities.sql` builds a second population — 202,000 activities, 200,000 steps,
200,000 notes, 200,000 assignments, with one target plan of 2,000 activities (100 of them WBS
summaries in a chain) — and `05-delete-order.sql` runs the §4.5 delete order over it inside a
transaction that rolls back, so it can be re-run.

```bash
psql -h localhost -U app -d recycle_bench -f 04-seed-activities.sql   # ~80 s
psql -h localhost -U app -d recycle_bench -f 05-delete-order.sql
```

**Do not run `05` before `apps/api/prisma/migrations/20260818130000_activity_fk_restrict_indexes`
is applied.** Against the pre-migration schema the `activities` statement alone takes **over
three and a half minutes** for 2,000 rows, and the timing harness will look hung rather than slow.

To reproduce the "before" deliberately:

```sql
DROP INDEX idx_activities_parent_id_fk, idx_notes_activity_id_fk,
           idx_activity_steps_activity_id_fk, idx_resource_assignments_activity_id_fk;
```

### The same caveat, plus one more

Everything in the sibling section applies. In addition: this population deliberately makes **all
four** referencing tables large. A population where `notes`, `activity_steps` and
`resource_assignments` are empty measures only the `activities.parent_id` scan and will report
that fixing `parent_id` alone is sufficient. It is not — see the ablation in the migration.
