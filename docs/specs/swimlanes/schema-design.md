# Schema design: labelled swimlanes

- **Status:** Approved with the spec (2026-10-22, SQ-7 yes: the baseline columns are in), design only. Nothing in `apps/api/prisma/` is changed by this document.
- **Author:** database-architect agent, for the swimlanes spec (`./feature-spec.md` §4.11).
- **Date:** 2026-10-22
- **Base:** `origin/main` 9788f1f. Every `file:line` below was read on that tree. Every
  behavioural claim marked **(probed)** was run against a scratch database on the local
  PostgreSQL 16.15 (`C.UTF-8`, libc provider) and Prisma 6.19.3; the database was dropped after.
- **Implements:** plan task M1-T1 (`./implementation-plan.md`, "Feature: schema").
- **Amended 2026-10-23 at landing** (migration `20261023120000_swimlanes`, whose header carries
  the measurements), by the database-architect agent, approved by the coordinator:
  1. §3.2 and §3.5: the level branches of both CHECKs gain `IS NOT NULL AND`. As first written they
     admitted a NULL level (probed: `UPDATE 1`), against their own stated invariant.
  2. §3.3: without `idx_activities_swimlane_id_fk` the RESTRICT check does not scan the table; it
     falls back to the plan composite. The index still pays 3.5–5× and stays.
  3. §3.4: the Organization back-relation to `ActivitySwimlaneLane` is `swimlaneLanes`.
  4. §4 Q6: `LANE_ROWS_PER_ACTIVITY = 2`, with its measurement.

---

## 1. Summary

Two new models, one new column on `activities`, two on `plans`, two new enums, one migration.
No backfill, no contract step, no data-dependent statement.

| Object                     | What it holds                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| `swimlanes` (new)          | a plan's hand-made swimlanes: name, order, lifecycle               |
| `activity_swimlane_lanes`  | an activity's lane **per basis** it has been placed against        |
| `activities.swimlane_id`   | hand-made membership (nullable, composite FK, same plan by the DB) |
| `plans.swimlane_source`    | `NONE` / `MANUAL` / `WBS`, default `NONE`                          |
| `plans.swimlane_wbs_level` | 1 to 3 when the source is `WBS`, NULL otherwise                    |

**The one place this departs from the spec's data list (§4.11 item 2).** The spec asks for one
in-swimlane lane and one basis _on the activity_. A single slot cannot keep three promises the
spec makes, because the spec's own materialise-on-write rule overwrites it. §2 shows why, and
§3.4 replaces the slot with a keyed table, so each basis keeps its own lane. Everything else in
§4.11 is designed as asked.

---

## 2. Why a single lane slot on the activity cannot work

The spec (§4.4) stores one `swimlaneLaneIndex` plus "the swimlane it was written against", and
promises: "Moving it back, switching back, or restoring the swimlane brings the exact old lane
back with no write." It also requires the first write into a swimlane to write **every unplaced
member** of that swimlane (§4.4 "Materialise on write"), and setup to write "the initial
in-swimlane lanes for every activity" (§2 Workflows, Setup). Traced through a single slot:

1. **Switching source and back.** MANUAL to WBS runs setup, which writes every activity's slot
   against its WBS basis. The MANUAL lanes are now gone. Switching back finds every basis
   mismatched and re-derives the whole manual layout. §4.6 "Switching source … keeps
   everything" is false.
2. **Delete a swimlane, then restore it.** Its members fall into "No swimlane" with a
   mismatched basis. The next write into "No swimlane" materialises them there, overwriting
   their slot. Restore then finds a mismatch. §4.7 "restore brings them back as it was" is
   false after any intervening write into "No swimlane", which is the likely case.
3. **WBS move and back.** §4.6 has the client write the nearest free lane in the new swimlane
   "in the same write as the move", which overwrites the old one.

So the promise holds only while nothing else is written, and these flows always write something.
Either the promises go, or each basis keeps its own lane. This design keeps the promises: **one
row per (activity, basis)** in `activity_swimlane_lanes` (§3.4). "Never placed against this
basis" is then the **absence of a row**, which is not a sentinel (ADR-0139).

The narrower alternative (three columns on `activities`, plus the four-way basis in §3.4 on the
activity row) is costed in §11 A, together with the spec sentences it would make false.

---

## 3. The schema

### 3.1 Enums (new, no `@@map`, per `docs/DATABASE.md:33-39`)

```prisma
/// Where a plan's swimlanes come from (swimlanes spec §4.6). MUST stay in lock-step with the
/// `SwimlaneSource` union in @repo/types.
enum SwimlaneSource {
  NONE
  MANUAL
  WBS
}

/// What an activity's in-swimlane lane was written against (spec §4.4, "lane basis").
/// Each label pins which basis columns are set, by the fail-closed
/// ck_activity_swimlane_lanes_basis_shape.
enum SwimlaneLaneBasis {
  /// a hand-made swimlane (swimlane_id set)
  SWIMLANE
  /// "No swimlane" while the source is MANUAL (nothing set)
  NO_SWIMLANE
  /// one WBS group: the swimlane of WBS_SUMMARY summary_activity_id (summary_activity_id set)
  WBS_SUMMARY
  /// "No swimlane" while the source is WBS at wbs_level (wbs_level set)
  NO_WBS_SUMMARY
}
```

Both are created in the same migration that first uses them. `CREATE TYPE` plus use in one
transaction is legal; only `ALTER TYPE … ADD VALUE` plus use is not. That is the precedent in the
`ActivityHistoryScope` docblock (`schema.prisma:3614-3618`). One migration, not two.

### 3.2 `plans`: two columns

```prisma
  swimlaneSource   SwimlaneSource @default(NONE) @map("swimlane_source")
  swimlaneWbsLevel Int?           @map("swimlane_wbs_level") @db.SmallInt
```

- `NOT NULL DEFAULT 'NONE'` is true of every existing plan: none has swimlanes. On PostgreSQL
  11+ this is a metadata-only `ADD COLUMN`, so there is no rewrite and no backfill.
