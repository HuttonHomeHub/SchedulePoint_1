# CQ-1 schema design — freezing the criticality rule on a baseline

- **Status:** Design for review. **Nothing has been applied** — `schema.prisma` is unedited and no
  migration file exists. This document is the `CLAUDE.md` §19.3 / §20 `database-architect` pass.
- **Author:** database-architect
- **Date:** 2026-09-03
- **Subject:** `docs/specs/revision-compare-delta/feature-spec.md` §6 CQ-1, answered **(b) freeze**.
- **Builds on:** ADR-0025 (baseline snapshot-copy), ADR-0068 §5 (the frozen day factor),
  ADR-0071 M3 (`baseline_activities.budgeted_expense` — **the governing precedent here**),
  ADR-0035 §17/§18/§20 (the criticality options), ADR-0053 M3 (the enum two-migration rule).

---

## 0. Verdict, up front

The spec's proposal is **wrong in two ways and right in its instinct**. Both corrections make the
design more honest, and neither makes it bigger in any way that matters.

| #   | The spec says (§0.2, §4.6, §6 CQ-1)                                                                                                                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Correction                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Three** scalars: `critical_path_definition`, `critical_float_threshold_minutes`, `make_open_ends_critical`                                         | **WRONG — it is four.** `total_float_mode` decides which of two computed spans is exposed as `totalFloat` (`compute.ts:675-681`), and that value is _both_ the `TOTAL_FLOAT` criticality predicate's left-hand side (`:683-687`) _and_ the `total_float` this feature reports as float movement. Omitting it leaves the exact defect CQ-1 exists to close, one field along — this register's most-recorded failure shape.                                                                                                          | Freeze **four**.                                                                                                                                                                                                            |
| 2   | "Three **constant-defaulted** scalars … the ADR-0068 `hours_per_day_minutes` precedent **verbatim** … every existing baseline keeps today's meaning" | **WRONG, and it is the important one.** ADR-0068's `DEFAULT 1440` was permissible only because it was **true of every existing row** — the migration says so in those words, and so does `cost_snapshot_level DEFAULT 'ACTIVITY'`. The criticality defaults are **not** true of history: all four columns have been planner-writable since `20260716180000` / `20260802120000`, so a baseline captured on a plan with `threshold = 2880` would be backfilled `0` — a false statement about how its own `is_critical` was computed. | **Nullable, no default. NULL is a sentinel meaning "unknown", never a claim.** The governing precedent is `baseline_activities.budgeted_expense` (ADR-0071 M3), in this same model family, decided for exactly this reason. |
| 3   | "metadata-only `ADD COLUMN`, no rewrite"                                                                                                             | **CORRECT**, and now measured rather than asserted (§3). True for the nullable form _and_ for the constant-enum-default form the spec proposed.                                                                                                                                                                                                                                                                                                                                                                                    | Keep the claim; the evidence is in §3.                                                                                                                                                                                      |
| 4   | "`database-architect` … three additive columns and one agent run"                                                                                    | Correct in spirit. The pass also surfaced a **third-order gap the frozen columns cannot close** (§7): the plan's live settings are not necessarily the settings that produced the persisted `is_critical`, because a settings PATCH neither recalculates nor marks the schedule stale.                                                                                                                                                                                                                                             | Recorded as **Finding F2** with a costed Option B. **Not smuggled into this design** — it is a product-owner decision.                                                                                                      |

**Recommended, and what the rest of this document specifies:** four **nullable, no-default** columns
on `baselines`, two raw-SQL CHECK constraints (one fail-closed all-or-none, one range), **no index**,
one migration, no enum changes, no table rewrite. The read model treats NULL as a first-class
`UNKNOWN` outcome and is **forbidden to coalesce it to a default**.

---

## 1. What was verified, and how

`CLAUDE.md` §19.11 / ADR-0076: every decision-bearing claim below names what was run or read. **No
claim is carried forward from the spec unchecked** — two did not survive.

