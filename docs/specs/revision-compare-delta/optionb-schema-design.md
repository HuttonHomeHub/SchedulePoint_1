# Option B schema design — the recalculation records the rule it ran with

- **Status:** Design for review. **Nothing has been applied** — `schema.prisma` is unedited, no
  migration file exists, and no repository or service code is changed. This document is the
  `CLAUDE.md` §19.3 / §20 `database-architect` pass for the **second** schema change on this epic.
- **Author:** database-architect
- **Date:** 2026-09-04
- **Subject:** Option B of [`cq1-schema-design.md`](./cq1-schema-design.md) §7, **accepted by the
  product owner 2026-09-04**.
- **Relationship to the previous pass:** that document designed the four `baselines` columns and
  _sketched_ Option B in three bullets inside a rejected-alternatives section. This pass designs it.
  **Four of those three bullets' implications did not survive contact with the code** (§0.1). The
  sketch is treated here as a proposal to verify, per the brief and per ADR-0076.
- **Builds on:** ADR-0022 (engine-owned batched writes bypass optimistic locking), ADR-0034 (the
  recalculation parity gate), ADR-0045 §5 (`schedule_computed_at`, the governing precedent),
  ADR-0025 (baseline copy-not-reference), ADR-0035 §17–§20 (the criticality options),
  ADR-0041 (levelling is additive), ADR-0053 M3 (the enum two-migration rule).

---

## 0. Verdict, up front

**Option B is the right shape, and it is a better decision than the previous pass credited it with.**
It does not merely close Finding F2's residual — it _removes_ a false-positive the previous design
would have shipped (§7.3). The recommendation is to build it.

**But the three-bullet sketch was wrong in four ways, and two of them would have reproduced, inside
the fix, the exact defect the fix exists to remove.** The corrections are in §0.1 and each is designed
out below.

**Recommended, and what the rest of this document specifies:** four **nullable, no-default,
engine-owned** columns on `plans` (`schedule_critical_path_definition`,
`schedule_critical_float_threshold_minutes`, `schedule_total_float_mode`,
`schedule_make_open_ends_critical`); **three** raw-SQL CHECK constraints (fail-closed all-or-none,
range, and a **cursor-coupling** constraint that has no `baselines` analogue); **no index**; **one
migration**, no enum change, no rewrite, no backfill. `stampScheduleComputedAt` gains a **third
parameter carrying the rule the engine ran with**, sourced from **one shared object** that is also
spread into `ComputeOptions` — not from a self-copy of the plan's own columns, and not from
`graph.options`.

### 0.1 What the previous pass's sketch got wrong

| #   | The sketch (`cq1-schema-design.md` §7 "Option B")                                                        | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Correction                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Four more `SET` clauses in that statement is the whole write-path change."                              | **WRONG, and this is the important one.** Read literally — `SET schedule_critical_path_definition = critical_path_definition` — that copies the row's **current configuration**, not what the engine ran with. `plan` is read at `schedule.service.ts:244`, **outside and before** the transaction and the advisory lock (`:266`), and a settings PATCH takes **no** plan lock (V4 below). So the engine can run rule A while the row already holds rule B, and the self-copy would stamp B. That is F2's defect reproduced inside F2's fix. | The values are **parameters**, carrying the rule that fed `computeSchedule` (§2 B4).                                            |
| 2   | Implicitly, that those values can be read off `graph.options`.                                           | **Unsafe as written.** All four `ComputeOptions` fields are **optional** (`compute.ts:71`, `:77`, `:83`, `:90`), so reading them there yields `T \| undefined` and forces a `??` default at the write site — the exact coalescing the previous pass's §8.2 forbids on the read side, arriving through the write side instead.                                                                                                                                                                                                                | **One shared required-typed object** built once, spread into `options` and returned beside it (§2 B4). One derivation, not two. |
| 3   | D7: "the four `baselines` columns are unchanged … only the source they copy from changes."               | **Half right.** The four **columns** are unchanged — re-verified (§7.1). But `CaptureInput`'s four fields **cannot stay required**, because the mirror is NULL for any plan last recalculated before this ships, and the previous pass's stated mechanism for enforcing all-or-none _was_ their requiredness (`cq1-schema-design.md` §6.1).                                                                                                                                                                                                  | One **nullable grouped object** on `CaptureInput`, so the compiler enforces all-or-none by grouping (§7.2).                     |
| 4   | §6.2: re-reading the plan inside the capture lock is "acceptable … but strictly weaker" — i.e. optional. | **Now mandatory, and for a different reason.** Under Option B the mirror is engine-owned and a settings PATCH cannot move it — so the old race is gone. A **new** one replaces it: a recalculation can commit between capture's outer `plan` read (`baselines.service.ts:122`) and its lock (`:127`), so the outer row's mirror would describe a **different run** from the snapshot rows loaded inside the lock.                                                                                                                            | The mirror **must** be read from `tx` inside the lock (§7.2).                                                                   |

Two things the sketch got right and are confirmed: `stampScheduleComputedAt` is the single correct
write site (V3), and it touches neither `version` nor `updated_at` nor `updated_by` — **proved
against a real database, not read off the docblock** (V6).

---

## 1. What was verified, and how

`CLAUDE.md` §19.11 / ADR-0076. Every claim names what was run or read. **No claim is carried from the
previous design unchecked** — three did not survive (§0.1).

