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
cold cache. These timings were taken with the earlier `(organization_id)` index; see the plan check below.

**The organisation index is `(organization_id, id)`** on `code_value_assignments` and
`code_swimlane_lanes` (performance review, before release), so the export's keyset page is an index range
scan in `id` order with no sort. One index each, and `organization_id` still leads, so the organisation
key's RESTRICT check is served as before. Checked with `EXPLAIN (ANALYZE, BUFFERS)` on a copy of the table (`CREATE TABLE … LIKE`, with its
indexes, no foreign keys) holding **505,000 rows** over 101 organisations of about 5,000 each (random
UUID ids, the worst case for heap locality), `ANALYZE`d. The exact page shape (`WHERE organization_id = …
AND id > $last ORDER BY id LIMIT 1000`) at the fourth page: `Index Scan using …_organization_id_id_idx`
with the index condition on both columns and **no Sort node**, **1,000 rows visited, 1,012 shared
buffers, 1.1 ms** (about one heap page per row, all cache hits); the first page (no `id` bound) the same
plan, 1,012 buffers, 1.2 ms. The lanes table has the same columns and index and was not run separately.
The scratch schema was dropped.

## 8. What the builder's half of M2-T3 changed (2026-10-27)

- **Export `2.3`.** `2.2` shipped in `api-v0.102.2` (release 1, which carried migration A's `ACTIVITY_CODE`
  label), so migration B's additions are a new minor, which the format document allows for new files,
  columns and enum values (database-design D-P4). Four new files (35 in all), `plans.swimlaneCodeTypeId`,
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
- **Owed by M2-T4 (security review S1):** every service that creates a code type, value, assignment or
  lane sets `organizationId` from the resolved plan, never from the request, and a test sends a foreign
  `organizationId` and checks the stored row carries the plan's.
- **Left for M2-T4:** `UpdatePlanDto` admitting `swimlaneCodeTypeId`; the cascade and restore of types
  and values (database-design §8.2). Both are settled in §9 below: the first moved to M4-T1, the second is
  M2-T5.

## Not measured here

- **Item 2**, the import commit of a 5,000-activity, 30-type file through the real write path: there is
  no write path yet (M5).

## 9. What M2-T4 built (2026-10-27, the builder)

**Routes** (all under `/api/v1/organizations/:orgSlug/plans/:planId`, `docs/API.md` "Codes"):
`GET|POST code-types`, `PATCH code-types/order`, `PATCH|DELETE code-types/:id`, `POST code-types/:id/restore`,
`POST code-types/:id/values`, `PATCH code-types/:id/values/order`, `PATCH|DELETE code-values/:id`,
`POST code-values/:id/restore`, and `PATCH activities/codes`. The activity list gains `codes`.

**Decisions this milestone took that the spec left open** (each is additive or a naming, and none changes a
decided behaviour):

- **The write route's body** is `{ activities: [{ id, version, codes: [{ codeTypeId, codeValueId | null }] }] }`.
  An activity row states only the types it touches; `codeValueId` is required-but-nullable, so a typo is
  never a silent clear. One to 2,000 activities, at most 100 types a row (the body cap is 512 KB).
- **The write lives in the activities module** (`ActivityCodesService`), not the codes module, because it
  is an activity write (version bump, history). It imports the codes repositories; the codes module does
  not import the activities module.
- **Errors:** a foreign, deleted or unknown activity, type or value is 404 (never told apart); a value of
  another type of the plan is 422 `CODE_VALUE_WRONG_TYPE`; a deleted value is 422 `CODE_VALUE_DELETED`
  (the spec's "409 / 422, api-reviewer picks one": 422, because the request names a value that cannot be
  assigned, not a state clash on the activity). Delete of the source type: 409 `CODE_TYPE_IS_SWIMLANE_SOURCE`
  with the owner's sentence.
- **History item** `code:<codeTypeId>` holds `{ from, to }` as code VALUE ids (design §15 D7), recorded in a
  `DEFINITION` batch (one entry per activity, never merging). Names are not stored, so the web resolves
  them from the plan's code types; `format-history-item.ts` says only "Code changed" until M3-T3 does.
- **`codes` is on the list and the codes write only.** Other activity responses omit it, so a client must
  not overwrite a cached activity's codes with one. Putting it in `withDayFactors` would cost every write
  response two statements; M3 decides if that is wanted.
