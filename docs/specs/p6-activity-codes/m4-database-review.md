# M4 database review: swimlanes by a code

- **Status:** Draft
- **Date:** 2026-10-30
- **Author:** database-architect agent (CLAUDE.md §19.3), before M4's spec and plan are written.
- **Inputs:** [`./spec.md`](./spec.md) §4.5, §4.10, §4.11; [`./plan.md`](./plan.md) M4 and "Sequencing and
  release order"; [`./database-design.md`](./database-design.md) (§17, what landed, wins over §5–§13);
  [`./m2-record.md`](./m2-record.md); [`./m3-record.md`](./m3-record.md).
- **Base:** branch `docs/p6-m4-spec` at `c4370ef`. `apps/api/package.json` reads `0.103.1`, and the only
  commit after the Version Packages merge `a513ce2` is a docs commit, so **the `apps/api` source read here is
  the api 0.103.1 image**: the "previous image" when M4 ships.
- **How it was measured (§8):** a scratch database on the local PostgreSQL 16.15 (shared container, not the
  deployed host, not `postgres:17-alpine`), built by applying all 81 migration files in order with `psql`
  (Prisma is not installed in this checkout, so `scripts/e2e-local.sh --db-only` started Postgres and then
  stopped at its migrate step). It was seeded at the M2 measurement sizes and dropped afterwards.

---

## 1. Verdict

1. **M4 needs no schema change.** No column, no index, no constraint and no data migration. Every write
   and read M4 adds is admitted, refused or served by what migrations `20261027120000` and `20261027120100`
   already landed. §2 goes through each one with its evidence.
2. **One query shape is load-bearing.** Design §9.2's membership query, used as written, measured
   **13–15 ms** (median) against the 10 ms target. The same query with the type filter applied only on the
   assignment side measured **7.2–8.0 ms** (§2.3). The builder must use that shape. No index is needed.
3. **The source switch must take the plan advisory lock.** Today the plan update takes none
   (`plans.service.ts:238-261`, `:273-300`), and a two-session probe shows that the foreign key does **not**
   serialise a switch against a code-type soft delete that is still in flight (§2.9). DB-3's refusal
   (`code-types.service.ts:246-256`) is only sound if the switch takes the lock too.
4. **The rollback runbook already in `docs/DEPLOYMENT.md` is wrong for the image M4 rolls back to.** It
   says the previous image "cannot read that plan's row". That is true only for images before api 0.102.2.
   Api 0.103.1 reads such a plan. It cannot change the plan's source or capture a baseline of it (both fail
   with the CHECK, 23514), and it draws the diagram without swimlanes. A baseline frozen with
   `ACTIVITY_CODE` is harmless to 0.103.x. §4 gives the corrected analysis and a draft text.

---

## 2. Each M4 write and read, against the landed schema

### 2.1 Switching the source

| Switch                                     | What the database does                                                                                                   | Evidence                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| NONE / MANUAL / WBS → `ACTIVITY_CODE` + T  | admitted when T is a type of this plan                                                                                   | probe P1; `ck_plans_swimlane_source_level` (migration B `:352`)                                               |
| → `ACTIVITY_CODE` + a type of another plan | refused 23503 by `plans_id_swimlane_code_type_id_fkey`                                                                   | probe P2; migration B `:342`                                                                                  |
| T1 → T2 (both code types)                  | admitted: a one-column update of `swimlane_code_type_id`                                                                 | probe P3                                                                                                      |
| `ACTIVITY_CODE` → MANUAL, type left set    | **refused 23514**                                                                                                        | probe P4. This is what 0.103.1's update writes, because `plans.service.ts:259-260` sets source and level only |
| `ACTIVITY_CODE` → MANUAL, type cleared     | admitted                                                                                                                 | probe P5                                                                                                      |
| `ACTIVITY_CODE` with a soft-deleted type   | **admitted by the database** (a key does not see `deleted_at`). Refusing it is the service's job, under the lock in §3.1 | probe P11                                                                                                     |