| #   | Claim                                                                          | Established by                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Verdict                                                                                                   |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C1  | `Baseline` freezes no criticality setting                                      | `apps/api/prisma/schema.prisma:1735-1810` — the model's columns are `is_active`, `captured_at`, `data_date`, `captured_project_finish`, `hours_per_day_minutes`, `cost_snapshot_level` plus housekeeping. None is a criticality option.                                                                                                                                                                                                                                    | **Confirmed** (spec V11)                                                                                  |
| C2  | The plan holds the criticality options                                         | `schema.prisma:681` `criticalPathDefinition`, `:699` `criticalFloatThresholdMinutes`, `:706` `totalFloatMode`, `:711` `makeOpenEndsCritical` — all four `NOT NULL` with constant defaults                                                                                                                                                                                                                                                                                  | **Confirmed, and it is FOUR not three**                                                                   |
| C3  | All four are consumed by the engine **today** (none is dark)                   | `schedule.service.ts:1267-1277` passes all four into `ComputeOptions`; `compute.ts:150-152` reads them; `:675-681` selects the float by mode; `:683-687` `byDefinition`; `:695-696` `isCritical`. The schema comments on `:706`/`:711` saying "the engine consumes it in a later M6 task" are **stale** — the wiring landed.                                                                                                                                               | **Confirmed live**                                                                                        |
| C4  | Exactly these four change `is_critical` **without changing a single date**     | Read `compute.ts:400-420` (`LONGEST_PATH` builds `onLongestPath` by walking already-computed driving edges — it produces a _set_, not dates), `:668-681` (both float spans are computed unconditionally; the mode only _selects_ which is exposed), `:689-696` (`makeOpenEndsCritical` ORs an open-end test into an already-decided predicate). Contrast `ignoreExternalRelationships` / `useExpectedFinishDates` / `progressRecalcMode`, which move the dates themselves. | **Confirmed** — this is the discriminator for the column set (§2, D1)                                     |
| C5  | All four are planner-writable through the public API                           | `plans.service.ts:154-163` patches each from `UpdatePlanDto`; `update-plan.dto.ts:90-117`; the web surface is `PlanScheduleSettings.tsx` + `PlanCriticalFloatThresholdField.tsx`                                                                                                                                                                                                                                                                                           | **Confirmed** — so a default is a claim about history that is _knowably_ sometimes false                  |
| C6  | The columns' history: when did a non-default value become possible?            | `prisma/migrations/20260716180000_m6_plan_float_options/migration.sql:28-57` created the two enum types and three of the columns; `20260802120000_critical_float_threshold_minutes/migration.sql:115` the threshold's minutes form                                                                                                                                                                                                                                         | **Confirmed** — planner-writable since 2026-07-16, i.e. **before** the deployed host's existing baselines |
| C7  | `ADD COLUMN` of the proposed shape is metadata-only on a populated table       | Measured. See §3 — filenode unchanged, 1.8 ms for four columns at 200,000 rows                                                                                                                                                                                                                                                                                                                                                                                             | **Confirmed by measurement, not by reading**                                                              |
| C8  | The ADR-0053 M3 two-migration enum rule applies here                           | The rule is about a **newly added label** used in the same transaction; both enum types (`CriticalPathDefinition`, `TotalFloatMode`) were committed by `20260716180000` and **no label is added**. Reproduced both halves in Postgres — the new-label case errors `unsafe use of new value`, the existing-label case succeeds (§3)                                                                                                                                         | **Does NOT apply. One migration is correct and sufficient.**                                              |
| C9  | The capture path already has the four values in hand                           | `baselines.service.ts:123` loads the plan via `plan.repository.ts:74-80` `findActiveByIdInOrg`, which is a bare `findFirst` returning the **whole `Plan` row** — no `select`, so all four are already present. **No extra query is needed.**                                                                                                                                                                                                                               | **Confirmed**                                                                                             |
| C10 | The frozen threshold is directly comparable to the live one with no conversion | Both are working **minutes** (`schema.prisma:699` and its docblock; `schedule.service.ts:1274` passes it through unconverted, with a comment forbidding a factor). `hours_per_day_minutes` is **not** involved.                                                                                                                                                                                                                                                            | **Confirmed** — a reader tempted to convert must not                                                      |
| C11 | A plan settings change neither recalculates nor marks the schedule stale       | `plans.service.ts:140-200` writes only `PlanPatch`; `scheduleComputedAt` appears nowhere in `src/modules/plans/` outside a spec fixture. The web says so in its own docblock: `PlanScheduleSettings.tsx:36-38` — _"it changes no dates itself — a later Recalculate applies the new definition/measure"_                                                                                                                                                                   | **Confirmed — this is Finding F2 (§7)**                                                                   |
| C12 | ADR-0068's default was justified as _true of history_, not as convenience      | `20260801120000_calendar_hours_per_day/migration.sql:6-10`: _"the factor was the constant 1440, which was correct for every calendar in the system because nothing could author a weekly pattern that was not full days"_. Same argument in `20260802140000_baseline_assignment_costs/migration.sql:40`: _"is not merely convenient — it is TRUE of every row"_                                                                                                            | **Confirmed — and it is exactly the argument that fails here**                                            |

---

## 2. Design decisions

### D1 — Freeze **four** columns, and the boundary is "changes criticality without moving a date"

The set is `critical_path_definition`, `critical_float_threshold_minutes`, `total_float_mode`,
`make_open_ends_critical`.

The spec named three. `total_float_mode` belongs for a reason that is stronger than symmetry:

```ts
// compute.ts:675-681
const totalFloat =
  totalFloatMode === 'START'
    ? startFloat
    : totalFloatMode === 'SMALLEST'
      ? Math.min(startFloat, finishFloat)
      : finishFloat;
// compute.ts:683-687
const byDefinition =
  criticalDefinition === 'LONGEST_PATH' ? onLongestPath.has(id) : totalFloat <= criticalThreshold;
```

So the mode decides (a) the number persisted into `activities.total_float` and
`baseline_activities.total_float` — which this feature reports as **float movement** — and (b) the
left-hand side of the `TOTAL_FLOAT` criticality test. A planner who moves `FINISH → SMALLEST` and
recalculates gets a different critical set and different floats **with every bar in exactly the same
place**. Under the spec's three-column design the comparison would report that as real movement and
still claim `SETTINGS_MATCH`. That is CQ-1's own defect surviving in the fix for CQ-1.

**Why the boundary sits there, and why the other seven plan options are out.** `Plan` carries eleven
single-row scheduling options. The four above share a property no other one has (C4): they change
`is_critical` / `total_float` while leaving every computed date byte-identical. The others
(`progress_recalc_mode`, `use_expected_finish_dates`, `ignore_external_relationships`,
`level_resources`, `level_within_float_only`, `scheduling_mode`) change the **network** — so when the
delta reports movement, the dates really did move and the report is true, if incomplete. The four
here are the only ones that can make **"7 activities entered the critical path"** true of the data
and false about the world. Freezing the whole option set was considered and rejected: it would freeze
facts this feature does not read, invite a reader to treat the baseline as a general engine-input
snapshot (the design the superseded spec was killed for), and dilute a CHECK that should mean one
thing.

### D2 — They belong on `baselines`, not `baseline_activities`

Three reasons, in descending strength:

1. **It is a capture-level fact.** One `computeSchedule` run produced the whole snapshot under one
   rule; there is no per-activity variation to model. Putting it on `baseline_activities` would
   repeat one value N times, and `docs/DATABASE.md` ("Relationships") permits denormalisation only
   with a **measured** reason. There is none — the read is one row.
2. **The read needs the answer before it looks at any row.** This is `cost_snapshot_level`'s own
   argument (`schema.prisma:1765-1772`), and it applies verbatim: the delta must decide
   `SETTINGS_MATCH` / `SETTINGS_DIFFER` / `SETTINGS_UNKNOWN` **once**, up front, because that outcome
   caveats the entire report — including the parts computed before any activity row is examined.
3. **A per-row copy makes internal disagreement representable.** Two rows of one capture claiming
   different thresholds is a state with no meaning, and nothing in a same-row CHECK could forbid it
   (it is a cross-row property). On `baselines` it is unrepresentable by construction.

