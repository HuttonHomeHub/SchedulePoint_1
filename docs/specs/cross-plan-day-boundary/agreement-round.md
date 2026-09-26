# Agreement round: cross-plan day boundary (#385)

- **Status:** In progress. The spec and plan are folded once every reviewer has reported.
- **Delegated answers (product owner, 2026-09-26):** "go with the most robust options you consider
  correct and let the agents ratify them".
  - CQ-1: migrate the stored lag.
  - CQ-2: `PROJECT_DEFAULT` means the successor plan's calendar in both directions.
  - CQ-3: recalculate the affected plans once at boot.

## database-architect: AGREE-WITH-CHANGES

CQ-1 and CQ-2 are ratified. The only new schema object is a record table.
`cross_plan_dependencies` needs no new column, index or constraint.

Blocking:

- **B1: integer overflow on populated data only.** `lag_minutes * factor` in `int4` overflows at
  ±3650 days × 480. On the deployed host that is a restart loop (ADR-0107).
  - Compute `round(lag_minutes::numeric * factor / 1440)::integer`.
  - Test ±3650-day rows on a 480-minute calendar, red against `int4` arithmetic.
- **B2: FC-7 cannot detect a wrong factor.** The API's `Math.round(minutes / factor)` hides it.
  Assert the stored `lag_minutes` against hand-written expected values. Add a differential check:
  the record's `day_factor_minutes` equals the TypeScript resolver's factor for the same row.
- **B3: FC-7's "byte-for-byte" clauses contradict the `version` bump.**
  - `UPDATE` only rows whose value changes (`new <> old`). This leaves factor-1440, `TWENTY_FOUR_HOUR`
    and zero-lag rows untouched, which must be pinned.
  - The reverse restores `lag_minutes` and bumps `version` again, because an optimistic-lock version
    never goes backwards.
- **B4: one PR** carries the migration, the write-path conversion, the response divisor and the
  derivation's lag read. Otherwise `main` holds a column in two units, and today's `/1440` reads
  silently drop the lag.
- **B5: join fan-out and plan-id source.**
  - The driving-resource join uses the partial unique index's predicate exactly, plus the
    soft-delete guards (`driving-calendars.ts:20-36`).
  - "Its own plan" and the successor plan are resolved through the endpoint activity's `plan_id`,
    never the link's `*_plan_id` columns.

The approved design (§b of the review):

- **Record table `cross_plan_lag_migrations`:**
  - `plan_id` FK `ON DELETE CASCADE`.
  - No FK on the dependency id or the calendar id.
  - `UNIQUE (cross_plan_dependency_id)`.
- **One `WITH resolved AS …` conversion statement, last in the file.**
  - It converts every row, soft-deleted included.
  - It bumps `version` on changed rows only and leaves `updated_at` alone.
  - The calendar join carries no `deleted_at` filter.
- **Measured cost:** 10k rows, `EXPLAIN ANALYZE` ×5.
- **A documented reverse in `docs/DEPLOYMENT.md`:** lock the record table, restore, convert rows
  created after the release, a check query, then drop.
- **The D8 marker:** `_prisma_migrations.finished_at`.

## api-reviewer: AGREE-WITH-CHANGES

CQ-1, CQ-2 and CQ-3 are ratified.

Blocking:

- **A1: no task fixes the read path.** `CrossPlanDependencyResponseDto.from` divides by a hard-coded
  1440 (`cross-plan-dependency-response.dto.ts:8,74`) for create, get and both lists. The CRUD
  loads select only `{id, code, name}` per endpoint.
  - Mirror in-plan: an async `withLagDayFactor(s)` resolves the factor before `.from()`
    (`dependencies.service.ts:84-129`, `dependency-response.dto.ts:93`).
  - Test a GET and a list read, not only the create response, because the create echo passes
    trivially.
- **A2: `docs/API.md:659-708` tells clients to send `lagMinutes`.** Cross-plan links have no such
  field, and `packages/types` claims "identical semantics".
  - Decided (the delegated robust option): add `lagMinutes` to the cross-plan response and
    `CrossPlanDependencySummary`. That is an additive shape change, so it needs a changeset.
  - Correct the three stale docblock sites.

Suggested:

- A counting-stub cost bound for the CRUD list, batching by distinct calendar across a page.
- The migration SQL and the TypeScript resolver are two spellings of one rule. This is covered by
  B2's differential check.
- Fold the stale docblock at `cross-plan-dependency-response.dto.ts:45-49` into M2-T3.
- It suggested **not** bumping `version`. **Overruled** in favour of database-architect B3/§b:
  ADR-0148 and ADR-0155 bump `version` when a migration rewrites a planner-owned input, and with no
  update route the bump invalidates no in-flight edit.