| #   | Claim                                                                                        | Established by                                                                                                                                                                                                                                                                                                                                                       | Verdict                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| V1  | The four criticality options are read from `plan` into `ComputeOptions`                      | `schedule.service.ts:1262` (`const options: ComputeOptions = {`), `:1267`, `:1274`, `:1275`, `:1276`                                                                                                                                                                                                                                                                 | **Confirmed**                                                                                   |
| V2  | Those four `ComputeOptions` fields are **optional**                                          | `compute.ts:71` `criticalDefinition?`, `:77` `criticalFloatThresholdMinutes?`, `:83` `totalFloatMode?`, `:90` `makeOpenEndsCritical?`                                                                                                                                                                                                                                | **Confirmed — and it invalidates sourcing the mirror from `graph.options`** (§0.1 #2)           |
| V3  | `stampScheduleComputedAt` is the **single** write site for a persisted schedule              | `grep -rn "stampScheduleComputedAt" src/ test/` → **one non-spec caller**, `schedule.service.ts:309`. `grep -rn "early_start" src/ \| grep -v spec` → **one** writer, `schedule.repository.ts:805` (`writeResults`), called at `:302` in the same transaction. `grep -rn "schedule_computed_at\|scheduleComputedAt" src/` → one `SET`, `schedule.repository.ts:884`. | **Confirmed three independent ways — there is no second path**                                  |
| V4  | A plan settings PATCH takes **no** plan write lock                                           | `grep -n "lockPlanForWrite\|acquirePlanWriteLock" src/modules/plans/plans.service.ts` → **no match**; the only advisory lock there is calendar-scoped (`:184`, `:192`). The criticality patch is `plans.service.ts:154-163`.                                                                                                                                         | **Confirmed — this is why B4's self-copy is wrong**                                             |
| V5  | The recalculation reads the plan **before** the transaction and the lock                     | `schedule.service.ts:244` `findActiveByIdInOrg` → `:266` `$transaction` → `:268` `lockPlanForWrite`. `buildEngineGraph(organization.id, plan, …)` at `:272` is handed that same outer object.                                                                                                                                                                        | **Confirmed** — so the mirror must record the object the engine used, not the row's later state |
| V6  | A raw `UPDATE plans SET …` leaves `version` and `updated_at` untouched, incl. 4 more clauses | Measured, not read. `updated_at` is `NOT NULL` with **no DB default and no trigger** (`20260709160500_…/migration.sql:48,50`; `grep -rn "CREATE TRIGGER" prisma/migrations/` returns **only** the three `audit_events` triggers). Then executed a five-clause `UPDATE` on a seeded table: `version_unchanged = t`, `updated_at_unchanged = t` (§3).                  | **Confirmed by execution** — the ADR-0022 property survives the change                          |
| V7  | Levelling never rewrites `is_critical` / `total_float`                                       | `level.ts:296-299` merges `{ ...r, ...ov }` where the overlay is only `leveledStart/Finish(Offset)`, `levelingDelay`, `levelingWindowExceeded`, `selfOverAllocated` (`:170-177`). `isCritical`/`totalFloat` are never keys of `ov`.                                                                                                                                  | **Confirmed at source** — levelling is orthogonal (§2 B3)                                       |
| V8  | Levelling runs **inside** the same transaction and the same stamp                            | `schedule.service.ts:279-296` (levelling) → `:302` `writeResults` → `:309` `stampScheduleComputedAt`, all inside the `$transaction` opened at `:266`                                                                                                                                                                                                                 | **Confirmed** — one stamp per persisted schedule, levelled or not                               |
| V9  | Interchange and the programme solve reuse the same unit                                      | `interchange.service.ts:281` calls `schedule.recalculate`; `schedule.service.ts:225` and `:495` both route to `recalculatePlan`                                                                                                                                                                                                                                      | **Confirmed** — three entry points, one write path                                              |
| V10 | The non-persisting engine callers must **not** stamp                                         | `grep -rn "computeSchedule(" src/ \| grep -v spec` → `float-paths.ts:49`, `critical-path-test.ts:112`/`:149` (both read models, ADR-0116 D7), plus the conformance adapters. None writes activities.                                                                                                                                                                 | **Confirmed** — the mirror describes the **persisted** schedule, which is the correct semantics |
| V11 | `plans.schedule_computed_at` is the governing precedent                                      | `schema.prisma:780` + its docblock `:770-779`: "ENGINE-OWNED … NEVER accepted from a client DTO … NULLABLE with NO default: NULL = 'never calculated' … Additive, no backfill … so no index"                                                                                                                                                                         | **Confirmed — same table, same writer, same sentinel discipline, four columns along**           |
| V12 | Nothing needs a projection widened to read the mirror                                        | `plan.repository.ts:74-80` `findActiveByIdInOrg` is a bare `findFirst` with **no `select`**; `ActivePlan` is `NonNullable<Awaited<ReturnType<…>>>` (`schedule.service.ts:171`)                                                                                                                                                                                       | **Confirmed — the mirror appears on `ActivePlan` for free**                                     |
| V13 | The mirror cannot leak into the public plan DTO by accident                                  | `plan-response.dto.ts:139-162` maps **field by field** (`id`, `projectId`, … `version`, `createdAt`), with no spread of `entity`                                                                                                                                                                                                                                     | **Confirmed — exposure is opt-in**                                                              |
| V14 | The enums already exist; no label is added                                                   | `CriticalPathDefinition` / `TotalFloatMode` committed by `20260716180000_m6_plan_float_options`. Both halves of the ADR-0053 M3 rule reproduced again for **this** migration's shape (§3).                                                                                                                                                                           | **Confirmed — one migration file is correct**                                                   |
| V15 | The shared types already carry both unions                                                   | `packages/types/src/index.ts:176` `CriticalPathDefinition`, `:184` `TotalFloatMode`                                                                                                                                                                                                                                                                                  | **Confirmed** — no `@repo/types` addition needed for the enums themselves                       |

---

## 2. Design decisions

### B1 — Four engine-owned mirror columns on `plans`

`schedule_critical_path_definition`, `schedule_critical_float_threshold_minutes`,
`schedule_total_float_mode`, `schedule_make_open_ends_critical`.

The set is the **same four** the previous pass established for `baselines`, for the same reason
(`cq1-schema-design.md` D1): they are exactly the plan options that change `is_critical` /
`total_float` while leaving every computed date byte-identical, so they are the only ones that can
make _"7 activities entered the critical path"_ true of the data and false about the world.

**Why not mirror all eleven scheduling options.** The temptation is real — the mirror would then be a
general "what did this recalculation run with" record, and the report could also say _"and the
progress recalculation mode changed"_. Rejected for two reasons. First, the other seven change the
**network**, so movement they cause is real movement the delta is right to report without a caveat.
Second, a mirror of the whole option set **is** the engine-input snapshot the superseded revision-
compare spec was killed for: it invites a reader to treat `plans` as a run record, and every column
nothing reads is a column somebody eventually reads wrongly. The trigger to widen is named rather
than left implicit: **a feature that must state that a network-changing option moved between two
persisted schedules.** That is not this feature.

### B2 — Nullable, no default; NULL is a sentinel, never a claim

Identical discipline to the previous pass's D3, and here the precedent is **stronger and closer**:
`plans.schedule_computed_at` (`schema.prisma:780`, V11) is engine-owned, nullable, no default, no
index, never accepted from a client DTO, and its NULL means "never calculated". The mirror's NULL
means the same thing plus one more case:

| Value             | Means                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| all four non-null | the rule `computeSchedule` **actually ran with** on the run that produced this plan's persisted `is_critical`/`total_float` |
| all four NULL     | **unknown** — never recalculated, **or** recalculated before this shipped                                                   |
| a mix             | **unrepresentable** — refused by `ck_plans_schedule_criticality_all_or_none`                                                |

**There is no backfill and there can be none.** No surviving artefact records which rule produced an
existing persisted schedule; the `audit_events` route (rejected in the previous pass) is evidence,
not state, and would in any case be silent for every plan recalculated before ADR-0073 C3.2. A
constant `DEFAULT 'TOTAL_FLOAT'/0/'FINISH'/false` would be a **confident false statement in a
`NOT NULL` column**, which is the defect this whole change exists to remove.

The sentinel is self-clearing in a way `baselines`' is not, and this is worth knowing: **the very
next recalculation of a plan populates its mirror.** The unknown window on the live side is therefore
bounded by one recalculation per plan, not forever. The `baselines` sentinel is permanent, because a
capture cannot be re-run.

### B3 — Levelling changes nothing here, and that is a finding rather than an assumption

The brief asks whether ADR-0041's levelling pass goes through the same stamp and whether it matters.

- **It does go through the same stamp.** Levelling is not a separate write path: it runs inside
  `recalculatePlan`'s single transaction (`schedule.service.ts:279-296`), replaces `results`, and
  the same `writeResults` → `writeDrivingFlags` → `stampScheduleComputedAt` sequence follows at
  `:302`/`:303`/`:309` (V8). There is one stamp per persisted schedule, levelled or not.
- **It does not matter to the mirror's _contents_.** The levelling overlay is `{ leveledStart,
leveledFinish, leveledStartOffset, leveledFinishOffset, levelingDelay, levelingWindowExceeded,
selfOverAllocated }` and is merged as `{ ...r, ...ov }` (`level.ts:170-177`, `:296-299`) — so
  `isCritical` and `totalFloat` are the **pure network values on a levelled plan and an unlevelled
  one alike** (V7, ADR-0041 Q2). The mirror describes the rule that produced those two columns, so
  levelling is orthogonal by construction.
- **Therefore `level_resources` and `level_within_float_only` are correctly OUT of the mirror set**
  (B1). They change the leveled overlay and never the criticality the delta reads.

The one consequence worth carrying: a mirror written on a levelled run is exactly as meaningful as
one written on an unlevelled run, so the read model needs no levelling branch. That is stated
because the tempting alternative — "record whether levelling ran, too" — is B1's rejected widening
wearing a different hat.

### B4 — The write site: **one shared derivation**, passed as a parameter

This is the decision the sketch got wrong twice (§0.1 #1, #2), so it is specified precisely.

**The mirror must record the rule that fed `computeSchedule` on this run.** Three candidate sources:

| Source                                                               | Verdict                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-copy inside the SQL** (`SET schedule_x = x`)                  | **REJECTED.** Records the row's configuration at stamp time. `plan` is read at `:244`, outside the transaction and before the lock (V5), and a settings PATCH takes no plan lock (V4) — so a PATCH committing in that window makes the engine run rule A and the stamp record rule B. F2's defect, reproduced inside F2's fix, and undetectable afterwards. |
| **`graph.options.criticalDefinition` etc.**                          | **REJECTED.** All four fields are optional (V2), so this needs `?? 'TOTAL_FLOAT'` / `?? 0` / `?? 'FINISH'` / `?? false` at the write site. That is the forbidden coalescing arriving through the write side, and it would silently manufacture a default the engine may not have used if a future refactor ever leaves one unset.                           |
| **One shared, required-typed object built where `options` is built** | **RECOMMENDED.** `buildEngineGraph` constructs the rule **once**, spreads it into `options`, and returns it. There is one derivation, so the engine input and the mirror **cannot** disagree — the ADR-0065 `routeOrthogonal` / ADR-0121 `stackSeries` argument, where two implementations drift and the drift is invisible because each looks right alone. |

So `stampScheduleComputedAt` gains a **third parameter**, and it is required — not optional with a
default, because an optional parameter is how the next caller silently writes NULLs.

**Adding the four `SET` clauses preserves the ADR-0022 property, and this was executed rather than
reasoned about** (V6, §3): a five-clause raw `UPDATE` left `version` and `updated_at` byte-identical.
It stays a raw `$executeRaw`, never a Prisma `update`, for the reason the docblock at
`schedule.repository.ts:874-880` already gives.

**Cost, measured:** min-of-7 runs of 2,000 single-row updates each — one clause **102.1 / 102.3 ms**,
five clauses **with both CHECKs installed** **103.6 / 105.2 ms**. That is **+0.0015 ms per
recalculation, ≈ +1.5 % of the stamp statement**, against a recalculation ADR-0116 M6 measured at
260–846 ms. It is unmeasurable at the feature level. (An earlier, noisier probe reported a 2×
difference; that was an artefact of two `bench()` calls in one `SELECT` and is recorded here rather
than quietly dropped.)

### B5 — Three CHECK constraints, and the third has no `baselines` analogue

All raw SQL in the migration with a documenting comment in the model and **no `@@index` or other
Prisma declaration the database does not have** (`docs/DATABASE.md`, TECH_DEBT #54,
`prisma:check-drift`).

1. **`ck_plans_schedule_criticality_all_or_none`** — fail-closed, identical in shape to the
   `baselines` sibling and to `ck_notes_exactly_one_parent` /
   `ck_resources_group_no_scheduling_fields`:

   ```sql
   num_nonnulls(schedule_critical_path_definition, schedule_critical_float_threshold_minutes,
                schedule_total_float_mode, schedule_make_open_ends_critical) IN (0, 4)
   ```

   Written as an explicit membership test rather than `= 0 OR = 4` so that adding a fifth mirrored
   setting later fails loudly against the literal rather than passing silently. It is what makes the
   three-state read **total**: a caller may test one column and be right about all four.

2. **`ck_plans_schedule_critical_float_threshold_minutes_range`** — `IS NULL OR BETWEEN 0 AND
5256000`, the same bounds as the source column's `ck_plans_critical_float_threshold_minutes_range`
   (`20260802120000_…/migration.sql:115-117`) plus the nullable-safe guard. Same argument as on
   `baselines`: a mirror must not be able to hold a value its source would refuse — and here it is
   stronger, because the mirror is written by **raw SQL that bypasses every Prisma and DTO guard**,
   so this constraint is the only thing standing behind it.

3. **`ck_plans_schedule_criticality_requires_cursor`** — **new, and specific to `plans`**:

   ```sql
   schedule_critical_path_definition IS NULL OR schedule_computed_at IS NOT NULL
   ```

   The whole premise of Option B is that the mirror and the freshness cursor describe **the same
   run**. That is guaranteed today only by there being exactly one write site (V3) — a fact about
   code, which the database does not know. This constraint states it where it cannot rot: a second
   write path that populated the mirror without stamping would fail loudly, and a second write path
   is precisely the defect class this change exists to fix. It is also what makes B2's sentinel
   wording ("never recalculated, **or** recalculated before this shipped") a checkable claim rather
   than a description: the converse case — a rule with no cursor — is unrepresentable.

   _Verified to admit and refuse, on a real table (§3):_ cursor + all four **admitted**; all four
   with a cleared cursor **refused**; all NULL with a NULL cursor **admitted** (never recalculated);
   cursor set with all four NULL **admitted** (the sentinel case).

**Deliberately not the same shape as `baselines` in one respect, and the same in another.** The
brief asks. Constraints 1 and 2 are **deliberately identical in shape** to their `baselines`
siblings, because they express the same invariant and a reader comparing the two tables should find
the same rule written the same way. Constraint 3 has **no** `baselines` analogue and must not be
invented for one: a baseline has no "when was this computed" column to couple to — `captured_at` is
when the snapshot was taken, not when the schedule was calculated — so an analogous constraint there
would couple two facts that are not about the same event.

**No CHECK on the two enum columns** (the Postgres enum type is the constraint). **No CHECK relating
the mirror to the live configuration** — they are _supposed_ to differ; that difference is the free
signal in §8.2, not an error.

### B6 — No index, and the trigger to revisit is named

All four are read **only alongside their own row, by primary key** — the recalculation writes them by
`id`, the capture reads them by `id` inside the lock, and the delta reads them on the plan row it has
already loaded. There is no new `WHERE`, `JOIN` or `ORDER BY` predicate anywhere in the feature; no
route filters or groups plans by a criticality setting. `docs/DATABASE.md` ("Indexes"): index **query
patterns, not columns** — and this is the same sentence `schedule_computed_at`'s own docblock closes
with (`schema.prisma:778-779`, "Not a query predicate — read with the plan row … so no index").

Trigger to revisit, named rather than left implicit: **a route that filters plans by what rule they
were last computed under** (e.g. an installation-wide "which plans are still on `LONGEST_PATH`?").
None exists and none is proposed.

### B7 — Names carry the `schedule_` prefix, and that is a deliberate departure from the `baselines` decision

On `baselines` the previous pass chose **unprefixed** names (its D6) so a field-by-field comparison
of two rows reads as what it is. On `plans` the opposite is right, and for a reason that does not
exist on `baselines`: **the mirror has a same-row twin one column away.** `critical_path_definition`
(client-settable, `plans.service.ts:154`) and `schedule_critical_path_definition` (engine-owned)
would be indistinguishable without it, and the pair is the whole point — §8.2's signal is precisely
"these two differ".

`schedule_` is chosen over `computed_` / `last_run_` because `schedule_computed_at` is the existing
precedent on this exact table for this exact purpose (engine-owned, about the last computation), and
a second prefix meaning the same thing is how a table grows two vocabularies.

The delta's baseline-vs-live comparison therefore compares `baselines.critical_path_definition`
against `plans.schedule_critical_path_definition`. The names differ across the two sides — which is
correct, because the two columns mean different things about different events, and identical names
would invite a reader to think one was a copy of the other. (It **is** a copy, but of the value, not
of the column's meaning: one records a run, the other records what a snapshot froze.)

### B8 — The parity argument, and it is structural

**`computeSchedule`'s signature, inputs and behaviour are untouched.** The four values already flow
into `ComputeOptions` today (V1); this change reads the _same four values_ a second time on their way
out to a column, and adds nothing to the engine's input surface. The engine never reads `plans` — it
is handed activities, edges, calendars and options built from it. So the ADR-0034 recalculation
parity gate is untouched **by construction**, not by test: there is no input the engine can see that
did not exist before.

**What this epic may no longer claim, and the reword is a task rather than an aside** (the product
owner's own condition when accepting Option B): the recalculation **persistence** path is touched —
a third parameter on `stampScheduleComputedAt`, four `SET` clauses in its statement, and a shared
rule object in `buildEngineGraph`. The claim becomes _"the recalculation persistence is touched; the
engine is not."_ `feature-spec.md` §4.1 property 1 currently says "**no engine-path file is
touched**" and is now false — `schedule.service.ts` and `schedule.repository.ts` both change. A stale
claim of engine-purity is exactly the drift this repository keeps recording.

### B9 — Two migrations, and the order is a real recommendation rather than tidiness

This change and the `baselines` change from the previous pass are **two separate migration files**,
not one. At the DDL level they are independent (different tables, no shared object), so either order
applies cleanly. But there is one asymmetric argument, and it is worth acting on:

**Ship the `plans` mirror first — ideally in an earlier release than the `baselines` columns.** The
mirror populates itself on every recalculation (B2), and the capture path can only copy a value that
already exists. Every recalculation that happens between the two releases turns a plan's mirror from
NULL to real, so the **first baselines captured after the second release carry a real rule instead of
the permanent `UNKNOWN` sentinel.** Shipping both in one release makes every baseline captured before
the plan's next recalculation permanently unknown — which is not wrong, but is avoidable at zero
cost.

The `plans` mirror is also useful **on its own**, with no `baselines` column at all: §8.2's "your
criticality settings have changed since the last recalculation" signal needs only this migration.
That is a second, independent reason it can and should lead.

---

## 3. Migration safety — measured, not assumed

**Measured on PostgreSQL 16.13** (`select version()` → `PostgreSQL 16.13 (Ubuntu
16.13-0ubuntu0.24.04.1)`), against a `plans`-shaped table seeded with **200,000 rows** (36 MB) —
deliberately an upper bound by orders of magnitude, since `plans` holds one row per plan. The repo
targets PG 17; the two behaviours exercised are unchanged between 16 and 17 (the non-rewriting
`ADD COLUMN` path landed in PG 11 via `pg_attribute.attmissingval`; `check_safe_enum_use` has been in
place since PG 12). **Stated as a generalisation from a 16.13 measurement, not as a 17 measurement**
— re-running the probe on 17 before merge is cheap if the reviewer wants it closed.

**End-to-end, warm cache, on a fresh 200,000-row copy:**

```
filenode before: 585513
ALTER TABLE … ADD COLUMN ×4 (2 enum-typed, nullable, no default)   1.276 ms
ADD CONSTRAINT ck_…_all_or_none            … NOT VALID             0.906 ms
VALIDATE CONSTRAINT ck_…_all_or_none                              34.010 ms
ADD CONSTRAINT ck_…_threshold_minutes_range … NOT VALID             0.827 ms
VALIDATE CONSTRAINT ck_…_threshold_minutes_range                  27.790 ms
ADD CONSTRAINT ck_…_requires_cursor        … NOT VALID              0.827 ms
VALIDATE CONSTRAINT ck_…_requires_cursor                          27.586 ms
                                                          TOTAL ≈ 93.2 ms