**What the service must do.** Every switch writes all three columns together: `swimlaneSource`,
`swimlaneWbsLevel` (NULL unless WBS) and `swimlaneCodeTypeId` (NULL unless `ACTIVITY_CODE`). The
pair-resolution at `plans.service.ts:238-261` becomes a triple. A request that changes neither source nor
type keeps the stored type only while the source stays `ACTIVITY_CODE`, as the level is kept only while it
stays WBS (`:245-250`). The type must be checked as live, of this plan and of this organisation, under the
lock (§3.1), and a mismatch is a 422 (`SWIMLANE_LEVEL_MISMATCH`'s sibling), never the CHECK's 500. Write it
as a scalar through `PlanPatch` (`plan.repository.ts:56`, written by `updateMany` at `:194-197`), never with
`swimlaneCodeType: { connect }` (design §16 D-P1; the gate is `nested-relation-writes.structural.spec.ts`).

**Switching codes keeps each layout: confirmed.** `code_swimlane_lanes` is unique on
`(plan_id, activity_id, code_type_id, code_value_id) NULLS NOT DISTINCT` (migration B `:325`). Type is part
of the key, so a lane written under T2 can never touch a T1 row. Probe P9 shows one activity holding rows
for three types side by side, with one "no value" row per type after two upserts. Switching to MANUAL or
WBS touches only `activity_swimlane_lanes`, a different table, so code lanes survive that too. The source
switch itself writes no lane row in any direction.

### 2.2 Values in use (the 1-to-100 switch rule)

The rule is a service count, because a CHECK cannot count. The shape: live activities joined to live values
of T, `count(DISTINCT code_value_id)`. It measured **7.5–7.8 ms** (median of 15, three runs; maximum
8.7–22.6 ms) for a 5,000-activity plan with 30 types (bench `Q4`). It uses `uq_code_values_type_short_code`
and `idx_code_value_assignments_type_value`. No index is owed.

### 2.3 The membership read (`GET …/code-types/:id/membership`)

Measured for one 5,000-activity plan inside a database of 10 such plans: 30 types × 50 values, every
activity carrying every type (1,500,000 assignments), 5 % of activities soft-deleted, one value per type
soft-deleted, v4 ids. Fifteen repetitions in plpgsql, server-side only, every column read (`count(s.*)`).
Median and maximum per run, three runs:

| Shape                                                                                                                                                          | Median (ms) | Max (ms)  | Plan                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1, design §9.2 as written** (`cva.plan_id = a.plan_id AND cva.activity_id = a.id AND cva.code_type_id = T`)                                                 | 13.1–15.2   | 20.3–23.6 | walks `uq_code_value_assignments_plan_activity_type` with `(plan_id, code_type_id)`, skipping the middle column: all 150,000 of the plan's entries, 6,647 buffers |
| **Q1b, type filter on the assignment side only** (`cva.activity_id = a.id AND cva.code_type_id = T`; `a.organization_id`, `a.plan_id`, `a.deleted_at IS NULL`) | **7.2–8.0** | 8.6–12.0  | bitmap scan of `idx_code_value_assignments_type_value` for T's 5,000 rows, hash-joined to the plan's live activities                                              |
| Q1c, Q1b plus a join that reads a deleted value as none                                                                                                        | 10.6–12.3   | 12.3–19.3 | as Q1b plus T's live values                                                                                                                                       |
| Q3b, assignments of T alone (no activity join)                                                                                                                 | 4.1–4.2     | 4.4–5.2   | `idx_code_value_assignments_type_value`                                                                                                                           |
| Q5, T's code lanes for the plan                                                                                                                                | 2.7–4.8     | 3.3–5.6   | `uq_code_swimlane_lanes_basis` on `(plan_id, code_type_id)`                                                                                                       |

**Decision for the builder: use Q1b.** Dropping `cva.plan_id` is safe because the composite key
`(plan_id, code_type_id) → code_types (plan_id, id)` (`code_value_assignments_plan_id_code_type_id_fkey`,
migration B, step 5) means every assignment of T carries T's plan. The service loads T as a live type of
this plan and organisation first, as every codes route does. Return the stored `codeValueId` and let the
client read a value missing from T's live value list as "no value" (design §9.2's last paragraph). Resolving
it on the server (Q1c) costs 3–4 ms more and misses the target. If code lanes travel with membership, Q5 is
a second statement of about 3 ms. The page-sized alternative (code lanes per page of the activity list,
beside `swimlaneLanes`) measured 0.6 ms per 200 activities. Either is index-served, so which one is an API
choice, not a schema one.

Write it as `$queryRaw`. Prisma's relation filters do not produce this join. The ADR-0172 gate reads raw SQL
and refuses a statement naming `activities` without a `deleted_at` predicate
(`soft-delete-filter.structural.spec.ts:576-610`), so `a.deleted_at IS NULL` must appear in the text.

The design's own reading of 8.0 ms (design §9.2) used a bitmap scan of the type index. Here the planner
preferred the unique index when `plan_id` was also named. That is the difference, and why the shape is
stated rather than left to the planner.

### 2.4 Code lanes on a code write (`PATCH …/activities/codes` while a code source is shown)

- The upsert is raw `INSERT … ON CONFLICT (plan_id, activity_id, code_type_id, code_value_id) DO UPDATE`,
  because Prisma cannot name a NULL in a compound-unique `where` (design §16.2 item 6). Probe P9: two upserts
  of the "no value" row leave one row, holding the second write's lane.
