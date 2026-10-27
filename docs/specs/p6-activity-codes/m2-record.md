# M2 record: migration B and its measurements

- **Spec:** [`./spec.md`](./spec.md) · **Plan:** [`./plan.md`](./plan.md) M2-T3 · **Design:**
  [`./database-design.md`](./database-design.md) §12, §16, §17
- **Migration:** `apps/api/prisma/migrations/20261027120100_p6_activity_codes/migration.sql`, whose
  header carries the same figures beside the statements they concern.
- **Taken:** 2026-10-27 by the database-architect agent.
- **Where:** the local **PostgreSQL 16.15** (Ubuntu, glibc, database collation `C.UTF-8`, libc provider)
  in a shared container. **Not** the deployed host and **not** `postgres:17-alpine`: there is no Docker
  daemon here. CI's run of `test/code-schema.e2e-spec.ts` is the PostgreSQL 17 reading for the
  constraint probes and the case folding.
- **Data:** synthetic rows written by SQL with time-ordered UUID v7-shaped keys, except the seed
  catalogue, which was seeded through the REST API (`@repo/seed-http`, `--tier all`) into a database at
  migration A. Times are warm, three repetitions, given as a range.

## Decisions this record settles

| Owner question                        | What was measured                                                                  | What ships                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Q1** baselines: every type if ≤ 1 s | one capture copying 150,000 assignments and 15,000 code lanes: **2.4–2.8 s added** | the fallback: the swimlane source type's value and lane per captured activity, as three `baseline_activities` columns |
| `ASSIGNMENT_ROWS_PER_ACTIVITY`        | an assignment costs 0.61–0.86 history rows warm, 1.02–1.13 cold                    | **4** (the calibrated history constant 5, scaled, lower reading)                                                      |
| the two FK-check indexes              | without them one plan's values delete takes 15–16 s and 177 s                      | both kept                                                                                                             |
| Q5 parent value column                | `m0-record.md`: `ACTVCODE.parent_actv_code_id` has one public source               | **no** `code_values.parent_id`; an expand-only follow-up if a real export confirms it                                 |

## 1. Duration of migration B

The whole file in one transaction, rolled back, timed inside the transaction (connection set-up
excluded).

| Database                                                                     | Whole file | `uq_activities_plan_id_id` | `ck_baseline_activities_code_lane_pair` scan |
| ---------------------------------------------------------------------------- | ---------- | -------------------------- | -------------------------------------------- |
| the seed catalogue: 31 plans, 428 activities, no baselines                   | 51–58 ms   | —                          | —                                            |
| 10 plans × 5,000 = 50,000 activities                                         | 85–98 ms   | 35–37 ms                   | —                                            |
| 100 plans × 5,000 = 500,000 activities, 2,000,000 `baseline_activities` rows | 685–824 ms | 276–359 ms                 | 337–462 ms                                   |

Both growing statements scan existing tables (`activities` under a `SHARE` lock to build the index,
`baseline_activities` to validate the CHECK). The API migrates before it serves (ADR-0018), so this is
added to one boot. The deployed host's row counts set its real figure; at the sizes above it is under a
second.

## 3. Expiry of a 5,000 × 30 plan

One plan of ten in the database: 5,000 activities; 30 types × 50 values; every activity carrying every
type (150,000 assignments, written contiguously as an import writes them); 15,000 code lanes (three
types, one of them "no value"); 10,000 history rows interleaved at random; the plan's swimlanes from its
first type. The database holds 1.5 M assignments and 150,000 code lanes. The runner's order, literal
`IN` lists, one transaction rolled back.

| Statement             | All indexes                  | Without `idx_code_swimlane_lanes_type_value` | Without `idx_code_value_assignments_type_value` |
| --------------------- | ---------------------------- | -------------------------------------------- | ----------------------------------------------- |
| history (10,000)      | 27–30 ms                     | 29–46 ms                                     | 51 ms                                           |
| code lanes (15,000)   | 7.3–7.4 ms                   | 9.1–13 ms                                    | 12 ms                                           |
| assignments (150,000) | 68–76 ms (253 ms cold rep 1) | 70–118 ms                                    | 135 ms                                          |
| activities (5,000)    | 264–277 ms                   | 305–410 ms                                   | 277 ms                                          |
| plan pointer cleared  | 0.8–1.1 ms                   | 0.9 ms                                       | 0.8 ms                                          |
| values (1,500)        | 74–118 ms                    | **15.1–16.1 s**                              | **177 s**                                       |
| types (30)            | 133–156 ms                   | 143–192 ms                                   | 149 ms                                          |
| plan                  | 2.6–3.4 ms                   | 2.7–5.7 ms                                   | 3.8 ms                                          |

