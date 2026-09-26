# M2-T1: the lag re-encoding migration, as designed and as built

- **Status:** Built with M2-T2 on 2026-09-26 by database-architect. This is the agreement round's §b
  design and its re-confirmation corrections (spec §4.4), and every point where the built SQL adds
  to them or departs from them.
- **Files:**
  - `apps/api/prisma/migrations/20260926120000_cross_plan_lag_working_minutes/migration.sql`
  - `apps/api/prisma/schema.prisma` (`CrossPlanLagMigration`, back-relation `xplanLagMigrations`)
  - `apps/api/test/cross-plan-lag-migration.e2e-spec.ts`
  - `docs/DEPLOYMENT.md` "Rolling back past the cross-plan lag release"
- **Evidence:** `m2/red-runs.md` (every case red against its defect) and `m2/migration-cost.md`
  (cost, and the migration and reverse run on a populated database).

## The record table `cross_plan_lag_migrations`

| Column                     | Type                  | Source                                                                        | Key                                                             |
| -------------------------- | --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `id`                       | `UUID`                | UUID v7 from `clock_timestamp()`, the ADR-0148/ADR-0155 expression verbatim   | primary key                                                     |
| `organization_id`          | `UUID`                | the link's                                                                    | FK `RESTRICT`, no index                                         |
| `plan_id`                  | `UUID`                | the **successor activity's** `plan_id` (B5)                                   | FK `ON DELETE CASCADE`, `cross_plan_lag_migrations_plan_id_idx` |
| `cross_plan_dependency_id` | `UUID`                | the link's id                                                                 | `UNIQUE` (`…_cross_plan_dependency_id_key`), no FK              |
| `lag_calendar`             | `"LagCalendarSource"` | the link's                                                                    | —                                                               |
| `lag_calendar_id`          | `UUID` NULL           | the resolved calendar; NULL for `TWENTY_FOUR_HOUR` or no calendar on the path | no FK                                                           |
| `day_factor_minutes`       | `INTEGER`             | `COALESCE(calendars.hours_per_day_minutes, 1440)`                             | —                                                               |
| `prior_lag_minutes`        | `INTEGER`             | `lag_minutes` before                                                          | —                                                               |
| `new_lag_minutes`          | `INTEGER`             | `round(prior::numeric * factor / 1440)::integer`                              | —                                                               |
| `migrated_at`              | `TIMESTAMPTZ(3)`      | `DEFAULT CURRENT_TIMESTAMP` (transaction start: one instant per run)          | —                                                               |

The DDL is exactly what `prisma migrate diff` generates for the model: the names were taken from
its output rather than typed. The CI drift check reports no difference on an empty database and on
the populated one.

## The statement

One `WITH resolved AS (…), recorded AS (INSERT … RETURNING …) UPDATE … FROM recorded`, last in the
file, as §4.4 specifies. The lag calendar per row:

```text
TWENTY_FOUR_HOUR  → NULL                                   (factor 1440)
PROJECT_DEFAULT   → successor activity's plan's calendar_id  (CQ-2)
PREDECESSOR       → COALESCE(driving resource calendar, predecessor.calendar_id, predecessor's OWN plan's calendar_id)
SUCCESSOR         → COALESCE(driving resource calendar, successor.calendar_id,   successor's OWN plan's calendar_id)
```

The driving resource comes from `LEFT JOIN resource_assignments ON activity_id = … AND is_driving
AND deleted_at IS NULL AND activity.type = 'RESOURCE_DEPENDENT' AND activity.deleted_at IS NULL`,
then `LEFT JOIN resources ON … AND resources.deleted_at IS NULL`. That mirrors
`schedulingCalendarId` (`activities/day-factor.ts:45-62`) fed by `loadDrivingResourceCalendarRows`
(`driving-calendars.ts:20-36`). The calendar join is unfiltered (E30). Plans are always joined
through the endpoint activity (B5).

## Additions to, and departures from, spec §4.4

1. **The factor-drift finder has a third limb** (`docs/DEPLOYMENT.md`), and this is the one
   substantive departure. §4.4 requires that the finder "must not under-report" and specifies two
   limbs: the resolved calendar edited since the release, and `lag_minutes` not a multiple of
   today's factor. Neither sees a **change of resolution path**. A successor moved to a different
   calendar that has not been edited, when the stored minutes happen to be a multiple of the new
   factor, is invisible to both (2,400 minutes is five days at 480 and four at 600). The third limb
   lists a link when an endpoint activity, its plan, or its driving assignment or resource was
   edited after the migration finished. That over-reports, which the spec accepts. **Verified**: the
   two-limb finder misses exactly that case (`m2/red-runs.md` F1). This needs ratifying when the
   SQL goes back to review before the PR (M2-T1 step 3, CLAUDE.md §19.3).
2. **The record's `UNIQUE` also makes a manual re-run of the statement refuse.** Every pre-release
   link is recorded, so re-running the statement by hand fails its `INSERT` and rolls back rather
   than converting post-release links a second time. The exception, stated in the migration header:
   if no link existed at migration time, the record is empty and this guard is absent.
3. **A fan-out is loud, not silent.** Measured: dropping `is_driving` or the assignment's
   `deleted_at IS NULL` from the join fails the statement on the `UNIQUE` (`23505`) rather than
   double-counting. On a populated deployed database that is the ADR-0107 restart loop, so the
   exact partial-index predicate is load-bearing, not tidy.
4. **The `CASE` has no `ELSE`.** `LagCalendarSource` has exactly four labels
   (`20260715120000_activity_dependency_baseline_minutes`, line 43), and the test pins each one. A
   fail-closed `ELSE` was considered and rejected. The in-expression way to raise, a failing cast
   of a constant (`ELSE 'unhandled'::uuid`), is coerced when the statement is **parsed**, so it
   fails on every database whether or not any row reaches that arm. Measured on 16.13: `ERROR:
invalid input syntax for type uuid` on a one-row `VALUES` whose only row takes the first arm.
   (A first draft of this sentence blamed plan-time constant folding. The documentation's `1/0`
   example of that did **not** fail on the same instance, so the mechanism was wrong even though the
   conclusion held.)
5. **The driving join does not filter on the assignment's `organization_id`.**
   `loadDrivingResourceCalendarRows` scopes by the plan's organisation. An assignment in another
   organisation than its activity is impossible by service invariant, so the two agree on every row
   the product can hold. M2-T3's differential is where a disagreement would show.
6. **Reverse step 3 bumps `version` on every unrecorded link**, changed or not. That is the spec's
   wording, followed exactly, and it is harmless (no update route, E32). The migration's own
   `UPDATE` bumps changed rows only, per B3.
7. **The Prisma back-relation is named `xplanLagMigrations`**, not `crossPlanLagMigrations`. The
   longer name re-aligned 45 unrelated lines of the `Organization` and `Plan` blocks under
   `prisma format`. That is the reason `FmDateMigration` has a short model name, and here it only
   needs a short field name. The model's type name `CrossPlanLagMigration[]` is still wider than the
   type column, so `prisma format` re-aligned 12 lines of whitespace in the `Plan` block. `git diff
-w` shows the schema change as pure additions.

## What M2-T3 has to supply

The migration test carries `it.todo('M2-T3 differential: …')`. M2-T3's one cross-plan lag-calendar
function must return, for every entry in the test's `CASES`, the `expectedFactor` hand-written there.
That value is also the record's `day_factor_minutes`, which the test already asserts. The check is
red against a factor-1440 row that should resolve to 480. The fixture gives every resolution path
its own factor, so a function that takes the wrong path lands on a different number.