- A lane naming a value of another type is refused 23503 by
  `code_swimlane_lanes_code_type_id_code_value_id_fkey` (probe P10; migration B `:317`). That is a backstop,
  not the check: the codes write already refuses it as 422 `CODE_VALUE_WRONG_TYPE`
  (`activity-codes.service.ts:139-152`).
- **The basis is derived on the server and never sent by the client** (ADR-0206 A3): `(T, the activity's
value of T after this write)`, or `(T, NULL)` when that value is none or is soft-deleted. That mirrors the
  manual path, where a kept membership naming a deleted swimlane takes the "No swimlane" basis
  (`activities.service.ts:1137-1151`). Today `deriveLaneBasis` throws a plain `Error` for `ACTIVITY_CODE`
  (`swimlane-lanes.ts:118-124`). M4 replaces that branch with a code-basis derivation that writes to
  `code_swimlane_lanes`, never to `activity_swimlane_lanes`.
- No code-lane write touches `activities.lane_index` (ADR-0206 A1–A2). The row lock and version bump the
  codes write already does (`activity-codes.service.ts:118`, `:183-194`) are what the lane rows need
  (design §5.5's lifecycle note).
- **Not measured: the added cost of the lane upsert at 2,000 rows.** It should sit beside the assignment
  upsert's 80 ms (`m2-record.md` §9), but that is an estimate. M4-T1 measures it with the existing
  `test/measure/codes-reads.measure.ts` harness (ADR-0142).

### 2.5 Move to swimlane under a code source

This is the codes write of §2.4 carrying a lane: set (or clear, for "No <type>") T's assignment and upsert
the lane under the new basis, in one transaction and one undo step. Materialise-on-write (ADR-0206; the
`derived` list from `deriveSwimlaneLanes`, `packages/layout/src/swimlanes.ts:30-41`) needs the target
swimlane's unplaced members written **in the same batch**. Those are other activities whose codes do not
change, so the request must admit lane-only rows. Each such row is row-locked and version-bumped like any
lane write. That is an API-shape decision for the spec. The schema admits it as is.

### 2.6 A bar moved within a code swimlane (the positions batch)

`PATCH …/activities/positions` with in-swimlane rows already locks activity rows and then reads the plan
`FOR SHARE` (`activities.service.ts:1094-1096`, `:338-356`). Under a code source:

- `lockPlanSwimlaneSource` must also return `swimlane_code_type_id`, which costs no extra statement.
- It reads the locked activities' assignments of T. These are stable, because every assignment write holds
  the same activity row locks (`activity-codes.service.ts:118`, `FOR NO KEY UPDATE` per
  `common/db/activity-row-lock.ts:62`).
- It reads whether those values are live. This read is advisory, as the kept-swimlane read is
  (`activities.service.ts:1116-1126`). A value soft delete that races it leaves a lane under a basis the
  diagram no longer draws, which the stale-row rule already absorbs.
- It upserts `code_swimlane_lanes` (§2.4).
- **Recommended: refuse a `swimlaneId` write under `ACTIVITY_CODE`**, as WBS does
  (`assertSwimlaneIdWritable`, `activities.service.ts:318-327`, called at `:471`, `:889`, `:1083`, `:1103`).
  Membership is the code's, so the hand-made `swimlane_id` should be kept and ignored for switching back.
  That is a behaviour for the spec to state, with no schema effect.

### 2.7 Deleting a value that is a current lane

Probe P13: the soft delete is admitted, and all of the value's assignments (100) and lanes (100) are kept.
Its activities draw in "No <type>" and take their `(T, NULL)` lanes, derived and then materialised on the
next write. Restoring the value brings back their `(T, V)` lanes untouched. No schema change. The cascade
already keeps join rows (`m2-record.md` §10).

### 2.8 Refusing to delete the source type (DB-3)

Built in M2-T4. The type delete takes the plan advisory lock, re-reads the plan and refuses when
`swimlaneCodeTypeId` names the type (`code-types.service.ts:246-256`). The database refuses only a **hard**
delete of the source type (probe P12: 23503 on `plans_id_swimlane_code_type_id_fkey`). It admits the soft
delete (probe P11). So the refusal is a service rule, sound only if every writer of the pointer takes the
same lock (§2.9).

### 2.9 The race that makes the plan lock mandatory on the switch

Two sessions on the scratch database:

- Session A: `SELECT … FROM code_types WHERE id = T FOR NO KEY UPDATE`, then
  `UPDATE code_types SET deleted_at = now()`, then holds for 3 s. This is exactly what the type delete does
  (`code-types.service.ts:258`; `code-type.repository.ts:168`).
- Session B, with `lock_timeout = 1500ms`: `UPDATE plans SET swimlane_source = 'ACTIVITY_CODE',
swimlane_code_type_id = T` **completed in 2.4 ms without waiting**.

The pointer's foreign-key check takes `FOR KEY SHARE`, and a soft delete changes no key column, so it holds
only `FOR NO KEY UPDATE`. Those two do not conflict (PostgreSQL "Row-level locks" conflict table). Both
commits would leave a live plan pointing at a deleted type. The same session B taking `SELECT … FOR SHARE`
on T **did** wait (cancelled at 1,500 ms). So the switch takes the plan advisory lock, which serialises it
with the type delete (and with the plan cascade, which takes it first: `hierarchy-lifecycle.service.ts:248-250`).
It also takes T `FOR SHARE` (`CodeTypeRepository.lockActiveForShare`, `code-type.repository.ts:235`), as the
codes write does, so the liveness check and the write see the same row.

### 2.10 Baseline capture of a code-sourced plan

- **0.103.1 fails today.** It writes `swimlaneSnapshotLevel: 'FULL'` and the plan's source, but no type
  (`baseline.repository.ts:257-259`; the source is read at `baselines.service.ts:201-208`). For an
  `ACTIVITY_CODE` plan, `ck_baselines_swimlane_snapshot_shape` refuses that row with 23514 (probe P6;
  migration B `:376`). M4 must fix this before any plan can hold the source, or the journey's "take a
  baseline of the code-sourced plan" step fails.
- **What M4's capture writes:**
  - `baselines.swimlane_code_type_id` = the plan's pointer, read with the other mirrors under the lock
    (`baselines.service.ts:201-208` gains it).
  - `baselines.code_snapshot_level = 'SWIMLANE_TYPE'` on **every** capture, whatever the source. The
    landed docblock says so (`schema.prisma:2384-2389`), and probe P8 shows a MANUAL plan's capture with
    `SWIMLANE_TYPE` is admitted. Under any source but `ACTIVITY_CODE`, the three activity columns are NULL
    and that is complete.
  - `baseline_activities.code_value_id`, on each row of an `ACTIVITY_CODE` plan: the activity's stored
    assignment of T, **verbatim**, even if that value is soft-deleted. That is the docblock's contract
    (`schema.prisma:2696-2706`): facts, not a rule's answer.
  - `baseline_activities.code_lane_index` and `.code_lane_updated_at`, on the same rows: the
    `code_swimlane_lanes` row for T and that value (or for T and no value), or both NULL
    (`ck_baseline_activities_code_lane_pair`).
  - Probe P7: that row shape is admitted.
- **Read shape:** two statements under the existing plan lock and activity row locks
  (`baselines.service.ts:136-142`): T's assignments with the type filter alone (Q3b, about 4 ms) and T's
  lanes for the plan (Q5, about 3 ms), joined in memory. A single three-way join with
  `IS NOT DISTINCT FROM` measured 19–22 ms with the plan predicate and 9.5–10.3 ms without it. Both are
  acceptable inside a capture. The two-statement form is the cheapest and matches `m2-record.md` §4's
  2.6–4.4 ms per read.
- **For the spec (ghosts):** because the value is frozen verbatim, a ghost whose frozen value is not live
  today draws in "No <type>", and its frozen lane belongs to the frozen value's swimlane, not to "No
  <type>". The ghost projection must then treat that lane as absent and derive one. This is the one place
  where verbatim freezing and the live display rule part, and the spec should say it.

### 2.11 Cascade, restore, expiry and import compensation with a code-sourced plan

All landed in M2 and need no M4 change:

- **Expiry** clears the pointer before deleting types, and deletes code lanes and assignments by plan
  before activities (`hierarchy-expiry.runner.ts:156`, `:159`, `:221-231`). E2e: `hierarchy-expiry.e2e-spec.ts:279-319`.
- **Compensation** does the same (`interchange.service.ts:1679-1690`). E2e: `interchange.e2e-spec.ts:696-736`.
- **Cascade and restore** stamp and restore types and values with the plan's batch. The pointer survives a
  delete and restore of its plan (`hierarchy-lifecycle.service.ts:386-397`; `code-cascade.e2e-spec.ts:233-241`).
  The pointer can name a soft-deleted type only while its plan is in the same delete batch, and a batch
  restore brings both back together.
- **No import can set the source in M4.** The import graph admits only `NONE | MANUAL | WBS`
  (`packages/interchange/src/import-graph.ts:311`). M5 adds the import choice.

Each of these e2e tests writes the pointer directly with Prisma (`codes.e2e-spec.ts:866`). M4 adds one case
per path that sets the source through the real plan PATCH, so the switch and the lifecycle meet.

### 2.12 Organisation export

No change and no format bump. Format `2.3` already lists `ACTIVITY_CODE` for `plans.swimlaneSource` and
`baselines.swimlaneSource`, `plans.swimlaneCodeTypeId`, `baselines.codeSnapshotLevel` and the three
`baseline-activities` columns (`docs/ORGANISATION_EXPORT_FORMAT.md:218`, `:238-239`, `:404`, `:626-627`,
`:673`; `export-columns.ts:252-255`, `:509-512`, `:566`, `:1074`). M4 makes those values reachable, which is
what they were added for. The census (`export-census.structural.spec.ts`) has nothing new to classify.

### 2.13 Indexes

None is added. Every M4 statement above is served by an existing index: the membership and capture reads
by `idx_code_value_assignments_type_value`; the lane reads and the upsert arbiter by
`uq_code_swimlane_lanes_basis`; the in-use count by `uq_code_values_type_short_code`; the pointer check on a
type delete by `plans_pkey` (`m2-record.md` §10).

---

## 3. Lock order for each M4 write

All of these keep database-design §15 "Lock order" (plan advisory lock → activities in id order `FOR NO KEY
UPDATE` → code types → code values in id order `FOR SHARE`; history last). They also keep the existing
plan-then-calendar order (`activities.service.ts:479-481`, `:779-785`). The pen check
(`PlanEditLockService.assertHoldsPen`, `plan-lock.service.ts:277-300`) is a plain read before the
transaction and takes no database lock.

### 3.1 The source switch (plan PATCH carrying `swimlaneSource` or `swimlaneCodeTypeId`)

0. Pen check, before the transaction (as today, `plans.service.ts:242`).
1. **Plan advisory lock** (`acquirePlanWriteLock`). This is new on this route, taken whenever the request
   carries either swimlane field, and as the transaction's first statement.
2. The calendar lock, only when the same PATCH assigns a calendar (`assertCalendarUsableBy`, today the first
   statement at `plans.service.ts:274-288`). It moves to **after** the plan lock, to keep plan → calendar.
3. Re-read the plan live under the lock (a plain read, the activity-create precedent at
   `activities.service.ts:485`).
4. When the target is `ACTIVITY_CODE`: T `FOR SHARE`, live and of this plan (`code-type.repository.ts:235`),
   then the values-in-use count (§2.2).
5. The version-gated plan `UPDATE` (`plan.repository.ts:194-197`).

No activity row is locked. That is why the switch cannot deadlock with the positions batch (activities →
plan `FOR SHARE`). The switch never holds the plan row while waiting for the advisory lock, so it cannot
deadlock with the codes write (advisory lock → activities) either.

### 3.2 The codes write with lanes (`PATCH …/activities/codes`; also Move to swimlane)

The existing order (`activity-codes.service.ts:111-199`), with the lane upsert slotted in:

1. Plan advisory lock.
2. Plan re-read. This now supplies the source and the type, which stay stable because the switch takes the
   same lock.
3. Activities in id order, `FOR NO KEY UPDATE`.
4. Types `FOR SHARE`.
5. Values `FOR SHARE`.
6. Assignment upsert and delete.
7. **Code lane upsert.**
8. Version bump.
9. History lock, last.

### 3.3 The positions batch under a code source

The existing order (`activities.service.ts:1092-1171`), unchanged in shape:

1. Activities in id order, `FOR NO KEY UPDATE`.
2. Plan `FOR SHARE`, now also returning the type.
3. Assignment and value reads (no lock).
4. Activities `UPDATE`.
5. Code lane upsert.
6. History.

It still takes **no** plan advisory lock, as today. The capture's comment relies on that
(`baselines.service.ts:137-141`).

### 3.4 Baseline capture

The existing order (`baselines.service.ts:135-142`):

1. Plan advisory lock.
2. Plan activities in id order.
3. Reads, including the pointer and T's assignments and lanes (§2.10).
4. Inserts.

Codes writes are excluded by the advisory lock and positions batches by the activity locks, so the frozen
codes and the frozen activities describe one moment.

### 3.5 Type delete, value delete, restores and cascade

Unchanged:

- Type delete: plan advisory lock, then the type `FOR NO KEY UPDATE` (`code-types.service.ts:249-258`).
- Restores: ancestors `FOR SHARE` top-down, then the plan advisory lock (`code-types.service.ts:322-337`).
  No restore takes the plan row, so the switch's plan → plan-row order cannot cycle with it.
- Cascade: the plan advisory lock, then activities (`hierarchy-lifecycle.service.ts:248-250`).

No calendar lock is involved in any code path (ADR-0201 untouched).

---

## 4. Rollback

### 4.1 What api 0.103.1 does with a plan whose source is `ACTIVITY_CODE`

Api 0.103.1 was generated from a schema that already holds the enum label (migration A, released in api
0.102.2, `apps/api/CHANGELOG.md:37`) and the pointer column (migration B, released in 0.103.0, `:19`), so
its Prisma client decodes both. Read path by path:

| Path in 0.103.1                                                                                          | Behaviour                                                                                                                          | Evidence                                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Read the plan, list plans                                                                                | **works**: the enum value is in its client; the response echoes the source and omits the type                                      | `schema.prisma:727-736` (as of 0.102.2); `plan-response.dto.ts:107-114`, `:188-189`                                                |
| Change the swimlane source (any target)                                                                  | **fails, 500**: writes source and level, leaves the type set, refused 23514                                                        | `plans.service.ts:238-261`; probe P4; no filter maps 23514 (`common/filters`)                                                      |
| Set the source to `ACTIVITY_CODE`                                                                        | refused 422 by the DTO                                                                                                             | `update-plan.dto.ts:35`, `:208`                                                                                                    |
| Capture a baseline                                                                                       | **fails, 500**: `FULL` + `ACTIVITY_CODE` with no type, refused 23514                                                               | `baseline.repository.ts:257-259`; probe P6                                                                                         |
| Positions batch with in-swimlane rows                                                                    | **fails, 500**: `deriveLaneBasis` throws a plain `Error`. Web 0.200.3 never sends such rows for this plan (below); an M4 web would | `swimlane-lanes.ts:118-124`; `activities.service.ts:1151`                                                                          |
| Codes write, type delete (refuses the source type), value delete, restore, cascade, expiry, compensation | **work**                                                                                                                           | `activity-codes.service.ts`; `code-types.service.ts:251`; `hierarchy-expiry.runner.ts:221-231`; `interchange.service.ts:1684-1690` |
| Guest view                                                                                               | works, shows no swimlanes                                                                                                          | `share-guest.service.ts:180-189`                                                                                                   |
| XER / MSPDI export                                                                                       | works, writes the source as NONE                                                                                                   | `export.service.ts:258-261`                                                                                                        |
| Organisation export                                                                                      | works (format 2.3 lists the value)                                                                                                 | `export-columns.ts:252-255`                                                                                                        |
| A baseline whose frozen source is `ACTIVITY_CODE`                                                        | **works**: no baseline reader switches on the frozen source, and the response does not carry it                                    | `revision-*.ts` (searched: no `'MANUAL'`/`'WBS'` case); `baseline-response.dto.ts:87`, `:111`                                      |

**Web 0.200.3** (the matching web image) types the value (`packages/types/src/index.ts:213`):

- It draws **no swimlanes** for this plan: `swimlanePictureOn` is true only for MANUAL and WBS
  (`use-swimlane-scene.ts:33-35`), so the scene input is null and nothing is pending (`:105-122`).
- The Swimlanes toggle still reads as on (`swimlanesShown`, `use-tsld-canvas-ui-state.ts:211-213`), and
  "set up" reads false (`use-tsld-toolbar-context.tsx:733-735`).
- Setting up hand-made swimlanes calls `setManualSource` (`SwimlaneSetupDialog.tsx:132`), which hits the
  500 in the second row of the table.

So: **nothing is unreadable and nothing is lost**, but the plan is stuck. Its source cannot be changed, it
cannot be baselined, and it shows no swimlanes.

### 4.2 By rollback target

| Target image                   | Plans with `ACTIVITY_CODE`                                                                                                                    | Baselines frozen with `ACTIVITY_CODE`                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| api 0.103.x (M4's previous)    | readable; stuck as §4.1. **Reset recommended**                                                                                                | harmless                                                                                                                        |
| api 0.102.2 (migration A only) | as 0.103.x, and its expiry fails 23503 on plans holding code rows (design §13; it does not know the four tables)                              | harmless: its client has the label                                                                                              |
| api ≤ 0.102.1 (pre-codes)      | **unreadable** per design §13 (its client lacks the label). Not probed here, because Prisma is not installed in this checkout. Reset required | **no clean rollback**: the frozen value must not be rewritten (ADR-0025). Roll forward, or restore the ADR-0192 pre-update copy |

So design §13's "once a baseline froze that source there is no clean rollback", and the existing
`docs/DEPLOYMENT.md` bullets "cannot read that plan's row" and "no clean rollback", hold **only for targets
before api 0.102.2**. For M4's real previous image they overstate the damage. M4's PR corrects that section
rather than adding a second one.

### 4.3 Draft text for `docs/DEPLOYMENT.md`

To replace the two bullets beginning "Once any plan's swimlanes come from a code" and "Once a baseline has
been captured on such a plan" in "Rolling back past the P6 activity codes release":

> - **Once any plan's swimlanes come from a code (`swimlane_source = 'ACTIVITY_CODE'`), what breaks
>   depends on how far back you go.** Find out first; if this answers 0, nothing below applies:
>
>   ```sh
>   docker compose exec -T db psql -U <user> -d <db> -At -c "SELECT count(*) FROM plans WHERE swimlane_source = 'ACTIVITY_CODE';"
>   ```
>
>   - **Back to api 0.103.x or 0.102.2** (the images that already know the value): such a plan still
>     opens, but it shows no swimlanes. Choosing another swimlane source for it, and capturing a baseline
>     of it, both fail with a server error, because those images do not clear the plan's code type.
>   - **Back to api 0.102.1 or earlier**: those images cannot read such a plan at all, which breaks it and
>     any list that loads it.
>
>   In both cases, with the API **and** web containers stopped (roll both images back together: a newer web
>   sends in-swimlane lane writes that the older API answers with a server error), save the list of plans and
>   their code types, then reset them:
>
>   ```sh
>   docker compose exec -T db psql -U <user> -d <db> -v ON_ERROR_STOP=1 \
>     -c "COPY (SELECT id, swimlane_code_type_id FROM plans WHERE swimlane_source = 'ACTIVITY_CODE') TO STDOUT WITH CSV HEADER" \
>     > p6-code-swimlanes-$(date -u +%Y%m%dT%H%MZ).csv
>   docker compose exec -T db psql -U <user> -d <db> -v ON_ERROR_STOP=1 -c "UPDATE plans SET swimlane_source = 'NONE', swimlane_code_type_id = NULL, version = version + 1, updated_at = now() WHERE swimlane_source = 'ACTIVITY_CODE';"
>   ```
>
>   The `UPDATE` reports how many plans it reset; it must equal the count above. `version` is raised so an
>   editor that still holds the old plan is told to refresh rather than overwriting it. Then pin the previous
>   `API_IMAGE_TAG` and `WEB_IMAGE_TAG` and `docker compose up -d`. What is kept: every code type, value and
>   assignment, and every code swimlane lane (`code_swimlane_lanes` is not touched), so after rolling forward
>   a planner chooses **Swimlanes… ▸ By code** again for each plan in the saved file and the bars return to
>   the lanes they had. What is lost: only the choice itself, until it is made again. The reset writes no
>   audit row (a swimlane source is not a governance setting), so note it where the host's changes are
>   recorded.
>
> - **Baselines are never edited by this procedure.** A baseline captured on such a plan keeps
>   `swimlane_source = 'ACTIVITY_CODE'`, which api 0.102.2 and later read without trouble. **Going back to
>   api 0.102.1 or earlier once such a baseline exists has no clean route**: those images cannot read it,
>   and rewriting it would falsify a snapshot (ADR-0025). Check with
>   `SELECT count(*) FROM baselines WHERE swimlane_source = 'ACTIVITY_CODE';` (deleted baselines included,
>   because they come back on restore). If it is not 0, roll forward instead or, as a last resort, restore
>   the pre-update copy the backup service made before migrating (ADR-0192,
>   `docs/guides/back-up-and-restore.md`), which loses everything written since.

The bullets on the rolling-deploy lock, on "before anybody uses a code" and on not dropping tables stay as
they are. The expiry bullet already names the pre-codes image. devops-reviewer reviews the text (plan.md
"Agents").

---

## 5. What the builder must know

- **Pins that do NOT move** (no schema change):
  - `clearActivityTree` stays at 9 children (`m2-record.md` §8).
  - `clearBaselineTree` stays at 5.
  - `clearPlanTree` already clears the pointer first (`clear-plan-tree.e2e-spec.ts:50-75`).
  - `pnpm check:counts`: 42 models.
  - Export format stays `2.3`.
- **Statement-count pins** (`activity-history-statements.e2e-spec.ts:47-94`) are measured on plans whose
  source is NONE, and none of them covers the codes write or the positions batch. They stay where they are
  **if** every new statement is gated on the source being `ACTIVITY_CODE`. Widening `lockPlanSwimlaneSource`'s
  `SELECT` adds a column, not a statement. A new unconditional read on the activity PATCH path would move
  `OWN_ACTIVITY_PATCH` (6), and that is the signal it was not gated.
- **`schedule-inputs.structural.spec.ts:72-83`:** delete `swimlaneCodeTypeId` from `classifiedAheadOfDto`
  when `UpdatePlanDto` admits it. The `not.toContain` at `:78` fails otherwise, by design. If the array is
  then empty, remove it and its comment.
- **`PLAN_FIELD_CLASS`:** `swimlaneCodeTypeId: 'NOT_INPUT'` is already in place
  (`schedule-input-fields.ts:75`), so a switch never stamps `schedule_inputs_changed_at`
  (`plans.service.ts:303`). It is not a governance field (`plan-governance-fields.ts:24-39`), so the switch
  writes no `plan.settings_changed` row, as today for source and level.
- **DTO and response:**
  - `WRITABLE_SWIMLANE_SOURCES` gains `ACTIVITY_CODE` (`update-plan.dto.ts:29-36`, and its docblock).
  - `UpdatePlanDto` gains `swimlaneCodeTypeId?: string | null`, validated with `UUID_REGEX` (`:26`).
  - `PlanResponseDto` gains `swimlaneCodeTypeId`, and its `swimlaneSource` description drops "NONE, MANUAL
    or WBS" (`plan-response.dto.ts:111`).
  - `swimlane-enums.spec.ts` is unchanged.
- **Comments that become false at M4:** `plan.repository.ts:51-55` ("No write path sets it yet"),
  `schema.prisma:731-733` (`ACTIVITY_CODE` "NO row can hold it"), `swimlane-lanes.ts:118-124`,
  `update-plan.dto.ts:29-34`, `SwimlaneSourceFields.tsx:14`, and `codes.e2e-spec.ts:866`. They are not
  schema, but they are claims (ADR-0076).
- **ADR-0172 gate:** raw SQL must state `deleted_at` on `activities` and `code_values`
  (`soft-delete-filter.structural.spec.ts:576-610`). Any new `// soft-delete: any-state` declaration
  updates the running tally comment at `:1843`. `code_swimlane_lanes` and `code_value_assignments` carry no
  `deleted_at` and are outside the gate.
- **D-P1 gate:** write `swimlaneCodeTypeId` and every lane column as scalars
  (`nested-relation-writes.structural.spec.ts`).
- **Guards:** the switch stays behind `plan:update` plus the pen (`plans.service.ts:195`, `:242`). Every
  lookup of T is scoped by organisation and plan. A foreign or deleted T is a 404 or 422 from the service,
  never the 23503 or 23514 from the database. The membership route takes `code:read` and the plan's org
  scope, as the other codes reads do.
- **The plan lock adds a wait to the switch:** it now queues behind a recalculation or a codes write on the
  same plan. That is the price of DB-3 and it is deliberate. A test pins the lock on the switch
  (`code-cascade.e2e-spec.ts` already drives a held plan lock against codes writes; the same harness covers
  a switch held against a type delete).

---

## 6. Risks the spec must carry

1. **Values in use can pass 100 after the switch.** The rule is checked when the source is switched only.
   Assigning a new value, restoring a value or an activity, or pasting can then take the source type past
   100 swimlanes, up to its 1,000 live values. The database cannot count. The spec decides between two
   options:
   - (a) The codes write refuses a value that would take the **source** type over 100 in use. This is a
     service count under the plan lock the write already holds, about 8 ms (§2.2), paid only when the write
     touches the source type. Activity and value restores would still slip past it.
   - (b) The projection draws whatever is in use and states that it went over.

   Recommendation: (a), plus a stated residual for restores.

2. **Ghost lanes under a since-deleted frozen value** (§2.10, last bullet): derive, do not trust, the frozen
   lane when the frozen value is not live.
3. **The membership query shape is a performance requirement** (§2.3). A review should reject the design
   §9.2 shape. M4-T1 records the endpoint's p95 in an `m4-record.md` with the M2/M3 harness.
4. **Rollback stuck-state** (§4.1). The runbook is the mitigation, and M4's PR carries the correction
   (plan.md "Rollback window").
5. **Lock wait on the switch** (§5, last bullet). Acceptable, stated.

---

## 7. Not measured or not probed

- Prisma's behaviour on an enum value its client lacks (§4.2, the ≤ 0.102.1 row). It comes from design §13
  and is unprobed here, because Prisma is not installed in this checkout.
- The code lane upsert at 2,000 rows (§2.4), and the membership endpoint end to end over HTTP. Both are owed
  in M4-T1.
- `postgres:17-alpine` and the deployed host. Every figure here is the shared PostgreSQL 16.15 container.

## 8. Method

- **Database:** a scratch database `m4probe` on the local PostgreSQL 16.15, built by `psql -f` of all 81
  `apps/api/prisma/migrations/*/migration.sql` in order (42 tables), and dropped afterwards.
- **Seed:**
  - 10 plans of 5,000 activities (5 % soft-deleted).
  - 30 types per plan, 50 values per type (one soft-deleted).
  - Every activity carrying every type: 1,500,000 assignments.
  - 15,000 code lanes per plan, on three types, one of them all "no value": 150,000 in all.
  - v4 ids, `ANALYZE`d.
- **Timings:** a plpgsql loop of 15 executions per shape, `clock_timestamp()` deltas, median and maximum,
  three runs. Every selected column was read through `count(s.*)`: an earlier run with `count(*)` let the
  planner remove a LEFT JOIN onto a unique key and was discarded. `EXPLAIN (ANALYZE, BUFFERS)` gave the
  plans quoted in §2.3.
- **Probes:** P1–P13, each in its own transaction, rolled back.
- **Race:** two concurrent `psql` sessions, as described in §2.9.