The sibling `hours_per_day_minutes` sits on `baselines` for the same reason (`schema.prisma:1760`).

### D3 — **Nullable, no default. NULL is a sentinel, not a value.** This is the load-bearing decision

The spec proposes constant defaults "mirroring the ADR-0068 precedent exactly". **That precedent does
not transfer, and the reason is written into the precedent itself** (C12): `DEFAULT 1440` was legal
because 1440 was _true of every existing row_ — nothing in the product could produce a calendar for
which it was false. `DEFAULT 'ACTIVITY'` on `cost_snapshot_level` carries the identical justification
in the identical words.

Neither holds here. `critical_float_threshold_minutes` has been planner-writable since 2026-07-16
(C5, C6). A baseline captured last month on a plan running `LONGEST_PATH` with a 2-day threshold
would be backfilled `TOTAL_FLOAT` / `0` / `FINISH` / `false`. Those columns would then be read by a
feature whose entire premise is that everything it says is true, and they would say something false —
**and, worse, they would say it confidently**, because a NOT NULL column offers a reader no way to
tell a captured value from a manufactured one.

The correct precedent is one table along, and it decided this exact question:

> `baseline_activities.budgeted_expense` — _"NULLABLE / NO DEFAULT, and the NULL means 'not
> decomposed' … A `NOT NULL DEFAULT 0` was rejected for the same reason: 0 is a claim ('this
> activity had no expense'), and on a pre-ADR-0071 baseline that claim is unknowable, not zero."_
> — `schema.prisma:1795-1801` (ADR-0071 M3)

So:

| Value             | Means                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| all four non-null | the rule the plan held at capture, frozen                                                                                              |
| all four NULL     | **unknown** — this baseline predates the freeze, and the rule that produced its `is_critical` is not recoverable **by anything, ever** |
| a mix             | **unrepresentable** — refused by `ck_baselines_criticality_snapshot_all_or_none`                                                       |

This is a **sentinel, and the distinction matters more than the column names** (the brief is right
about that). Concretely, it is what lets the read model distinguish three outcomes where a defaulted
design can only express two, and the missing third is the honest one.

**No `criticality_snapshot_level` discriminator column.** A reader will reach for one by analogy with
`cost_snapshot_level`, and should not. That column exists because its evidence lived in a **different
table** — "zero `baseline_assignments` rows" cannot distinguish "nothing to decompose" from "nothing
was decomposed". Here all four values live in the same row as the discriminator would, so the
discriminator _is_ `critical_path_definition IS NULL`, with the all-or-none CHECK making that test
total. Adding a fifth column would create the two-sources-of-truth problem `cost_snapshot_level`'s
own docblock warns about, in a case that does not need it.

### D4 — Two CHECK constraints; both raw SQL in the migration, both documented in the model

Prisma cannot express `CHECK`, so per `docs/DATABASE.md` and TECH_DEBT #54 they live in the migration
with a documenting comment in the model and **no `@@index` or other declaration** the database does
not have (`prisma:check-drift` = `prisma migrate diff --exit-code`, `apps/api/package.json:23`).

1. **`ck_baselines_criticality_snapshot_all_or_none`** — fail-closed, in the
   `ck_notes_exactly_one_parent` / `ck_resources_group_no_scheduling_fields` tradition:

   ```sql
   num_nonnulls(critical_path_definition, critical_float_threshold_minutes,
                total_float_mode, make_open_ends_critical) IN (0, 4)
   ```

   It makes "half a rule" unrepresentable, which is what makes D3's three-state read _total_: the
   read may test one column and be right about all four. Written as an explicit membership test
   rather than `= 4 OR = 0` so that adding a fifth setting later fails loudly against the literal
   rather than passing silently.

2. **`ck_baselines_critical_float_threshold_minutes_range`** — `IS NULL OR BETWEEN 0 AND 5256000`,
   mirroring `ck_plans_critical_float_threshold_minutes_range`
   (`20260802120000_.../migration.sql:115-117`) with the nullable-safe guard the sibling does not
   need. Same bounds deliberately: a frozen copy must not be able to hold a value its source column
   would refuse, and widening a CHECK later is free while narrowing one is not.

**No CHECK on the two enum columns** — the Postgres enum type is the constraint. **No CHECK tying
these to `hours_per_day_minutes`**: the threshold is in minutes and the factor is not involved (C10);
a cross-column rule would imply a relationship that does not exist.

### D5 — No index. Deliberately, with the reason

All four are read **only alongside their own row, by primary key**, when the delta loads the `from`
baseline. There is no new `WHERE`, `JOIN` or `ORDER BY` predicate anywhere in the feature — the
comparison never asks "which baselines used LONGEST_PATH?". `docs/DATABASE.md` ("Indexes"): index
**query patterns, not columns**; `20260801120000_.../migration.sql` closes with exactly this sentence
for `hours_per_day_minutes`. Four unindexed columns on a table of a handful of rows per plan also
cost the capture write nothing.

The trigger to revisit is named rather than left implicit: **a route that filters or groups baselines
by a criticality setting**. There is no such route in this spec and none proposed.

### D6 — Column names are the source names, unprefixed

`critical_path_definition`, `critical_float_threshold_minutes`, `total_float_mode`,
`make_open_ends_critical` — identical to `plans`. A `captured_*` prefix was considered and rejected:
every column on `baselines` is captured by definition, `hours_per_day_minutes` sets the verbatim-name
precedent (`schema.prisma:1760`), and the delta's core operation is a **field-by-field comparison of
two rows** — like-named columns make that code and its tests read as what they are. (`data_date` is
not a counterexample: it renames because its source is `planned_start`, a name that means something
different on a snapshot.)

### D7 — Forward-compatible with the fix for Finding F2

If Option B (§7) is later accepted, **these four columns do not change** — only the _source_ the
capture path copies them from moves, from `plans.critical_*` to the engine-stamped mirrors. Nothing
here is thrown away by that decision, which is why it can be deferred honestly rather than rushed.

---

## 3. Migration safety — measured, not assumed