filenode after:  585513   (UNCHANGED — no table rewrite)
```

**Findings:**

1. **Metadata-only, no rewrite, no scan on the `ADD COLUMN`.** `pg_relation_filenode` is identical
   before and after all seven statements; 1.276 ms for four columns at 200,000 rows.
   `pg_attribute.atthasmissing` is `f` for all four (no `attmissingval`), as expected for nullable
   columns with no default.
2. **No backfill, and every existing row satisfies all three CHECKs by construction** (all four
   columns NULL ⇒ `num_nonnulls = 0`, threshold `IS NULL`, definition `IS NULL`). Verified by the
   three `VALIDATE`s succeeding against the seeded table, one third of whose rows carry a NULL
   `schedule_computed_at` and two thirds a non-NULL one.
3. **`NOT VALID` + `VALIDATE`**, mirroring `ck_plans_critical_float_threshold_minutes_range` on this
   same table (`20260802120000_…/migration.sql:115-117`): `NOT VALID` enforces **every new and
   updated row** from the moment it commits, and `VALIDATE` takes only `SHARE UPDATE EXCLUSIVE`
   rather than holding `ACCESS EXCLUSIVE` across a scan.
4. **The ADR-0053 M3 two-migration enum rule does not apply**, re-verified for _this_ migration's
   shape rather than carried from the previous pass:

   ```
   BEGIN; ALTER TYPE "TotalFloatMode" ADD VALUE 'MIDDLE';
          ALTER TABLE plans ADD CONSTRAINT … CHECK (schedule_total_float_mode IS DISTINCT FROM 'MIDDLE');
   ERROR:  unsafe use of new value "MIDDLE" of enum type "TotalFloatMode"
   HINT:   New enum values must be committed before they can be used.

   BEGIN; ALTER TABLE plans ADD COLUMN probe "TotalFloatMode";
          UPDATE plans SET probe = 'SMALLEST' WHERE false;
          ALTER TABLE plans ADD CONSTRAINT … CHECK (probe IS DISTINCT FROM 'SMALLEST'::"TotalFloatMode");
   COMMIT;   -- succeeds: an already-committed label in one transaction is fine
   ```

   This migration adds **no** label and both types were committed by `20260716180000` (V14), so **one
   migration file is correct**. Splitting it would be cargo-culting the precedent's shape without its
   cause.

**All three CHECKs were verified to refuse and to admit under `UPDATE`** — not merely to install, and
`UPDATE` rather than `INSERT` because that is the shape the write actually takes here (this is a
difference from the `baselines` pass, where the write is an `INSERT`):

```
-- half-set
UPDATE plans SET schedule_critical_path_definition='TOTAL_FLOAT' WHERE id=…;
  ERROR: violates check constraint "ck_plans_schedule_criticality_all_or_none"