- `ck_plans_swimlane_source_level`, fail-closed (raw SQL):

  ```sql
  CHECK (CASE swimlane_source
           WHEN 'NONE'   THEN swimlane_wbs_level IS NULL
           WHEN 'MANUAL' THEN swimlane_wbs_level IS NULL
           WHEN 'WBS'    THEN swimlane_wbs_level IS NOT NULL
                              AND swimlane_wbs_level BETWEEN 1 AND 3
           ELSE false END)
  ```

  This is spec §2 Validation verbatim ("Required when the source is `WBS` and absent
  otherwise"). A fourth source added later is rejected until it gets a branch. The `IS NOT NULL`
  is load-bearing: `NULL BETWEEN 1 AND 3` is NULL and a CHECK admits NULL, so without it
  `('WBS', NULL)` passes (the amendment note at the top).

- No index. The columns are read with their own plan row and never filtered across plans (the
  `scheduleComputedAt` precedent, `schema.prisma:910-921`).
- Both are `NOT_INPUT` in `PLAN_FIELD_CLASS` (`schedule-input-fields.ts:54-71`). A source write
  must not stamp `schedule_inputs_changed_at`, and it will not, because the classification is the
  observer (`:14-19`).
- A source change goes through the plan PATCH and bumps `plans.version`. A concurrent plan
  settings save therefore 409s. That is acceptable under the pen. The alternative, a separate
  settings row, is not worth a table.

### 3.3 `activities`: one column, and the database enforces the same plan

```prisma
  // Hand-made swimlane membership (swimlanes spec §4.6). NULL = "No swimlane". Kept, and
  // ignored, while the plan's source is WBS or NONE, so switching back restores it. May name a
  // SOFT-DELETED swimlane: that is how a deleted swimlane's members come back on restore.
  swimlaneId String? @map("swimlane_id") @db.Uuid

  swimlane Swimlane? @relation(fields: [planId, swimlaneId], references: [planId, id],
                               onDelete: Restrict, onUpdate: Restrict)
```

**A composite foreign key `(plan_id, swimlane_id) → swimlanes (plan_id, id)`.** This makes the
spec's same-plan invariant (§2 Permissions) a database guarantee rather than a service-only one.
Today's single-column FKs cannot do that; the schema says so itself for `calendar_id`
(`schema.prisma:1108-1110`) and for `parent_id` (`:1254-1260`).

- **(probed)** `prisma validate` accepts an optional composite relation whose fields mix the
  required `planId` with the optional `swimlaneId`. `migrate diff` emits `FOREIGN KEY ("plan_id",
"swimlane_id") REFERENCES "Swimlane"("plan_id", "id")`. In PostgreSQL, an activity in plan B
  naming plan A's swimlane is refused with `23503`, and a NULL `swimlane_id` is admitted
  (`MATCH SIMPLE`).
- **`onUpdate: Restrict`, not Prisma's default `CASCADE`.** `plan_id` is part of the key, so a
  cascading update of `swimlanes.plan_id` would rewrite `activities.plan_id`, moving activities
  between plans as a side effect. Swimlane ids and plans never change, so `Restrict` costs
  nothing and removes the possibility.
- `onDelete: Restrict` follows the house rule (`docs/DATABASE.md:248-249`). Swimlanes are hard
  deleted only by plan expiry and import compensation. Both delete activities first (§6).
- **Index: `idx_activities_swimlane_id_fk (swimlane_id) WHERE swimlane_id IS NOT NULL`**, raw SQL
  and not declared (TECH_DEBT #54). It exists **only** to back the RESTRICT check that runs when
  expiry hard-deletes swimlane rows. The check's generated query is `plan_id = $1 AND
swimlane_id = $2`, which implies the predicate. Without the index the check does **not** scan
  the table, as this said before landing (the amendment note at the top): the key contains `plan_id`, so it falls back to
  `activities_plan_id_created_at_id_idx` and walks the plan's just-deleted entries (EXPLAIN
  ANALYZE, generic plan). Measured: 100 swimlanes of a 2,000-activity plan delete in 33–48 ms
  without the index against 9.2 ms with it, 3.5–5×, so the index stays. It is partial, so only
  assigned activities are in it. There is no other query: membership is read with the
  plan-scoped activity load (spec §4.11 Q4).
- `ACTIVITY_FIELD_CLASS`: `swimlaneId: 'NOT_INPUT'`. It is absent from `ENGINE_ACTIVITY_SELECT`.

### 3.4 `swimlanes` (new)

```prisma
/// A hand-made swimlane: a labelled, contiguous run of lanes on a plan's diagram (swimlanes
/// spec §0). Plan content, like a note: soft-deleted on its own, swept into its plan's
/// delete_batch_id by the plan cascade, hard-deleted only with its plan (ADR-0096 expiry) or by
/// import compensation. Never listed in Recently deleted. Not a scheduling input.
///
/// Raw-SQL objects (migration only, Prisma cannot express them): uq_swimlanes_plan_name
/// (plan_id, lower(name)) WHERE deleted_at IS NULL; idx_swimlanes_delete_batch_id;
/// ck_swimlanes_name_shape; ck_swimlanes_position_nonneg.
model Swimlane {
  id             String    @id @default(uuid(7)) @db.Uuid
  // Denormalised from the plan inside the create transaction, never client input. RESTRICT.
  organizationId String    @map("organization_id") @db.Uuid
  planId         String    @map("plan_id") @db.Uuid
  name           String
  // Order key, read as ORDER BY position, id. Deliberately NOT unique (see Q1).
  position       Int
  version        Int       @default(1)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  createdBy      String?   @map("created_by")
  updatedBy      String?   @map("updated_by")
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(3)
  deleteBatchId  String?   @map("delete_batch_id") @db.Uuid

  organization Organization          @relation(fields: [organizationId], references: [id],
                                               onDelete: Restrict)
  plan         Plan                  @relation(fields: [planId], references: [id],
                                               onDelete: Restrict)
  members      Activity[]
  lanes        ActivitySwimlaneLane[]

  // The composite FK target for activities (plan_id, swimlane_id). Its leftmost prefix also
  // backs the plan_id FK, the plan's swimlane list, the cascade sweep and the expiry delete,
  // so there is no separate (plan_id) index.
  @@unique([planId, id], map: "uq_swimlanes_plan_id_id")
  @@index([organizationId])
  @@map("swimlanes")
}
```

`Plan` gains `swimlanes Swimlane[]`, `Organization` gains `swimlanes` and `swimlaneLanes` (the
latter so named that `prisma format` does not realign the whole block), and `Activity` gains
`swimlaneLanes` plus a second, named back-relation (`summaryLanes`) for `summary_activity_id`.

**Constraints (raw SQL):**

- `ck_swimlanes_name_shape`: `char_length(name) BETWEEN 1 AND 80 AND name = btrim(name) AND name
!~ '[[:cntrl:]]'`. This backstops spec §2's validation in the database. The DTO trims first,
  so the CHECK guards rather than rejects ordinary input (the `ck_notes_body_length` shape). It
  matters because XER import (spec §4.8) writes names from hostile files.
- `ck_swimlanes_position_nonneg`: `position >= 0`.
- The cap of 100 active swimlanes per plan is a service check under the plan advisory lock (§5).
  A CHECK cannot count rows, and a trigger would be logic in the database
  (`docs/DATABASE.md:204-205`).

### 3.5 `activity_swimlane_lanes` (new)

```prisma
/// An activity's lane inside one swimlane, kept per BASIS so that switching source, moving
/// between swimlanes and restoring a deleted swimlane each return the exact lane last written
/// there (swimlanes schema-design §2). The absence of a row for the activity's current basis
/// means "never placed there": the projection derives a lane.
///
/// Departures from the house template, each deliberate (the ActivityHistoryEntry precedent):
/// 1. No `version`: no client writes a row directly. Rows are written only inside an activity
///    write that holds the activity row lock (id order) and bumps activities.version, so the
///    activity's version is the optimistic lock for its lanes.
/// 2. No `deleted_at` / `delete_batch_id`: a row lives exactly as long as its activity.
///    Soft-deleting the activity leaves its rows, so restore needs nothing.
/// 3. No `created_by` / `updated_by`: the activity row's `updated_by` records the writer.
///
/// Raw SQL (migration only): ck_activity_swimlane_lanes_basis_shape (fail-closed CASE),
/// ck_activity_swimlane_lanes_lane_index_nonneg, the two partial FK-check indexes, and the
/// NULLS NOT DISTINCT clause on the unique index below (Prisma cannot express it).
model ActivitySwimlaneLane {
  id                String            @id @default(uuid(7)) @db.Uuid
  // Copied from the activity inside the write, never from the request.
  organizationId    String            @map("organization_id") @db.Uuid
  activityId        String            @map("activity_id") @db.Uuid
  basis             SwimlaneLaneBasis
  swimlaneId        String?           @map("swimlane_id") @db.Uuid
  summaryActivityId String?           @map("summary_activity_id") @db.Uuid
  wbsLevel          Int?              @map("wbs_level") @db.SmallInt
  laneIndex         Int               @map("lane_index")
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  // Also the tie-break when two placed members of one basis collide (§4 Q3, last paragraph).
  updatedAt         DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id],
                                      onDelete: Restrict)
  activity     Activity     @relation("ActivitySwimlaneLanes", fields: [activityId],
                                      references: [id], onDelete: Restrict)
  swimlane     Swimlane?    @relation(fields: [swimlaneId], references: [id], onDelete: Restrict)
  summary      Activity?    @relation("ActivitySwimlaneSummaryLanes",
                                      fields: [summaryActivityId], references: [id],
                                      onDelete: Restrict)

  // DECLARED as a plain unique so prisma:check-drift stays empty. The migration adds NULLS NOT
  // DISTINCT, which Prisma 6 cannot express and does not compare (probed, §8.2). One index:
  // the one-row-per-basis guarantee, the INSERT … ON CONFLICT arbiter, the activity_id FK
  // RESTRICT check (leftmost prefix, no predicate) and the "lanes of these activities" load.
  @@unique([activityId, basis, swimlaneId, summaryActivityId, wbsLevel],
           map: "uq_activity_swimlane_lanes_basis")
  @@index([organizationId])
  @@map("activity_swimlane_lanes")
}
```

**`ck_activity_swimlane_lanes_basis_shape`**, fail-closed like `ck_notes_exactly_one_parent`:

```sql
CHECK (CASE basis
  WHEN 'SWIMLANE'       THEN swimlane_id IS NOT NULL AND summary_activity_id IS NULL
                             AND wbs_level IS NULL
  WHEN 'NO_SWIMLANE'    THEN swimlane_id IS NULL AND summary_activity_id IS NULL
                             AND wbs_level IS NULL
  WHEN 'WBS_SUMMARY'    THEN swimlane_id IS NULL AND summary_activity_id IS NOT NULL
                             AND wbs_level IS NULL
  WHEN 'NO_WBS_SUMMARY' THEN swimlane_id IS NULL AND summary_activity_id IS NULL
                             AND wbs_level IS NOT NULL AND wbs_level BETWEEN 1 AND 3
  ELSE false END)