**Measured on PostgreSQL 16.13** (the local server; `select version()`), against a table seeded with
**200,000 rows**. The repo targets PG 17; the two behaviours exercised are unchanged between 16 and
17 — the non-rewriting `ADD COLUMN … DEFAULT` optimisation landed in PG 11 (`pg_attribute
.attmissingval`) and `check_safe_enum_use` has been in place since PG 12. **This is stated as a
generalisation from a 16.13 measurement, not as a 17 measurement**, and re-running the probe below on
17 before merge is cheap if the reviewer wants it closed.

```
-- four columns, two of them enum-typed, NULLABLE with no default
ALTER TABLE baselines ADD COLUMN critical_path_definition "CriticalPathDefinition",
  ADD COLUMN critical_float_threshold_minutes INTEGER,
  ADD COLUMN total_float_mode "TotalFloatMode",
  ADD COLUMN make_open_ends_critical BOOLEAN;
Time: 1.785 ms       filenode before 577351 → after 577351   (NO REWRITE)

-- for comparison: the spec's proposed shape, a NOT NULL constant ENUM default
ALTER TABLE baselines ADD COLUMN spec_defn "CriticalPathDefinition" NOT NULL DEFAULT 'TOTAL_FLOAT';
Time: 0.771 ms       filenode 577351 (unchanged)
pg_attribute: spec_defn  atthasmissing = t  attmissingval = {TOTAL_FLOAT}
```

**Three findings from that probe:**

1. **The nullable form is metadata-only**, as is the constant-default form. `pg_relation_filenode`
   is identical before and after; 1.8 ms for four columns at 200k rows.
2. **A constant enum default is non-volatile and does _not_ force a rewrite** — Postgres stores the
   literal in `attmissingval` exactly as it does an integer. So the spec's "no rewrite" claim was
   correct for its own proposal; the reason to reject that proposal is honesty (D3), not cost. The
   question in the brief — _"whether a constant default is correct for an enum-valued column"_ — has
   two separate answers: **mechanically yes, semantically no.**
3. **The ADR-0053 M3 two-migration rule does not apply.** Reproduced both halves:

   ```
   BEGIN; ALTER TYPE "TotalFloatMode" ADD VALUE 'MIDDLE';
          ALTER TABLE baselines ADD CONSTRAINT tmp_ck CHECK (total_float_mode IS DISTINCT FROM 'MIDDLE');
   ERROR:  unsafe use of new value "MIDDLE" of enum type "TotalFloatMode"
   HINT:   New enum values must be committed before they can be used.

   BEGIN; ALTER TABLE baselines ADD CONSTRAINT tmp_ck2 CHECK (... 'SMALLEST'::"TotalFloatMode" ...);
   ALTER TABLE   -- an EXISTING, previously-committed label in one transaction is fine
   ```

   This migration **adds no enum label** and both types were committed by `20260716180000` (C6, C8),
   so **one migration file is correct**. Splitting it would be cargo-culting the precedent's shape
   without its cause.

**Constraint cost, measured on the same 200k-row table:**

```
ADD CONSTRAINT ck_..._all_or_none ... NOT VALID     1.086 ms   (ACCESS EXCLUSIVE, catalogue only)
VALIDATE CONSTRAINT ck_..._all_or_none             16.346 ms   (SHARE UPDATE EXCLUSIVE, one scan)
ADD CONSTRAINT ck_..._threshold_range ... NOT VALID 0.750 ms
VALIDATE CONSTRAINT ck_..._threshold_range         11.546 ms
filenode after all four statements: 577351 (unchanged)
```

`NOT VALID` + `VALIDATE` is used because it is what the immediately adjacent constraint on this very
table does (`ck_baselines_hours_per_day_minutes_range`,
`20260801120000_.../migration.sql:31-33`), and because `VALIDATE` takes only SHARE UPDATE EXCLUSIVE
rather than holding ACCESS EXCLUSIVE across a scan. `NOT VALID` still enforces both constraints on
**every new and updated row** from the moment it commits; only existing-row validation is deferred to
the second statement. Real `baselines` tables are a handful of rows per plan, so 16 ms at 200k rows
is an upper bound with several orders of magnitude of headroom.

**Both CHECKs were verified to refuse and to admit** (not merely to install):

```
INSERT ... (critical_path_definition) VALUES ('TOTAL_FLOAT');   -- half-set
  ERROR: violates check constraint "ck_baselines_criticality_snapshot_all_or_none"
INSERT ... all four set                                          -- INSERT 0 1
INSERT ... none set                                              -- INSERT 0 1
INSERT ... threshold -1 (all four set)                           -- ERROR: ..._threshold_minutes_range
```

**Locks and duration.** One `ALTER TABLE` with four `ADD COLUMN` sub-commands plus two `ADD
CONSTRAINT … NOT VALID` take a brief ACCESS EXCLUSIVE on `baselines` for catalogue updates only; the
two `VALIDATE`s take SHARE UPDATE EXCLUSIVE. Nothing blocks reads of `activities`, and nothing
touches `baseline_activities`. Total measured work at 200k rows: **~30 ms**. Safe under the
self-migrating container entrypoint (ADR-0018) with no maintenance window.

**Backfill: none, by design.** See D3 — there is nothing to backfill _to_. Existing rows read NULL,
which is the true statement.

**`prisma migrate diff` drift:** the four columns are declared in `schema.prisma` and generated by
Prisma; the two CHECKs are invisible to Prisma and are therefore raw SQL with **no** corresponding
schema declaration, per the house rule.

---

## 4. Proposed Prisma change

**Not applied.** Insert after `hoursPerDayMinutes` (`schema.prisma:1761`), before `costSnapshotLevel`.