-- all four + cursor                                               UPDATE 1
-- ... and version/updated_at afterwards:   version_unchanged = t   updated_at_unchanged = t
-- threshold -1 with all four set
  ERROR: violates check constraint "ck_plans_schedule_critical_float_threshold_minutes_range"
-- clearing all four back to NULL                                  UPDATE 1
-- all four set, cursor cleared
  ERROR: violates check constraint "ck_plans_schedule_criticality_requires_cursor"
-- cursor set, all four NULL (the sentinel case)                   UPDATE 1
```

**Locks and duration.** One `ALTER TABLE` with four `ADD COLUMN` sub-commands plus three
`ADD CONSTRAINT … NOT VALID` take a brief `ACCESS EXCLUSIVE` on `plans` for catalogue updates only;
the three `VALIDATE`s take `SHARE UPDATE EXCLUSIVE`. Nothing touches `activities`,
`baseline_activities` or any index. Total measured work at 200,000 rows: **≈ 93 ms**, against a real
`plans` table of at most a few thousand rows. Safe under the self-migrating container entrypoint
(ADR-0018) with no maintenance window.

**`prisma migrate diff` drift:** the four columns are declared in `schema.prisma` and generated by
Prisma; the three CHECKs are invisible to Prisma and are therefore raw SQL with **no** corresponding
schema declaration, per the house rule (`prisma:check-drift` = `prisma migrate diff --exit-code`,
`apps/api/package.json:23`).

---

## 4. Proposed Prisma change

**Not applied.** Insert immediately after `scheduleComputedAt` (`schema.prisma:780`), before
`version` — i.e. beside the sibling it is coupled to, not beside the client-settable options it
mirrors, so a reader meets the two engine-owned facts together.

```prisma
model Plan {
  // … unchanged through scheduleComputedAt (:780) …

  // THE CRITICALITY RULE THE LAST RECALCULATION ACTUALLY RAN WITH (ADR-0125 / CQ-1 Option B).
  // ENGINE-OWNED MIRRORS of the four client-settable options above (:681, :699, :706, :711),
  // stamped by the recalculation write path in the SAME raw UPDATE as `schedule_computed_at` —
  // NEVER accepted from a client DTO, never patched, never bumping version/updated_at (ADR-0022).
  //
  // WHY THEY EXIST. `activities.is_critical` and `.total_float` are the OUTPUT of a rule, and the
  // configuration one column along is NOT evidence of which rule produced them: a settings PATCH
  // neither recalculates nor marks the schedule stale (plans.service.ts:154-163 writes only the
  // patch; PlanScheduleSettings.tsx:36-38 says so on screen — "a later Recalculate applies the new
  // definition"). So a planner can change the definition and the persisted critical set still
  // reflects the OLD one, with nothing in the database able to say so. These four columns are the
  // only thing that can, and they make a revision comparison's SETTINGS_MATCH / SETTINGS_DIFFER a
  // statement about two COMPUTATIONS rather than about two configurations.
  //
  // NULLABLE WITH NO DEFAULT, AND THE NULL IS A SENTINEL — "unknown", never a claim. NULL means
  // never recalculated, OR recalculated before this shipped. The values are UNBACKFILLABLE: no
  // surviving artefact records which rule produced an existing persisted schedule, and inventing
  // one is the defect these columns exist to remove. This follows scheduleComputedAt above
  // exactly (engine-owned, nullable, no default, no backfill, no index) and deliberately NOT the
  // constant-DEFAULT pattern of the four client-settable options, whose defaults are legitimate
  // because a NEW plan genuinely starts there — a plan that has already been computed has not.
  // The sentinel is self-clearing: the next recalculation of a plan populates it.
  //
  // ALL FOUR OR NONE, AND NEVER WITHOUT THE CURSOR. Three raw-SQL CHECKs in the migration (Prisma
  // cannot express CHECK, so there is deliberately NO declaration here the database does not have;
  // prisma:check-drift, TECH_DEBT #54): ck_plans_schedule_criticality_all_or_none makes "half a
  // rule" unrepresentable, so a reader may test ONE column and be right about all four;
  // ck_plans_schedule_critical_float_threshold_minutes_range mirrors the source column's 0…5_256_000
  // bounds (nullable-safe) — load-bearing here because this column is written by RAW SQL that
  // bypasses every Prisma and DTO guard; and ck_plans_schedule_criticality_requires_cursor states
  // in the database the property that today rests on there being exactly ONE write site — a mirror
  // may never exist without the `schedule_computed_at` it describes.
  //
  // WORKING MINUTES, NOT DAYS — scheduleCriticalFloatThresholdMinutes is a verbatim copy of the
  // value handed to ComputeOptions (schedule.service.ts:1274), which forbids a conversion factor
  // for the reasons written there. Never apply hours_per_day_minutes to it.
  //
  // No index: read only alongside its own row, by id (the recalculation writes by id, a baseline
  // capture reads inside the plan lock, and the comparison reads the plan row it already loaded).
  // No route filters or groups plans by a criticality setting — index query patterns, not columns
  // (docs/DATABASE.md), the same sentence scheduleComputedAt above closes with.
  //
  // MUST stay in lock-step with the CriticalPathDefinition / TotalFloatMode unions in @repo/types.
  scheduleCriticalPathDefinition        CriticalPathDefinition? @map("schedule_critical_path_definition")
  scheduleCriticalFloatThresholdMinutes Int?                    @map("schedule_critical_float_threshold_minutes")
  scheduleTotalFloatMode                TotalFloatMode?         @map("schedule_total_float_mode")
  scheduleMakeOpenEndsCritical          Boolean?                @map("schedule_make_open_ends_critical")

  version                       Int                    @default(1)
  // … unchanged from here …
}
```

**Also worth fixing in the same commit** (the ADR-0071 lesson about stepping over drift, already
raised by the previous pass and still true): `schema.prisma:706` and `:711` both say the engine
"consumes it in a later M6 task". It does — `schedule.service.ts:1275-1276` passes both today. Two
one-line corrections.

No enum is added or altered. No relation, no index, no `@@` declaration changes.

---

## 5. Proposed migration

**Not applied.**
`apps/api/prisma/migrations/20260904090000_plan_schedule_criticality_mirror/migration.sql`

```sql
-- CQ-1 Option B (ADR-0125): the recalculation records the criticality rule it ACTUALLY RAN WITH.
--
-- WHY. `activities.is_critical` and `.total_float` are the OUTPUT of a rule the plan holds
-- (plans.critical_path_definition / .critical_float_threshold_minutes / .total_float_mode /
-- .make_open_ends_critical). Those columns are the plan's CONFIGURATION, and they are not evidence
-- of which rule produced the persisted output: a settings PATCH writes them without recalculating
-- and without marking the schedule stale (plans.service.ts:154-163; the web says so itself at
-- PlanScheduleSettings.tsx:36-38 — "a later Recalculate applies the new definition/measure"). So a
-- planner can move the definition, capture a baseline, and the frozen critical set reflects a rule
-- the plan no longer holds — with nothing in the database able to say which rule that was.
--
-- These four ENGINE-OWNED mirrors close that. They are written by the recalculation's existing
-- freshness stamp (schedule.repository.ts stampScheduleComputedAt, called at
-- schedule.service.ts:309 inside the plan advisory lock and the recalc transaction), from the SAME
-- object that is spread into ComputeOptions — one derivation, so the engine input and the mirror
-- cannot disagree. A revision comparison can then say SETTINGS_MATCH / SETTINGS_DIFFER about two
-- COMPUTATIONS rather than about two configurations, and a plan can be told that its criticality
-- settings have changed since the schedule it is displaying was computed.
--
-- WHY THESE FOUR AND NOT THE OTHER SEVEN PLAN SCHEDULING OPTIONS. Verified against the engine
-- (compute.ts:668-696): these four change is_critical / total_float and move NO date.
-- progress_recalc_mode, use_expected_finish_dates, ignore_external_relationships, level_resources,
-- level_within_float_only and scheduling_mode all change the network, so movement they cause is
-- real movement a comparison is right to report without a caveat. Mirroring the whole option set
-- would make `plans` an engine-input run record, which invites a reader to treat it as one.
--
-- LEVELLING IS ORTHOGONAL. The ADR-0041 pass runs inside this same transaction and this same stamp
-- (schedule.service.ts:279-296 → :302 → :309), and its overlay writes only the leveled_* / leveling_*
-- columns (level.ts:170-177, :296-299) — is_critical and total_float stay the pure NETWORK values on
-- a levelled plan and an unlevelled one alike (ADR-0041 Q2). So the mirror means the same thing
-- either way, and level_resources / level_within_float_only are correctly NOT mirrored.
--
-- NULLABLE, NO DEFAULT, AND THAT IS THE LOAD-BEARING DECISION. NULL means "the rule that produced
-- this plan's persisted is_critical is UNKNOWN" — never recalculated, or recalculated before this
-- shipped. It is a sentinel, never a claim. The four client-settable source columns carry constant
-- DEFAULTs legitimately, because a NEW plan genuinely starts there; a plan that has ALREADY been
-- computed has not, so a DEFAULT here would state, in a NOT NULL column that offers a reader no way
-- to doubt it, a rule the recalculation may never have used. The governing precedent is one column
-- along: plans.schedule_computed_at (ADR-0045 §5) — engine-owned, nullable, no default, no backfill,
-- no index, NULL = "never calculated". THE VALUES ARE UNBACKFILLABLE: nothing surviving records
-- which rule produced an existing persisted schedule. Unlike the baselines sentinel this one is
-- SELF-CLEARING — the next recalculation of a plan populates it.
--
-- ONE MIGRATION IS CORRECT. The ADR-0053 M3 two-file split exists because a NEWLY ADDED enum label
-- cannot be used in the transaction that added it. This file adds NO label: "CriticalPathDefinition"
-- and "TotalFloatMode" were committed by 20260716180000_m6_plan_float_options. Reproduced both
-- halves against Postgres while designing this: adding a label and naming it in one transaction
-- raises `unsafe use of new value`; naming an already-committed label in one transaction succeeds.
--
-- METADATA-ONLY, NO REWRITE, NO BACKFILL, NO DATA MIGRATION. Measured on a 200,000-row plans-shaped
-- table (PostgreSQL 16.13; the ADD COLUMN and enum behaviours are unchanged in 17) — an upper bound
-- by orders of magnitude, since plans holds one row per plan:
--   ADD COLUMN × 4 (2 enum-typed, nullable, no default)   1.276 ms, pg_relation_filenode UNCHANGED
--   ADD CONSTRAINT … NOT VALID × 3                        0.906 / 0.827 / 0.827 ms
--   VALIDATE CONSTRAINT × 3                              34.010 / 27.790 / 27.586 ms
--                                                 TOTAL ≈ 93 ms, filenode unchanged
-- Every existing row satisfies all three CHECKs by construction (all four columns NULL).
-- Safe under the self-migrating entrypoint (ADR-0018) with no maintenance window.
--
-- WRITE-PATH COST, MEASURED. The recalculation's stamp goes from one SET clause to five, with two
-- of the three CHECKs evaluated on the row. min-of-7 runs of 2,000 single-row updates: 102.1 ms
-- (one clause) vs 103.6 ms (five clauses, constraints installed) — +0.0015 ms per recalculation,
-- against a recalculation ADR-0116 M6 measured at 260–846 ms.
--
-- PARITY. computeSchedule's signature, inputs and behaviour are UNCHANGED: these four values already
-- flow into ComputeOptions (schedule.service.ts:1267, :1274-1276), and this reads the same four on
-- their way out to a column. The engine never reads `plans`. So the ADR-0034 recalculation parity
-- gate is untouched BY CONSTRUCTION. What IS touched is the recalculation PERSISTENCE path — the
-- stamp gains a parameter and four SET clauses. The epic's "no engine-path file is touched" claim
-- is therefore false and must be reworded to "the recalculation persistence is touched; the engine
-- is not" (feature-spec.md §4.1).