Without either index each deleted value's `RESTRICT` check scans the whole other table. The second
case alone is three times the expiry's 60 s batch transaction. Both indexes stay.

**`ASSIGNMENT_ROWS_PER_ACTIVITY`.** An assignment's cost is its own delete plus the dead index entries
the value and type deletes then walk in their checks: (68–76 + 74–118 + 133–156 ms) / 150,000 =
**1.8–2.3 µs** warm, **3.1 µs** on the cold first repetition. A history row costs **2.7–3.0 µs** here.
The swimlanes method (scale the calibrated `HISTORY_ROWS_PER_ACTIVITY = 5` by the ratio) gives 5.8–8.2
warm and 4.4–4.9 cold. Charging too little overruns the batch transaction and charging too much only
slows a backlog, so the lower reading is taken: **4**. Code lanes cost about 0.5 µs a row and are
charged at the existing `LANE_ROWS_PER_ACTIVITY = 2`. Not measured: assignments interleaved on disk by
hand edits over time (the lower constant is their headroom), and a cold run on the deployed host
(`docs/TECH_DEBT.md` #443 covers all three constants).

## 4. Q1: one baseline capture

The full shape (database-design §6.2): copy every assignment and every code lane of every captured
activity, by `INSERT … SELECT` inside the capture transaction, into frozen tables with two indexes and
two foreign keys each.

| Variant (plan of 5,000 activities × 30 types) | 150,000 assignments | 15,000 code lanes |
| --------------------------------------------- | ------------------- | ----------------- |
| as designed, v7-shaped ids minted in SQL      | 2.20–2.60 s         | 0.19–0.27 s       |
| v4 ids (`gen_random_uuid()`)                  | 2.21–2.49 s         | 0.19–0.27 s       |
| the copy table's two foreign keys dropped     | 1.40 s              | —                 |
| the copy table's two indexes dropped          | 2.02–2.23 s         | —                 |

**2.4–2.8 s added: over the 1 s ceiling.** Even with no keys and no indexes the write of 150,000 rows is
over 1 s on this machine, so no schema choice brings the full copy under it. A Prisma `createMany` of the
same rows (the existing lane copy's pattern) would add round trips, not remove them.

**The fallback shipped:** each captured activity's value and code lane **for the frozen swimlane source
type only**, as three nullable columns on the `baseline_activities` row the capture already writes
(`code_value_id`, `code_lane_index`, `code_lane_updated_at`), with `baselines.code_snapshot_level`
(`NONE` | `SWIMLANE_TYPE`) saying whether they were recorded. Its added work is two reads of that type
for 5,000 activities (values 2.6–3.4 ms, lanes 3.0–4.4 ms) and three more fields per row: no new rows
and no new key checks. What it gives up: removed work cannot be placed in the swimlanes of a code type
the plan switched to after the capture; it is counted instead (database-design DB-2's "no" cost, for
that case only).

## 5. The CHECK round trip

- `pg_dump -Fc` / `pg_restore` (16.15 tools) of a database migrated from empty through migration B:
  **all 299 constraint definitions and the 19 new index definitions identical text for text**
  (`pg_get_constraintdef` / `pg_get_indexdef`, diffed). Covers the two replaced CHECKs, which use two
  comparisons instead of `BETWEEN` (`docs/DATABASE.md` "Constraints"), and the eight new ones.
- `scripts/backup-restore-check.sh` against `app_test` after `test:e2e:backup-fixture` (local tools,
  no Docker): **104 checks passed, 0 failed**. CI's run uses `postgres:17-alpine`.

## 6. Case folding of the two case-insensitive uniques

PostgreSQL **16.15**, glibc, `C.UTF-8`: `'Électrique'` then `'éLECTRIQUE'` in one plan refused `23505`
by `uq_code_types_plan_name`; `'Étage'` then `'éTAGE'` in one type refused `23505` by
`uq_code_values_type_short_code`. `test/code-schema.e2e-spec.ts` asserts both on CI's own
`postgres:17-alpine` database.

## 7. The organisation export reads (item 7)

Taken 2026-10-27 by the builder, on the same machine and PostgreSQL as above. Two organisations of five
plans each; every plan 5,000 activities, 30 types × 50 values and every activity carrying every type, so
**1,500,000 assignments** (750,000 per organisation), 150,000 code lanes, 15,000 values and 300 types
in the database; v7-shaped keys minted in SQL, `ANALYZE`d. The four new files' `org` reads of one
organisation, exactly the `findMany` the repository issues (`organizationId = …`, `id > last`,
`ORDER BY id`, 1,000 rows, the registry's columns), inside a read-only repeatable-read transaction.
Two repetitions; the first figure is the first.

| File                     | Rows    | Pages | Total (s) | Page p50 | Page max   |
| ------------------------ | ------- | ----- | --------- | -------- | ---------- |
| `code-types`             | 150     | 1     | 0.006     | 6 ms     | 6 ms       |
| `code-values`            | 7,500   | 8     | 0.11–0.13 | 14–17 ms | 23–26 ms   |
| `code-value-assignments` | 750,000 | 751   | 11.1–11.4 | 13–14 ms | 139–155 ms |
| `code-swimlane-lanes`    | 75,000  | 76    | 1.2–1.3   | 14–15 ms | 44–49 ms   |

**About 12.5 s of query time to read one organisation's 750,000 assignments and everything beside
them**, against `EXPORT_TRANSACTION_TIMEOUT_MS` (ten minutes) and a 30 s `statement_timeout` per page
(the slowest page took 0.16 s). The existing `m2-measurements.md` put a ten-plan organisation at 25 s, so
the four new files add roughly half again at this size. Not measured: serialising the rows to JSON and
CSV and zipping them (the same cost per row as every other file), the response over a network, and a
cold cache. The query plan was not inspected.

## 8. What the builder's half of M2-T3 changed (2026-10-27)

- **Export `2.2`, kept.** The newest api tag is `api-v0.102.1` and it does not contain the commit that
  introduced `2.2` (the tags containing `12f532b5` are none), so `2.2` has not shipped and migration B's
  files and columns join its entry. Four new files (35 in all), `plans.swimlaneCodeTypeId`,
  `baselines.swimlaneCodeTypeId` and `.codeSnapshotLevel`, and three appended `baseline-activities`
  columns; no `parentId` (Q5), and no DB-2 files (Q1 fallback).
- **Expiry.** The runner deletes code lanes and assignments by plan id after the swimlane lanes, clears
  the plan's pointer, then values (by type id), types, and the plan. `Plan→CodeType` is the second
  `EXEMPT_EDGES` entry, paid for by a source-order assertion. The budget charges assignments at
  `ASSIGNMENT_ROWS_PER_ACTIVITY = 4` and code lanes with the swimlane lanes at
  `LANE_ROWS_PER_ACTIVITY`. The `hierarchy.expired` audit row does not carry the new counts (it carries
  no lane count today either).
- **Compensation.** `InterchangeService.compensate` deletes code lanes, assignments, then clears the
  pointer and deletes values and types. Its e2e seeds the rows inside the mocked recalculation, as the
  swimlane case does.
- **Test harness.** `clearActivityTree` 7 → 9 children; `clearBaselineTree` stays at 5;
  `clearDomainData` clears the pointer, values and types; a new DMMF-derived `clearPlanTree`
  (`test/clear-plan-tree.ts`) replaces the hand-listed `plan.deleteMany()` in the twelve specs that reset
  by deleting plans without `clearDomainData` (the design counted eleven): `calendar-scope`,
  `cross-plan-revision-compare`, `hierarchy-expiry`, `interchange-roundtrip`, `pairwise-differential`,
  `redundant-links`, `revision-compare`, `revision-delta-m0`, `schedule`, `schedule-health-check`,
  `share`, `share-guest`. The two `test/measure/` scripts delete by organisation id and were left alone.
- **Left for M2-T4:** `UpdatePlanDto` admitting `swimlaneCodeTypeId`, which removes the named allowance
  in `schedule-inputs.structural.spec.ts`; the cascade and restore of types and values
  (database-design §8.2), which no route can reach until the module exists.

## Not measured here

- **Item 2**, the import commit of a 5,000-activity, 30-type file through the real write path: there is
  no write path yet (M5).
