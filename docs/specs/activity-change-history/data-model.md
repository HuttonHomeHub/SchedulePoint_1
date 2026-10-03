# Data model: Activity change history

- **Status:** **Input to M1-T1.** The feature spec was approved by the product owner on 2026-10-03,
  including CQ-3 (links and resources from the first release) and three follow-ups (links recorded on
  both ends; names stored as they were at the time; knock-on entries on survivors). Paper only: no
  `schema.prisma` edit and no migration exist yet.
- **Revisions:** first draft by **database-architect** (CLAUDE.md §19.3), 2026-10-03; extended the
  same day by database-architect for plan task **M1-T0** (spec §4.4 items O1–O7, §10 below). The
  extension changed five things in the first draft, each marked **(M1-T0)** where it lands and listed
  in §9.
- **Answers:** feature spec §4.4 (corrections 1–8 and O1–O7) and risks R1–R5, R12–R14; plan M1-T1,
  M1-T4/T5, M2, M3-T1.

## 0. What was read

| Claim relied on                                                                                                                                                                                                        | Evidence                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Every per-activity child is `RESTRICT` and deleted explicitly by the expiry; `activity_id` carries a full index purely for the RESTRICT check (3m47s without it)                                                       | `schema.prisma` `ActivityStep` block; `docs/DATABASE.md` index table rows for `idx_*_activity_id_fk`    |
| The expiry derives its delete list from the DMMF: any `Restrict` FK into a table it deletes must be deleted earlier, any `Cascade` FK must **not** be named                                                            | `common/hierarchy/hierarchy-expiry.structural.spec.ts:117-200`                                          |
| Expiry budgets 20,000 activities/run at ~59 µs each, cannot split a batch, and runs each batch in one transaction with a 60 s timeout                                                                                  | `hierarchy-expiry.service.ts:15-26`, `:325-366`; `prisma.service.ts:36`                                 |
| The runner already resolves the scope's `activityIds` and deletes activity-keyed children in 8,000-id chunks                                                                                                           | `hierarchy-expiry.runner.ts:81-133`                                                                     |
| Interchange compensation hard-deletes a plan's activities without naming steps or notes                                                                                                                                | `interchange.service.ts:1274-1290`                                                                      |
| Attribution columns are opaque Better Auth TEXT ids with no FK; erasure scrubs the `users` row and leaves ids pointing at it                                                                                           | `schema.prisma` `User.id` (no `@db.Uuid`), `AuditEvent.actorUserId`; ADR-0085 D1                        |
| `external_early_start` / `external_late_finish` are `timestamptz(3)`; every other recorded date is `date`                                                                                                              | `schema.prisma` Activity block                                                                          |
| Money is `BIGINT` minor units capped at `MONEY_MINOR_UNITS_MAX` at the DTO                                                                                                                                             | `activities.budgeted_expense`; `update-assignment.dto.ts:87,101` (`@Max(MONEY_MINOR_UNITS_MAX)`)        |
| Name ≤ 200, code ≤ 32, description ≤ 2,000; calendar name ≤ 120; resource name ≤ 200, code ≤ 32                                                                                                                        | `update-activity.dto.ts:48,55,62`; `create-calendar.dto.ts:36`; `create-resource.dto.ts:34,44`          |
| An activity cannot move plans (no `planId` in the update DTO)                                                                                                                                                          | `update-activity.dto.ts` (grep `planId`: no match)                                                      |
| ~15 e2e files hard-delete activities in their cleanup                                                                                                                                                                  | grep `activity.deleteMany` over `apps/api/test` (incl. `audit-reset.ts:66`)                             |
| Audit JSON precedent: object-typed + `pg_column_size(...) <= 8192`                                                                                                                                                     | `migrations/20260803170000_audit_events/migration.sql:80-87`                                            |
| **(M1-T0)** A link's endpoints, plan and org never change after create; `update` patches only `type`, `lagMinutes`, `lagCalendar`                                                                                      | `schema.prisma:1608-1622`; `dependencies.service.ts:352-411` (`DependencyPatch`)                        |
| **(M1-T0)** Link `update` runs **outside** any transaction; `create` holds the plan advisory lock; `remove` transitions via `updateMany … WHERE deleted_at IS NULL`                                                    | `dependencies.service.ts:392-404`, `:236-237`, `hierarchy-lifecycle.service.ts:398-400`                 |
| **(M1-T0)** Assignment `remove` runs **outside** any transaction and is not version-gated                                                                                                                              | `resource-assignment.service.ts:349-365`                                                                |
| **(M1-T0)** Setting a driver clears every other driver on the activity (writes other assignment rows)                                                                                                                  | `resource-assignment.service.ts:162-164`, `:310-317` (`clearDrivingForActivity`)                        |
| **(M1-T0)** An activity duration edit rewrites the driving assignment's units/rate in the same transaction                                                                                                             | `activities.service.ts:771-800` (`recomputeDrivingAssignmentOnDurationEdit`)                            |
| **(M1-T0)** Assignment carries eight client-settable inputs: `budgetedUnits`, `unitsPerHour`, `isDriving`, `curveType`, `lagMinutes`, `actualUnits` (DECIMAL(18,4) ×3) and `budgetedCost`, `actualCost` (BIGINT money) | `schema.prisma:3299-3394`; `update-assignment.dto.ts:44-151`                                            |
| **(M1-T0)** A resource in use cannot be deleted; archive touches no assignment; dissolve acts only on GROUPs, which can never be assigned                                                                              | `resources.service.ts:435-460`; `resource-assignment.service.ts:120-128`; `Resource.archivedAt` comment |
| **(M1-T0)** The activity soft-delete cascade stamps in-plan links incident to the deleted set; it does **not** stamp `cross_plan_dependencies`                                                                         | `hierarchy-lifecycle.service.ts:162-187`; `hierarchy-expiry.runner.ts:15-18` (TECH_DEBT #139)           |
| **(M1-T0)** A cross-plan link joins two plans of the **same** organisation; RBAC is organisation-wide (no plan- or project-membership model)                                                                           | `schema.prisma:1709-1730` (invariant comment); model list (no `PlanMember`/`ProjectMember`)             |
| **(M1-T0)** Recalc holds the plan advisory lock and then row-locks every activity in the plan via one `UPDATE … FROM unnest` (no lock order); `updatePlacements` row-locks up to 2,000 without the plan lock           | `schedule.service.ts:559-597`, `schedule.repository.ts:910-960`; `activities.service.ts:907-926`        |
| **(M1-T0)** Both unique indexes on `activities` are partial, so every activity `UPDATE` takes `FOR NO KEY UPDATE` (compatible with an FK's `FOR KEY SHARE`)                                                            | `20260710092048_add_activities/migration.sql` (`uq_activities_plan_name`, `uq_activities_plan_code`)    |
| **(M1-T0)** House precedent for a batched, ordered advisory-lock acquisition in one statement                                                                                                                          | `common/db/resource-advisory-lock.ts:37-57`                                                             |
| **(M1-T0)** Bulk delete and every batch write cap at 2,000 ids                                                                                                                                                         | `bulk-delete-activities.dto.ts:41`; `update-placements.dto.ts:123`; `update-parents.dto.ts:61`          |

## 1. The model

```prisma
// PROPOSAL — not in schema.prisma. M1-T1 lands it.
enum ActivityHistoryScope {
  DEFINITION
  PROGRESS
  PLACEMENT
  LOGIC      // (M1-T0) in the initial CREATE TYPE — no later ALTER TYPE
  RESOURCES  // (M1-T0) in the initial CREATE TYPE

  @@map("activity_history_scope")
}

// (M1-T0) Why an entry exists that the actor did not make directly to this activity.
// RESOURCE_ASSIGNMENT is withdrawn (§10 O4). All three labels ship in the initial CREATE TYPE
// so M2 needs no migration.
enum ActivityHistoryOrigin {
  ACTIVITY_DELETED   // a link to this activity was removed because the other end was deleted
  ACTIVITY_RESTORED  // … and came back when it was restored
  SUMMARY_DISSOLVED  // this activity's WBS parent changed because its summary was dissolved

  @@map("activity_history_origin")
}

/// One person's continuous work on one activity in one write scope (ADR-0174 D2).
/// An ORDINARY mutable table: merge UPDATEs it, net-zero DELETEs it, expiry DELETEs it.
/// NOT an audit trail (no triggers). Departures from the house template, each deliberate:
/// no version (no client edits a row; recorders are serialised by the history lock, §4),
/// no deleted_at (a row lives exactly as long as its activity), no created_by/updated_by
/// (actor_user_id IS the attribution), no created_at/updated_at (first/last_recorded_at are).
/// Raw-SQL CHECKs (§1 table) live in the migration only.
model ActivityHistoryEntry {
  id               String                 @id @default(uuid(7)) @db.Uuid
  /// Copied from the activity row inside the write transaction, never from the request (R5).
  organizationId   String                 @map("organization_id") @db.Uuid
  activityId       String                 @map("activity_id") @db.Uuid
  /// Opaque Better Auth id. No FK — the house attribution convention (ADR-0085 D1).
  actorUserId      String                 @map("actor_user_id")
  scope            ActivityHistoryScope
  /// (M1-T0) clock_timestamp() read UNDER the history lock, strictly increasing per activity (§4).
  /// Set on INSERT, never changed. The sort key.
  firstRecordedAt  DateTime               @map("first_recorded_at") @db.Timestamptz(3)
  /// clock_timestamp() of the latest merged save, under the same lock.
  lastRecordedAt   DateTime               @map("last_recorded_at") @db.Timestamptz(3)
  editCount        Int                    @default(1) @map("edit_count")
  /// Set together for a multi-activity write; batchSize = entries the write recorded.
  batchId          String?                @map("batch_id") @db.Uuid
  batchSize        Int?                   @map("batch_size")
  origin           ActivityHistoryOrigin?
  /// False ⇔ every change in `changes` is cost-only (§2 "Cost"). Lets the read skip cost-only
  /// rows in the keyset scan rather than post-filtering a short page.
  hasNonCostChange Boolean                @map("has_non_cost_change")
  /// { "<itemKey>": <item>, … } — see §2.
  changes          Json                   @db.JsonB

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  activity     Activity     @relation(fields: [activityId], references: [id], onDelete: Restrict)

  @@index([activityId, firstRecordedAt(sort: Desc), id(sort: Desc)], map: "idx_activity_history_activity_recorded")
  @@index([organizationId], map: "idx_activity_history_organization_id")
  @@map("activity_history_entries")
}
```

Back-relations `historyEntries ActivityHistoryEntry[]` on `Activity` and `Organization`.

**Raw-SQL CHECKs in the migration** (Prisma cannot express them; each named in the model comment):

| Constraint                                | Expression                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ck_activity_history_changes_object`      | `jsonb_typeof(changes) = 'object' AND changes <> '{}'::jsonb` — empty is never stored; net-zero deletes                                                                                                                                                    |
| `ck_activity_history_changes_size`        | **(M1-T0)** `pg_column_size(changes) <= 32768` — raised from 8,192; derivation in §2 "Bound"                                                                                                                                                               |
| `ck_activity_history_edit_count_positive` | `edit_count >= 1`                                                                                                                                                                                                                                          |
| `ck_activity_history_recorded_order`      | `last_recorded_at >= first_recorded_at`                                                                                                                                                                                                                    |
| `ck_activity_history_batch_pair`          | `(batch_id IS NULL) = (batch_size IS NULL) AND (batch_size IS NULL OR batch_size >= 1)`                                                                                                                                                                    |
| `ck_activity_history_origin` **(M1-T0)**  | fail-closed: `CASE WHEN origin IS NULL THEN true WHEN origin IN ('ACTIVITY_DELETED','ACTIVITY_RESTORED') THEN scope = 'LOGIC' AND batch_id IS NOT NULL WHEN origin = 'SUMMARY_DISSOLVED' THEN scope = 'PLACEMENT' AND batch_id IS NOT NULL ELSE false END` |

The origin CHECK encodes two facts the design relies on: an origin-tagged entry is always a batch
entry (so it can never be merged into, by rule 6), and each origin implies one scope. An origin label
added later without a branch here is **rejected**, which is the point.

Deliberately **not** a CHECK: "a batch entry has `edit_count = 1`". Batches never merge under spec
rule 6, but that is a server constant's policy and the spec promises those change without a migration.

## 2. The `changes` shape and its bound

An **object keyed by item**, not an array: one key per item by construction, and merge is "keep
`from`, overwrite `to`, add new keys" with no search. Two key families:

- **Field keys** — the recorded-field constant in `@repo/types` (`durationMinutes`, `name`, …). A field
  key **never contains `:`**.
- **Keyed-object items (M1-T0)** — `link:<dependencyId>`, `xlink:<crossPlanDependencyId>`,
  `assignment:<assignmentId>`. The prefix says which table the id belongs to and how to format it.

All keys are a **persisted vocabulary**: a key may be added, never renamed, without a data migration
rewriting old rows. State that on the constant.

### Field items: `{ "from": V, "to": V }`

| Field kind                                                                                | `from` / `to` value                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| text (`name`, `code`)                                                                     | string or `null`                                                                                                                                                  |
| `date` columns (constraint dates, actuals, suspend/resume, expected finish, visual start) | `"YYYY-MM-DD"` or `null`                                                                                                                                          |
| `timestamptz` columns (`externalEarlyStart`, `externalLateFinish`)                        | ISO-8601 UTC instant `"…T…Z"` or `null` — **not** a calendar date                                                                                                 |
| durations                                                                                 | integer minutes                                                                                                                                                   |
| money (`budgetedExpense`, `actualExpense`)                                                | integer minor units as a JSON number (safe: DTO-capped at `MONEY_MINOR_UNITS_MAX`); the recorder converts Prisma's `BigInt` first — `JSON.stringify` throws on it |
| enums (type, duration type, constraint types, %-complete type, accrual)                   | the enum label                                                                                                                                                    |
| booleans, percents, priority, lane                                                        | number / boolean / `null`                                                                                                                                         |
| references (`calendarId`, `parentId`)                                                     | `{ "id": uuid, "name": string }` or `null`; **net-zero compares `id` only**                                                                                       |
| `description`                                                                             | `{ "len": n, "h": "<16 hex of sha-256>" }` or `null` — never the text                                                                                             |

### Link items (M1-T0, O1/O2/O6)

```jsonc
"link:0192…": {
  "dir": "IN",                    // IN: the other end is this activity's predecessor; OUT: its successor
  "other": { "id": "0191…", "code": "1020", "name": "Steel erection" },  // as at the time
  "from": null,                   // null = the link did not exist (added)
  "to":   { "type": "FS", "lagMinutes": 960, "lagCalendar": "PROJECT_DEFAULT" }  // null = removed
}
"xlink:0193…": {                  // cross-plan: same shape, plus the other end's plan
  "dir": "OUT",
  "other": { "id": "…", "code": "…", "name": "…", "planId": "…", "planName": "…" },
  "from": { … }, "to": null
}
```

- **`from: null` = added, `to: null` = removed** — confirmed. Both `null` is never stored (it is
  net-zero: added then removed in the window drops the item).
- `dir`, `other` are **descriptors**, outside `from`/`to`, because a link's endpoints and direction
  never change (`DependencyPatch` has no endpoint field). `other` is refreshed on every merge, so an
  entry names the other end as it was at its **latest** edit. A later rename or deletion never
  rewrites a stored entry.
- **Net-zero compares `from` and `to` by value only** (`type`, `lagMinutes`, `lagCalendar`), never
  `other`. A different link id is a different item, so the ADR-0048 undo-re-create is two items (R13),
  as the spec already says.
- `lagMinutes` is the stored signed working-minute value, exact. Showing it in days uses the factor at
  **read** time, as for every duration field (spec §2 "duration … shown in the activity's day units").
  Storing the factor at the time is a possible follow-on, not needed for exactness.
- `isDriving` on a link is **never** read into a state (engine output).

### Assignment items (M1-T0, O2/O3)

```jsonc
"assignment:0194…": {
  "resource": { "id": "…", "code": "CR600", "name": "Tower crane" },   // as at the time; code may be null
  "from": null,
  "to": {
    "budgetedUnits": "40.0000", "unitsPerHour": null, "actualUnits": "0.0000",   // decimals as strings
    "isDriving": true, "curveType": "UNIFORM", "lagMinutes": 0,
    "budgetedCost": null, "actualCost": 0                                          // cost sub-fields
  }
}
```

- **Full state** in `from` and `to`, not only the changed sub-fields. That keeps merge trivial (first
  `from`, latest `to`) and net-zero exact (`from` deep-equals `to`). An assignment state is ≤ ~250 B.
- **All eight client-settable inputs** are in the state, not the five the spec lists: `actualUnits`
  (progress quantity) and `budgetedCost` / `actualCost` (money) are inputs too, and leaving them out
  would make a change to them invisible in a table that claims to record inputs.
- **Exact decimals (O3).** The three `DECIMAL(18,4)` columns are JSON **strings in canonical
  fixed-4 form**: Prisma `Decimal#toFixed(4)`, which is what Postgres itself prints for `numeric(18,4)`.
  A JSON number is unsafe: 14 integer digits plus 4 decimals exceed 2⁵³. Because the form is
  canonical, string equality **is** numeric equality, so net-zero needs no decimal parsing. The values
  come from the **database row** (`RETURNING`, or a re-read inside the transaction), **never from the
  DTO's `number`**, which is a float and can disagree with what was stored.
- **Money** sub-fields follow the field rule: JSON number, DTO-capped.

### Cost

A field item is cost if its key is a cost field. Inside an assignment item, `budgetedCost` and
`actualCost` are cost **sub-fields**. Redaction for a reader without `cost:read`:

1. Drop cost field items.
2. Strip cost sub-fields from every assignment state. If the item is a **change** (both states
   non-null) and the stripped states are now equal, drop the item. An **add** or **remove** stays, so a
   Viewer sees "Resource added: Tower crane — 40 h" with no money.
3. An entry left with no items is not returned.

`has_non_cost_change` is set by the recorder by the same rule, so step 3 is a predicate in the keyset
scan, never a short page. Link items are never cost.

### Item cap and bound (M1-T0)

**At most 16 keyed-object items per entry** (`MAX_KEYED_ITEMS_PER_ENTRY`, a server constant with its
reason):

- A **merge** that would take an entry past 16 inserts a new entry instead. Merging is an
  optimisation, so declining one loses nothing.
- A **single write** that produces more than 16 for one activity writes several entries for that
  activity, in chunks of 16, sharing the write's batch id. Only the knock-on path (§10 O7) can do this.
  Every other write produces at most two keyed items per activity: one link, or an assignment plus the
  driver it displaced.

**Bound.** Field items are worst-case ~5 KB (first draft). The worst keyed item is an assignment with
a 200-character name and a 32-character code, both in 4-byte UTF-8 (~950 B), plus two states (~500 B),
so ~1.5 KB. 5 KB + 16 × 1.5 KB ≈ 29 KB, under the **32,768-byte** backstop. A CHECK must admit the
worst **legal** input, or a legal write fails. The 8,192 from the first draft would refuse a legal
knock-on entry on a hub milestone, which would fail the **deletion** that caused it. Typical entries
are unchanged (80–250 B; a link item with ordinary names is ~250 B). `pg_column_size` in a CHECK
measures the **uncompressed** datum, because the tuple is checked before TOAST, so the bound is honest.

## 3. Foreign keys, and why not `CASCADE` (R3)

`activity_id → activities` **`ON DELETE RESTRICT`**, and the expiry runner deletes history
**explicitly**, before activities:

```ts
// hierarchy-expiry.runner.ts, beside the activityStep line
const historyCount = await deleteChunked(activityIds, (chunk) =>
  tx.activityHistoryEntry.deleteMany({ where: { activityId: { in: chunk } } }),
);
```

Why `RESTRICT` beats `CASCADE`:

1. **It can be counted, so it can be budgeted.** A cascade runs inside the `DELETE FROM activities`
   statement as one RI-trigger delete per activity row. Its cost lands on the activity count the
   runner already budgets, and the runner never sees how many history rows there were. An explicit
   `deleteMany` returns that count.
2. **The census enforces it for free.** A `Restrict` FK into `activities` makes
   `hierarchy-expiry.structural.spec.ts` fail until the runner deletes this table first.
3. **House precedent.** `activity_steps`, `resource_assignments` and `notes` are all `RESTRICT` and
   deleted explicitly.

**How the budget accounts for history.** `ExpiryCounts` gains `activityHistoryEntries`. The sweep
charges `activities + ceil(activityHistoryEntries / HISTORY_ROWS_PER_ACTIVITY)` against
`ACTIVITY_BUDGET_PER_RUN`. **`HISTORY_ROWS_PER_ACTIVITY` ships as `1`**, which is deliberately
pessimistic. **M3-T1** replaces it with the measured ratio. The `hierarchy.expired` audit row's
flattened `after` gains `activityHistoryCount`.

**The hazard the budget cannot bound.** A batch can't be split, and it runs inside the 60 s
`BATCH_TRANSACTION_TIMEOUT_MS`. **M3-T1** must report the **history-row count at which a single scope
reaches 60 s**. If a realistic scope can reach it, the fallback is a pre-pass that deletes the scope's
history in bounded chunks, each in its own transaction. Each chunk transaction first takes
`SELECT … FOR UPDATE` on the scope root and re-checks `deleted_at < cutoff`. Not proposed for v1.
CQ-3 raises the history density per activity (§10 O7), so this measurement matters more than it did,
but the shape is unchanged.

**Other hard-delete sites must name it too:**

- **Interchange compensation** (`interchange.service.ts:1285`):
  `tx.activityHistoryEntry.deleteMany({ where: { activity: { planId } } })` before
  `activity.deleteMany`. This is a no-op in practice, because imports record nothing, but it is
  written anyway.
- **Test harness:** a DMMF-derived "children of `activities`" cleanup helper on the
  `test/clear-baseline-tree.ts` pattern (TECH_DEBT #253's lesson), used by `test/audit-reset.ts` and
  the standalone specs.

`organization_id → organizations` **`RESTRICT`**, like every org-scoped table. No FK on
`actor_user_id` (house convention; §5).

**Same-org (R5).** No composite FK. The recorder writes `organization_id` from the activity row
(`INSERT … SELECT a.organization_id … FROM activities a WHERE a.id = …`), never from request context,
and an e2e test proves that a foreign-org write cannot plant a row. For cross-plan links each endpoint's
entry copies **its own** activity's org (§10 O6).

## 4. Indexes, ordering and concurrency

| Index                                                                                   | Kind | Serves                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PK `(id)`                                                                               | full | identity                                                                                                                                                                                                                                                                                                                                                   |
| `idx_activity_history_activity_recorded (activity_id, first_recorded_at DESC, id DESC)` | full | (1) **latest-entry probe**: `WHERE activity_id = $1 ORDER BY first_recorded_at DESC, id DESC LIMIT 1`; (2) **read page** with keyset `(first_recorded_at, id) < ($t, $id)` and `AND has_non_cost_change` for non-cost readers; (3) the **`RESTRICT` check**; (4) the runner's `activity_id IN (…)` delete. Declared in Prisma (full index; TECH_DEBT #54). |
| `idx_activity_history_organization_id (organization_id)`                                | full | the org FK `RESTRICT` check (`DATABASE.md` "index every FK").                                                                                                                                                                                                                                                                                              |

**Sort on `first_recorded_at`.** Entries for one activity are non-overlapping intervals: a merge only
ever extends the latest one. `first_recorded_at` never changes, so keyset cursors stay stable during a
merge, and a merge UPDATE touches **no indexed column**, which makes it HOT-eligible. `fillfactor` is a
M1-T7 measurement.

**Not indexed, on purpose:** `batch_id`, `actor_user_id`, recency (CQ-2 chose no age sweep), and
`plan_id` (not stored).

### 4.1 The history lock (M1-T0, O5) — replaces the first draft's row-lock argument

**The problem.** The first draft said a merge was safe because the activity's version-gated `UPDATE`
holds the activity row lock until commit. That is true only for writes that update the activity row.
A link write, an assignment write with no duration change, and a knock-on write do **not** update the
activity row. Two such recorders on one activity would both read the same latest entry, both
rewrite its `changes` from that read, and the second would **silently overwrite the first's item**.
That is a lost update, not just misordering. The case is real: two link creates on one activity
fired a few milliseconds apart.

**Rejected: lock the endpoint rows with `SELECT … FOR NO KEY UPDATE` in id order.** It serialises
correctly, but it adds a **new multi-row row-locker** that can deadlock with two existing ones that
row-lock many activities in **no defined order**: the recalc write (`UPDATE … FROM unnest`, under the
plan advisory lock) and `updatePlacements` (up to 2,000 rows, without the plan lock). A link write
holding A and waiting for B, while a recalc holds B and waits for A, is a deadlock. Taking the plan
advisory lock first would fix the recalc case but not `updatePlacements`, and it would park every link
and assignment write behind a running recalc.

**Rejected: per-activity advisory locks for every path.** A 2,000-row batch would take 2,000
lock-table slots. The shared lock table is `max_locks_per_transaction × max_connections` (6,400 at
defaults), so three concurrent batches could fail with `out of shared memory`.

**Decision: a two-level transaction advisory lock, owned by the recorder, taken as the transaction's
last lock.** Namespace `activity-history` (a new `common/db/activity-history-lock.ts`, on the
`resource-advisory-lock.ts` pattern):

| Recorder path                                                                                                                                      | Acquires, in **one statement**, in this order                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single-object** (activity PATCH / progress; link create / update / remove; assignment create / update / remove; cross-plan link create / delete) | `pg_advisory_xact_lock_shared(ns, hashtext(planId))` for each distinct plan, **ascending plan id**; then `pg_advisory_xact_lock(ns, hashtext(activityId))` for each recorded activity (1 or 2), **ascending activity id** |
| **Batch and knock-on** (placements, parents, dissolve, activity delete / bulk delete / restore knock-ons)                                          | `pg_advisory_xact_lock(ns, hashtext(planId))` **exclusive**, for each distinct plan, ascending plan id                                                                                                                    |

- Two single-object recorders contend **only if they share an activity**. Two Contributors reporting
  progress on different activities in one plan do not serialise.
- A batch excludes every single recorder in its plan(s) for the remainder of its transaction. That
  costs **one** lock slot, however many rows it has.
- Lock slots per transaction: ≤ 4 single, ≤ a handful for a batch.

**Why it cannot deadlock.** Two rules, both stated in ADR-0174 D4 and enforced in the recorder:

1. **The history lock is the last lock a transaction takes.** After it, the transaction writes only
   `activity_history_entries` (plus `audit_events`, append-only, no FK) and commits. Those writes take
   `FOR KEY SHARE` on the activity and organisation rows (FK checks). That is compatible with the
   `FOR NO KEY UPDATE` every activity `UPDATE` takes, because both unique indexes on `activities` are
   partial (§0). Nothing in `src/` takes `FOR UPDATE` on an active activity or an organisation (grep).
   History rows are touched only by history-lock holders, and by hard deletes of already-deleted
   activities, which no recorder can target.
2. **One recorder call per transaction**, taking every plan and activity it will record in that one
   acquisition. A second call in the same transaction is a programming error and throws. The builder
   tracks this per transaction client.

So a transaction waiting on a non-history lock holds no history lock, and history locks are always
acquired in one total order (plans ascending, then activities ascending). No cycle can form. The
existing row-lock and plan-lock orders are untouched: the recorder adds no row lock at all.

**Not made worse, and not verified either way:** `updatePlacements` and the recalc write both row-lock
many activities with no defined order. That looks like a pre-existing deadlock exposure between them.
It is outside this epic, and the recorder neither adds to it nor depends on it.

**What it costs.** One extra statement per write (~0.1 ms). A link write's two endpoints share that
statement. Under contention, a single recorder waits for at most the tail of a concurrent batch in the
same plan (its recorder phase plus commit). M1-T7 measures (c) with the locks in place, and M2-T5
measures the batch tail. The pass bars stand.

**Concurrency tests (M1-T4/T5):** (a) two concurrent link creates on a shared endpoint by one user
within the window must leave **both** link items in one entry (the lost-update test, which fails
without the lock); (b) a link create A→B concurrent with a PATCH of B and a placement batch containing
A and B must complete with no `40P01` across 200 iterations; (c) a concurrent assignment update and
duration PATCH on one activity must each produce exactly their own items.

### 4.2 Recorded time (M1-T0) — corrects the first draft

The first draft said "set timestamps with `now()`". **That is wrong.** `now()` is the
**transaction's start** time, so a transaction that started earlier but acquired the lock later would
write an entry dated before one it has already observed as latest. The latest-entry probe would then
pick the wrong row.

- Recorded times are `clock_timestamp()` read **after** the history lock is acquired, truncated to
  milliseconds (`date_trunc('milliseconds', clock_timestamp())`, matching `timestamptz(3)`).
- **Strictly increasing per activity:** a new entry gets `first_recorded_at = GREATEST(t,
latest.last_recorded_at + interval '1 millisecond')`, and a merge sets `last_recorded_at =
GREATEST(t, latest.last_recorded_at)`. This removes same-millisecond ties, which would otherwise be
  broken by an app-generated v7 id minted before the lock, and so possibly in the wrong order. It also
  covers a wall-clock step backwards.
- The 60 s / 10 min merge tests compare `t` with the latest entry's `last_` / `first_recorded_at`, in
  SQL.

### 4.3 Batch path (M2) — the probe survives, for ordering, not merging

Batches never merge, either way. So the batch path does **not** need the latest entry to decide
merging, and the first draft's `LATERAL` probe (below) was solving the wrong problem. It **is** still
needed for §4.2's monotonic `first_recorded_at`, and it stays one statement for N ≤ 2,000:

```sql
SELECT a.id, h.last_recorded_at
FROM unnest($1::uuid[]) AS a(id)
LEFT JOIN LATERAL (
  SELECT e.last_recorded_at FROM activity_history_entries e
  WHERE e.activity_id = a.id
  ORDER BY e.first_recorded_at DESC, e.id DESC
  LIMIT 1
) h ON true;
```

After that comes one multi-row `INSERT` (no `UPDATE`). It is N index probes plus one insert, inside the
exclusive plan history lock.

### 4.4 Before-values

The recorder diffs the rows the write **actually transitioned**, never what the DTO sent:

- Before-values are read inside the transaction at the version the gated update requires. The gate
  guarantees that the row read is the row replaced (spec §4.2).
- After-values come from `RETURNING` or a re-read inside the transaction.
- Un-gated transitions are recorded **only if this transaction made them**: link remove
  (`updateMany … WHERE deleted_at IS NULL`, count = 1), assignment remove, and the `clearDriving`
  rows (`RETURNING id`). Two concurrent removes record one "removed", not two.

Two existing paths have **no transaction today** and must gain one to record:
`DependenciesService.update` and `ResourceAssignmentService.remove` (§0).

## 5. Erasure (ADR-0085 D1) and identity

`actor_user_id` is the opaque id; **no name or email of a person is stored**. Erasure scrubs the
`users` row in place, and every entry resolves to the tombstone at read time. The entries repeat text
that people typed: activity names and codes in `from` / `to`, and **(M1-T0)** the other activity's
code and name and the resource's code and name in link and assignment descriptors. That text is
content, not attribution. It has the same status as `activities.name` and `resources.name`, which
erasure also leaves alone. Descriptions are never stored.

## 6. Retention

Under CQ-2 (approved: as long as the activity), an entry lives as long as its activity. Soft-deleting
an activity leaves its history untouched. There is no `deleted_at` or `delete_batch_id`, so restore
needs nothing. Permanent deletion happens only through §3's paths. A link or assignment descriptor
that names an activity or resource since expired holds only an id and a name, with no FK, so it
outlives its subject by design (follow-up 2).

## 7. Volume and size (estimate; M3-T2 replaces it)

| Item                          | Estimate                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heap row                      | ≈ **220–400 B** (typical `changes` 80–250 B; a link item ~250 B)                                                                                                                                                              |
| Index entries                 | ≈ **80 B**                                                                                                                                                                                                                    |
| Per entry, all in             | **≈ 0.3–0.5 KB**                                                                                                                                                                                                              |
| Busy plan, 50–300 entries/day | 6–55 MB/year before CQ-3. **(M1-T0)** A link change is two entries, so with links and resources expect **+20–40 %** on a logic-heavy plan, plus knock-on entries (≤ one per crossing link per delete or restore). Unmeasured. |
| Batch                         | ≤ 2,000 rows/transaction, about 0.5–1 MB of WAL                                                                                                                                                                               |

Read and merge cost depend only on one activity's entry count.

## 8. Migration risk profile

- **One migration, expand-only:** `CREATE TYPE` ×2 **with all five scope labels and all three origin
  labels (M1-T0)**, `CREATE TABLE`, two FKs, two indexes and six CHECKs, all on a new, empty table. No
  `ALTER` on any populated table and **no backfill**. No later `ALTER TYPE … ADD VALUE` is planned
  anywhere in the epic. The first draft's note that M3 would need one is withdrawn.
- **ADR-0107:** there is no pristine-vs-populated divergence.
- **Locks:** adding the FKs takes `SHARE ROW EXCLUSIVE` on `activities` and `organizations` briefly.
  Validation is instant against an empty child.
- **Generated SQL is usable.** `prisma migrate diff` emits the types, table, FKs and both indexes. The
  six CHECKs are appended by hand, each with a comment, and the migration header records §4.1's lock
  protocol, because the lock exists for this table.
- **Rollback hazard of `RESTRICT`, stated rather than hidden.** A pre-feature image, run after history
  rows exist, fails expiry and import compensation with `23503` on plans that have history, until the
  image moves forward again. Nothing is corrupted or lost, and expiry ships disabled by default. This
  is accepted for §3's reasons.

## 9. Corrections to the spec and plan (database view)

First draft (adopted by the spec as §4.4 items 1–8): `RESTRICT` plus explicit counted delete; no
`plan_id`; external dates as instants; description as `{len, h}`; merge lookup is "latest entry for
this activity"; size ≈ 0.3–0.5 KB; `PLACEMENT` for batch re-parent and dissolve; batches never merge.

**Added by M1-T0:**

10. **Merge safety is the history lock (§4.1), not the activity row lock.** Every recorder path takes
    it, including the activity PATCH, so there is one rule. Spec §4.2's diagram step "lock both
    endpoint activity rows in id order" becomes "take the history lock (plans ascending shared, then
    activities ascending)". The spec's edge-case row "each endpoint's entry is written under that
    endpoint's row lock" should say "under the history lock". ADR-0174 D4 states both rules of §4.1.
11. **`clock_timestamp()` under the lock, strictly increasing per activity (§4.2)**, not `now()`. This
    corrects the first draft and plan M1-T2 step 1 ("timestamps set by SQL `now()`").
12. **The batch path's `LATERAL` probe is for ordering, not merging (§4.3):** one probe plus one
    multi-row `INSERT`, no `UPDATE`. This corrects spec §4.2's last paragraph and plan M2-A.
13. **Size backstop 32,768, plus a 16-keyed-item cap per entry (§2).** The spec's "hard backstop 8 KB"
    becomes 32 KB.
14. **Assignment items record eight inputs, not five (§2):** add `actualUnits` (non-cost), plus
    `budgetedCost` and `actualCost` (cost sub-fields, redacted per §2 "Cost").
15. **Scope is the route's, and the items are everything the write changed on that activity.**
    Generalising the spec's triad rule: an assignment write that changes the duration puts
    `durationMinutes` in the `RESOURCES` entry. A **duration PATCH** that rewrites the driving
    assignment's units (`recomputeDrivingAssignmentOnDurationEdit`) puts that `assignment:` item in
    the `DEFINITION` entry. Setting a driver also records the displaced driver's
    `isDriving true → false` as a second assignment item. The census must list
    `activities.service.ts:771` as a write to `resource_assignments`.
16. **Two paths gain a transaction:** `DependenciesService.update` and
    `ResourceAssignmentService.remove` (§4.4).
17. **Knock-on survivors need the transitioned link set.** `deleteLinksForActivities`
    (`hierarchy-lifecycle.service.ts:175`) is an `updateMany` and returns only a count. M2-T4 needs the
    stamped links' ids and endpoints: a `RETURNING` raw statement, or a `findMany` of the same predicate
    inside the transaction before the stamp.

## 10. Links and resources — M1-T0's answers to O1–O7

**O1 — both ends: confirmed.** A link write records one item, keyed `link:<id>`, on **each** endpoint,
in scope `LOGIC`. Each end merges against its **own** latest entry, so one end can merge while the
other inserts (for example when a colleague edited the predecessor in between). A link can never have
the same activity at both ends (`ck_dependencies_*` self-loop CHECK). **Cost:** one history-lock
statement covering both endpoints, two latest-entry probes (one statement with
`unnest(ARRAY[$a,$b])` and `LATERAL`), and up to two inserts or updates. That is about 1–2 ms added,
within M1-T7's ≤ 4 ms bar.

**O2 — value shapes:** §2 "Link items" and "Assignment items". Names are stored **as at the time**, in
descriptors outside `from` / `to`, refreshed on merge and never compared for net-zero. `from: null` =
added, `to: null` = removed. The 8 KB backstop did **not** hold for several items, so it is now
32 KB, with a 16-item cap (§2).

**O3 — exact decimals:** canonical fixed-4 strings from the database row, compared by string equality
(§2). There is no float anywhere in the path.

**O4 — enums:** the scope enum ships with five labels in the initial `CREATE TYPE`.
**`RESOURCE_ASSIGNMENT` is withdrawn.** The triad's duration change lands in the `RESOURCES` entry,
so nothing needs to explain it, and an origin that could only ever say "this came from the entry you
are already reading" carries no information. The origin enum ships with what M2's paths need:
`ACTIVITY_DELETED`, `ACTIVITY_RESTORED`, `SUMMARY_DISSOLVED`, with the fail-closed
`ck_activity_history_origin`. **No resource-library origin**, because the library cannot touch an
assignment today: delete is refused while the resource is in use, archive writes no assignment, and
dissolve acts only on GROUPs, which can never be assigned (§0). The M2 census confirms this. If a
future library action does touch assignments, the census fails, and the label is a two-migration
`ALTER TYPE … ADD VALUE` plus a CHECK branch. That is the right moment to pay for it.

**O5 — concurrency:** §4.1. A two-level advisory history lock, owned by the recorder and taken as the
transaction's last lock in one statement: plans ascending (shared for single-object writes, exclusive
for batches and knock-ons), then activities ascending (exclusive, single-object only). It is
deadlock-free by construction, adds no row lock, and costs one statement. Timestamps are taken under it
(§4.2). Three concurrency tests are specified in §4.1.

**O6 — cross-plan links:** confirmed on both endpoints, keyed `xlink:<id>` (a different table, so a
different prefix), each entry in its own plan's activity, with `organization_id` copied from **that**
activity. The schema invariant makes both organisations the same, and copying per row means the
recorder does not depend on it. The history lock takes both plans in ascending order, then both
activities. `other` carries the other plan's id and name at the time. **No disclosure concern:** RBAC
is organisation-wide, with no plan or project membership, so any reader of one end may already read
the other plan. Guests have no history route. The cross-plan routes are create and delete only (no
PATCH), so an `xlink:` item is always an add or a remove.

**O7 — knock-on fan-out and the expiry budget:**

- **Where fan-out arises today: in-plan links only.** An activity delete, bulk delete (≤ 2,000
  selected, plus WBS descendants) or restore transitions every in-plan link crossing the boundary of
  the deleted set. Plan, project and client deletes have **no survivors** for in-plan links. **Cross-plan
  links are not stamped by any delete cascade** (TECH_DEBT #139), so no cross-plan knock-on exists to
  record. If #139 is fixed, the census fails and the recorder's multi-plan lock already covers it.
  Resource-library knock-on is zero (O4).
- **Shape:** one batch entry per surviving activity (scope `LOGIC`, origin `ACTIVITY_DELETED` or
  `_RESTORED`, the deleting actor), holding one `link:` item per crossing link to that survivor,
  chunked at 16 (§2). Entries ≤ crossing links, and the hard ceiling is the plan's active link count.
  The deleted activities get **no** entries.
- **Cost:** set-based. One exclusive plan history lock, one `LATERAL` probe over the survivors (§4.3),
  and one multi-row `INSERT`. It is linear in crossing links with no per-row round trip. **No product
  bound** is imposed. Refusing or truncating would either fail a deletion because of its history, or
  leave the silent gap the spec forbids. The engineering bound is M2-T5's pass bar (≤ 25 % of the
  route and ≤ 150 ms at 2,000). A miss returns here, and the fallback is a bounded per-entry item count
  with an explicit "and N more" item, not dropping rows.
- **Expiry interaction:** knock-on entries live on **survivors**, so they never inflate the history of
  the subtree being expired, and they expire with their own activity, counted by the same
  `activityHistoryEntries` charge. Their only effect on expiry is density: a hub milestone that has
  outlived many deleted predecessors carries more rows. That is exactly what the counted, budgeted
  delete (§3) absorbs, and what M3-T1's "rows per scope at 60 s" measurement must include. **M3-T1
  should seed links and knock-ons**, not only field edits. A descriptor naming an expired activity is a
  plain id and name with no FK, so expiry never has to touch other activities' history.

**For the product owner: nothing blocks M1-T1.** Two consequences of the code as it stands follow from
existing decisions, not from history, and are visible once shipped:

- Deleting an activity that has a **cross-plan** link writes no "link removed" entry on the other plan's
  activity, because the link is not removed (TECH_DEBT #139).
- No resource-library action produces an entry, because none touches an assignment.