-- AddColumn ×4: the criticality rule the last recalculation ran with. Nullable with no default ⇒
-- metadata-only on PostgreSQL 11+ (no table rewrite, no scan; a brief ACCESS EXCLUSIVE for the
-- catalogue update).
ALTER TABLE "plans"
  ADD COLUMN "schedule_critical_path_definition"         "CriticalPathDefinition",
  ADD COLUMN "schedule_critical_float_threshold_minutes" INTEGER,
  ADD COLUMN "schedule_total_float_mode"                 "TotalFloatMode",
  ADD COLUMN "schedule_make_open_ends_critical"          BOOLEAN;

-- FAIL-CLOSED ALL-OR-NONE (the ck_notes_exactly_one_parent /
-- ck_resources_group_no_scheduling_fields tradition; same shape as the sibling constraint on
-- `baselines`). A half-recorded rule has no meaning, and forbidding it is what makes the three-state
-- read TOTAL: a caller may test `schedule_critical_path_definition IS NULL` and be right about all
-- four columns. Written as an explicit IN (0, 4) membership test rather than `= 0 OR = 4` so that
-- adding a fifth mirrored setting later fails loudly against the literal instead of passing silently.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_criticality_all_or_none" CHECK (
  num_nonnulls(
    "schedule_critical_path_definition",
    "schedule_critical_float_threshold_minutes",
    "schedule_total_float_mode",
    "schedule_make_open_ends_critical"
  ) IN (0, 4)
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_criticality_all_or_none";