```prisma
model Baseline {
  // … unchanged through hoursPerDayMinutes (:1755-1760) …

  // THE CRITICALITY RULE AT CAPTURE (ADR-0125 / CQ-1). `is_critical` and `total_float` on the
  // snapshot rows are not properties of an activity — they are the OUTPUT of a rule the PLAN holds,
  // and until this existed a baseline froze the output and not the rule. A planner who moves the
  // threshold, the definition, the float measure or the open-ends option and recalculates gets a
  // different critical set with EVERY BAR IN THE SAME PLACE, so a comparison against an older
  // baseline reports a large, real-looking set as having "entered the critical path". These four
  // columns are exactly the plan options that can do that (verified against compute.ts:400-420,
  // :668-696: they change is_critical / total_float and move no date); the other seven plan
  // scheduling options change the network itself, so movement they cause is real movement.
  //
  // NULLABLE WITH NO DEFAULT, AND THE NULL IS A SENTINEL — "the rule is unknown", never a claim.
  // This deliberately DOES NOT follow the hours_per_day_minutes DEFAULT 1440 pattern above: that
  // default was legal because 1440 was TRUE of every pre-existing row (nothing could author a
  // non-full-day calendar). These four have been planner-writable since 20260716180000, so a
  // DEFAULT would tell a two-month-old baseline it was computed under a rule it may never have
  // seen. The precedent that governs here is baseline_activities.budgeted_expense (ADR-0071 M3),
  // which rejected `NOT NULL DEFAULT 0` in this table family for exactly this reason: 0 is a claim,
  // and on an older snapshot that claim is unknowable, not zero.
  //
  // ALL FOUR OR NONE. ck_baselines_criticality_snapshot_all_or_none (raw SQL in the migration —
  // Prisma cannot express CHECK, so there is deliberately no declaration here that the database
  // does not have; prisma:check-drift, TECH_DEBT #54) makes "half a rule" unrepresentable, which is
  // what lets a reader test ONE column and be right about all four. There is therefore NO separate
  // `*_snapshot_level` discriminator: unlike cost_snapshot_level below, whose evidence lived in
  // another table (a row count), the discriminator here is `critical_path_definition IS NULL` on
  // this same row, and a fifth column would be the two-sources-of-truth defect that docblock warns
  // about. The threshold is bounded by ck_baselines_critical_float_threshold_minutes_range
  // (nullable-safe, same 0…5_256_000 bounds as ck_plans_critical_float_threshold_minutes_range).
  //
  // WORKING MINUTES, NOT DAYS. criticalFloatThresholdMinutes is in the same unit the engine compares
  // it against, so it is copied and compared verbatim — hoursPerDayMinutes is NOT involved and must
  // never be applied to it (schedule.service.ts:1268-1274 forbids a factor for the same reason).
  //
  // Set by the capture path, then IMMUTABLE like every other snapshot column. No index: all four are
  // read only alongside their own row, by id — there is no predicate to serve, and no route filters
  // baselines by a criticality setting (docs/DATABASE.md: index query patterns, not columns).
  //
  // MUST stay in lock-step with the CriticalPathDefinition / TotalFloatMode unions in @repo/types.
  criticalPathDefinition        CriticalPathDefinition? @map("critical_path_definition")
  criticalFloatThresholdMinutes Int?                    @map("critical_float_threshold_minutes")
  totalFloatMode                TotalFloatMode?         @map("total_float_mode")
  makeOpenEndsCritical          Boolean?                @map("make_open_ends_critical")

  // … unchanged from costSnapshotLevel (:1773) onward …
}
```

No enum is added or altered. No relation, no index, no `@@` declaration changes.

---

## 5. Proposed migration

**Not applied.** `apps/api/prisma/migrations/20260903120000_baseline_criticality_settings/migration.sql`