- **`UpdatePlanDto` does not admit `swimlaneCodeTypeId`.** `m2-record.md` §8 and the allowance comment
  said M2-T4 would; the spec (§4.7, "existing plan update") and plan.md M4-T1 put the source switch in M4,
  with its 1-to-100-values-in-use rule and its plan-lock. The allowance in `schedule-inputs.structural.spec.ts`
  stays, its comment now naming M4-T1. The source-delete refusal is tested by writing the pointer with
  Prisma, as the migration's own probes did.
- **Values are flat** (no `parent_id`, Q5), so a value's "live subtree" is itself and `PARENT_DELETED` on a
  value restore means a deleted type or plan.
- **Insert-after is not offered** for types or values (append, then reorder); swimlanes have it, and it
  can be added without a contract change.
- **Cascade, restore stamping and the seed catalogue are M2-T5 and M2-T6** and untouched; so is the
  activity-history statement budget (`activity-history-statements.e2e-spec.ts` unchanged and green).

**Obligations of §8 met.** Security review S1: `organizationId` is never accepted (a body carrying one is
422 on every write route) and every row is created with the loaded plan's. Tests send a foreign
`organizationId` and then check the stored rows. The D-P1 gate (`nested-relation-writes.structural.spec.ts`)
passes: every write is through plain columns, and the assignment upsert is raw `INSERT … ON CONFLICT`.

**Declarations the gates now pin.** `soft-delete-filter.structural.spec.ts` 52 → 59 declarations, 144 → 151
calls covered: the two any-state lookups for restore, two restore-picker lists, two project-to-client reads
for the top-down ancestor lock (the swimlanes precedent) and the assignment lock's deleted-or-not question.
The history coverage census gains `ActivityRepository.bumpVersions`, recorded by `ActivityCodesService.write`.

### Read and write timings (SC-5, reads)

Re-taken after the review folds: the value list now selects the nine columns it emits and the per-page codes read has no SQL `ORDER BY`. The first set read the 100,000-value list at 2.9 s p50 and 3.4 s p95; the narrow select brings it to 2.3 s and 2.6 s. The table below is the second set.

`apps/api/test/measure/codes-reads.measure.ts`, run on the local PostgreSQL 16.15 in the shared container
(not the deployed host), warm, through the real application over HTTP, ids v4 (`gen_random_uuid()`, the
worst case for index locality). One plan of 5,000 activities with 30 types of 50 values and every activity
holding every type (150,000 assignments, the import cap); a second plan of 5,000 with none.

| Request                                                      | p50    | p95    |
| ------------------------------------------------------------ | ------ | ------ |
| list 100 activities, plan with no code type                  | 30 ms  | 39 ms  |
| list 100 activities, 30 types, every activity coded          | 47 ms  | 67 ms  |
| list 100 activities (a later page), same plan                | 48 ms  | 60 ms  |
| `PATCH …/activities/codes`: 1 activity, 1 type               | 40 ms  | 48 ms  |
| `PATCH`: 100 activities, 1 type                              | 102 ms | 129 ms |
| `PATCH`: 100 activities, 30 types (3,000 changes)            | 329 ms | 352 ms |
| `PATCH`: 2,000 activities, 1 type (2,000 changes)            | 1.00 s | 2.03 s |
| comparator, `PATCH …/placements`, 2,000 activities, a change | 498 ms | 586 ms |
| `GET code-types`: 30 types × 50 values (1,500 values)        | 45 ms  | 59 ms  |
| `GET code-types`: 100 types × 1,000 values (100,000 values)  | 2.3 s  | 2.6 s  |

- **The page's codes cost about 20 ms over a plan without codes** (3,000 triples serialised for 100
  activities), end to end, inside the p95 < 200 ms target (CLAUDE.md §15). The database probe's
  6 ms per 200 activities (design §5.4) is the statement alone.
- **The 2,000-row write is about twice the placements batch.** An isolated 2,000-row write profiled at
  0.74 s: 40 ms of locks and checks, 80 ms for the assignment upsert (three foreign-key checks a row), 70 ms
  for the version bump, 150 ms for the history batch and commit, 140 ms to re-read the rows and 270 ms to
  decorate and map the answer. **An earlier run of the same harness measured 2.6 s for this row**, with the
  time in the history batch (0.05 s on the first write, 2.9 s by the fifth) after earlier runs had churned
  `activity_history_entries`; a later run on the same database read 1.05 s. That cost is the recorder's own
  (ADR-0174) and was not isolated here, so 1.0 to 2.6 s is what a 2,000-row write can take, and the web
  should send far fewer (a selection, not a plan).
- **The type list at the caps is not cheap**: 100 types × 1,000 values is 100,000 rows and about 3 s. The
  typical plan (1,500 values) is 57 ms. The list nests every live value of the page's types in one query
  and does not page them. If M3 shows a plan near the cap, the remedy is a values-on-demand read per type,
  which is additive; nothing is built for it now (ADR-0142: measured before it is built).