-- Range: the same 0 … 5_256_000 working minutes (≈10 years) as the source column's
-- ck_plans_critical_float_threshold_minutes_range (20260802120000), plus the nullable-safe guard the
-- source does not need. A mirror must not be able to hold a value its source would refuse — and that
-- matters MORE here than on `baselines`, because this column is written by a raw parameterised
-- UPDATE that bypasses every Prisma and DTO guard, so this constraint is the only thing behind it.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_critical_float_threshold_minutes_range" CHECK (
  "schedule_critical_float_threshold_minutes" IS NULL
  OR "schedule_critical_float_threshold_minutes" BETWEEN 0 AND 5256000
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_critical_float_threshold_minutes_range";

-- A MIRROR MAY NEVER EXIST WITHOUT THE CURSOR IT DESCRIBES. This constraint has NO analogue on
-- `baselines` (a baseline's captured_at is when the snapshot was taken, not when the schedule was
-- computed, so coupling to it would relate two different events). The premise of this whole change
-- is that the four mirrors and `schedule_computed_at` describe the SAME recalculation — guaranteed
-- today only by there being exactly one write site (verified: stampScheduleComputedAt has one
-- non-spec caller, schedule.service.ts:309, and writeResults is the only writer of early_start,
-- schedule.repository.ts:805). That is a fact about code, which the database does not know. Stating
-- it here means a second write path that populated the mirrors without stamping fails loudly — and
-- a second, un-stamping write path is precisely the defect class this migration exists to remove.
-- It also makes the sentinel's wording ("never recalculated, OR recalculated before this shipped")
-- a checkable claim: the converse — a rule with no cursor — becomes unrepresentable.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_criticality_requires_cursor" CHECK (
  "schedule_critical_path_definition" IS NULL
  OR "schedule_computed_at" IS NOT NULL
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_criticality_requires_cursor";

-- No index on any of the four. They are read only alongside their own row, by primary key: the
-- recalculation writes by id, a baseline capture reads by id inside the plan advisory lock, and the
-- comparison reads the plan row it has already loaded. There is no new WHERE/JOIN/ORDER BY predicate
-- anywhere in the feature and no route filters or groups plans by a criticality setting. Index query
-- patterns, not columns (docs/DATABASE.md) — the same sentence schedule_computed_at's own docblock
-- closes with. Revisit ONLY if a route is added that asks which plans were last computed under which
-- rule.

-- Down (forward-only in production; documented for completeness):
--   ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_schedule_criticality_requires_cursor";
--   ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_schedule_critical_float_threshold_minutes_range";
--   ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_schedule_criticality_all_or_none";
--   ALTER TABLE "plans" DROP COLUMN "schedule_make_open_ends_critical";
--   ALTER TABLE "plans" DROP COLUMN "schedule_total_float_mode";
--   ALTER TABLE "plans" DROP COLUMN "schedule_critical_float_threshold_minutes";
--   ALTER TABLE "plans" DROP COLUMN "schedule_critical_path_definition";
-- A down is recoverable in a way the baselines one is not: the mirrors repopulate on the next
-- recalculation of each plan. Any baselines captured in the meantime keep whatever they copied.
```

---

## 6. The required change to `stampScheduleComputedAt` and its one caller

**Not applied.** Three files change; none of them is the engine.

### 6.1 One shared rule object — `schedule.service.ts` (`buildEngineGraph`)

The rule is built **once** and used twice, so the engine input and the mirror cannot drift (B4).

```ts
/**
 * The criticality rule a recalculation runs with (ADR-0125 / CQ-1 Option B). Built ONCE, spread into
 * {@link ComputeOptions} AND returned so the persistence path can mirror it onto the plan — there is
 * one derivation, so what the engine ran with and what the row records cannot disagree. Every field
 * is REQUIRED, deliberately: the four ComputeOptions fields are optional (compute.ts:71/77/83/90),
 * and sourcing the mirror from there would need a `??` default at the write site — which is how a
 * value the engine never used gets recorded as one it did.
 */
export interface CriticalityRule {
  criticalDefinition: CriticalPathDefinition;
  criticalFloatThresholdMinutes: number;
  totalFloatMode: TotalFloatMode;
  makeOpenEndsCritical: boolean;
}
```

Inside `buildEngineGraph`, replacing the four inline assignments at `:1267`, `:1274-1276` (their
existing comments move with them verbatim — they record why the threshold takes no conversion
factor):

```ts
const criticality: CriticalityRule = {
  criticalDefinition: plan.criticalPathDefinition,
  criticalFloatThresholdMinutes: plan.criticalFloatThresholdMinutes,
  totalFloatMode: plan.totalFloatMode,
  makeOpenEndsCritical: plan.makeOpenEndsCritical,
};

const options: ComputeOptions = {
  dataDate,
  calendar,
  progressMode: plan.progressRecalcMode,
  useExpectedFinishDates: plan.useExpectedFinishDates,
  ...criticality,
  ignoreExternalRelationships: plan.ignoreExternalRelationships,
};
```

and `criticality` is added to the object returned at `:1329-1345`, beside `options`.

### 6.2 The stamp — `schedule.repository.ts:881-888`

```ts
/**
 * Stamp the plan's schedule freshness cursor AND the criticality rule this run used (F6 staleness,
 * ADR-0045 §5 / ADR-0035 §30.7; the rule mirror is ADR-0125 / CQ-1 Option B) — one raw, parameterised
 * UPDATE. […existing paragraph unchanged…]
 *
 * `rule` is REQUIRED and carries the rule that fed `computeSchedule` on THIS run — never a self-copy
 * from the plan's own `critical_*` columns. The plan row is read outside the transaction and before
 * the advisory lock (schedule.service.ts:244 vs :266-268) and a settings PATCH takes NO plan lock
 * (plans.service.ts has no acquirePlanWriteLock), so the row's configuration at stamp time can differ
 * from what the engine ran with. A self-copy would record the configuration and reproduce, inside this
 * fix, the exact defect it exists to remove.
 *
 * The four added SET clauses keep this write's ADR-0022 property: verified against Postgres that a
 * five-clause raw UPDATE leaves `version` and `updated_at` byte-identical. It stays $executeRaw and
 * never a Prisma `update`, which would touch both.
 */
