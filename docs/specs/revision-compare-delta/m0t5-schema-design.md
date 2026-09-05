# M0-T5 schema design — the criticality rule frozen onto a baseline

- **Status:** Design for review. **Nothing has been applied** — `schema.prisma` is unedited, no
  migration file exists, and no repository or service code is changed. This document is the
  `CLAUDE.md` §19.3 / §20 `database-architect` pass for the **third and last** schema decision on
  this epic, and the **first taken with M0-T6 already in the tree**.
- **Author:** database-architect
- **Date:** 2026-09-05
- **Subject:** Task M0-T5 of [`implementation-plan.md`](./implementation-plan.md) — four nullable
  columns on `baselines` freezing the criticality rule a snapshot was computed under.
- **Supersedes, on the points where they disagree:** [`cq1-schema-design.md`](./cq1-schema-design.md)
  (pass 1) §6 and its line citations, and [`optionb-schema-design.md`](./optionb-schema-design.md)
  (pass 2) §6/§7.2 code. **Their decisions stand; six of their citations and three of their code
  samples do not** (§1).
- **Builds on:** ADR-0025 (baseline copy-not-reference), ADR-0068 §5 (the frozen day factor),
  ADR-0071 M3 (`baseline_activities.budgeted_expense` — the governing precedent for the sentinel),
  ADR-0022 (engine-owned writes bypass optimistic locking), ADR-0034 (the parity gate).

---

## 0. Verdict, up front

**The settled decisions survive contact with the shipped M0-T6 code. Nothing in this document
re-opens them.** Four columns, nullable sentinels with no defaults, copied from the `plans` mirrors,
one nullable grouped object on `CaptureInput`, plan re-read inside the capture lock — all confirmed
against the tree as it stands, and every one of them for the reason the earlier pass gave.

Six things are new, and four of them change the work:

| #   | Finding                                                                                                                                                                                                                                                                       | Effect                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **The plan's proposed column names are wrong** and pass 1's are right — but the decisive argument is not the one pass 1 gave (§4).                                                                                                                                            | Use `critical_path_definition` / `critical_float_threshold_minutes` / `total_float_mode` / `make_open_ends_critical`. |
| 2   | **Both passes' capture-path code samples will not compile**: the shipped `CriticalityRule` names its first field `criticalPathDefinition`, not `criticalDefinition`, and `stampScheduleComputedAt` took its parameters in a different order than either pass proposed (§1.2). | Rewrite §7.2's snippet; do not copy it.                                                                               |
| 3   | **Both passes wrote an un-org-scoped `tx.plan.findUniqueOrThrow` into the service.** There is a house pattern eight lines away in the same file that is org-scoped and narrowly selected (§6.2).                                                                              | Match `baselines.service.ts:242`, not the design docs.                                                                |
| 4   | Making the in-lock re-read mandatory **also closes a pre-existing orphan-baseline hazard** neither pass noticed: `hierarchy-lifecycle` soft-deletes a plan **without taking the plan write lock** (§7.1).                                                                     | The null branch is reachable and must be a 404, not a silent `null` rule.                                             |
| 5   | **`SETTINGS_UNKNOWN` is a property of which baseline is active, not of the plan** (§7.2). Activating an older baseline silently reverts a confident report to unknown.                                                                                                        | A read-model obligation neither pass states.                                                                          |
| 6   | Two obligations pass 2 recorded for M0-T6 **were not discharged when it shipped** (§8) — and one of them cited material in `docs/DATABASE.md` that has never existed.                                                                                                         | Fold both into M0-T5's commit rather than leaving them.                                                               |

**The third CHECK is confirmed unwarranted — and pass 2's reason is right but incomplete** (§3.3). I
considered a `baselines` analogue it did not, found it defensible, and rejected it with reasons.

**Recommended:** four nullable, no-default columns on `baselines`; **two** raw-SQL CHECKs; **no
index**; one migration; no enum change, no rewrite, no backfill. Measured cost **≈ 59 ms at 200,000
rows with `pg_relation_filenode` unchanged** (§5).

---

## 1. Verifying the two passes against the tree as it stands

`CLAUDE.md` §19.11 / ADR-0076. Every claim below names the command or file that established it.
**Nothing is carried from either design document unchecked**, which is the brief's instruction and
turned out to matter.

### 1.1 What still holds

