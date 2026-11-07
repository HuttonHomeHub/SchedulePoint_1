# Cross-plan instants: schema design (M2, and the M4 marker)

- **Spec / plan:** [`feature-spec.md`](./feature-spec.md) §4.4, §4.6; [`implementation-plan.md`](./implementation-plan.md)
  M2-T1 (this file), M2-T2, M2-T3, M4-T1. Both Approved 2026-11-07 (Q1 B, Q2 A).
- **Designed by:** database-architect (CLAUDE.md §19.3), 2026-11-07.
- **Applies to:** a builder applies exactly this in its own branch. Nothing here is applied to `main` by
  this file.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Four `activities` columns named after the date column each one explains: `visual_effective_start_instant`, `visual_effective_finish_instant`, `late_start_instant`, `late_finish_instant`. Prisma `visualEffectiveStartInstant` and so on.                                                                                                                      | A reader finds the instant next to its date by name. The engine calls the first pair "placed", but the database already calls those dates `visual_effective_*`, and the column name has to follow the database's naming.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A2  | Type **`TIMESTAMPTZ(3)`**, holding the engine's absolute minute as a UTC instant: civil time with no zone, "compared as if UTC".                                                                                                                                                                                                                                | Precedent: `external_early_start`/`external_late_finish` (`schema.prisma:1278-1279`). The engine axis is minutes since `1970-01-01T00:00` (`working-time-calendar.ts:137-193`, Hinnant `days_from_civil` with the 1970 epoch), which is the same as `Date.getTime() / 60000`, so `abs → stored → abs` is exact. The export can write it as kind `instant` with no new kind. An `integer` minute column was considered and rejected: it is exact, but nobody can read it in the database, in `psql` or in the export, and its unit has to be explained everywhere.                                                                                                                                                          |