async stampScheduleComputedAt(
  planId: string,
  db: Prisma.TransactionClient,
  rule: CriticalityRule,
): Promise<void> {
  await db.$executeRaw`
    UPDATE plans
    SET schedule_computed_at = now(),
        schedule_critical_path_definition         = ${rule.criticalDefinition}::"CriticalPathDefinition",
        schedule_critical_float_threshold_minutes = ${rule.criticalFloatThresholdMinutes}::integer,
        schedule_total_float_mode                 = ${rule.totalFloatMode}::"TotalFloatMode",
        schedule_make_open_ends_critical          = ${rule.makeOpenEndsCritical}::boolean
    WHERE id = ${planId}::uuid
  `;
}
```

The explicit enum casts are not decoration: a `$executeRaw` parameter arrives as `text` and Postgres
will not implicitly coerce it to an enum type in an `UPDATE … SET` target position.

### 6.3 The caller — `schedule.service.ts:309`

```ts
await this.schedule.stampScheduleComputedAt(planId, tx, graph.criticality);
```

Unchanged: it is still inside the `$transaction` opened at `:266`, still after
`lockPlanForWrite` (`:268`) and `assertHoldsPen` (`:270`), still after `writeResults` (`:302`) and
`writeDrivingFlags` (`:303`). So the mirror and the `is_critical` values it describes commit
atomically, and all three recalculation entry points — the public `recalculate`, the programme solve
and interchange (V9) — get it without further change.

**One existing test must be extended, not merely kept passing.**
`schedule.service.spec.ts:229-242` destructures `stampScheduleComputedAt.mock.calls[0] as [string,
unknown]`, so it compiles unchanged against a third parameter and would keep passing while the mirror
was never written. It must assert the third argument equals the four values handed to
`computeSchedule` on the same run — which is also the only place the B4 "one derivation" property is
observable from a test.

---

## 7. Interaction with the four `baselines` columns

### 7.1 The columns are unchanged — re-verified

The previous pass's D7 said the four `baselines` columns survive Option B untouched and only their
source moves. **Re-verified now that the decision is real, and it holds.** Their types, nullability,
absence of defaults, the two CHECK constraints, the no-index decision, the naming decision and the
"NULL is a sentinel" semantics are all unaffected by where the values come from. Nothing in
[`cq1-schema-design.md`](./cq1-schema-design.md) §4 or §5 changes.

What changes is §6 of that document — the capture path — and it changes in three ways the previous
pass did not anticipate.

### 7.2 What `baseline.repository.ts` copies, and from where

**Source: `plans.schedule_critical_*`, read inside the plan advisory lock, on the transaction client.**

**(a) The `CaptureInput` shape must change** (§0.1 #3). The previous design made the four fields
required so the compiler enforced all-or-none. That is no longer available, because the mirror is
NULL for any plan whose last recalculation predates this migration. Four independent nullable fields
would make "half a rule" representable in TypeScript and leave the database CHECK as the only guard —
i.e. a 500, not a compile error. The replacement keeps the compiler in the loop by **grouping**:

```ts
export interface CaptureInput {
  // …unchanged…
  /** The plan calendar's hours-per-day at capture, in minutes (ADR-0068 §5). */
  hoursPerDayMinutes: number;
  /**
   * The criticality rule the snapshot's `is_critical`/`total_float` were COMPUTED under
   * (ADR-0125 / CQ-1 Option B) — copied from the plan's engine-owned mirrors, NOT from its
   * client-settable options. One nullable object rather than four nullable fields, so the compiler
   * enforces all-or-none: `null` means the plan's last recalculation predates the mirror and the
   * rule is unrecoverable, which is the sentinel the four columns store as all-NULL.
   */
  criticalityRule: CriticalityRule | null;
  // …unchanged…
}
```

and `createWithSnapshot` writes, beside `hoursPerDayMinutes` (`:104`) and `costSnapshotLevel`
(`:111`), **unconditionally** — a conditional write is how a NULL meaning "unknown" gets confused
with a NULL meaning "we happened not to set it":

```ts
criticalPathDefinition: input.criticalityRule?.criticalDefinition ?? null,
criticalFloatThresholdMinutes: input.criticalityRule?.criticalFloatThresholdMinutes ?? null,
totalFloatMode: input.criticalityRule?.totalFloatMode ?? null,
makeOpenEndsCritical: input.criticalityRule?.makeOpenEndsCritical ?? null,
```

The `?? null` here is **not** the forbidden coalescing: it defaults to the sentinel, never to a
value. The forbidden form is `?? 'TOTAL_FLOAT'` / `?? 0`. Worth a line in the structural gate
(§9) so the distinction is enforced rather than remembered.

`baseline_activities` is not touched (the previous pass's D2 is unaffected).

**(b) The read must happen inside the lock, and it is now mandatory** (§0.1 #4). In
`baselines.service.ts`, after `acquirePlanWriteLock(tx, planId)` (`:127`) and beside
`resolveDayFactorMinutes` (`:148`):

```ts
// The criticality rule the snapshot was COMPUTED under (ADR-0125 / CQ-1 Option B) — read from the
// plan's ENGINE-OWNED mirrors, inside the lock, on `tx`. NOT from the outer `plan` read at :122:
// that read happens before this transaction and before the lock, so a recalculation can commit in
// between — and then the outer row's mirror describes a DIFFERENT run from the snapshot rows
// loaded at :129 under this lock. Both are written by the same locked recalculation, so reading
// them under the same lock is what pairs the rule with the output it produced.
const mirrors = await tx.plan.findUniqueOrThrow({
  where: { id: planId },
  select: {
    scheduleCriticalPathDefinition: true,
    scheduleCriticalFloatThresholdMinutes: true,
    scheduleTotalFloatMode: true,
    scheduleMakeOpenEndsCritical: true,
  },
});
const criticalityRule: CriticalityRule | null =
  mirrors.scheduleCriticalPathDefinition === null
    ? null // pre-mirror recalculation; all four are NULL by ck_plans_schedule_criticality_all_or_none
    : {
        criticalDefinition: mirrors.scheduleCriticalPathDefinition,
        criticalFloatThresholdMinutes: mirrors.scheduleCriticalFloatThresholdMinutes!,
        totalFloatMode: mirrors.scheduleTotalFloatMode!,
        makeOpenEndsCritical: mirrors.scheduleMakeOpenEndsCritical!,
      };