| #   | Claim (pass, id)                                                                  | Re-checked how                                                                                                                                                                                        | Verdict                                                                                                        |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A1  | The four plan source columns sit at `schema.prisma:681/699/706/711` (p1 C2)       | `grep -n "criticalPathDefinition \|criticalFloatThresholdMinutes \|totalFloatMode \|makeOpenEndsCritical " apps/api/prisma/schema.prisma`                                                             | **Still exact**                                                                                                |
| A2  | All four `ComputeOptions` fields are optional at `compute.ts:71/77/83/90` (p2 V2) | `grep -n "criticalDefinition?\|criticalFloatThresholdMinutes?\|totalFloatMode?\|makeOpenEndsCritical?" src/modules/schedule/engine/compute.ts`                                                        | **Still exact**                                                                                                |
| A3  | `compute.ts:675`/`:683` select the float and decide criticality (p1 D1)           | `grep -n "const totalFloat =\|byDefinition\|onLongestPath.has" …/compute.ts` → `675`, `683`, `685`, `696`                                                                                             | **Still exact**                                                                                                |
| A4  | `findActiveByIdInOrg` is a bare `findFirst` with no `select` (p1 C9, p2 V12)      | `plan.repository.ts:74-80` — `db.plan.findFirst({ where: this.active({ id, organizationId }) })`                                                                                                      | **Confirmed**                                                                                                  |
| A5  | The baseline DTO maps field-by-field, so exposure is opt-in (p2 V13's analogue)   | `baseline-response.dto.ts:65-81` — ten explicit keys, no spread of `entity`                                                                                                                           | **Confirmed for `baselines` too**                                                                              |
| A6  | `@repo/types` already carries both unions (p2 V15)                                | `packages/types/src/index.ts:176`, `:184`                                                                                                                                                             | **Confirmed**                                                                                                  |
| A7  | `docs/DATABASE.md` anchors `:302` and `:640` (p1 §9, p2 §9)                       | `grep -n "^### Plan\|^#### " docs/DATABASE.md`                                                                                                                                                        | **Confirmed** (p1's `:688` for the cost-snapshot heading is `:686`)                                            |
| A8  | The three `plans` CHECKs are invisible to `prisma migrate diff`                   | **Executed** `prisma migrate diff --from-url … --to-schema-datamodel ./prisma/schema.prisma --exit-code` against the live `app_test` DB with all three installed → _No difference detected_, `EXIT=0` | **Confirmed by execution** — the raw-SQL-CHECK-with-no-Prisma-declaration rule is safe for M0-T5's two as well |
| A9  | Both enum types exist and no label is added                                       | The §5 probe executed `ADD COLUMN … "CriticalPathDefinition"` / `"TotalFloatMode"` against the live database and succeeded                                                                            | **Confirmed by execution** — one migration file is correct                                                     |

### 1.2 What is now stale or wrong

**These are corrections to the documents, not to the decisions.** Every one is a citation or a code
sample, and three of the samples would not compile.

| #   | Where               | The document says                                                                                      | The tree says                                                                                                                                                                                                                           |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | p1 C1 §4            | `Baseline` is at `schema.prisma:1735-1810`; insert after `hoursPerDayMinutes` at `:1761`               | `model Baseline` is at **`:1769`**; `hoursPerDayMinutes` at **`:1794`**; `costSnapshotLevel` at **`:1807`**. M0-T6 added ~34 lines to `Plan` and shifted everything below.                                                              |
| S2  | p2 §6.1             | `interface CriticalityRule { criticalDefinition; … }` declared in `schedule.service.ts`                | Shipped as a `type` in **`src/modules/schedule/criticality-rule.ts`**, and its first field is **`criticalPathDefinition`**. `criticalDefinition` is the _engine option_ name, produced by `toCriticalityOptions`.                       |
| S3  | p2 §6.2             | `stampScheduleComputedAt(planId, db, rule)`                                                            | Shipped **`stampScheduleComputedAt(planId, criticality, db)`** (`schedule.repository.ts:894-898`) — the transaction client is **last**.                                                                                                 |
| S4  | p2 §6.3, §5 comment | The stamp is called at `schedule.service.ts:309`; the plan is read at `:244`, `$transaction` at `:266` | Called at **`:314`**; plan read at **`:247`**; `$transaction` at `:266`; `lockPlanForWrite` at `:269`. (The plan document's own `:246` is also off by one.)                                                                             |
| S5  | p2 §7.2a code       | `input.criticalityRule?.criticalDefinition`                                                            | **Will not compile** — see S2. Four call sites in that snippet.                                                                                                                                                                         |
| S6  | p1 §6.2, p2 §7.2b   | Capture reads the plan at `:123` / `:122`, locks at `:127`, `resolveDayFactorMinutes` at `:148`        | Plan read **`:122`**, `$transaction` **`:126`**, `acquirePlanWriteLock` **`:129`**, `resolveDayFactorMinutes` **`:150`**, `createWithSnapshot` **`:155`**.                                                                              |
| S7  | p1 §9, p2 §9        | Migration count moves 58 → 59 (p1) / 58 → 60 (p2)                                                      | **59 today** (`ls apps/api/prisma/migrations \| grep -c "^2026"`, and `node scripts/check-counts.mjs` reports 59 OK). M0-T5 takes it to **60**, in **four** files (§8).                                                                 |
| S8  | p2 §9               | Add a `docs/DATABASE.md` paragraph "beside the `schedule_computed_at` material"                        | `grep -n "schedule_critical\|schedule_computed_at" docs/DATABASE.md` returns **nothing**. There is no such material; `schedule_computed_at` has never been documented there. The instruction described a neighbour that does not exist. |

**S2/S3/S5 are the ones that would have produced wrong work.** The shipped `CriticalityRule` keeps
the _plan column_ vocabulary (`criticalPathDefinition`) and translates to the _engine option_
vocabulary (`criticalDefinition`) in exactly one function, `toCriticalityOptions`, whose
`Required<Pick<ComputeOptions, …>>` return type is the compiler-enforced half. Pass 2 was written
before that split existed and used the engine name throughout. Copying its snippet gives four
type errors — which is the benign failure; the malign one is a reader "fixing" them by renaming the
_baseline_ columns to the engine vocabulary, which would put a **fourth** name on one setting (§4).

---

## 2. Design decisions — confirmed, and what confirms them now

Everything in this section is settled per the brief. It is restated only where the M0-T6 code
changes the _evidence_ for it.

### D1 — Four columns; the boundary is unchanged

`critical_path_definition`, `critical_float_threshold_minutes`, `total_float_mode`,
`make_open_ends_critical`. The set is now **corroborated by shipped code rather than by an argument**:
`criticality-rule.ts` declares exactly these four and no others, and `toCriticalityOptions`'s
`Required<Pick<…>>` return type makes a fifth criticality option a compile error rather than a
silent omission. The `baselines` columns are the frozen image of that type, one for one.

### D2 — On `baselines`, not `baseline_activities` — unchanged

Capture-level fact; the read needs it before any snapshot row; a per-row copy makes internal
disagreement representable and unconstrainable by a same-row CHECK. `hours_per_day_minutes` and
`cost_snapshot_level` both sit here for the same reason.

### D3 — Nullable sentinels, no defaults — unchanged, and now _doubly_ forced

Pass 1's argument stands (ADR-0068's `DEFAULT 1440` was legal because 1440 was true of every existing
row; these settings have been planner-writable since `20260716180000`, so no default is true of
history). M0-T6 adds a second, independent reason that did not exist when pass 1 was written:

> **The source itself is nullable.** `plans.schedule_critical_path_definition` is `NULL` for every
> plan not yet recalculated since 2026-09-05. A `NOT NULL` column on `baselines` would have nothing
> to copy — the capture would have to invent a value, which is the defect the epic exists to remove,
> arriving through a `NOT NULL` declaration.

So the nullability is no longer a judgement about honesty alone; it is what makes the copy
_expressible_. Governing precedent remains `baseline_activities.budgeted_expense`
(`schema.prisma:1905` region — _"0 is a claim … on a pre-ADR-0071 baseline that claim is unknowable,
not zero"_), verified verbatim.

### D4 — Two CHECKs, both raw SQL, no Prisma declaration — see §3

### D5 — No index — see §5.3

### D6 — Column names — see §4 (this is the one the brief asked me to decide)

---

## 3. The exact migration

### 3.1 File

`apps/api/prisma/migrations/20260906120000_baseline_criticality_snapshot/migration.sql`

The timestamp must sort **after** `20260905120000_plan_schedule_criticality_mirror`; use the real
creation instant. The _release_ ordering (M0-T6 one release ahead) is a separate constraint that no
migration timestamp can express, and it is the plan's to hold.

### 3.2 SQL

Comment style, `NOT VALID` + `VALIDATE` shape, section ordering and the closing no-index sentence all
match the shipped sibling deliberately: a reader who has read one should find the other written the
same way.

```sql
-- ADR-0125 / CQ-1: a baseline freezes the criticality RULE its snapshot was COMPUTED under.
--
-- WHY. `baseline_activities.is_critical` and `.total_float` are the OUTPUT of a rule, not properties
-- of an activity. Until now a baseline froze the output and not the rule, so a planner who changed
-- the definition, the threshold, the float measure or the open-ends option and recalculated got a
-- different critical set with EVERY COMPUTED DATE BYTE-IDENTICAL — and a comparison against an older
-- baseline reported that as activities "entering the critical path". The product could not say so;
-- it could not even detect it.
--
-- WHY THESE FOUR AND NOT THE OTHER SEVEN PLAN SCHEDULING OPTIONS. Verified against the engine
-- (compute.ts:675-696): these four change is_critical / total_float and move NO date.
-- progress_recalc_mode, use_expected_finish_dates, ignore_external_relationships, level_resources,
-- level_within_float_only and scheduling_mode all change the network, so movement they cause is real
-- movement a comparison is right to report without a caveat. total_float_mode is IN the set — the
-- feature spec named only three — because it selects which of two computed spans is exposed as
-- `total_float`, which is BOTH the TOTAL_FLOAT criticality predicate's left-hand side AND the number
-- this feature reports as float movement. The set is the frozen image of `CriticalityRule`
-- (src/modules/schedule/criticality-rule.ts), whose `Required<Pick<ComputeOptions, …>>` projection
-- makes a fifth criticality option a compile error rather than a silent omission here.
--
-- WHERE THE VALUES COME FROM, AND WHY NOT THE OBVIOUS PLACE. NOT from the plan's client-settable
-- critical_* columns: those are its CONFIGURATION, and a settings PATCH writes them without
-- recalculating and without marking the schedule stale, so they may name a rule the snapshot's
-- numbers never came from. They are copied from the ENGINE-OWNED mirrors added by
-- 20260905120000_plan_schedule_criticality_mirror, read inside the plan advisory lock the capture
-- already holds — so the rule is paired with the recalculation that produced the rows being frozen.
--
-- NULLABLE, NO DEFAULT, AND THAT IS THE LOAD-BEARING DECISION. NULL means "the rule under which this
-- snapshot's is_critical was computed is UNKNOWN". It is a sentinel, never a claim. Two independent
-- reasons, and either alone would decide it:
--   (1) A constant DEFAULT would follow the shape of baselines.hours_per_day_minutes DEFAULT 1440
--       while discarding its justification — that default was legal because 1440 was TRUE of every
--       existing row (nothing could author a non-full-day calendar). These four settings have been
--       planner-writable since 20260716180000_m6_plan_float_options, so defaulting an existing
--       baseline to TOTAL_FLOAT/0/FINISH/false would state, in a NOT NULL column that offers a
--       reader no way to doubt it, a rule that baseline may never have been computed under.
--   (2) The SOURCE is nullable. plans.schedule_critical_path_definition is NULL for every plan not
--       recalculated since the mirror shipped, so a NOT NULL column here would have nothing to copy
--       and the capture would have to invent a value.
-- The governing precedent is one table along: baseline_activities.budgeted_expense (ADR-0071 M3),
-- which rejected NOT NULL DEFAULT 0 in this same model family because "0 is a claim". THE VALUES ARE
-- UNBACKFILLABLE: no surviving artefact records which rule produced a historic snapshot.
--
-- UNLIKE THE PLANS MIRROR, THIS SENTINEL IS PERMANENT. A plan's mirror self-clears on its next
-- recalculation; a capture cannot be re-run, so a baseline captured before this reads UNKNOWN
-- forever. That is the true statement, and it is why M0-T6 ships a release ahead: every
-- recalculation in between converts a plan from "next capture is permanently unknown" to "next
-- capture records a real rule".
--
-- MEASURED, not assumed, against a 200,000-row copy of this table (CREATE TABLE … LIKE baselines
-- INCLUDING ALL) on PostgreSQL 16.13:
--   ADD COLUMN x4 (2 enum-typed, nullable, no default)   2.233 ms, pg_relation_filenode UNCHANGED
--   ADD CONSTRAINT x2, NOT VALID                         1.007 / 0.686 ms
--   VALIDATE CONSTRAINT x2                              31.712 / 23.838 ms
--                                                 TOTAL ~59.5 ms, no table rewrite
-- pg_attribute.atthasmissing is FALSE for all four (no attmissingval), as expected for nullable
-- columns with no default: existing rows are not read, not rewritten and not widened. A real
-- baselines table holds a handful of rows per plan, so the figures above are an upper bound by
-- orders of magnitude. Safe under the self-migrating entrypoint (ADR-0018), no maintenance window.
-- The ADR-0053 M3 two-migration enum rule does NOT apply: this migration adds no enum label, and
-- both types were committed by 20260716180000. One file is correct.
--
-- PARITY. The CPM engine never reads `baselines` — it is handed activities, edges, calendars and
-- ComputeOptions built from `plans`. computeSchedule's signature, inputs and outputs are unchanged,
-- so the ADR-0034 recalculation parity gate is untouched by construction. The capture writes four
-- more scalars inside the transaction and the advisory lock it already holds.

ALTER TABLE "baselines"
  ADD COLUMN "critical_path_definition"         "CriticalPathDefinition",
  ADD COLUMN "critical_float_threshold_minutes" INTEGER,
  ADD COLUMN "total_float_mode"                 "TotalFloatMode",
  ADD COLUMN "make_open_ends_critical"          BOOLEAN;

-- FAIL-CLOSED ALL-OR-NONE (the ck_notes_exactly_one_parent tradition; the same shape as
-- ck_plans_schedule_criticality_all_or_none on the mirror this copies from, because it expresses the
-- same invariant and a reader comparing the two tables should find it written the same way). A half
-- frozen rule has no meaning, and forbidding it is what makes the three-state read TOTAL: a caller
-- may test `critical_path_definition IS NULL` and be right about all four columns — which is what
-- lets the capture's own non-null assertions be legitimate rather than hopeful. Written as an
-- explicit IN (0, 4) membership test rather than `= 0 OR = 4`, so adding a fifth frozen setting later
-- fails loudly against the literal instead of passing silently.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none" CHECK (
  num_nonnulls(
    "critical_path_definition",
    "critical_float_threshold_minutes",
    "total_float_mode",
    "make_open_ends_critical"
  ) IN (0, 4)
) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none";

-- Range: the same 0 … 5_256_000 working minutes (about ten years) as the ultimate source column's
-- ck_plans_critical_float_threshold_minutes_range, plus the nullable-safe guard that source does not
-- need. A frozen copy must not be able to hold a value its source would refuse — and the value
-- reaches this table through TWO hops (a raw parameterised UPDATE onto plans, then a Prisma insert
-- here), so this constraint is the last thing standing behind it. NOT VALID + VALIDATE mirrors
-- ck_baselines_hours_per_day_minutes_range on this same table; both constraints enforce every new
-- and updated row from the moment they commit, and VALIDATE takes only SHARE UPDATE EXCLUSIVE.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range" CHECK (
  "critical_float_threshold_minutes" IS NULL
  OR "critical_float_threshold_minutes" BETWEEN 0 AND 5256000
) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range";

-- NO THIRD CHECK, and that is a decision rather than an omission. The mirror carries
-- ck_plans_schedule_criticality_requires_cursor ("a rule may never exist without the
-- schedule_computed_at it describes") because there the rule and the cursor are written by ONE
-- statement, so the constraint pins a genuine co-write invariant. This table has no such column:
-- `captured_at` is NOT NULL DEFAULT now(), so an analogous coupling would be a tautology that can
-- never refuse anything — worse than no constraint, because it reads as protection. Coupling instead
-- to `captured_project_finish` was considered and rejected: it would relate the frozen rule (copied
-- from the plan) to the snapshot's computed extent (derived from the activity rows) — two facts
-- about different events, which is the same objection that rules out `captured_at`, and it buys
-- nothing the service's SCHEDULE_NOT_CALCULATED guard does not already refuse.

-- No index on any of the four. They are read only alongside their own row, by primary key, when the
-- comparison loads a baseline; there is no new WHERE/JOIN/ORDER BY predicate anywhere in the feature
-- and no route filters, sorts or groups baselines by a criticality setting. Index query patterns,
-- not columns (docs/DATABASE.md) — the same sentence 20260801120000 closes with for
-- hours_per_day_minutes. Revisit ONLY if such a route is added.

-- Down (forward-only in production; documented for completeness):
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range";
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none";
--   ALTER TABLE "baselines" DROP COLUMN "make_open_ends_critical";
--   ALTER TABLE "baselines" DROP COLUMN "total_float_mode";
--   ALTER TABLE "baselines" DROP COLUMN "critical_float_threshold_minutes";
--   ALTER TABLE "baselines" DROP COLUMN "critical_path_definition";
-- A down here is IRREVERSIBLE in the only way that matters, and unlike the plans mirror's: those
-- repopulate on the next recalculation, these are gone with the captures that produced them.
```

### 3.3 On the third CHECK — pass 2 confirmed, and its reason strengthened

The brief asks whether the plans mirror's `ck_plans_schedule_criticality_requires_cursor` has a
`baselines` analogue. **It does not. Pass 2 is right, and its argument is right as far as it goes,
but the decisive fact is one it did not state.**

Pass 2 said a coupling to `captured_at` "would relate two different events". True, and there is a
harder objection underneath it: **`baselines.captured_at` is `NOT NULL DEFAULT CURRENT_TIMESTAMP`**
(established by `\d baselines` against the live database — `captured_at | timestamp(3) with time zone
| not null | CURRENT_TIMESTAMP`). So `critical_path_definition IS NULL OR captured_at IS NOT NULL` is
a **tautology**: the right disjunct is true of every row the table can hold, so the constraint can
never refuse anything. That is strictly worse than not writing it, because a constraint named
`…_requires_…` sitting in `\d baselines` reads to the next person as a guarantee, and it is not one.

**A second candidate neither pass considered, and why it is also rejected.** The nearest thing this
table has to a "was this computed" column is `captured_project_finish`, and
`critical_path_definition IS NULL OR captured_project_finish IS NOT NULL` is _not_ a tautology (that
column is nullable). It would be true of every row: the capture refuses with
`SCHEDULE_NOT_CALCULATED` unless `latestFinish(activities)` is non-null
(`baselines.service.ts:136-141`), so a baseline that carries a rule always carries a finish. Rejected
for three reasons, in descending strength:

1. **It couples two independently-sourced facts.** The rule comes from `plans.schedule_critical_*`;
   the finish comes from the _activity rows_. On `plans` the mirror and the cursor are set by a
   single `UPDATE` — the constraint restates a property of one statement. Here it would assert a
   relationship between two reads, which is exactly the objection that killed the `captured_at` form.
2. **It buys nothing.** The only write path is `createWithSnapshot`
   (`grep -rn "baseline\.create" --include=*.ts src/` returns **one** non-spec hit,
   `baseline.repository.ts:96`), and the guard it would duplicate sits nineteen lines upstream of it.
3. **It would fight a future service decision.** Whether an uncomputed plan may be captured is an
   ADR-0025 Q3 service ruling, not a storage invariant. Encoding it in DDL means the day somebody
   revisits it, the migration argues with the service and the argument is a `P0001` in production.

**Two CHECKs. Both verified to refuse and to admit** (§5.2), which is the test that distinguishes a
constraint from a constraint-shaped comment.

---

## 4. Column naming — decided, and against the plan

The plan says `criticality_definition` / `criticality_threshold_minutes` / `criticality_float_mode` /
`criticality_open_ends`. Pass 1 says `critical_path_definition` /
`critical_float_threshold_minutes` / `total_float_mode` / `make_open_ends_critical`.

**Take pass 1's.** `docs/DATABASE.md` §"Naming conventions" is silent on prefixes — it constrains
case, FK form, index/constraint prefixes and booleans — so this is decided by precedent and by what
each name says. Four arguments, and the fourth is the one that settles it:

**1. The verbatim-source precedent is on this exact table.**
`baselines.hours_per_day_minutes` is character-for-character `calendars.hours_per_day_minutes`
(`schema.prisma:1595` and `:1794`). `data_date` is not a counterexample: it renames because its
source is `planned_start`, a name that means something different once frozen. Nothing here means
something different once frozen — a `total_float_mode` of `SMALLEST` is the same fact on either row.

**2. The sibling's prefix exists for a reason that does not exist here.**
M0-T6 chose `schedule_critical_path_definition` because `plans` carries a same-row twin one column
away, and the _pair_ is the point — the "your settings changed since this was calculated" signal is
literally "these two differ". `baselines` has no `critical_*` column of any kind (confirmed by
`\d baselines`), so a disambiguator would disambiguate from nothing. Note what the sibling did with
the stem: it kept `critical_path_definition` intact and _added_ to it. The plan's names do the
opposite — they replace the stem while adding nothing.

**3. Two of the plan's four names lose information the column needs.**

- `criticality_threshold_minutes` drops **float**. The threshold is compared against _total float_
  and against nothing else. The unit survives (which `docs/DATABASE.md` cares about — "the unit is in
  the column name because a day/minute confusion…"); the _quantity_ does not.
- `criticality_float_mode` is worse, and in the epic's own sore spot. The column is typed
  `TotalFloatMode` and its values are `FINISH`/`START`/`SMALLEST`; naming it `criticality_*` asserts
  that it only affects criticality, when it also selects the persisted `total_float` this feature
  reports as float movement. That is exactly the half-reading that got `total_float_mode` left out of
  the design in the first place. A name should not re-plant the mistake the column exists to fix.
- `criticality_open_ends` also fails `docs/DATABASE.md`'s boolean rule in substance if not in letter:
  the rule wants a positive predicate (`is_active`), and this is a bare noun phrase from which a
  reader cannot recover what `true` means. `make_open_ends_critical` is an imperative rather than a
  predicate, which is not ideal either — but it is the shipped name on `plans` and it says what
  `true` does.

**4. The decisive one: the plan's names would create a FOURTH vocabulary for one setting.**
There are already three, and each has a reason to exist:

| Layer                            | First setting's name                                  |
| -------------------------------- | ----------------------------------------------------- |
| plan column / Prisma field       | `critical_path_definition` / `criticalPathDefinition` |
| engine option (`ComputeOptions`) | `criticalDefinition`                                  |
| shipped `CriticalityRule`        | `criticalPathDefinition`                              |

`criticality-rule.ts` exists partly to hold that translation in **one** function
(`toCriticalityOptions`, whose docblock calls itself "the ONE place the two vocabularies meet").
Pass 1's names make the baseline columns identical to the third row, so `CaptureInput` → Prisma is a
name-for-name copy with no mapping table. The plan's names add a fourth column of that table, on a
setting whose whole history in this epic is people mis-reading which of its names means what.

**Consequence for the delta.** It compares `baselines.critical_path_definition` against
`plans.schedule_critical_path_definition` — a shared stem with the sibling's deliberate prefix
marking which side is the run record. That reads correctly. The plan's names would compare
`criticality_definition` against `schedule_critical_path_definition`, where nothing on the page says
those are the same setting.

**The plan's `Description` line therefore needs correcting**, the way its M0-T5 section has already
been corrected once. It is the fourth wrong claim in that task's description, and worth recording as
such rather than silently overwritten.

---

## 5. Migration cost, measured

### 5.1 Method

**Executed**, not asserted. PostgreSQL **16.13** (`select version()` →
`PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)`), against the repository's own migrated
`app_test` database with `20260905120000_plan_schedule_criticality_mirror` applied. The probe is a
**real copy of this table** — `CREATE TABLE baselines_probe (LIKE baselines INCLUDING ALL)`, so it
carries `baselines`' actual column set, defaults, both partial uniques, the batch index and the
existing range CHECK — seeded with **200,000 rows** (79 MB total including indexes). That is an upper
bound by orders of magnitude: a real `baselines` holds a handful of rows per plan.

The repository targets PG 17. The two behaviours exercised are unchanged between 16 and 17 (the
non-rewriting `ADD COLUMN` path landed in PG 11 via `pg_attribute.attmissingval`; `check_safe_enum_use`
has been in place since PG 12). **Stated as a generalisation from a 16.13 measurement, not as a 17
measurement** — the probe is three commands and can be re-run on 17 if the reviewer wants it closed.

### 5.2 Results

```
filenode_before                                                       601918
ALTER TABLE … ADD COLUMN ×4 (2 enum-typed, nullable, no default)      2.233 ms
ADD CONSTRAINT ck_baselines_criticality_snapshot_all_or_none NOT VALID 1.007 ms
VALIDATE CONSTRAINT ck_baselines_criticality_snapshot_all_or_none     31.712 ms
ADD CONSTRAINT ck_baselines_critical_float_threshold_… NOT VALID       0.686 ms
VALIDATE CONSTRAINT ck_baselines_critical_float_threshold_…           23.838 ms
                                                              TOTAL  ~59.5 ms
filenode_after                                                        601918   (UNCHANGED)
```

**`pg_relation_filenode` is identical before and after all five statements — no table rewrite.**
`pg_attribute.atthasmissing` is `f` for all four new columns with `attmissingval` empty, which is the
expected shape for nullable-with-no-default and confirms existing rows are not read, not rewritten and
not widened.

**Both CHECKs verified to refuse and to admit**, via `INSERT` (the shape this write actually takes —
a difference from the mirror, where it is an `UPDATE`), each case run through a `plpgsql` wrapper
trapping `check_violation` so one script exercises all eight:

| Case                              | Result                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| all four NULL (the sentinel)      | **ADMITTED**                                                        |
| all four set                      | **ADMITTED**                                                        |
| definition only (one of four)     | **REFUSED** — `ck_baselines_criticality_snapshot_all_or_none`       |
| three of four                     | **REFUSED** — `ck_baselines_criticality_snapshot_all_or_none`       |
| threshold NULL, other three set   | **REFUSED** — `ck_baselines_criticality_snapshot_all_or_none`       |
| threshold `-1`, all four set      | **REFUSED** — `ck_baselines_critical_float_threshold_minutes_range` |
| threshold `5256001`, all four set | **REFUSED** — `ck_baselines_critical_float_threshold_minutes_range` |
| threshold `5256000`, all four set | **ADMITTED** (the boundary is inclusive)                            |

The `5256000` and `-1` pair matter together: a range CHECK tested only on the refusing side passes
equally against `BETWEEN 0 AND 0`.

**Drift.** `prisma migrate diff --from-url … --to-schema-datamodel … --exit-code` was executed against
the live database **with the three M0-T6 CHECKs installed and undeclared in `schema.prisma`** and
returned _No difference detected_, `EXIT=0`. That is direct evidence — not inference from the house
rule — that the two CHECKs proposed here will not break `prisma:check-drift` and must therefore have
**no** `@@index`, `@@unique` or other Prisma declaration behind them (TECH_DEBT #54).

**Locks.** One `ALTER TABLE` with four `ADD COLUMN` sub-commands plus two `ADD CONSTRAINT … NOT VALID`
take a brief `ACCESS EXCLUSIVE` on `baselines` for catalogue updates only; the two `VALIDATE`s take
`SHARE UPDATE EXCLUSIVE`. Nothing touches `baseline_activities`, `baseline_assignments`, `activities`
or any index. `NOT VALID` enforces both constraints on **every new and updated row** from the moment
it commits; only existing-row validation is deferred.

**Backfill: none, and there is nothing to backfill to** (D3). Every existing row satisfies both
CHECKs by construction — all four columns NULL gives `num_nonnulls = 0` and `threshold IS NULL` —
which is what the two `VALIDATE`s succeeding against 200,000 rows demonstrates.

### 5.3 Index — none, argued from the read patterns

The brief asks for this from the reads rather than from an expectation. Enumerated from
`baseline.repository.ts`, every access to the `baselines` table:

| Site           | Shape                                                                             | Predicate                                                        |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `:96`          | `create` — the **only** insert (`grep -rn "baseline\.create"` → one non-spec hit) | n/a                                                              |
| `:230`         | `findFirst` — the active baseline for variance                                    | `(organizationId, planId, isActive, deletedAt)`                  |
| `:333`         | `count`                                                                           | `(organizationId, planId, deletedAt)`                            |
| `:343`, `:354` | `findFirst` by id                                                                 | `(id, organizationId, planId, deletedAt)`                        |
| `:374`, `:392` | `findFirst` / update for activate                                                 | as above                                                         |
| `:421`         | `updateMany` — soft-delete stamp                                                  | `(id, deletedAt)`                                                |
| `:436`         | `findFirst` + `include activities` — the detail read the delta uses               | `(id, organizationId, planId, deletedAt)`                        |
| `:456`         | `findMany` list                                                                   | `(organizationId, planId, deletedAt)`, ordered `(createdAt, id)` |

**Not one of them mentions a criticality column, and the feature adds none that would.** The delta
loads the `from` baseline by id — an existing primary-key read — and reads the four values off the
row it already has, exactly as it reads `hours_per_day_minutes`. There is no "which baselines used
LONGEST_PATH?" question anywhere in the spec, and none proposed. `docs/DATABASE.md` §"Indexes": index
**query patterns, not columns**.

Two smaller points that also point the same way. The columns are **trailing and NULL on every existing
row**, so they occupy no space at all in the stored tuple (directly implied by the unchanged filenode:
existing rows are untouched). And an index on any of them would be pathologically low-cardinality —
two, three and two distinct values for three of the four.

**Trigger to revisit, named rather than left implicit:** a route that filters, sorts or groups
baselines by a criticality setting. If one is ever added, the index that serves it is almost certainly
composite with `plan_id` leading, not a single-column index on the setting.

---

## 6. The Prisma field block

Insert **after `costSnapshotLevel` (`schema.prisma:1807`) and before `version` (`:1809`)** — not
after `hoursPerDayMinutes` as pass 1 said. Two reasons the position changed: pass 1's line numbers no
longer resolve (S1), and the shipped mirror set the placement convention by putting the four
criticality columns **immediately before `version`**, after the other domain columns. Matching it
means a reader who has seen one block finds the other in the same place.

Uses `///` (a Prisma documentation comment), matching the shipped sibling at `schema.prisma:781-810`.
The older blocks on this model use `//`; `///` is the newer convention and the one the immediately
comparable block uses.

```prisma
model Baseline {
  // … unchanged through costSnapshotLevel (:1807) …

  /// ADR-0125 / CQ-1 — the criticality RULE this snapshot's numbers were COMPUTED under.
  ///
  /// `baseline_activities.is_critical` and `.total_float` are the OUTPUT of a rule, not properties
  /// of an activity, and until this existed a baseline froze the output and not the rule. A planner
  /// who moves the threshold, the definition, the float measure or the open-ends option and
  /// recalculates gets a different critical set with EVERY BAR IN THE SAME PLACE — so a comparison
  /// against an older baseline reported a large, real-looking set as having "entered the critical
  /// path", and nothing in the database could say otherwise. These are exactly the four plan options
  /// that can do that (verified against `engine/compute.ts:675-696`: they change is_critical /
  /// total_float and move NO date); the other seven change the network, so movement they cause is
  /// real. The set is the frozen image of `CriticalityRule`
  /// (src/modules/schedule/criticality-rule.ts), whose `Required<Pick<ComputeOptions, …>>`
  /// projection makes a fifth criticality option a compile error rather than a silent omission here.
  ///
  /// COPIED FROM THE PLAN'S ENGINE-OWNED MIRRORS (`plans.schedule_critical_*`), NEVER from its
  /// client-settable `critical*` options. Those are the plan's CONFIGURATION, and a settings PATCH
  /// writes them without recalculating and without marking the schedule stale — so they can name a
  /// rule this snapshot's numbers never came from. The copy is read inside the plan advisory lock
  /// the capture already holds, which is what pairs the rule with the recalculation that produced
  /// the rows being frozen. Set by the capture path, then IMMUTABLE like every other snapshot
  /// column: a soft-delete/restore stamps only `deletedAt`/`deleteBatchId` and never touches these.
  ///
  /// NULLABLE WITH NO DEFAULT, AND THE NULL IS A SENTINEL — "the rule is unknown", never a claim.
  /// This deliberately does NOT follow the `hoursPerDayMinutes DEFAULT 1440` pattern above: that
  /// default was legal because 1440 was TRUE of every pre-existing row (nothing could author a
  /// non-full-day calendar). These four have been planner-writable since 20260716180000, so a
  /// DEFAULT would tell an old baseline it was computed under a rule it may never have seen — and
  /// the source is itself nullable, so a NOT NULL column here would have nothing to copy for any
  /// plan not recalculated since the mirror shipped. The governing precedent is one table along:
  /// `baseline_activities.budgetedExpense` (ADR-0071 M3), which rejected `NOT NULL DEFAULT 0`
  /// because "0 is a claim". UNLIKE the plan's mirror this sentinel is PERMANENT — a plan's mirror
  /// self-clears on its next recalculation, and a capture cannot be re-run.
  ///
  /// ALL FOUR OR NONE. `ck_baselines_criticality_snapshot_all_or_none` (raw SQL in the migration —
  /// Prisma cannot express CHECK, so there is deliberately no declaration here that the database
  /// does not have; prisma:check-drift, TECH_DEBT #54) makes "half a rule" unrepresentable, which is
  /// what lets a reader test ONE column and be right about all four. There is therefore NO separate
  /// `*_snapshot_level` discriminator: unlike `costSnapshotLevel` above, whose evidence lived in
  /// another table (a row count), the discriminator here is `criticalPathDefinition IS NULL` on this
  /// same row, and a fifth column would be the two-sources-of-truth defect that docblock warns
  /// about. `ck_baselines_critical_float_threshold_minutes_range` bounds the threshold
  /// (nullable-safe, the same 0…5_256_000 as `ck_plans_critical_float_threshold_minutes_range`).
  /// There is deliberately NO third CHECK: the mirror's "may not exist without its cursor" has no
  /// analogue here, because `capturedAt` is NOT NULL and coupling to it would be a tautology.
  ///
  /// WORKING MINUTES, NOT DAYS. `criticalFloatThresholdMinutes` is in the same unit the engine
  /// compares it against, so it is copied and compared verbatim — `hoursPerDayMinutes` above is NOT
  /// involved and must never be applied to it.
  ///
  /// No index: all four are read only alongside their own row, by id, when the comparison loads a
  /// baseline. No route filters, sorts or groups baselines by a criticality setting — index query
  /// patterns, not columns (docs/DATABASE.md).
  ///
  /// MUST stay in lock-step with the CriticalPathDefinition / TotalFloatMode unions in @repo/types.
  criticalPathDefinition        CriticalPathDefinition? @map("critical_path_definition")
  criticalFloatThresholdMinutes Int?                    @map("critical_float_threshold_minutes")
  totalFloatMode                TotalFloatMode?         @map("total_float_mode")
  makeOpenEndsCritical          Boolean?                @map("make_open_ends_critical")

  version       Int       @default(1)
  // … unchanged from here …
}
```

No enum is added or altered. No relation, no index, no `@@` declaration changes.

---

## 6.2 The capture path — corrected against the shipped code

**Do not copy pass 2 §7.2's snippets; they will not compile (S2, S5).** The corrected form:

**(a) `CaptureInput` (`baseline.repository.ts:58-68`)** gains one nullable grouped object, **reusing
the shipped `CriticalityRule`** rather than redeclaring it. The cross-module type import is already
the pattern here — this file imports `PlanCalendarInput` from `../schedule/plan-calendar` at `:7` —
and `criticality-rule.ts`'s own `ComputeOptions` import is type-only, so nothing is dragged in.

```ts
import type { CriticalityRule } from '../schedule/criticality-rule';

export interface CaptureInput {
  // …unchanged…
  /** The plan calendar's hours-per-day at capture, in minutes (ADR-0068 §5). */
  hoursPerDayMinutes: number;
  /**
   * The criticality rule this snapshot's `is_critical`/`total_float` were COMPUTED under
   * (ADR-0125 / CQ-1) — copied from the plan's ENGINE-OWNED `schedule_critical_*` mirrors, never
   * from its client-settable options. ONE nullable object rather than four nullable fields, so the
   * compiler enforces all-or-none: `null` means the plan's last recalculation predates the mirror
   * and the rule is unrecoverable, which is the all-NULL sentinel the four columns store.
   */
  criticalityRule: CriticalityRule | null;
  // …unchanged…
}
```

**(b) `createWithSnapshot` (`:96`)** writes all four **unconditionally**, beside `hoursPerDayMinutes`
(`:104`) and `costSnapshotLevel` (`:111`). Field names map one-for-one, which is §4's fourth argument
paying off:

```ts
// ADR-0125 / CQ-1. Written unconditionally, exactly as costSnapshotLevel below is and for the same
// reason: a CONDITIONAL write is how a NULL meaning "the rule is unknowable" becomes
// indistinguishable from a NULL meaning "we happened not to set it this time".
// `?? null` here defaults to the SENTINEL, never to a value — `?? 'TOTAL_FLOAT'` / `?? 0` is the
// forbidden form, and the structural gate must permit the first and ban the second.
criticalPathDefinition: input.criticalityRule?.criticalPathDefinition ?? null,
criticalFloatThresholdMinutes: input.criticalityRule?.criticalFloatThresholdMinutes ?? null,
totalFloatMode: input.criticalityRule?.totalFloatMode ?? null,
makeOpenEndsCritical: input.criticalityRule?.makeOpenEndsCritical ?? null,
```

**(c) The in-lock read (`baselines.service.ts`, after `acquirePlanWriteLock` at `:129`, beside
`resolveDayFactorMinutes` at `:150`)** — and **not** as either pass wrote it. Both proposed
`tx.plan.findUniqueOrThrow({ where: { id: planId } })`, which is **unscoped by organisation**. This
service already has a house pattern for exactly this read, eight lines into `activate`
(`baselines.service.ts:242-245`): a `tx.plan.findFirst` that is org-scoped and narrowly selected.
Match it.

```ts
// The criticality rule the snapshot was COMPUTED under (ADR-0125 / CQ-1) — read from the plan's
// ENGINE-OWNED mirrors, inside the lock, on `tx`. NOT from the outer `plan` read at :122: that read
// happens before this transaction and before the lock, so a recalculation can commit in between and
// the outer row's mirror would then describe a DIFFERENT run from the activity rows loaded at :130
// under this lock. Both are written by the same locked recalculation, so reading them under the same
// lock is what pairs the rule with the output it produced.
//
// Org-scoped rather than a bare findUnique by id, matching `activate`'s re-read at :242: the id is
// trusted by this point, but an unscoped read in a service that is otherwise org-scoped throughout
// is a pattern the next reader copies somewhere it is not safe.
const mirrors = await tx.plan.findFirst({
  where: { id: planId, organizationId: organization.id, deletedAt: null },
  select: {
    scheduleCriticalPathDefinition: true,
    scheduleCriticalFloatThresholdMinutes: true,
    scheduleTotalFloatMode: true,
    scheduleMakeOpenEndsCritical: true,
  },
});
// Soft-deleted between the check at :122 and this lock. See §7.1 — the plan cascade does NOT take
// the plan write lock, so this is reachable, and 404 is both the honest answer and the thing that
// stops an orphan baseline being inserted under a plan that is already in a delete batch.
if (!mirrors) throw new NotFoundError('Plan not found.');

const criticalityRule: CriticalityRule | null =
  mirrors.scheduleCriticalPathDefinition === null
    ? // Recalculated before the mirror shipped, or never. All four are NULL together —
      // ck_plans_schedule_criticality_all_or_none is what makes testing ONE of them total.
      null
    : {
        criticalPathDefinition: mirrors.scheduleCriticalPathDefinition,
        // The three non-null assertions are legitimate ONLY because of that constraint. Do not
        // "tidy" them into `?? 0` / `?? 'FINISH'` — that manufactures a rule nothing ever ran.
        criticalFloatThresholdMinutes: mirrors.scheduleCriticalFloatThresholdMinutes!,
        totalFloatMode: mirrors.scheduleTotalFloatMode!,
        makeOpenEndsCritical: mirrors.scheduleMakeOpenEndsCritical!,
      };
```

**(d) Deliberately not changed.** `loadActiveActivitiesForCapture`, the `SCHEDULE_NOT_CALCULATED`
refusal (`:136-141`), the `baseline.captured` audit row (`:176-190`), the advisory lock, the
one-active-baseline flip, and every `baseline_activities` / `baseline_assignments` column. No new
audit action: the capture is already audited and ADR-0073's two tests are satisfied by the existing
row. Nothing is added to `BaselineResponseDto` by this task — exposure is opt-in and belongs to the
milestone that reads it.

---

## 7. What the plan and both design passes missed

### 7.1 The in-lock re-read closes a pre-existing orphan hazard, and the null branch is reachable

Both passes justified the in-lock read only by the staleness of the _rule_. There is a second thing
it fixes, and it decides how the null branch must behave.

`grep -rn "acquirePlanWriteLock\|lockPlanForWrite" src/ --include=*.ts` (excluding specs and the lock
helper) returns callers in `plan-lock`, `dependencies`, `baselines`, `activities` and `schedule` —
and **nothing in `src/common/hierarchy/`**. So the plan/project/client soft-delete cascade
(`hierarchy-lifecycle.service.ts:117-135`, which sweeps a plan's baselines into the same
`delete_batch_id`) **does not take the plan write lock**.

Consequence, today, without this change: a capture that passes its existence check at `:122` can have
the plan soft-deleted underneath it before the insert at `:155`, producing an **active baseline under
a soft-deleted plan** — not in the delete batch, so a restore will not reactivate it and the recycle
bin will never show it. The FK is `RESTRICT`, so the insert succeeds (the parent row still exists;
only `deleted_at` is set).

Making the mirror read mandatory and org/soft-delete-scoped **closes that as a side effect**, because
it re-checks the plan's liveness _inside_ the lock and _after_ the point the cascade could have
committed. That is why the null branch must be a `NotFoundError` and not a silent `criticalityRule =
null`: treating a vanished plan as "unknown rule" would keep the orphan and record a sentinel that
lies about why it is there.

**This is worth one sentence in the ADR**, because it is the kind of fix that gets refactored away
later by someone who reads the null branch as defensive noise.

### 7.2 `SETTINGS_UNKNOWN` is a property of the active baseline, not of the plan

Neither pass says this, and the read model will get it wrong without it.

The delta compares the plan's **active** baseline against live. The one-active-baseline invariant
(`uq_baselines_plan_active ON (plan_id) WHERE is_active = true AND deleted_at IS NULL`) means a
planner can move that pointer at will — `activate` is a supported operation
(`baselines.service.ts:227`). So:

> A plan whose comparison reads confidently today can be made to read `SETTINGS_UNKNOWN` tomorrow,
> by a planner activating a baseline captured before this migration. Nothing is broken; the older
> snapshot genuinely does not know its rule.

The obligation that follows is on the copy, not on the schema: the `UNKNOWN` sentence must attribute
the unknowability to **that baseline** ("this baseline was captured before SchedulePoint recorded
which criticality rule produced it"), never to the plan or to the report. Phrased as a property of
the report — "settings could not be compared" — it reads as a defect that appeared when the planner
changed nothing but the pointer, and the first thing they will do is re-activate the newer baseline
and lose the comparison they wanted.

Add to pass 2's §8.1 obligations as a fourth item.

### 7.3 The two "was this computed?" guards are independent, and that is correct

Worth stating because it looks like a gap. The capture's `SCHEDULE_NOT_CALCULATED` refusal is decided
by `latestFinish(activities)` over the snapshot's `early_finish` — **not** by
`plans.schedule_computed_at`. So in principle a plan can hold computed activity dates while its
cursor and mirrors are NULL, and the capture will succeed and freeze all four as NULL.

That combination is **right**, not a hole: the snapshot has real numbers (so there is something to
freeze) and no recoverable rule (so `UNKNOWN` is the true statement). It needs no constraint, and
attempting one is the `captured_project_finish` coupling §3.3 rejects. It is called out here so the
next reader does not "discover" the asymmetry and close it.

### 7.4 Restore is a no-op for these columns — verified, not assumed

`hierarchy-lifecycle.service.ts:117-135` (delete) and the restore path write only `deletedAt` and
`deleteBatchId` on `baselines`, and stamp `baseline_activities` / `baseline_assignments` via their
parent's `planId` in the same batch. **No path anywhere updates a criticality column** — there is one
writer of these values, `createWithSnapshot`, and it is an `INSERT`. So a delete/restore round trip
returns a baseline whose frozen rule is byte-identical, and neither CHECK can be violated by a
restore (the columns are not in the predicate of any partial unique either).

The one restore risk on this table is pre-existing and untouched by this change: `uq_baselines_plan_active`
can refuse a restore if another baseline became active in the meantime. Nothing here makes that better
or worse, and it is out of scope.

### 7.5 There is exactly one insert path, which is what makes the grouped object sufficient

`grep -rn "baseline\.create\|baseline\.createMany" --include=*.ts src/ | grep -v spec` returns **one**
hit, `baseline.repository.ts:96`. Nothing in `src/modules/plans/` or `src/modules/interchange/`
references baselines at all (`grep -rn "baseline" --include=*.ts src/modules/plans/ src/modules/interchange/`
returns nothing) — so there is no plan-duplication or import path that copies a baseline and could
silently omit the four columns.

This is the `baselines` analogue of pass 2's V3, and it is the fact that makes the
`CriticalityRule | null` grouping a real guarantee rather than a convention: the compiler covers the
only door.

---

## 8. Obligations this creates elsewhere — including two M0-T6 left behind

| Artefact                           | Obligation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`    | The four fields + the `///` block in §6, after `costSnapshotLevel` (`:1807`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`schema.prisma:706` / `:711`**   | **Still stale, and both design passes flagged it.** Both comments say the engine "consumes it in a later M6 task"; `schedule.service.ts:1285-1290` passes both today via `toCriticalityOptions`. M0-T6 shipped without the two one-line corrections its own design pass listed. Fix them in this commit (the ADR-0071 lesson about stepping over drift, now two epics old).                                                                                                                                                                                                                                                                                 |
| **`docs/DATABASE.md`**             | Two paragraphs, not one. (a) Under "Baseline & BaselineActivity" (`:640`), in the shape of "The cost snapshot's two levels" (`:686`): **"The criticality rule — and why NULL is not a default."** (b) **M0-T6's paragraph was never written**: `grep -n "schedule_critical\|schedule_computed_at" docs/DATABASE.md` returns nothing, so neither the mirror nor `schedule_computed_at` itself is documented there. Pass 2 §9 asked for it "beside the `schedule_computed_at` material", which does not exist. Write both under "Plan: the mandatory data date" (`:302`).                                                                                     |
| `CLAUDE.md` §1 + three files       | Migration count **59 → 60**, in **four** places: `CLAUDE.md:23`, `CLAUDE.md:111`, `README.md:15`, `docs/ARCHITECTURE.md:133`. `pnpm check:counts` re-derives it (ADR-0076) and currently reports 59 OK. Model count unchanged at 29 (no new model).                                                                                                                                                                                                                                                                                                                                                                                                         |
| `apps/api/src/modules/baselines/*` | `CaptureInput.criticalityRule`, the unconditional write, the in-lock org-scoped mirror read with the 404 branch (§6.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@repo/types`                      | No enum addition. If a baseline DTO ever exposes these, the fields are `T \| null`, never `T` with a default — the optionality must mirror the sentinel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Structural gate                    | Pass 2 §8.1.2's no-coalescing gate, extended to the four **baseline** fields, permitting `?? null` and banning `?? 'TOTAL_FLOAT'` / `?? 0` / `?? 'FINISH'` / `?? false`. Comment-stripped (the fourth scan-matching-prose failure in this repository is one too many), with a pinned positive case, verified red first.                                                                                                                                                                                                                                                                                                                                     |
| `apps/api/test/`                   | Follow M0-T6's shape, which is good: `test/schedule.e2e-spec.ts:271` asserts the never-calculated sentinel **first**, which is what stops the rest of the case passing against a defaulted column. The M0-T5 analogue: (1) a capture on a plan with a populated mirror writes all four **from the mirror**, provable by PATCHing the plan's live settings to different values first and asserting the baseline still holds the mirror's; (2) a capture on a plan whose mirror is NULL **succeeds** and writes all four NULL; (3) a delete/restore round trip leaves all four unchanged. The migration's own SQL read from the shipped file, never restated. |
| ADR-0125                           | D1 (why four), D3 (sentinel vs claim, with ADR-0068 explicitly declined and the _second_ reason from §2 D3), §3.3 (why there is no third CHECK — including the tautology, which is the transferable part), §4 (the naming decision and the fourth-vocabulary argument), §7.1 (the orphan hazard the in-lock read closes) and §7.2 (`UNKNOWN` belongs to the baseline).                                                                                                                                                                                                                                                                                      |

---

## 9. Summary of the ask

| Question asked                            | Answer                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Verify the two passes against the tree | **Decisions hold; six citations and three code samples do not** (§1.2). The three that would produce wrong work: the shipped `CriticalityRule`'s first field is `criticalPathDefinition`, not `criticalDefinition`; `stampScheduleComputedAt` takes `(planId, criticality, db)`; and every `schema.prisma` line number for `Baseline` moved by ~34 lines when M0-T6 landed.                                                |
| 2. The exact migration SQL                | §3.2. Four `ADD COLUMN`, **two** CHECKs (`num_nonnulls(...) IN (0,4)` fail-closed; nullable-safe `BETWEEN 0 AND 5256000`), both `NOT VALID` + `VALIDATE`, comment style matched to the sibling.                                                                                                                                                                                                                            |
| 2b. Is a third CHECK warranted?           | **No — pass 2 confirmed, and its reason strengthened.** `baselines.captured_at` is `NOT NULL DEFAULT now()`, so the analogous constraint is a **tautology** that can never refuse anything, which is worse than absent because it reads as protection. A `captured_project_finish` coupling was considered (neither pass did) and rejected on three grounds (§3.3).                                                        |
| 3. The Prisma field block                 | §6, with a `///` docblock matching the shipped sibling, placed after `costSnapshotLevel` before `version`.                                                                                                                                                                                                                                                                                                                 |
| 4. Column naming                          | **Pass 1's, and the plan's `Description` line needs a fourth correction.** Decided on four grounds; the decisive one is that the plan's names would create a **fourth vocabulary** for one setting, on a setting whose whole history in this epic is people mis-reading which of its names means what (§4).                                                                                                                |
| 5. Any index?                             | **None.** Argued from all eight `baselines` access sites, not one of which mentions a criticality column (§5.3). Trigger to revisit named; the index that would serve it is composite with `plan_id` leading, not single-column.                                                                                                                                                                                           |
| 6. Migration cost                         | **Measured on a real `LIKE baselines INCLUDING ALL` copy at 200,000 rows**: `ADD COLUMN` ×4 **2.233 ms**, total **≈ 59.5 ms**, **`pg_relation_filenode` 601918 → 601918 — unchanged, no rewrite**; `atthasmissing = f` on all four. Both CHECKs verified to refuse **and** to admit across eight cases including the inclusive upper bound. `prisma migrate diff` verified drift-clean with undeclared CHECKs installed.   |
| 7. What was missed                        | Four things: the in-lock read also closes a **reachable orphan-baseline hazard**, because the hierarchy cascade takes no plan lock (§7.1); **`UNKNOWN` belongs to the active baseline, not the plan**, which changes the copy (§7.2); the two "was this computed" guards are independently sourced and that is correct (§7.3); restore is provably a no-op here (§7.4). Plus two M0-T6 obligations left undischarged (§8). |

**Parity, plainly:** the CPM engine never reads `baselines`. `computeSchedule`'s signature, inputs and
outputs are unchanged, so the ADR-0034 recalculation parity gate is untouched **by construction** —
there is nothing here to hold parity for. The capture writes four more scalars inside the transaction
and the advisory lock it already holds.

---

## 10. What was executed for this pass

Recorded so the reviewer can re-run any of it, per ADR-0076.

| Command                                                                                                                                                                                                                                                                                                                                   | Established                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service postgresql start`; `psql "postgresql://app:app@localhost:5432/app_test" -c "select version()"`                                                                                                                                                                                                                                   | PostgreSQL 16.13; the URL in the brief needs the `?schema=` dropped for `psql` (it is a Prisma parameter, not a libpq one)                                  |
| `psql … -c "\d baselines"`                                                                                                                                                                                                                                                                                                                | The live column set, both partial uniques, the existing range CHECK, and **`captured_at` is `NOT NULL DEFAULT CURRENT_TIMESTAMP`** — §3.3's tautology proof |
| `psql … -c "select migration_name from _prisma_migrations order by migration_name desc limit 5"`                                                                                                                                                                                                                                          | `20260905120000_plan_schedule_criticality_mirror` is applied                                                                                                |
| `CREATE TABLE baselines_probe (LIKE baselines INCLUDING ALL)` + 200,000-row seed + the §3.2 DDL with `\timing`                                                                                                                                                                                                                            | §5.2's timings and the unchanged filenode                                                                                                                   |
| A `plpgsql` wrapper trapping `check_violation`, eight `INSERT` cases                                                                                                                                                                                                                                                                      | §5.2's refuse/admit table                                                                                                                                   |
| `prisma migrate diff --from-url … --to-schema-datamodel ./prisma/schema.prisma --exit-code` (probe table dropped)                                                                                                                                                                                                                         | _No difference detected_, `EXIT=0` — CHECKs are drift-invisible                                                                                             |
| `node scripts/check-counts.mjs`; `ls apps/api/prisma/migrations \| grep -c "^2026"`                                                                                                                                                                                                                                                       | 59 migrations today, gate currently green                                                                                                                   |
| `grep -rn "acquirePlanWriteLock\|lockPlanForWrite" src/ --include=*.ts`                                                                                                                                                                                                                                                                   | The hierarchy cascade takes no plan lock — §7.1                                                                                                             |
| `grep -rn "baseline\.create\|baseline\.createMany" --include=*.ts src/ \| grep -v spec`                                                                                                                                                                                                                                                   | One insert path — §7.5                                                                                                                                      |
| `grep -rn "baseline" --include=*.ts src/modules/plans/ src/modules/interchange/`                                                                                                                                                                                                                                                          | No baseline copying anywhere — §7.5                                                                                                                         |
| `grep -n "schedule_critical\|schedule_computed_at" docs/DATABASE.md`                                                                                                                                                                                                                                                                      | Nothing — §8's second undischarged obligation                                                                                                               |
| Read: `criticality-rule.ts`, `schedule.repository.ts:894-909`, `schedule.service.ts:1285-1300`, `baselines.service.ts:118-170` and `:236-252`, `baseline.repository.ts:56-140`, `baseline-response.dto.ts:65-81`, `plan.repository.ts:74-80`, `hierarchy-lifecycle.service.ts:113-135`, `schema.prisma:675-715`, `:781-814`, `:1769-1840` | §1, §4, §6.2, §7                                                                                                                                            |

**Not measured, and stated rather than implied:** everything here is PostgreSQL **16.13**; the repo
targets 17. The two behaviours exercised (non-rewriting nullable `ADD COLUMN`, enum-label safety) are
unchanged between 16 and 17, but this is a generalisation from a 16 measurement, not a 17 measurement.
Re-running §5's probe on 17 is three commands if the reviewer wants it closed.