```

`ck_activity_swimlane_lanes_lane_index_nonneg`: `lane_index >= 0`, which mirrors
`ck_activities_lane_index_nonneg` (`20260710092048_add_activities/migration.sql:63`). The
10,000 ceiling stays in the DTO, as it does for `lane_index` (`update-positions.dto.ts:20-25`).

**Raw-SQL partial indexes, each for a RESTRICT check that a hard delete fires:**

- `idx_activity_swimlane_lanes_swimlane_id_fk (swimlane_id) WHERE swimlane_id IS NOT NULL`
- `idx_activity_swimlane_lanes_summary_fk (summary_activity_id) WHERE summary_activity_id IS
NOT NULL`

**Why `WBS_SUMMARY` carries no level.** Summary X's swimlane holds X's subtree at whichever
level X is a swimlane, so the member set does not depend on the level. Switching level 2 → 1 →
2 finds the basis-X rows again. "No WBS group" does depend on the level (it is everything not
under a level-L summary), so `NO_WBS_SUMMARY` carries it.

**Bound.** Each activity has at most one row per basis it has actually been written against.
That is typically one to three: its manual swimlane, its WBS group, perhaps a "No swimlane". It
is never more than the plan's swimlanes plus summaries plus 4. Rows that name a deleted swimlane
or summary are kept on purpose, because they are what restore returns to.

### 3.6 Index register (new rows for `docs/DATABASE.md` "Indexes")

Each entry gives the index, its columns, its kind, and what it serves.

- `uq_swimlanes_plan_id_id`, `(plan_id, id)`, full unique: the composite FK target, the plan
  FK, and the list.
- `swimlanes_organization_id_idx`, `(organization_id)`, full: the org FK, IDOR loads, and the
  export `org` read.
- `uq_swimlanes_plan_name`, `(plan_id, lower(name))`, partial unique: active-name uniqueness,
  ignoring case.
- `idx_swimlanes_delete_batch_id`, `(delete_batch_id)`, partial: the plan-batch restore lookup.
- `idx_activities_swimlane_id_fk`, `(swimlane_id)`, partial: the `activities` → `swimlanes`
  RESTRICT check.
- `uq_activity_swimlane_lanes_basis`, `(activity_id, basis, swimlane_id, summary_activity_id,
wbs_level)`, unique `NULLS NOT DISTINCT`: one row per basis, the upsert arbiter, the FK
  check, and the load.
- `activity_swimlane_lanes_organization_id_idx`, `(organization_id)`, full: the org FK and the
  export `org` read.
- `idx_activity_swimlane_lanes_swimlane_id_fk`, `(swimlane_id)`, partial: the lanes →
  `swimlanes` RESTRICT check.
- `idx_activity_swimlane_lanes_summary_fk`, `(summary_activity_id)`, partial: the lanes →
  `activities` (summary) RESTRICT check.

There is no recycle-bin index: swimlanes are not listed in Recently deleted (spec §4.7). There
is no `(plan_id, position)` index: at most 100 active rows per plan are sorted in memory after a
`uq_swimlanes_plan_id_id` prefix scan.

---

## 4. Answers to Q1–Q9

**Q1. Order.** An integer `position`, read as `ORDER BY position, id`, with **no uniqueness**.

- Reorder rewrites every active swimlane's `position` to `0..n-1` in one statement, version-gated
  per row and all or nothing (spec §4.12). Create appends at `max(position)+1`. `after` shifts
  later rows by one in the same transaction and bumps their versions, because order is part of
  their state.
- **Why not unique.** A partial unique index cannot be `DEFERRABLE`, because only constraints
  can be, and a constraint cannot be partial. PostgreSQL checks a non-deferrable unique index row
  by row, so a permutation in one `UPDATE` can fail part way through. Avoiding that needs a
  two-pass offset write and a wider CHECK. More importantly, a unique position would make
  **restore fail** whenever the slot was reused meanwhile. Restore is meant to fail only on a
  name (`docs/DATABASE.md:150-155`). Without uniqueness, a restored swimlane returns to its old
  number and the `id` tie-break orders it deterministically.
- **Why not fractional or lexicographic keys.** The cap is 100 and the only writer is under the
  pen, so a dense rewrite of at most 100 narrow rows is cheap. Fractional keys add precision
  exhaustion and rebalancing in exchange for nothing here.

**Q2. Name uniqueness.** `uq_swimlanes_plan_name ON swimlanes (plan_id, lower(name)) WHERE
deleted_at IS NULL`, raw SQL.

- A soft-deleted name does **not** block reuse. Restoring onto a name taken meanwhile is a
  `409 SWIMLANE_NAME_TAKEN`, and undo sets it aside with that reason (ADR-0176, ADR-0195 "as it
  was, or not at all").
- **(probed)** `'Électrique'` then `'éLECTRIQUE'` in one plan is refused with `23505`. A
  soft-deleted `'électrique'` is admitted beside the live one.
- **(probed)** `prisma migrate diff` ignores an expression partial index, so it causes no drift.
- **This is the schema's first case-insensitive unique** (no `lower(` index in any migration;
  the only mentions are comments in `20260725140000_library_archive_lifecycle/migration.sql:102,
109`). `docs/DATABASE.md` "Indexes" gains a line for it.
- **Folding outside ASCII depends on the database collation, and production was not
  measured.** The probe ran on `C.UTF-8` under glibc. The deployed image is `postgres:17-alpine`
  (`docker-compose.yml:14`), and CI uses the same image (`.github/workflows/ci.yml:304`). So M1's
  API e2e asserts the `É`/`é` collision **on CI's database**. If that fails, the index becomes
  `lower(name COLLATE "und-x-icu")` before landing. Until it is measured, the claim is "ASCII is
  folded everywhere; non-ASCII is folded on glibc, unverified on Alpine".

**Q3. The lane basis without a sentinel.** A discriminator plus typed nullable columns, pinned by
a fail-closed CHECK, in its own table keyed by basis (§3.5). This is the `Note` pattern
(`schema.prisma:3699-3725`). "Never placed" is the absence of a row.

- Not a polymorphic bare uuid: it would lose both foreign keys.
- Not a kind plus a single id: that has the same loss.
- Not the plan id standing for "No swimlane": that is a sentinel (ADR-0139).
- **The server derives the basis; the client never sends it.** In MANUAL mode the basis comes
  from `swimlane_id`. In WBS mode it is the level-L ancestor summary, from the tree
  `findPlanWbsTree` already loads (`activity.repository.ts`, `findPlanWbsTree`), or
  `NO_WBS_SUMMARY`. A client-supplied basis that disagreed with the activity's real membership
  would be stored, and believed by the projection. The ancestor walk must be **one shared pure
  function** used by the server and by `features/swimlanes/model/membership.ts`, so the two
  cannot disagree about depth (ADR-0063 §9's one-derivation rule). `@repo/layout` is the
  natural home. A lane write while `swimlane_source = 'NONE'` is `422`.
- **What a basis cannot promise.** A matching basis does not prove the stored lane is free. An
  activity can return to swimlane X through another client, carrying a row written long ago that
  now collides with a member placed since. The projection therefore resolves a collision between
  two placed members of one basis **deterministically**: the row with the later `updated_at`
  keeps the lane and the other is treated as unplaced, then id as the last tie-break. SC-4 holds
  for every write the client makes. For server-side arrivals it holds only through this rule.
  The spec should state this (§10, D4).

**Q4. `activities.swimlane_id` FK.** Composite `(plan_id, swimlane_id) → swimlanes (plan_id,
id)`, `ON DELETE RESTRICT ON UPDATE RESTRICT` (§3.3).

- RESTRICT is the house rule. A soft-deleted swimlane is never hard-deleted while its plan
  lives, so the check fires only inside plan expiry and import compensation. Both delete
  activities first (§6).
- `SET NULL` was rejected. It would be the one FK in the hierarchy that edits rows on a hard
  delete, and the hierarchy-expiry census only sees `Restrict` and `Cascade` edges
  (`hierarchy-expiry.structural.spec.ts:178`). It would also hide a wrong delete order
  rather than fail on it.
- Index: the partial FK index only (§3.3). The spec is right that the plan-scoped load needs
  nothing more.

**Q5. CHECK constraints.**

- `ck_plans_swimlane_source_level` (§3.2).
- `ck_activity_swimlane_lanes_basis_shape` and `_lane_index_nonneg` (§3.5).
- `ck_swimlanes_name_shape` and `_position_nonneg` (§3.4).

All are fail-closed where a discriminator is involved. The in-swimlane lane `>= 0` lives on the
lanes table, not on `activities`.

**Q6. Plan expiry and its preview.**

- **Expiry: yes, two tables join the subtree.** The new to-one FKs are lanes → activities
  (twice), lanes → swimlanes, activities → swimlanes and swimlanes → plans. The DMMF census
  (`hierarchy-expiry.structural.spec.ts:153-215`, filter at `:178`) therefore **fails the
  build** until the runner deletes lanes before activities and swimlanes after activities but
  before plans. That is the gate working as designed. The new literal order is in §6.1.
- **Preview: no change, and here this disagrees with the spec.** `clear-out-preview.ts` counts
  roots, projects, plans and activities (`PreviewItem`, `:50-62`; `countActivities`, `:79`).
  It does not count notes, steps, baselines or history. Its scope comes from
  `selectExpiryCandidates`, which is plan-keyed, so it "cannot promise less than the sweep
  deletes" (`:22-23`) whatever tables a plan owns. Counting swimlanes alone would be
  inconsistent, and nothing in ADR-0193 asks for it.
- **The run budget should count lane rows.** `budgetCharge` charges activities plus history rows
  (`hierarchy-expiry.service.ts:38-43`). Lane rows are unbounded in principle (§3.5 Bound), so
  `ExpiryCounts` gains `activitySwimlaneLanes` and the charge gains `ceil(n /
LANE_ROWS_PER_ACTIVITY)`. **`LANE_ROWS_PER_ACTIVITY = 2`**, measured at landing: a lane row
  costs 10.9–11.9 µs against a history row's 5.6–6.4 µs (1.7–2.1×), so scaling the calibrated
  `HISTORY_ROWS_PER_ACTIVITY = 5` gives 2.4–2.9, and the lower, safe reading is taken.
  Swimlane rows (at most about 100 live per plan, plus deleted ones) are not charged.

**Q7. Baselines.** Not in this epic, and leaving it out makes adding it later **no harder to
build**. It does make it **permanently poorer in data**.

- **Schema cost later.** Nullable columns on `baseline_activities` (a correlation `swimlane_id`
  with no FK, the `parentId` rule at `schema.prisma:2382-2387`, plus the frozen in-swimlane lane)
  and a per-baseline level discriminator (the `revision_snapshot_level` /
  `placement_snapshot_level` pattern, `:2170`, `:2193`). All of that is additive.
- **Data cost.** A snapshot can only freeze what existed at capture, so every baseline captured
  before the follow-on lands can **never** place removed work in a swimlane. Such ghosts stay
  "counted and not drawn" for the life of the baseline (ADR-0127 D3). That is the same
  unbackfillable shape as the criticality mirror (`schema.prisma:922-955`).
- **Partly recoverable even then.** A FULL revision snapshot already freezes `parent_id`
  (`:2400`), so a **WBS-mode** membership of removed work is derivable from it. Only the lane is
  missing, and ADR-0126 forbids guessing one (`revision-ghosts.ts:32-41`). **Manual** membership
  is not recoverable at all. Owner question OQ-1 (§12).

**Q8. Lock order across the two tables.** Yes, a write that touches both needs one. The total
order is **activities (id order) → swimlanes (id order)**, chosen to match the plan cascade,
which already locks every plan activity first (`lockPlansForCascade`,
`hierarchy-lifecycle.service.ts:231-234`). §5 gives every writer.

**Q9. A migration a pristine database cannot test (ADR-0107)?** No.

- Every statement is DDL whose result does not depend on existing rows: new types, new tables,
  a nullable column, a defaulted column, and constraints that are trivially true of existing data
  (`swimlane_id` all NULL, `swimlane_source` all `'NONE'`).
- Nothing is backfilled, so a pristine run and a run on a seeded database exercise the same
  code.
- The seeded run is still owed, for the lock and duration measurement in §8.3 rather than for
  correctness.

---

## 5. Lock order and transactions (Q8 in full)

Each writer, and the locks it takes in order:

- **Positions batch (extended) and activity create:**
  1. activity rows `FOR NO KEY UPDATE`, in id order (`lockActivityRowsInIdOrder`);
  2. the named swimlanes `FOR SHARE`, in id order, `deleted_at IS NULL`, same plan;
  3. `UPDATE activities`;
  4. `INSERT … ON CONFLICT` into the lanes table.
- **Swimlane rename or delete:** the one swimlane row, by a version-gated `UPDATE`.
- **Swimlane reorder:** the plan's active swimlanes, `SELECT … ORDER BY id FOR NO KEY UPDATE`,
  then `UPDATE … FROM unnest`.
- **Swimlane create:** the plan advisory lock (`acquirePlanWriteLock`), then a recheck that the
  plan is active and a count against the cap, then `INSERT`.
- **Swimlane restore:**
  1. client and project `FOR SHARE`, top-down (`lockActiveProjectChainForShare`);
  2. the plan advisory lock;
  3. a recheck that the plan is active;
  4. `UPDATE`.
- **Plan cascade (existing, extended):** the plan advisory lock, then the plan's activities in id
  order (existing), then the existing sweeps, then the swimlane stamp, then the plan stamp.

Why each step:

- **`FOR SHARE` on referenced swimlanes** closes a race in which an assignment commits against a
  swimlane deleted a moment earlier. A delete's `UPDATE` takes `NO KEY UPDATE`, which conflicts
  with `FOR SHARE`. `FOR KEY SHARE`, the lock the FK check itself takes, would not conflict. Taken
  after the activity locks, it cannot cycle with the cascade, which holds every plan activity
  before it stamps a swimlane.
- **Reorder locks in id order** for the #440 reason (`docs/DATABASE.md:99-108`):
  `UPDATE … FROM unnest` locks in join order, and a positions batch takes its `FOR SHARE` locks
  in id order.
- **Lanes need no order of their own.** Every lane row is written only under its activity's row
  lock, so two writers of one activity's lanes serialise on the activity first. The upsert is raw
  SQL after the lock. `activity-row-lock.structural.spec.ts` already refuses a raw `UPDATE
activities` that skips the lock.
- **Create and restore take the plan advisory lock** because the plan cascade holds it across its
  sweep. Without it, a swimlane inserted or restored after the sweep read would be active under a
  deleted plan: the #520 shape (`hierarchy-row-lock.ts:5-30`). The FK check's `KEY SHARE` on the
  plan row does not conflict with the cascade's `NO KEY UPDATE`, so the FK does not catch it. The
  lock also serialises the cap count. Restore takes ancestors before the advisory lock, as
  `hierarchy-row-lock.ts:35-38` requires.
  - _Noted, not changed:_ activity create takes the plan lock only when `parentId` is set
    (`activities.service.ts:363`), so the same race exists there today. It is out of scope; it
    is named here so the precedent is not read as permission.
- **WBS basis reads take no lock.** A summary reparented concurrently yields a row written
  against a basis that changes a moment later. The next projection reads it as a mismatch and
  derives a lane: benign, and stated rather than locked.
- **No calendar locks.** A swimlane binds no calendar, so ADR-0201's calendar-first order is
  untouched.

---

## 6. Lifecycle: soft delete, restore, expiry, compensation

- **Soft-delete a swimlane:** one row, its own `delete_batch_id`. Members keep `swimlane_id`, and
  lane rows are untouched.
- **Plan, project or client cascade:** active swimlanes of the swept plans are stamped into the
  batch (`CascadeCounts.swimlanes`). `restoreBatch` restores `swimlanes WHERE delete_batch_id =
…` beside notes and shares. Lane rows have no lifecycle columns and need nothing.
- **Restore a swimlane:** refused `PARENT_DELETED` under a deleted plan (§5), and `409` on a name
  collision.
- **Activity restore whose `swimlane_id` names a deleted swimlane: admitted, by design.** It
  diverges from ADR-0201 D1, which refuses a batch that binds a deleted **calendar**, and the
  divergence is deliberate.
  - A calendar is a scheduling input, so coming back onto a deleted one would silently change
    dates.
  - A swimlane is presentation, and "a member of a deleted swimlane" is precisely the state that
    swimlane delete creates and swimlane restore reverses (spec §4.7).
  - So `restoreBatch` gains **no** refusal for swimlanes. The new ADR records why, so the
    ADR-0201 rule is not read as covering it.
- **No independent expiry.** Swimlanes are not library rows (ADR-0195 D4 concerns those) and are
  not in the bin. A deleted swimlane lives until its plan expires, like a deleted activity or
  note.

### 6.1 The expiry runner's new order (`hierarchy-expiry.runner.ts`)

```text
crossPlanDependency, activityDependency, resourceAssignment, activityStep,
activityHistoryEntry, activitySwimlaneLane, note, baselineAssignment, baselineDependency,
baselineActivity, baseline, planShare, activity, swimlane, plan, calendarException, calendar,
project, client
```

- `activitySwimlaneLane` is deleted by the resolved `activityIds`, chunked. That covers rows whose
  `summary_activity_id` is in scope too, because the WBS tree is same-plan (ADR-0038).
- `swimlane` is deleted by `planId` chunk, after `activity`, because `activities` holds a
  RESTRICT key into it, and before `plan`.
- The literal at `hierarchy-expiry.structural.spec.ts:97-115` gains both names. The census's
  pinned positive case can add `Swimlane→Plan` and `Activity→Swimlane`.

### 6.2 Import compensation (`interchange.service.ts:1289-1321`)

Add `activitySwimlaneLane.deleteMany({ where: { activity: { planId } } })` before
`activity.deleteMany`, and `swimlane.deleteMany({ where: { planId } })` after it and before
`plan.deleteMany`. Do it in M1 even though no import writes either yet. That is the
`activityHistoryEntry` precedent at `:1300-1302`: "named so the day an import path records, the
rollback does not 23503".

---

## 7. Organisation export (ADR-0194)

- **New file `swimlanes`**: promised, `read: 'org'`. Exported columns are `id`,
  `organizationId`, `planId`, `name`, `position`, `createdAt`, `updatedAt`, `createdBy`,
  `updatedBy` and `deletedAt`. `version` (VERSION) and `deleteBatchId` (DELETE_BATCH) are
  withheld. Names are the customer's own data, not personal data.
- **New file `activity-swimlane-lanes`**: promised, `read: 'org'`. Exported columns are `id`,
  `organizationId`, `activityId`, `basis`, `swimlaneId`, `summaryActivityId`, `wbsLevel`,
  `laneIndex`, `createdAt` and `updatedAt`. Nothing is withheld. It is the planner's layout,
  as `activities.laneIndex` is exported today (`export-columns.ts:280`).
- **Appended columns:** `activities` gains `swimlaneId:text`, and `plans` gains
  `swimlaneSource:enum` and `swimlaneWbsLevel:int`, each at the end of its list (ADR-0194 D2).
- **Format `2.0` → `2.1`** (`export-columns.ts:899`, `ORGANISATION_EXPORT_FORMAT.md:4`). Adding
  a file, a column or an enum value is minor (`:131`). "28 files" becomes 30
  (`export-columns.ts:87`, `ORGANISATION_EXPORT_FORMAT.md:27`). The enum-values section gains
  `plans.swimlaneSource` and `activity-swimlane-lanes.basis`. The changelog gets a `2.1` entry.
- `EXPORT_STRATEGY` (`organization-export.repository.ts:90-120`) gains both models as `org`, and
  `readPage` gains their explicit reads.
- **Backups (ADR-0192):** nothing. `pg_dump` takes the whole database. Restoring an older copy
  applies this migration like any update (`docs/DATABASE.md:2515-2520`).

---

## 8. The migration

### 8.1 Outline

One file, `apps/api/prisma/migrations/<ts>_swimlanes/migration.sql`. It is generated by
`prisma migrate dev --create-only`, then hand-edited for the raw-SQL parts, in this order:

1. `CREATE TYPE "SwimlaneSource"`, `CREATE TYPE "SwimlaneLaneBasis"`.
2. `ALTER TABLE plans ADD COLUMN swimlane_source … NOT NULL DEFAULT 'NONE', ADD COLUMN
swimlane_wbs_level SMALLINT;` then `ADD CONSTRAINT ck_plans_swimlane_source_level`.
3. `CREATE TABLE swimlanes`. Then its FKs (organizations, plans; RESTRICT), the
   `uq_swimlanes_plan_id_id` unique, the org index, `uq_swimlanes_plan_name` (expression,
   partial), `idx_swimlanes_delete_batch_id` (partial), and the two CHECKs.
4. `ALTER TABLE activities ADD COLUMN swimlane_id UUID;` then the composite FK `ON DELETE
RESTRICT ON UPDATE RESTRICT`, then `idx_activities_swimlane_id_fk` (partial).
5. `CREATE TABLE activity_swimlane_lanes`. Then its four FKs (RESTRICT), `CREATE UNIQUE INDEX
uq_activity_swimlane_lanes_basis … NULLS NOT DISTINCT` (**hand-edited**: Prisma emits it
   without the clause), the org index, the two partial FK indexes, and the two CHECKs.

The header comment restates:

- the lock order in §5;
- the reason for `NULLS NOT DISTINCT` and why it is declared as a plain `@@unique`;
- the M1 measurements (§8.3).

### 8.2 Drift and Prisma (all probed on Prisma 6.19.3)

- A `NULLS NOT DISTINCT` unique on plain columns that is **not** declared in `schema.prisma` makes
  `migrate diff --from-url … --to-schema-datamodel` emit `DROP INDEX`, which is drift.
  **Declared** as `@@unique([...], map:)` with the same name, the diff is empty. So it is
  declared, with the comment in §3.5. `prisma:check-drift` is
  `apps/api/package.json:24`.
- A partial index, and an expression partial unique, are ignored by the diff. They are left
  undeclared, as the TECH_DEBT #54 rule says.
- `INSERT … ON CONFLICT (activity_id, basis, swimlane_id, summary_activity_id, wbs_level) DO
UPDATE` infers the `NULLS NOT DISTINCT` index as its arbiter. A second insert for a
  `NO_SWIMLANE` basis updated the one row rather than adding a second.
- **This is the schema's first `NULLS NOT DISTINCT` index**: no match in
  `apps/api/prisma/migrations`. `docs/DATABASE.md` "Indexes" gains the rule: declare it, and say
  so in the model.
- Rejected alternative: four partial uniques, one per basis kind. Those cannot back the
  `activity_id` RESTRICT check, so a fifth full index would be needed. Five indexes against one.

### 8.3 Locks, duration, and what M1 must measure

The API image migrates at boot before it serves (ADR-0018), so there is no live traffic to block.
Lock strength still matters for the run's duration:

- `ADD COLUMN` with a constant default, or nullable: metadata only.
- `ck_plans_swimlane_source_level` validates by scanning `plans`, which is small.
- The composite FK validates by scanning `activities`. All values are NULL, so it is quick, but
  it is a full scan under `SHARE ROW EXCLUSIVE`.
- `idx_activities_swimlane_id_fk` builds by scanning `activities` (`CREATE INDEX`, not
  `CONCURRENTLY`, inside the migration transaction). The index is empty, but the scan happens.
- `NOT VALID` plus `VALIDATE` would buy nothing, because both run in one implicit transaction.

**Measurements owed in M1-T1**, recorded in the migration header ("measure before adding an
index"):

1. Migration duration on the seeded catalogue and on the 2,000-activity torture fixture.
2. Plan expiry of a 2,000-activity plan holding 100 swimlanes and about 4,000 lane rows, with and
   without each FK index. This is the `idx_activity_steps_activity_id_fk` measurement repeated
   (`schema.prisma:3594-3605`).
3. Lane-row delete cost against history-row delete cost, which sets `LANE_ROWS_PER_ACTIVITY`
   (§4 Q6).
4. The `É`/`é` collision on CI's `postgres:17-alpine` (§4 Q2).

### 8.4 Expand/contract

Expand only. Nothing is renamed, retyped or dropped, and no later contract step is owed. The
ordering that does matter is application-level: web strict schemas before API responses
(plan M1-T4).

---

## 9. Every code site the schema touches

Files that **must** change in M1. Structural gates fail the build until most of them do.

Each entry gives the file, the change, and in brackets the gate that forces it.

- `apps/api/prisma/schema.prisma`: §3 (`prisma:check-drift`).
- `apps/api/prisma/migrations/<ts>_swimlanes/`: §8 (migration tests).
- `apps/api/src/common/hierarchy/hierarchy-expiry.runner.ts`: the §6.1 deletes, and counting
  lane rows (the expiry census).
- `apps/api/src/common/hierarchy/hierarchy-expiry.structural.spec.ts`: the order literal and
  the pinned cases (the spec itself).
- `apps/api/src/common/hierarchy/hierarchy-expiry.service.ts`: `budgetCharge` and the new
  constant (review).
- `apps/api/src/common/hierarchy/hierarchy-lifecycle.service.ts`: the cascade stamps,
  `CascadeCounts.swimlanes`, and the `restoreBatch` restore (e2e).
- `apps/api/src/modules/interchange/interchange.service.ts`: the `compensate` deletes in §6.2
  (e2e, which would fail with `23503`).
- `apps/api/src/modules/organization-export/export-columns.ts`: two files, three columns, format
  `2.1` (the export census).
- `apps/api/src/modules/organization-export/organization-export.repository.ts`: the strategies
  and reads (the strategy unit test).
- `docs/ORGANISATION_EXPORT_FORMAT.md`: files, columns, enum values, `2.1`
  (`export-format-doc.structural.spec.ts`).
- `apps/api/src/common/schedule-inputs/schedule-input-fields.ts`: three `NOT_INPUT` entries (a
  compile error, because the map is a `Record`).
- `apps/api/src/modules/activities/activity.repository.ts`: `ActivityPatch.swimlaneId`, and the
  positions SQL (compile; `activity-row-lock.structural.spec.ts`).
- `apps/api/src/modules/plans/plan.repository.ts`: `PlanPatch` (compile).
- `apps/api/src/common/query/soft-delete-filter.structural.spec.ts`: no edit. It derives
  `swimlanes` itself, and it gates every new read.
- `packages/types/src/index.ts`: the `SwimlaneSource` and `SwimlaneLaneBasis` unions (the enum
  lock-step comments).
- `CLAUDE.md` §1 and §4, `docs/DATABASE.md:5`: the model and migration counts
  (`check:counts`).
- `docs/DATABASE.md`: the index register, the two new index rules (§4 Q2, §8.2), and the
  deleted-at and enum counts at `:113` and `:35` (review).

**Downstream (M1-T2/T3 and later)**:

- **Every swimlane read** states `deletedAt: null` or a reasoned `soft-delete:` comment.
  `swimlanes` joins the ADR-0172 gate's subject automatically: it derives its model list from
  `schema.prisma`, `docs/DATABASE.md:126-127`. **Do not `include: { swimlane: true }`** from
  `Activity`: a to-one include is outside the gate by decision (`:130-131`) and would return a
  deleted swimlane as if it were live. Read the plan's list separately.
- **The new `swimlanes` module** (spec §4.12): reorder locks in id order, create and restore
  take the plan lock (§5), `23505` on `uq_swimlanes_plan_name` maps to `409`, and the cap is
  counted under the lock.
- **Positions batch and activity create/update**: derive the basis server-side (§4 Q3),
  `FOR SHARE` the swimlanes, then upsert lanes. The positions DTO row shape becomes `swimlane: {
swimlaneId?, laneIndex }`, with **no `basis`**.
- **Activity responses** gain `swimlaneId` and `swimlaneLanes: { basis, swimlaneId,
summaryActivityId, wbsLevel, laneIndex, updatedAt }[]`. The list load reads lanes by
  `activity_id IN (page ids)` through `uq_activity_swimlane_lanes_basis`, one query per page and
  no N+1.
- **Activity history** (`activity-history.diff.ts:149`): a `swimlaneId` item, and lane-row writes
  coalesced as lane-only. `activity-history-coverage.structural.spec.ts` classifies the new
  `ActivityPatch` key.
- **Audit:** `swimlane.deleted` and `swimlane.restored` need no schema change. They pass
  `ck_audit_events_action_format` (`20260803170000_audit_events/migration.sql:76-78`).
  `audit-coverage.structural.spec.ts` classifies the routes.
- **XER import (M4):** dedupe names case-insensitively before inserting, or `23505` aborts the
  commit.
- **Cross-plan copy:** clears `swimlaneId`. If it does not, the composite FK refuses it with
  `23503`.
- **Baseline capture** (`baseline.repository.ts:227`): unchanged. It must **not** start copying
  swimlane data without the Q7 follow-on's level discriminator.
- **Seed catalogue** (`packages/seed`): exercises the new routes only through the public API, as
  ADR-0066 requires.

---

## 10. Where this disagrees with the spec, and the spec edits it implies

The spec owner edits `feature-spec.md`; this design does not.

- **D1, §4.11 item 2 and §4.4.** Replace the activity's "lane within its swimlane (optional) and
  that lane's basis" with "a lane per basis, in its own table" (§2). Without that, §4.4's "brings
  the exact old lane back", §4.6's "keeps everything" and §4.7's restore promise are each false
  after an ordinary write.
- **D2, §4.12 positions.** The row is `swimlane: { swimlaneId?, laneIndex }`. **Remove
  `basis`**: the server derives it (§4 Q3). "Moving it back" should prefer the remembered lane
  when it is free, and fall back to `nearestFreeRow` otherwise.
- **D3, §4.7 and Q6.** The ADR-0193 preview needs **no** change (§4 Q6). The expiry runner and its
  budget do.
- **D4, SC-4.** State the collision rule for placed members of one basis (§4 Q3, last bullet):
  latest `updated_at` wins, then id. SC-4's property test covers projections over stale rows,
  not only writes.
- **D5, §2 Permissions.** The same-plan invariant for `swimlaneId` is enforced by the database
  (composite FK) **and** by the service, which answers 404 before the FK can answer 500. The
  sentence citing `schema.prisma:1108-1110` ("a foreign key alone cannot") no longer applies to
  this column.
- **D6, §2 Validation.** The case-insensitive name rule holds for ASCII. For non-ASCII it holds
  on whatever collation CI proves (§4 Q2), and the spec should not claim more until M1 measures
  it.
- **D7, new ADR outline (§4.14).** Add a decision recording that an activity restore onto a
  deleted swimlane is **admitted**, and why it differs from ADR-0201 D1 (§6).

---

## 11. Alternatives considered

- **A. The spec's single slot**: `swimlane_lane_index` plus the four basis columns on
  `activities`. That is one fewer table, but four more columns and a CHECK on the widest,
  hottest table. It makes D1's three promises false. Rejected on correctness.
- **B. Two slots on `activities`** (one MANUAL, one WBS). This keeps source switching, but still
  loses the lane on swimlane delete-then-write and on a WBS move and back, and a level switch
  overwrites the WBS slot. It is half of the fix at most of the cost.
- **C. Real swimlane rows for WBS groups**, synced from summaries. One basis kind fewer, but the
  server must mirror every WBS rename, move and dissolve into `swimlanes`. That is the server-side
  projection the spec rejects (§4.14 G), and a second copy of membership. Rejected.
- **D. Unique `position`.** Rejected in §4 Q1: permutation writes, and restore failing on order.
- **E. `ON DELETE SET NULL` / `CASCADE` for the new FKs.** Rejected in §4 Q4. Lanes are not
  CASCADE either: the expiry must count them for its budget, the ADR-0174 D8 reason
  (`hierarchy-expiry.runner.ts:131-136`).
- **F. `plan_id` on `activity_swimlane_lanes`.** It would allow a plan-keyed delete and load, at
  the cost of one more full index. The activity-keyed paths already exist: the runner resolves
  `activityIds`, and the list loads by page ids. Rejected as unneeded.

---

## 12. Questions for the product owner

- **OQ-1. Should baselines start freezing swimlanes in this epic?** Default: **no** (the spec's
  default, Q7). Consequence of the default: removed work in any baseline captured before the
  follow-on is never drawn in a swimlane. It is counted instead, with WBS-mode membership
  partly recoverable from the frozen WBS tree. Freezing now adds about one milestone task:
  columns on `baseline_activities` and one level column on `baselines`.

Nothing else here needs the owner. Every other choice above has a stated technical reason and a
measurement owed in M1.