```

The three non-null assertions are legitimate **only** because
`ck_plans_schedule_criticality_all_or_none` makes the mixed state unrepresentable — testing one
column and being right about all four is exactly what that constraint buys, and the comment must say
so or a later reader will "tidy" the assertions into defaults.

**(c) What happens when the mirror is NULL at capture time.** The capture **succeeds** and writes all
four baseline columns NULL. It must not refuse: `SCHEDULE_NOT_CALCULATED`
(`baselines.service.ts:136-141`) is decided by `latestFinish(activities)` over the snapshot's
`early_finish`, not by the mirror — so a plan recalculated before this migration has a perfectly
valid schedule to freeze and only an unknowable rule. Refusing would block a legitimate capture for a
condition the planner can neither see nor fix (short of a recalculation nobody told them to run). The
baseline then reports `SETTINGS_UNKNOWN` forever, which is the true statement.

This is the concrete payoff of B9's sequencing recommendation: every recalculation between the two
releases converts a plan from "next capture is permanently UNKNOWN" to "next capture records a real
rule".

### 7.3 Option B **removes** a false positive, not just a gap

The previous pass's F2 recorded, as a residual it could not fix, that _"a setting moved-and-moved-back
between two recalculations can even make the delta report `SETTINGS_MATCH` when the two persisted
outputs were genuinely computed under different rules."_ Re-examined under Option B, the **inverse**
is now true and it is worth stating because it is the strongest single argument for the decision:

- Baseline frozen from run 1 (rule A); planner sets B, recalculates (run 2, rule B); sets A back,
  recalculates (run 3, rule A). Both mirrors read A. `SETTINGS_MATCH` — **and that is correct**,
  because both persisted outputs really were computed under A.
- Under the previous design the baseline would have frozen whatever the plan _held_ at capture time,
  which could be B if the capture landed between a settings change and the next recalculation. That
  is a `SETTINGS_DIFFER` about two identical computations: a false alarm on a report whose whole
  premise is that everything it says is true.

Option B therefore **strictly dominates**: it is exact where the previous design was a proxy, and it
removes a false positive the proxy could produce in both directions.

---

## 8. What the read model may and may not say

### 8.1 `SETTINGS_MATCH` / `SETTINGS_DIFFER` / `SETTINGS_UNKNOWN`

Both sides now read a mirror, so the outcome is a statement about **two computations**:

| `from` side                 | `to` side                                   | Outcome                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| baseline, all four non-null | live (`plans.schedule_*`) / baseline, ditto | `SETTINGS_MATCH` if all four equal; otherwise `SETTINGS_DIFFER` naming **each** field that moved, with both values                                                                                                                                           |
| baseline, all four NULL     | anything                                    | `SETTINGS_UNKNOWN` — captured before the freeze, or from a plan whose last recalculation predated the mirror                                                                                                                                                 |
| anything                    | live with all four NULL                     | `SETTINGS_UNKNOWN` — the live plan has not been recalculated since the mirror shipped                                                                                                                                                                        |
| baseline non-null           | live NULL                                   | `SETTINGS_UNKNOWN`. **Unreachable given the current write path** — a non-null baseline value was copied from a live mirror that is never cleared — but it is handled rather than asserted away, because "unreachable" is a property of code that can change. |

**Three obligations on the consumer, carried forward from the previous pass's §8 and now applying to
both sides rather than only the old one:**

1. **Three outcomes, not two.** `UNKNOWN` is a first-class, reportable outcome in the ADR-0116 D3
   tradition, rendered as a sentence, never as a code and never as silence.
2. **Never coalesce.** `mirror.criticalFloatThresholdMinutes ?? 0` is the exact lie this design
   exists to prevent and the single most likely line a later contributor writes, because it makes a
   type error disappear and looks like tidying. One structural test, comment-stripped, with a pinned
   positive case, verified red first (the ADR-0116 G4 shape) — banning `??` / `||` / `?:` defaulting
   on the four mirror fields **and** the four baseline fields, while permitting `?? null`.
3. **`UNKNOWN` must never render as `MATCH`.** "If we can't tell, assume nothing changed" reproduces
   the pre-CQ-1 behaviour behind a badge claiming it has been checked, which is worse than the
   original defect. Assert it as a case, not a paragraph.

And `SETTINGS_DIFFER` is a **caveat on the report, not a refusal**: the delta is still computed and
still shown, because the movement it reports is real movement of persisted values. What changes is
what a reader may conclude from it.

### 8.2 The free signal, stated precisely

Comparing `plans.critical_*` (the live **configuration**, `schema.prisma:681/699/706/711`) against
`plans.schedule_critical_*` (the rule the last recalculation **ran**) is now a one-row, no-join,
no-engine test, and it answers a question the product has never been able to ask:

> **"Your criticality settings have changed since this schedule was calculated. Recalculate to apply
> them."**

Both values are already on the plan row every relevant read loads (V12), so it costs nothing.

**What it can detect exactly:** that the live configuration of any of the four criticality options
differs from what produced the displayed critical path — which is the ADR-0116-shaped statement that
the picture on screen is not the picture the settings describe.

**What it must not do, and this matters on the first deploy:** if the mirror is NULL, the comparison
is **unknowable and the signal must be withheld**, not shown. Rendering "your settings have changed"
for every NULL mirror would fire on **every plan in the installation** the day this ships, which is
how a true signal gets muted forever (the ADR-0075 / ADR-0087 M4 lesson).

**What it cannot detect, stated so it is not over-claimed:**

- **The other seven scheduling options.** They are not mirrored (B1), so the signal is specifically a
  _criticality settings_ signal and must be worded as one, never as a general "your plan is out of
  date". A planner who changes `progress_recalc_mode` and does not recalculate gets nothing.
- **Any change to the plan's data** — activities, durations, logic, progress, calendars. Staleness of
  that kind is `schedule_computed_at`'s territory and is unaffected by this change.
- **A change made and reverted between two recalculations.** Configuration equals mirror, no signal —
  correctly, because the displayed schedule _does_ reflect the current settings.
- **Which activities the change would move.** Answering that needs a recalculation. The signal says
  the rule differs; it must not imply a magnitude.

Where this is surfaced (the plan facts row, the comparison panel, both, neither) is a product
decision outside this pass. The schema makes it available; nothing here requires it to be used.

---

## 9. Obligations this change creates elsewhere

| Artefact                                               | Obligation                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`                        | The four fields + the docblock in §4. **Also in the same commit:** `:706` and `:711` still claim the engine consumes those options "in a later M6 task" — stale since `schedule.service.ts:1275-1276` (the ADR-0071 lesson about stepping over drift).                                                                                                                                                                 |
| `apps/api/src/modules/schedule/schedule.service.ts`    | The shared `CriticalityRule` (§6.1) and the third argument at `:309`.                                                                                                                                                                                                                                                                                                                                                  |
| `apps/api/src/modules/schedule/schedule.repository.ts` | The stamp's third parameter and four `SET` clauses (§6.2), with the explicit enum casts.                                                                                                                                                                                                                                                                                                                               |
| `apps/api/src/modules/baselines/*`                     | `CaptureInput.criticalityRule` (§7.2a), the in-lock mirror read (§7.2b).                                                                                                                                                                                                                                                                                                                                               |
| `feature-spec.md` §4.1 / §0.2 / §3                     | **Reword "no engine-path file is touched"** to "the recalculation persistence is touched; the engine is not" (B8), and change the Database row from "NONE unless CQ-1" to two additive migrations. The product owner made this a condition of accepting Option B; it is a task, not an aside.                                                                                                                          |
| `docs/DATABASE.md`                                     | A paragraph under "Plan: the mandatory data date" (`:302`) beside the `schedule_computed_at` material: **"The criticality mirror — what the last recalculation ran with, and why NULL is not a default."** Plus the `baselines` subsection the previous pass already owes.                                                                                                                                             |
| `CLAUDE.md` §1                                         | Migration count 58 → **60** (this migration and the `baselines` one). `pnpm check:counts` re-derives it (ADR-0076). Model count unchanged at 29.                                                                                                                                                                                                                                                                       |
| `@repo/types`                                          | No enum addition (V15). If the mirror or the signal is exposed, the DTO fields are `T \| null`, never `T` with a default — the optionality must mirror the sentinel.                                                                                                                                                                                                                                                   |
| `apps/api/test/` + specs                               | Extend `schedule.service.spec.ts:229-242` to assert the third argument (§6.3) — it compiles and passes unchanged otherwise. An API e2e asserting a recalculation writes all four mirrors and does **not** move `version`/`updated_at`. A case pinning that a **pre-mirror plan captures a baseline with all four NULL and reads UNKNOWN** — the one assertion that fails if somebody later "helpfully" adds a default. |
| Structural gate                                        | The no-coalescing gate (§8.1.2), extended to the four mirror fields and permitting `?? null`.                                                                                                                                                                                                                                                                                                                          |
| ADR-0125                                               | Should record B2 (sentinel vs claim, and why the source columns' constant defaults do not transfer), B4 (why the values are parameters and not a self-copy — the sharpest thing in this document), B5 §3 (the cursor-coupling constraint), B8 (the parity reword) and §7.3 (Option B removes a false positive).                                                                                                        |

---

## 10. Summary of the ask

| Question asked                                                | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Exact columns, types, nullability, defaults; NULL handling | `schedule_critical_path_definition CriticalPathDefinition?`, `schedule_critical_float_threshold_minutes Int?`, `schedule_total_float_mode TotalFloatMode?`, `schedule_make_open_ends_critical Boolean?` — **nullable, no defaults**. Sentinel discipline confirmed, and the precedent is **closer** than D3's: `plans.schedule_computed_at`, same table, same writer. NULL on either side ⇒ `SETTINGS_UNKNOWN`, never coalesced, never rendered as MATCH (§8.1).                                                                                                                                                     |
| 2. Is `stampScheduleComputedAt` the right site?               | **Yes, and it is provably the only one** — one non-spec caller, one writer of `early_start`, one `SET schedule_computed_at`, all in one transaction under the plan advisory lock with the pen asserted (V3, V8). It touches neither `version` nor `updated_at` nor `updated_by`, and **the four added `SET` clauses preserve that — proved by execution, not read off the docblock** (V6). **But the sketch's "four more SET clauses" is wrong as written**: the values must be a parameter carrying what the engine ran with, from one shared object, never a self-copy and never `graph.options` (§0.1 #1–#2, B4). |
| 3. Levelling                                                  | Goes through the **same** stamp (V8), and **does not matter** — the overlay writes only `leveled_*`/`leveling_*`, so `is_critical`/`total_float` are the pure network values either way (V7). Hence `level_resources`/`level_within_float_only` are correctly not mirrored (B3).                                                                                                                                                                                                                                                                                                                                     |
| 4. Migration safety                                           | Metadata-only, **measured**: 1.276 ms for four columns at 200,000 rows, `pg_relation_filenode` unchanged; ≈ 93 ms including three validated CHECKs. **One migration** — the ADR-0053 M3 enum split does not apply, reproduced both halves again for this shape. Write-path cost **+0.0015 ms per recalculation** (min-of-7 over 2,000 updates). Measured on PG 16.13, stated as a generalisation to 17.                                                                                                                                                                                                              |
| 5. The four `baselines` columns                               | **Columns unchanged** — D7 re-verified. **The capture path is not**: `CaptureInput` takes one **nullable grouped object** rather than four required fields (the previous pass's all-or-none mechanism no longer works), and the in-lock re-read moves from "preferable" to **mandatory** for a new reason. NULL mirrors at capture ⇒ capture **succeeds** and writes all four NULL (§7.2).                                                                                                                                                                                                                           |
| 6. Constraints, and same shape as `baselines`?                | **Three.** All-or-none and range are **deliberately identical in shape** to their `baselines` siblings. The third, `ck_plans_schedule_criticality_requires_cursor`, is **new and deliberately has no `baselines` analogue**: it states in the database that the mirror and the cursor describe one run — a property that today rests only on there being one write site. **No index** (trigger to revisit named).                                                                                                                                                                                                    |
| 7. `SETTINGS_*` semantics and the free signal                 | Both sides now read mirrors, so the outcome is about two **computations**, not two configurations — which also **removes a false positive** the previous design could produce (§7.3). The free signal is `plans.critical_*` vs `plans.schedule_critical_*`, exact when the mirror exists, **withheld (not shown) when it is NULL**, scoped to criticality only, and silent on a change-and-revert (§8.2).                                                                                                                                                                                                            |

**Parity, plainly:** `computeSchedule`'s signature, inputs and behaviour are untouched and the
ADR-0034 gate holds **structurally** — no engine input changes and the engine never reads `plans`.
The epic's "no engine-path file is touched" sentence, however, is now false and must be reworded.

**One thing this design still cannot do, stated plainly:** it says which rule produced the persisted
schedule, and it says nothing about the seven other scheduling options that also changed. That is
deliberate (B1) and its widening trigger is named rather than left to be rediscovered.