| A3  | **Transport is `int[]` minutes, converted in SQL** with `timestamptz 'epoch' + make_interval(mins => v.x)`. No ISO strings and no `to_timestamp`.                                                                                                                                                                                                               | Integer arithmetic gives no float rounding (`to_timestamp` takes `double`). `make_interval(mins =>)` has only a time part, so the addition does not depend on the session `TimeZone`. A `'…T16:00'` string without `Z` would be read in the session zone, and that trap is removed rather than documented. An `int[]` is never all-NULL (the engine always produces the four values), so the all-NULL array trap at `schedule.repository.ts:898-917` cannot happen, and `::int[]` is still explicit.                                                                                                                                                                                                                       |
| A4  | **Nullable, no default.** NULL means "not written by a recalculation since the column landed".                                                                                                                                                                                                                                                                  | No backfill is possible without the engine (D-DB-3). NULL reads as the date (FC-5). This is the `derived_duration_minutes` precedent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A5  | **One activity CHECK**, `ck_activities_schedule_instants_all_or_none_with_dates`: either all four instants are NULL, or all four instants and their four dates are non-NULL.                                                                                                                                                                                    | The one writer always writes four numbers (required `EngineResult` fields) beside four non-NULL dates (`compute.ts:1002-1034`; `writeResults` is the only writer of those dates, checked by grep for `late_start =` / `visual_effective_start =`). **A rolled-back image cannot violate it:** an older image never writes the instants and always writes non-NULL dates. Its real catch is narrow, and it is stated as narrow: a `SET` entry missing on a plan's _first_ recalculation after the migration fails with 23514. After that first recalculation a missing entry leaves the old value, so FC-7's real-statement e2e stays the guard.                                                                            |
| A6  | **No ordering CHECK** (start ≤ finish), **no whole-minute CHECK.**                                                                                                                                                                                                                                                                                              | The date columns have no ordering CHECK, and a progressed or COMPLETE-without-start activity can legally invert (`compute.ts:1017-1025`, "its Pass 1 start can land AFTER its finish; parity means reproducing that"). A CHECK would turn an engine quirk the dates tolerate into a failed recalculation. A whole minute is guaranteed structurally by A3, and the reader asserts `Number.isInteger` (the spec's error-scenario row). A CHECK would need a STABLE `date_trunc` on `timestamptz`, which is the wrong tool.                                                                                                                                                                                                  |
| B1  | **The freshness marker (D-4) is `plans.schedule_instants_computed_at TIMESTAMPTZ(3)`, nullable, no default.** It is written `= now()` **in the same `UPDATE` as `schedule_computed_at = now()`** (`stampScheduleComputedAt`). A remote plan's instants are trusted only when `schedule_instants_computed_at` is non-NULL and **equals** `schedule_computed_at`. | `now()` evaluated twice in one statement is one value, so a current image always makes the two equal. An older image's stamp names its columns (`schedule.repository.ts:1041-1049`), so it moves `schedule_computed_at` and leaves the marker behind. The pair then differs, and the reader falls back to the date with no operator step.                                                                                                                                                                                                                                                                                                                                                                                  |
| B2  | It lives **on `plans`**, against the `docs/DATABASE.md` "Re-derivation markers" caution.                                                                                                                                                                                                                                                                        | That caution is against a `plans` column for a fact that one `_prisma_migrations` row already records, and it is right there. This fact is **per plan**: which code wrote this plan's last recalculation. No migration row can hold it. A per-activity marker would add a 32-byte-per-row write to the hottest table to say something that is true at plan grain (writeResults is all-or-nothing per plan). The DDL is a metadata-only `ADD COLUMN` (precedent: `20261004120000` added `schedule_inputs_changed_at`, `20260905120000` added four columns).                                                                                                                                                                 |
| B3  | **One plan CHECK**, `ck_plans_schedule_instants_requires_cursor`: `schedule_instants_computed_at IS NULL OR schedule_computed_at IS NOT NULL`. **No `<=` or equality CHECK.**                                                                                                                                                                                   | This mirrors `ck_plans_schedule_criticality_requires_cursor`. `<=` was rejected because `schedule_computed_at` can move backwards: two recalculations queue on the plan lock, and the one whose transaction _started_ first stamps an earlier `now()` after the later one. With a current image followed by an older image overlapping on one host, that would fail the older image's recalculation, so the database would break the rollback it is meant to make safe.                                                                                                                                                                                                                                                    |
| B4  | **Exported** in `plans` as `scheduleInstantsComputedAt:instant`. **This overrides spec §4.6**, which withheld it as "meaningless outside this database".                                                                                                                                                                                                        | It is not meaningless. It is the exact predicate an export reader needs to know whether a row's instants are current (equal to `scheduleComputedAt`), and `scheduleComputedAt` and the criticality mirrors are already exported. ADR-0194 is include-by-default, and withholding it would ship four columns whose currency nobody can check.                                                                                                                                                                                                                                                                                                                                                                               |
| C1  | **No index**, on any of the five columns.                                                                                                                                                                                                                                                                                                                       | The cross-plan reads filter `cross_plan_dependencies` by `(organization_id, successor_plan_id \| predecessor_plan_id)` (`cross-plan-dependency.repository.ts:289, 327`, `this.active(...)`) and reach the remote activity and its plan by **primary key** through the existing include (`remoteEndpointSelect` already joins `plan`, `:56-63`). The new columns are only projected. The export reads per plan. The M3 pending query filters on `schedule_computed_at` against the marker and an `EXISTS` on links, never on these columns. Nothing has a `WHERE` or `ORDER BY` on them, so there is nothing to measure. An index would only cost each recalculation four entries per row and would remove HOT eligibility. |
| D1  | **No backfill.**                                                                                                                                                                                                                                                                                                                                                | D-DB-3. NULL reads the date.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D2  | **M4 boot marker:** a statement-free migration, named so that it sorts **last** at M4's merge. The M3 service keys on its `_prisma_migrations.finished_at`, as the four precedents do.                                                                                                                                                                          | D-DB-4. Keying on the M2 DDL migration would miss downstream plans recalculated with the old date read between M2 and M4. Those plans have _current_ instants and _old-rule dates_, so B1's marker cannot find them either. This is also why B1 does not replace the boot marker.                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 2. Prisma schema diff (`apps/api/prisma/schema.prisma`)

In `model Plan`, directly after `scheduleInputsChangedAt`:

```prisma
  /// The instant this plan's activity INSTANT columns were last written (ADR-0212 D4; cross-plan-instants
  /// m2-schema-design.md B1). ENGINE-OWNED: stamped `now()` by `stampScheduleComputedAt` in the SAME
  /// statement as `schedule_computed_at`, so a current recalculation always leaves the two EQUAL. A
  /// reader trusts a plan's `*_instant` columns only when this is non-null and equals
  /// `scheduleComputedAt`. An image that predates the instants advances the cursor without this, so its
  /// plans read as "instants not current" and the cross-plan derivation falls back to the date (FC-5,
  /// FC-8). That is the whole rollback safety, with no operator step.
  ///
  /// NULLABLE, NO DEFAULT, no backfill: NULL is "never written by an instant-aware recalculation".
  /// Never accepted from a DTO; touches no version/updated_at/updated_by (ADR-0022). CHECK
  /// ck_plans_schedule_instants_requires_cursor (raw SQL, migration only). Deliberately NO `<=`/equality
  /// CHECK: the cursor can move backwards when two recalculations queue on the plan lock, and such a
  /// CHECK would fail an older image's recalculation during a rollback. No index: read with its own
  /// plan row (via the cross-plan include and the export), never filtered or sorted across plans (the
  /// scheduleComputedAt precedent).
  scheduleInstantsComputedAt            DateTime?               @map("schedule_instants_computed_at") @db.Timestamptz(3)
```

In `model Activity`, directly after `derivedDurationMinutes`:

```prisma
  // SCHEDULE INSTANTS: the exact engine instant each of four stored DATES is dated from (ADR-0212;
  // cross-plan-instants spec §4.4 D-DB-1, m2-schema-design.md A1–A6). Read ONLY by the cross-plan
  // derivation: forward reads the predecessor's visual_effective_* pair, backward the successor's late_*
  // pair (cross-plan-basis.structural.spec.ts pins that asymmetry). The early pair is deliberately
  // absent: nothing across a link reads it (ADR-0148 M-H).
  //   * UNIT: the engine's absolute minute (ADR-0037, instantToAbsMinutes): civil time with NO zone, held
  //     as if UTC, the external_early_start precedent. `Date.getTime() / 60000` IS the engine value.
  //     Written from int minutes as `timestamptz 'epoch' + make_interval(mins => …)`, so the session
  //     TimeZone never touches it.
  //   * FINISH instants are the EXCLUSIVE end boundary the engine computes (the instant work stops),
  //     not the inclusive last day the finish DATE shows. On a 24-hour calendar that is the next
  //     midnight.
  //   * They can legitimately DISAGREE with their date: an actual date (the date is the actual), a
  //     typed finish-milestone placement (ADR-0207 D2), and the finish-milestone late clamp
  //     (`lateDayOf`, compute.ts). The instant is what the engine used for logic, which is what one
  //     plan reads.
  //   * ENGINE-OWNED: written ONLY by `writeResults`' batched unnest UPDATE for EVERY activity type, in
  //     the statement that writes the dates. NEVER from a DTO; NEVER touching
  //     version/updated_at/updated_by (ADR-0022).
  //   * TRUSTED ONLY WHEN plans.schedule_instants_computed_at = plans.schedule_computed_at (see Plan).
  //     NULL = not written since the columns landed; read the date (FC-5). No backfill (needs the
  //     engine).
  //   * CHECK ck_activities_schedule_instants_all_or_none_with_dates (raw SQL, migration only): all
  //     four NULL, or all four set with their four dates set. No ordering CHECK: the dates tolerate a
  //     progressed inversion and so must these.
  //   * NO index: only projected through the cross-plan includes (reached by primary key) and the
  //     export. No predicate or ORDER BY targets them.
  visualEffectiveStartInstant  DateTime? @map("visual_effective_start_instant") @db.Timestamptz(3)
  visualEffectiveFinishInstant DateTime? @map("visual_effective_finish_instant") @db.Timestamptz(3)
  lateStartInstant             DateTime? @map("late_start_instant") @db.Timestamptz(3)
  lateFinishInstant            DateTime? @map("late_finish_instant") @db.Timestamptz(3)
```

There are no `@@index` lines, and none must be added (TECH_DEBT #54).

## 3. M2 migration: `apps/api/prisma/migrations/20261107120000_schedule_instants/migration.sql`

```sql
-- SCHEDULE INSTANTS: the exact engine instant beside four computed dates, and the plan-level marker
-- that says whether they are current. Cross-plan instants (docs/TECH_DEBT.md #565, ADR-0212).
-- Spec: docs/specs/cross-plan-instants/feature-spec.md §4.4 (approved by the product owner 2026-11-07,
-- Q1 B, Q2 A). Plan M2-T2. Designed by the database-architect agent (CLAUDE.md §19.3); the full
-- reasoning is docs/specs/cross-plan-instants/m2-schema-design.md.
--
-- WHY. A stored DATE cannot tell two instants apart (a driven start milestone and an SNET-pinned one
-- both store 2027-07-03, cross-plan-milestone-fixture.spec.ts:260-292), so a cross-plan link reading
-- the remote plan's date cannot equal one plan. The engine already holds the instant when it writes
-- the date (compute.ts placedStartInst/placedFinishInst/lsInst/lfInst). This keeps it.
--
-- TIMESTAMPTZ(3), the external_early_start precedent: the engine's absolute minute (civil, no zone,
-- held as UTC). `writeResults` sends int minutes and converts with `timestamptz 'epoch' +
-- make_interval(mins => …)`: exact integer arithmetic, independent of the session TimeZone.
--
-- NULLABLE, NO DEFAULT, NO BACKFILL. An instant needs the engine. NULL reads the date exactly as before
-- (FC-5), and each plan fills on its next recalculation. M3/M4's boot service fills linked plans.
--
-- THE MARKER (plans.schedule_instants_computed_at). Stamped now() in the SAME UPDATE as
-- schedule_computed_at, so a current recalculation leaves them equal. An image that predates this
-- file names its columns in both writes, so it moves the dates and the cursor and leaves the instants
-- and this marker behind. The pair differs and the derivation reads the date. That is why a rollback
-- needs no step for these columns. It is on `plans`, against docs/DATABASE.md's caution about
-- markers, because this fact is per plan (which code wrote its last recalculation), and no
-- _prisma_migrations row can hold it.
--
-- CONSTRAINTS. Both are written so that NO OLDER IMAGE CAN VIOLATE THEM: an older image never writes
-- the instants or the marker, and always writes non-NULL dates and a non-NULL cursor.
--   * ck_activities_schedule_instants_all_or_none_with_dates: four NULL, or four set with their dates.
--     An IN (0, 4)-style literal count, so adding a fifth instant fails loudly (the
--     ck_plans_schedule_criticality_all_or_none tradition).
--   * ck_plans_schedule_instants_requires_cursor: a marker never exists without the cursor it is
--     compared with (the ck_plans_schedule_criticality_requires_cursor shape). NO `<=` CHECK: the cursor
--     can move backwards when two recalculations queue on the plan lock (the earlier-started
--     transaction stamps the earlier now() last), which would fail an older image's recalculation
--     mid-rollback.
--   * No ordering CHECK (start <= finish): the dates have none, and a progressed activity can invert.
--
-- NO INDEX. Only projected: the cross-plan loads filter cross_plan_dependencies and reach the remote
-- activity and plan by primary key; the export reads per plan. No WHERE or ORDER BY targets them.
--
-- BOOT SAFETY (ADR-0018 / ADR-0107). Each ADD COLUMN is nullable with no default, so it is
-- metadata-only and no row is rewritten. Each CHECK is added NOT VALID then VALIDATEd. Inside Prisma's
-- single migration transaction the ACCESS EXCLUSIVE lock is held to commit anyway, and the VALIDATE
-- scans read columns that are NULL on every row, which both constraints admit, so they cannot fail on
-- any data. A pending migration makes the ADR-0192 pre-migrate copy run on hosts with /backups.
-- OBSERVED on a populated database (ADR-0107): <builder records relfilenode before/after,
-- atthasmissing, convalidated, the round trip, the rolled-back-image simulation and
-- prisma:check-drift here, as 20261017120000 does>.
--
-- ROLLBACK. Redeploying the previous image is safe: its Prisma client selects named columns, and its
-- writeResults and stampScheduleComputedAt name neither these columns nor the marker. Its
-- recalculations therefore leave instants that the marker then reports as not current. Nothing reads
-- the instants before M4.
--
-- PARITY. No engine input changes; computeSchedule's existing outputs are untouched (FC-4).

ALTER TABLE "activities"
  ADD COLUMN "visual_effective_start_instant"  TIMESTAMPTZ(3),
  ADD COLUMN "visual_effective_finish_instant" TIMESTAMPTZ(3),
  ADD COLUMN "late_start_instant"              TIMESTAMPTZ(3),
  ADD COLUMN "late_finish_instant"             TIMESTAMPTZ(3);

ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_schedule_instants_all_or_none_with_dates" CHECK (
  num_nonnulls(
    "visual_effective_start_instant",
    "visual_effective_finish_instant",
    "late_start_instant",
    "late_finish_instant"
  ) = 0
  OR num_nonnulls(
    "visual_effective_start_instant",
    "visual_effective_finish_instant",
    "late_start_instant",
    "late_finish_instant",
    "visual_effective_start",
    "visual_effective_finish",
    "late_start",
    "late_finish"
  ) = 8
) NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_schedule_instants_all_or_none_with_dates";

ALTER TABLE "plans" ADD COLUMN "schedule_instants_computed_at" TIMESTAMPTZ(3);

ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_instants_requires_cursor" CHECK (
  "schedule_instants_computed_at" IS NULL
  OR "schedule_computed_at" IS NOT NULL
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_instants_requires_cursor";

-- Down (forward-only in production, ADR-0018; documented for completeness). Destroys nothing a
-- recalculation could not reproduce:
--   ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_schedule_instants_requires_cursor";
--   ALTER TABLE "plans" DROP COLUMN "schedule_instants_computed_at";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_schedule_instants_all_or_none_with_dates";
--   ALTER TABLE "activities" DROP COLUMN "late_finish_instant";
--   ALTER TABLE "activities" DROP COLUMN "late_start_instant";
--   ALTER TABLE "activities" DROP COLUMN "visual_effective_finish_instant";
--   ALTER TABLE "activities" DROP COLUMN "visual_effective_start_instant";
```

## 4. The write (`schedule.repository.ts`, for the builder)

- **`writeResults`:** append four `int[]` arguments **after `derived_duration_minutes`** (arguments 26–29),
  in one order across the `SET` list, the `unnest` list and the `AS v(…)` list. Every pinned index
  (16, 17 in `schedule.repository.day-factor.spec.ts`) is unchanged.

  ```ts
  const visualEffectiveStartInstant = results.map((r) => r.placedStartInstant); // names per M1-T1
  // … visualEffectiveFinishInstant, lateStartInstant, lateFinishInstant likewise
  ```

  ```sql
        derived_duration_minutes = v.derived_duration_minutes,
        visual_effective_start_instant  = timestamptz 'epoch' + make_interval(mins => v.visual_effective_start_instant),
        visual_effective_finish_instant = timestamptz 'epoch' + make_interval(mins => v.visual_effective_finish_instant),
        late_start_instant              = timestamptz 'epoch' + make_interval(mins => v.late_start_instant),
        late_finish_instant             = timestamptz 'epoch' + make_interval(mins => v.late_finish_instant)
      FROM unnest(
        …,
        ${derivedDurationMinutes}::int[],
        ${visualEffectiveStartInstant}::int[],
        ${visualEffectiveFinishInstant}::int[],
        ${lateStartInstant}::int[],
        ${lateFinishInstant}::int[]
      ) AS v(…, derived_duration_minutes,
             visual_effective_start_instant, visual_effective_finish_instant,
             late_start_instant, late_finish_instant)
  ```

  Assert `Number.isSafeInteger` on each value before sending it, and throw on failure. `int4` holds
  ±2^31 minutes, which covers the years 1970 ± 4,083, and the engine's horizon is 200 years
  (`HORIZON_DAYS`, `working-time-calendar.ts`).

- **`stampScheduleComputedAt`:** add `schedule_instants_computed_at = now()` to the same `SET`. The
  same statement is the guarantee of equality, so it **must not** be a second statement.
- **The reader (M4, for completeness):** add `scheduleComputedAt: true, scheduleInstantsComputedAt: true`
  to `remoteEndpointSelect.plan`. This adds no query. The instant is current when
  `instantsAt !== null && computedAt !== null && instantsAt.getTime() === computedAt.getTime()`. The
  value is `date.getTime() / 60000`, and the code throws if the result is not an integer.

## 5. M4 marker migration: `apps/api/prisma/migrations/20261107120100_cross_plan_instants_marker/migration.sql`

**Rename rule:** if any migration sorting after `20261107120100` merges before M4, rename this folder at
M4's merge to sort last, and update the M3 service's name constant in the same PR. The name only
matters for ordering and for that lookup. `finished_at` is taken when the M4 image applies it, which is
the instant that matters.

```sql
-- MARKER FOR THE CROSS-PLAN INSTANT RE-DERIVATION: cross-plan-instants M4-T1 (docs/TECH_DEBT.md #565,
-- ADR-0212 D5). Spec: docs/specs/cross-plan-instants/feature-spec.md §4.4 D-DB-4, §4.7 D-5; approved by
-- the product owner 2026-11-07 (Q2 A). Designed by the database-architect agent (CLAUDE.md §19.3).
--
-- THIS FILE CONTAINS NO STATEMENT, ON PURPOSE. Its only product is its `_prisma_migrations` row, whose
-- `finished_at` is the instant this release's cross-plan READ took over on the host.
-- `CrossPlanInstantRederiveService` recalculates once, upstream first over each organisation's whole
-- graph, every live plan with a data date that is an endpoint of a live cross-plan link (either
-- direction) and whose `schedule_computed_at` is earlier than that instant. Fail-closed: with no row
-- the scalar subquery is NULL and `x < NULL` admits no plan (docs/DATABASE.md "Re-derivation markers").
--
-- WHY NOT KEY ON 20261107120000_schedule_instants (the M2 columns). Between M2 and M4 the deployed
-- image WRITES instants but still READS the remote date. A downstream recalculated in that window has
-- current instants (schedule_instants_computed_at = schedule_computed_at) and old-rule dates. Neither
-- the M2 row nor the instants marker can find it; only this row can.
-- WHY NOT AN EARLIER MARKER, A CONSTANT OR A COLUMN: see 20260930120000_progressed_predecessor_visual_marker.
--
-- ORDERING. Lands after M2 (columns) and M3 (the dormant service). The only possible error is
-- over-inclusion (a plan recalculated again), which is idempotent.
--
-- NOTHING TO REVERSE IN THE SCHEMA. A ROLLBACK OF THE IMAGE MUST DELETE THIS ROW (docs/DEPLOYMENT.md,
-- the cross-plan instants rollback step), or a later roll-forward skips plans the previous image
-- recalculated. Stale INSTANTS need no step: plans.schedule_instants_computed_at stops matching the
-- cursor on the previous image's first recalculation, and the date is read. Outside a rollback, do NOT
-- delete the row as a "reset".
--
-- Cost: none at migrate time. A pending marker makes the ADR-0192 pre-migrate copy run on hosts with
-- the /backups mount; that copy is the rollback point.
```

## 6. Rolled-back image and restore analysis

| Situation                                            | Effect                                                                                                                                                                                                                                                 | Needs                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2 image → pre-M2 image                              | The old client ignores the five columns. Its recalculations move dates and the cursor. Instants and marker stay stale and `marker ≠ cursor`. Nothing reads them yet. Both CHECKs hold.                                                                 | Nothing.                                                                                                                                                                                                                                             |
| M4 image → M2/M3 image                               | That image writes current instants and marker but reads dates. This is the correct old behaviour.                                                                                                                                                      | Delete the M4 marker row (precedent rule).                                                                                                                                                                                                           |
| M4 image → pre-M2 image                              | Plans it recalculates read as not current, so downstream reads fall back to the date (FC-8).                                                                                                                                                           | Delete the M4 marker row. If the operator forgets: plans the old image recalculated after `finished_at` are skipped on roll-forward, and they keep **today's** behaviour (date read) until their next recalculation. They never get a wrong instant. |
| Mixed images on one host (overlap during a recreate) | No CHECK depends on cursor ordering (B3), so neither image's recalculation can fail because of the other.                                                                                                                                              | Nothing.                                                                                                                                                                                                                                             |
| ADR-0192 restore of a pre-M2 copy                    | Newer migrations apply: columns NULL, marker NULL, dates read. The M4 row is applied fresh, so the boot service recalculates linked plans.                                                                                                             | Nothing beyond any update.                                                                                                                                                                                                                           |
| Expiry, restore, cascades (ADR-0096/0201)            | No new FK, so nothing joins `restoreBatch`'s checks or the expiry order. History (ADR-0174) is not touched: a raw engine write is not an edit.                                                                                                         | Nothing.                                                                                                                                                                                                                                             |
| Soft delete (ADR-0172)                               | No new model. The columns sit on existing soft-deletable tables and are read through queries that already state their filter (`this.active(...)`). The structural gate's subject is unchanged. M3's new pending query must state its filters as usual. | M3 states filters.                                                                                                                                                                                                                                   |
| Baselines                                            | Not copied into `baseline_activities`. No cross-plan read uses a baseline (ADR-0126; spec scope).                                                                                                                                                      | Nothing.                                                                                                                                                                                                                                             |

**Accepted residual (the plan-grain marker cannot see one row).** A sequence of: rollback, then an
old-image recalculation, then a remote activity soft-deleted, then a roll-forward recalculation (which
skips deleted rows), then a restore of that activity. The restored row then carries an instant one run
older than its date under a plan marker that reads current. Both values are already stale relative to
the plan (the restore marks inputs changed), and the plan's next recalculation makes them consistent. A
per-row marker would cost a write on every row to close a rollback-plus-restore corner, so it is not
worth it.

## 7. Organisation export 2.4 (ADR-0194)

`export-columns.ts`:

- `activities`: append after `'swimlaneId:text'`, under a comment `// 2.4 — appended (cross-plan instants, ADR-0212)`:
  `'visualEffectiveStartInstant:instant'`, `'visualEffectiveFinishInstant:instant'`,
  `'lateStartInstant:instant'`, `'lateFinishInstant:instant'`.
- `plans`: append after `'swimlaneCodeTypeId:text'`: `'scheduleInstantsComputedAt:instant'`. It is
  **exported, not withheld** (B4).

`docs/ORGANISATION_EXPORT_FORMAT.md`: set the version to `2.4`. Add the five table rows, each with
"since 2.4". Add this entry under "Changes since `1.0`":

> **`2.4`**: five appended columns. `activities.visualEffectiveStartInstant`, `.visualEffectiveFinishInstant`,
> `.lateStartInstant` and `.lateFinishInstant` hold the exact working instant each of those four dates is
> calculated from. Each is written in the plan's own clock time in UTC form, and no time-zone conversion
> applies (as for `externalEarlyStart`). A finish instant is the moment work stops, not the inclusive
> last day the date column shows. An instant can differ from its date where the date is an actual, a
> placed finish milestone, or a finish milestone whose late date is held at its early date.
> `plans.scheduleInstantsComputedAt` says when the instants were written. A plan's instants are from
> the calculation that wrote its dates only when this value equals `scheduleComputedAt`. When it is
> empty or different, ignore them. All five are empty for a plan not calculated since they were added.
> Nothing is renamed or retyped, so a reader written for `2.3` reads `2.4`.

If another change takes `2.4` first, take the next minor at merge.

## 8. Tests the migration owes (in M2-T2's PR)

1. **ADR-0107, on a populated database** (the 20261017120000 recipe): `relfilenode` is unchanged on
   `activities` and `plans`; `atthasmissing = f`; both constraints read `convalidated = t`;
   `prisma:check-drift` reports no difference.
2. **Round trip, time-zone proof:** run `SET TIME ZONE 'Pacific/Chatham'` (an offset of +12:45 or
   +13:45), call `writeResults` with known minutes (including a 24-hour-calendar midnight finish and a
   pre-1970 value), read back through Prisma, and assert `getTime()/60000` is identical.
3. **Each CHECK, red:** three instants and one NULL gives 23514. Four instants with a NULL
   `late_start` gives 23514. A marker with a NULL cursor gives 23514. Remove one `SET` entry, recalculate
   a never-recalculated plan, and the first recalculation gives 23514.
4. **Rolled-back image (FC-8 at the database level):** after a current recalculation run an old-shape
   `UPDATE` (dates and `schedule_computed_at = now()` only, in a new transaction). Assert both CHECKs
   accept it and the predicate `schedule_instants_computed_at = schedule_computed_at` is false.
5. **Equality:** after a current recalculation the two plan columns are equal to the millisecond.
6. **Census:** `export-census.structural.spec.ts` and the registry-vs-document test pass with the five
   columns.

## 9. Risks

| Risk                                                                                                                                                | Likelihood | Mitigation                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| A builder splits the marker into its own `UPDATE`, so the two `now()` values are still equal but a future refactor moves one out of the transaction | low        | Test 5. The docblock says "same statement".                                                                       |
| A missing `SET` entry after a plan's first recalculation goes unnoticed                                                                             | low        | FC-7 real-statement e2e plus a mutation. The CHECK only covers the first recalculation, and that limit is stated. |
| `int4` overflow                                                                                                                                     | nil        | ±4,083 years against a 200-year engine horizon. `isSafeInteger` assert.                                           |
| Wider `activities` rows (+32 bytes) slow `writeResults`                                                                                             | low        | FC-10, measured in one sitting (plan M2-T2).                                                                      |
| `plans` DDL on deploy                                                                                                                               | low        | Metadata-only, and runs before the API starts (ADR-0018).                                                         |
| Export reader treats stale instants as current                                                                                                      | low        | The marker is exported, and the 2.4 entry states the rule.                                                        |