- **Not measured here:** the membership read for a swimlane source (M4-T1's endpoint does not exist) and
  `loadActivityCodes` on the deployed host.

## 10. What M2-T5 built (2026-10-27, the builder)

**Cascade and restore** (`hierarchy-lifecycle.service.ts`, database-design §8.2). A plan, project or client
delete stamps the plans' live code types and then their live values with the delete batch id, after the
swimlane sweep and before the plan stamp (`CascadeCounts.codeTypes`, `.codeValues`). The batch restore
reactivates them by batch id beside the swimlanes, and is skipped for activity and dependency batches. Assignments are
join rows and are not rewritten: they read as "no value" while their value is deleted and come back with it.
`activity-history-statements.e2e-spec.ts` is unchanged and green, and a unit test pins that an activity
restore issues no code statement.

- **Batch semantics hold.** A value or type deleted on its own keeps its own batch id, so the plan restore does not
  revive it (`test/code-cascade.e2e-spec.ts`, for plan, project and client). The swimlane-source pointer survives
  a delete and restore of its plan.
- **No restore guard is added to the batch path.** A plan batch holds types and values swept together; a value
  whose type was deleted earlier was itself deleted in that type's batch, so no value can be in this batch under
  a type that is not. The `PARENT_DELETED` refusals of design §8.2 stay on the single type/value restore routes (M2-T4).
- **Lock order.** The cascade takes the plan advisory lock and the plan's activity rows in id order
  (`lockPlansForCascade`), then stamps types, then values, which is the order the codes writer takes its row locks in
  (plan lock, activities, types `FOR SHARE`, values `FOR SHARE`, history last). Every creating or assigning codes route
  (and every restore) takes the plan lock and re-reads the live plan under it; rename, reorder and update routes only touch live
  rows by `deletedAt: null`, so none can add a live row under a deleted plan. The race is driven in
  `code-cascade.e2e-spec.ts`: a test-owned transaction holds the plan lock and runs the real cascade, and a type
  create, a value create and an assignment write started against the held lock are each held, then refused
  `NotFoundError`, with no live code row left under the plan.
- **No index is owed for the reverse lookup** (#562's last bullet). The pointer's key is
  `plans (id, swimlane_code_type_id) → code_types (plan_id, id)`; deleting a type checks `plans` with
  `WHERE id = $plan AND swimlane_code_type_id = $type`, and `EXPLAIN` (with sequential scans disabled, on empty
  tables) shows `Index Scan using plans_pkey` with the pointer as a filter on at most one row. The sweep's
  statements use `uq_code_types_plan_id_id` and `uq_code_values_type_id_id`.
- **Restore statements state `deletedAt: { not: null }`** beside the batch id (security review), as
  `code-value.repository.ts` does. The batch restore reaches them only inside `if (batchId)`, the guard every
  sibling sweep sits under, so a missing batch id never reaches Prisma as a dropped `where`; nothing more was added.

### Cost of the sweep at the caps (ADR-0142)

`test/measure/codes-cascade.measure.ts`, local PostgreSQL 16 database, warm, 3 delete-then-restore cycles,
one real HTTP `DELETE` and `POST …/restore` each, v4 ids, no activities or assignments (the codes sweep alone).

| Case                                                       | delete p50 | restore p50 |
| ---------------------------------------------------------- | ---------- | ----------- |
| (a) one plan, 100 types × 1,000 values (100,000), plan     | 1,957 ms   | 1,978 ms    |
| (a) the same plan, through its project's delete            | 1,729 ms   | 1,692 ms    |
| (b) a project of 10 such plans (1,000,000 values), project | **fails**  | not run     |

- **(b) does not fit.** The project delete was cancelled by Prisma at 17,330 ms against the **15,000 ms**
  `TRANSACTION_TIMEOUT_MS` (`prisma.service.ts:25`), a 500 to the user. The plan, project and client delete and
  restore call sites pass no `timeout`, so the 15 s default is what they run under; only the activity batch
  writers use `BATCH_TRANSACTION_TIMEOUT_MS` (60 s, `prisma.service.ts:36`). The restore of (b) was not run
  because there was nothing deleted to restore; by the symmetry of (a) it should cost about as much.
- The cost is about 17 µs a value for the delete and the same for the restore. The caps (100 × 1,000 per plan)
  allow 10 such plans in one project, and a client holds many projects, so the 15 s default is reachable by data
  the product accepts. A plan alone is safe (2 s).