```sql
-- CQ-1 (ADR-0125): a baseline freezes the criticality RULE it was computed under.
--
-- WHY. `baseline_activities.is_critical` and `.total_float` are the OUTPUT of a rule the PLAN holds
-- (plans.critical_path_definition / .critical_float_threshold_minutes / .total_float_mode /
-- .make_open_ends_critical). A baseline froze the output and not the rule, so a planner who changes
-- one of those options and recalculates gets a different critical set with every computed date
-- BYTE-IDENTICAL — and a comparison against an older baseline reports that as activities "entering
-- the critical path". Not only could the product not say so; it could not detect it.
--
-- WHY THESE FOUR AND NOT THE OTHER SEVEN PLAN OPTIONS. Verified against the engine
-- (compute.ts:400-420, :668-696): these four change is_critical / total_float and move NO date.
-- progress_recalc_mode, use_expected_finish_dates, ignore_external_relationships, level_resources,
-- level_within_float_only and scheduling_mode all change the network, so movement they cause is
-- real movement that the comparison is right to report. total_float_mode is in the set — the
-- feature spec named only three — because it selects which of two computed spans is exposed as
-- `totalFloat`, which is BOTH the TOTAL_FLOAT criticality predicate's left-hand side AND the number
-- the comparison reports as float movement.
--
-- NULLABLE, NO DEFAULT, AND THAT IS THE LOAD-BEARING DECISION. NULL means "the rule under which this
-- snapshot's is_critical was computed is UNKNOWN". It is a sentinel, never a claim. A constant
-- DEFAULT would follow the shape of baselines.hours_per_day_minutes DEFAULT 1440 while discarding
-- its justification: that default was legal because 1440 was TRUE of every existing row (nothing in
-- the product could author a non-full-day calendar). These options have been planner-writable since
-- 20260716180000_m6_plan_float_options, so defaulting an existing baseline to
-- TOTAL_FLOAT/0/FINISH/false would state, in a NOT NULL column that offers a reader no way to doubt
-- it, a rule that baseline may never have been computed under. The governing precedent is
-- baseline_activities.budgeted_expense (20260802140000, ADR-0071 M3), which rejected NOT NULL
-- DEFAULT 0 in this same table family for exactly this reason. THE VALUES ARE UNBACKFILLABLE: no
-- surviving artefact records which rule produced a historic snapshot, and inventing one is the
-- defect this migration exists to remove.
--
-- ONE MIGRATION IS CORRECT. The ADR-0053 M3 two-file split exists because a NEWLY ADDED enum label
-- cannot be used in the transaction that added it. This file adds NO label: "CriticalPathDefinition"
-- and "TotalFloatMode" were committed by 20260716180000. Reproduced both halves against Postgres
-- while designing this: adding a label and naming it in one transaction raises
-- `unsafe use of new value`; naming an already-committed label in one transaction succeeds.
--
-- METADATA-ONLY, NO REWRITE, NO BACKFILL, NO DATA MIGRATION. Measured on a 200,000-row table
-- (PostgreSQL 16.13; the ADD COLUMN and enum behaviours are unchanged in 17):
--   ADD COLUMN × 4 (2 enum-typed, nullable, no default)   1.785 ms, pg_relation_filenode UNCHANGED
--   ADD CONSTRAINT … NOT VALID × 2                        1.086 ms / 0.750 ms
--   VALIDATE CONSTRAINT × 2                              16.346 ms / 11.546 ms
-- Every existing row satisfies both CHECKs by construction (all four columns NULL). Real baselines
-- tables are a handful of rows per plan, so the figures above are an upper bound by orders of
-- magnitude; safe under the self-migrating entrypoint (ADR-0018) with no maintenance window.
--
-- NON-SCHEDULING / PARITY. The CPM engine never reads `baselines` — it is handed activities, edges,
-- calendars and ComputeOptions built from `plans` (schedule.service.ts:1262-1279). computeSchedule's
-- signature, inputs and outputs are unchanged, so the ADR-0034 recalculation parity gate is
-- structurally untouched. Capture writes four more scalars inside the transaction it already holds.

-- AddColumn ×4: the criticality rule at capture. Nullable with no default ⇒ metadata-only on
-- PostgreSQL 11+ (no table rewrite, no scan; a brief ACCESS EXCLUSIVE for the catalogue update).
ALTER TABLE "baselines"
  ADD COLUMN "critical_path_definition"         "CriticalPathDefinition",
  ADD COLUMN "critical_float_threshold_minutes" INTEGER,
  ADD COLUMN "total_float_mode"                 "TotalFloatMode",
  ADD COLUMN "make_open_ends_critical"          BOOLEAN;

-- FAIL-CLOSED ALL-OR-NONE (the ck_notes_exactly_one_parent / ck_resources_group_no_scheduling_fields
-- tradition). A half-frozen rule has no meaning, and forbidding it is what makes the three-state read
-- TOTAL: a caller may test `critical_path_definition IS NULL` and be right about all four columns.
-- Written as an explicit IN (0, 4) membership test rather than `= 0 OR = 4` so that adding a fifth
-- setting later fails loudly against the literal instead of passing silently.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none" CHECK (
  num_nonnulls(
    "critical_path_definition",
    "critical_float_threshold_minutes",
    "total_float_mode",
    "make_open_ends_critical"
  ) IN (0, 4)
) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none";

-- Range: the same 0 … 5_256_000 working minutes (≈10 years) as the source column's
-- ck_plans_critical_float_threshold_minutes_range (20260802120000), plus the nullable-safe guard the
-- source does not need. A frozen copy must not be able to hold a value its source would refuse.
-- NOT VALID + VALIDATE mirrors ck_baselines_hours_per_day_minutes_range on this same table; both
-- constraints enforce every new and updated row from the moment they commit, and VALIDATE takes only
-- SHARE UPDATE EXCLUSIVE.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range" CHECK (
  "critical_float_threshold_minutes" IS NULL
  OR "critical_float_threshold_minutes" BETWEEN 0 AND 5256000
) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range";

-- No index on any of the four. They are read only alongside their own row, by primary key, when the
-- comparison loads a baseline; there is no new WHERE/JOIN/ORDER BY predicate anywhere in the feature
-- and no route filters or groups baselines by a criticality setting. Index query patterns, not
-- columns (docs/DATABASE.md) — the same sentence 20260801120000 closes with for hours_per_day_minutes.
-- Revisit ONLY if such a route is added.

-- Down (forward-only in production; documented for completeness):
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range";
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none";
--   ALTER TABLE "baselines" DROP COLUMN "make_open_ends_critical";
--   ALTER TABLE "baselines" DROP COLUMN "total_float_mode";
--   ALTER TABLE "baselines" DROP COLUMN "critical_float_threshold_minutes";
--   ALTER TABLE "baselines" DROP COLUMN "critical_path_definition";
-- Note that a down is IRREVERSIBLE in the only way that matters: the frozen rules are unrecoverable
-- once dropped, exactly as the pre-migration ones are unrecoverable now.
```

---

## 6. What the capture path must write, and where the values come from

**Source: the plan row, read inside the plan write-lock.** All four are already on the loaded `Plan`
— `plan.repository.ts:74-80` `findActiveByIdInOrg` is a bare `findFirst` with **no `select`**, so it
returns the whole row (C9). **No new query, no new join, no engine call.**

### 6.1 `baseline.repository.ts`

`CaptureInput` (`:58-69`) gains four fields beside `hoursPerDayMinutes`:

```ts
/** The criticality RULE at capture (ADR-0125 / CQ-1) — all four together or none. */
criticalPathDefinition: CriticalPathDefinition;
criticalFloatThresholdMinutes: number;
totalFloatMode: TotalFloatMode;
makeOpenEndsCritical: boolean;
```

They are **required, not optional**, so the compiler — not a reviewer — enforces the all-or-none rule
at the only site that can produce a row. `createWithSnapshot` writes them beside
`hoursPerDayMinutes` (`:104`) and `costSnapshotLevel` (`:111`), **unconditionally**, with the same
comment discipline that column carries: a conditional write is how a NULL that means "unknown" gets
confused with a NULL that means "we happened not to set it this time".

`baseline_activities` is **not touched** (D2).

### 6.2 `baselines.service.ts` — read them inside the lock

`capture` currently loads the plan at `:123`, **before** `$transaction` at `:126`. `plan.calendarId`
is then used inside the lock at `:150`. For the new columns, prefer a re-read **inside** the locked
transaction, in the same place `resolveDayFactorMinutes` runs:

```ts
await acquirePlanWriteLock(tx, planId);
// … existing loadActiveActivitiesForCapture / latestFinish / isActive …

// The criticality RULE at capture (ADR-0125 / CQ-1), read INSIDE the lock. The snapshot's
// is_critical / total_float were produced by the last recalculation, which holds this same lock —
// so reading the rule here pairs it with a schedule no concurrent recalculation can be rewriting.
// Read from `tx`, not from the pre-transaction `plan`: a settings PATCH takes NO plan write lock
// (`grep -n acquirePlanWriteLock src/modules/plans/plans.service.ts` returns nothing), so the rule
// can move between the `:123` read and this point.
const rule = await tx.plan.findUniqueOrThrow({
  where: { id: planId },
  select: {
    criticalPathDefinition: true,
    criticalFloatThresholdMinutes: true,
    totalFloatMode: true,
    makeOpenEndsCritical: true,
  },
});
```

and spread `...rule` into `createWithSnapshot`.

**Why not just use the outer `plan`.** It is one extra sub-millisecond primary-key read, and it
closes a window that is otherwise real: a settings PATCH does not take the plan write-lock —
`acquirePlanWriteLock` does not occur in `plans.service.ts` at all — so between `:123` and the
capture the rule can move, and the baseline would then be stamped with a rule
that is not even the plan's current one. Reusing the outer read is _acceptable_ — it is the posture
`calendarId` already has — but it is strictly weaker and there is no reason to inherit it here.
**This is a service change, not a schema change**, and is recorded here because the migration's
correctness claim ("the frozen rule is the plan's rule at capture") depends on it.

### 6.3 What is deliberately **not** changed

`loadActiveActivitiesForCapture` (`baseline.repository.ts:171`), the `SCHEDULE_NOT_CALCULATED`
refusal (`baselines.service.ts:136-141`), the `baseline.captured` audit row (`:176-190`), the advisory lock, and every `baseline_activities`
column. No new audit action: the settings are part of a capture that is already audited, and
ADR-0073's two tests are already satisfied by the existing `baseline.captured` row.

---

## 7. Finding F2 — the frozen rule is a proxy, and the columns cannot close it

**This is the one thing the design pass found that CQ-1 did not ask about, and it is honest to state
it rather than let the read model imply more precision than exists.**

The freeze records **the rule the plan held at capture**. What a reader will assume it records is
**the rule that produced the snapshot's `is_critical`**. Those are the same thing only if the plan
was recalculated after the last settings change and before the capture — and nothing enforces that:

- `plans.service.ts:140-200` writes the settings and touches `schedule_computed_at` nowhere; the
  string does not occur in `src/modules/plans/` outside a spec fixture (C11).
- The product says so itself, on screen: `PlanScheduleSettings.tsx:36-38` — _"it changes no dates
  itself — a **later Recalculate** applies the new definition/measure to the computed critical
  path."_

So a planner can move the threshold and capture without recalculating, and the baseline will carry a
rule that never ran. The live side of a comparison has the same weakness in mirror image, and a
setting moved-and-moved-back between two recalculations can even make the delta report
`SETTINGS_MATCH` when the two persisted outputs were genuinely computed under different rules.

**The residual is bounded and much smaller than the defect being fixed.** Today the product cannot
detect a definition change _at all_; with these four columns it detects every case except "the
settings on the row were never applied to the output". That is a strict, large improvement, which is
why the recommendation is to land it.

> ### ACCEPTED 2026-09-04 — the product owner chose Option B
>
> Finding F2 was put to the product owner with the four options costed, and they chose **to fold the
> complete fix in now** rather than ship the proxy and file the remainder.
>
> Two consequences are taken on deliberately and must not be discovered later:
>
> 1. **This epic can no longer claim "no engine-path file is touched".** The recalculation
>    persistence path is touched — four more `SET` clauses in `stampScheduleComputedAt`. The claim
>    is reworded to _"the recalculation persistence is touched; the engine is not"_ everywhere it
>    appears, and `computeSchedule`'s signature and behaviour are still untouched, so the ADR-0034
>    parity gate holds. The reword is a task, not an aside: a stale claim of engine-purity is
>    exactly the drift this repository keeps recording.
> 2. **It is a second schema change, so it takes its own mandatory `database-architect` pass.**
>    Accepting a design an agent sketched in a rejected-alternatives section is not the same as
>    having designed it; §19.3 admits no exception, and "the architect already described it" is
>    precisely the judgement the rule exists to remove.
>
> The four `baselines` columns in §5 are **unchanged** by this decision — only the source they copy
> from changes (D7).

### Option B — the complete fix, costed, and NOW ACCEPTED (see the banner above)

Make the recalculation record what it ran with, and copy **that** into the baseline:

- Four engine-owned nullable columns on `plans` (`schedule_critical_path_definition`,
  `schedule_critical_float_threshold_minutes`, `schedule_total_float_mode`,
  `schedule_make_open_ends_critical`), NULL = "never recalculated, or recalculated before this
  shipped" — the same sentinel discipline as D3.
- Written by **one existing statement**: `schedule.repository.ts:881-888`
  `stampScheduleComputedAt` already does a raw `UPDATE plans SET schedule_computed_at = now()` inside
  the recalc transaction, deliberately touching neither `version` nor `updated_at` nor `updated_by`.
  Four more `SET` clauses in that statement is the whole write-path change.
- Capture then copies from those mirrors instead of the live options (D7: **the four `baselines`
  columns are unchanged**), and the live side of the comparison reads the mirrors too — so both
  sides become exact rather than proxied. It also yields, free, a real "your criticality settings
  have changed since the last recalculation" signal the plan facts row could show.

**Why it is not in this design.** It changes the recalculation persistence path, which turns this
epic's sentence from _"no engine-path file is touched"_ into _"the recalc persistence is touched, the
engine is not"_. `computeSchedule`'s signature and behaviour are untouched either way and the
ADR-0034 parity gate holds — but the claim in §4.1 of the spec would need rewording, and that is a
product-owner call about the epic's scope, not a database-architect call about a column.

**Rejected alternatives to Option B**, so they are not rediscovered:

| Alternative                                                                                     | Why not                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read `audit_events` for `plan.settings_updated` rows and compare against `schedule_computed_at` | An audit log is **evidence, not state**. Using it as a computational input makes a read model's answer depend on a table whose contents began only at ADR-0073 C3.2, and it would give the wrong answer for every plan edited before that. |
| A single `plans.critical_settings_changed_at` marker compared with `schedule_computed_at`       | Same write-path intrusion as Option B for a strictly weaker answer: it can say _that_ the rule is stale and never _which rule ran_, so a comparison still cannot name the setting that moved.                                              |
| Refuse to capture when the settings are stale                                                   | Unimplementable — staleness is exactly what nothing records. It would also block a legitimate capture for a condition the planner cannot see.                                                                                              |

---

## 8. What the read model must do with a NULL — and one gate worth having

The sentinel is only worth its cost if the reader honours it. Three obligations, for the milestone
that consumes these columns:

1. **Three outcomes, not two.** `SETTINGS_MATCH` / `SETTINGS_DIFFER` (naming which of the four moved,
   with both values) / `SETTINGS_UNKNOWN` (the `from` side predates the freeze — and, once
   baseline-vs-baseline ships, either side). `UNKNOWN` is a **first-class, reportable outcome** in
   the ADR-0116 D3 tradition, rendered as a sentence, never as a code and never as silence.
2. **Never coalesce.** `frozen.criticalFloatThresholdMinutes ?? 0` is the exact lie this design
   exists to prevent, and it is the single most likely line for a later contributor to write, because
   it makes a type error disappear and looks like tidying. It is worth **one structural test**
   banning `??` / `||` / `?:` defaulting on the four frozen fields in the delta module — cheap,
   comment-stripped, with a pinned positive case, verified red first (the ADR-0116 G4 shape).
3. **`UNKNOWN` must not be rendered as `MATCH`.** The tempting shortcut — "if we can't tell, assume
   nothing changed" — reproduces the pre-CQ-1 behaviour while displaying a badge claiming it has been
   checked, which is worse than the original defect. Assert it as a case, not a paragraph.

Note also that `SETTINGS_DIFFER` is a **caveat on the report, not a refusal**: the delta is still
computed and still shown, because the movement it reports is real movement of persisted values — what
changes is what a reader may conclude from it. That mirrors the existing `NOT_ASSESSABLE` /
partial-answer handling in §2 of the spec.

---

## 9. Obligations this change creates elsewhere

| Artefact                        | Obligation                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma` | The four fields + the docblock in §4. **Also worth fixing while there:** `:706` and `:711` still say "the engine consumes it in a later M6 task", which is stale — `schedule.service.ts:1276-1277` passes both today (C3). A one-line correction, in the same commit, per the ADR-0071 lesson about stepping over drift.                              |
| `docs/DATABASE.md`              | A subsection under "Baseline & BaselineActivity: the plan-of-record snapshot" (`:640`), in the shape of "The cost snapshot's two levels — and why 'no rows' is never the signal" (`:688`): **"The criticality rule — and why NULL is not a default"**. The spec's §5 already lists this file as conditional on CQ-1 = freeze.                         |
| `CLAUDE.md` §1                  | The migration count moves 58 → 59 and `pnpm check:counts` re-derives it (ADR-0076). Model count is unchanged at 29.                                                                                                                                                                                                                                   |
| `@repo/types`                   | `CriticalPathDefinition` and `TotalFloatMode` already exist there; the baseline DTO gains four **optional** fields. Optionality in the type must mirror the sentinel — `T \| null`, not `T` with a default.                                                                                                                                           |
| `apps/api/test/`                | An API e2e asserting a capture writes all four; a unit case asserting the repository writes them unconditionally; and — the one most likely to be skipped — a case pinning that a **pre-migration baseline reads all four as NULL and is reported `UNKNOWN`**, which is the only assertion that can fail if someone later "helpfully" adds a default. |
| ADR-0125                        | Should record D1 (why four, not three), D3 (sentinel vs claim, with ADR-0068's precedent explicitly **declined**) and Finding F2 with Option B's trigger. D3 is the one a future reader will most want the reasoning for.                                                                                                                             |

---

## 10. Summary of the ask

| Question asked                              | Answer                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Column set, types, nullability, defaults | **Four**, not three (add `total_float_mode`). `CriticalPathDefinition?`, `Int?`, `TotalFloatMode?`, `Boolean?` — **all nullable, no defaults**. The ADR-0068 precedent is the wrong one and is declined with reasons; a constant enum default is mechanically fine and semantically wrong.                                  |
| 2. `Baseline` or `BaselineActivity`?        | **`Baseline`.** Capture-level fact; the read needs it before any row; a per-row copy makes internal disagreement representable and unconstrainable.                                                                                                                                                                         |
| 3. Migration safety                         | Metadata-only, no rewrite, **measured**: 1.785 ms for four columns at 200k rows, filenode unchanged; ~30 ms including both validated CHECKs. **One migration** — the ADR-0053 M3 enum split does not apply and this was reproduced both ways. Measured on PG 16.13; stated as a generalisation to 17, not a 17 measurement. |
| 4. Backfill                                 | **None, and the NULL is a sentinel, not a claim.** The values are unbackfillable; a default would be a confident false statement in a NOT NULL column. The read model must expose `UNKNOWN` as a third outcome and must never coalesce (§8).                                                                                |
| 5. Indexes / constraints                    | **No index** (no predicate exists; trigger to revisit named). **Two CHECKs**: fail-closed all-or-none, and a nullable-safe range mirroring the source column's. No new enum, no FK, no unique.                                                                                                                              |
| 6. What capture writes                      | Four fields on `CaptureInput`, **required** so the compiler enforces all-or-none, written unconditionally beside `hours_per_day_minutes`. Source: the plan row — already loaded, no new query — but **re-read inside the plan write-lock**, because a settings PATCH takes no plan lock.                                    |

**One thing the design cannot do, stated plainly:** it freezes the rule the plan _held_, not
provably the rule that _ran_ (§7). That gap needs the recalculation to record its own options, which
is Option B, which is a scope decision for the product owner rather than a column choice for me.
